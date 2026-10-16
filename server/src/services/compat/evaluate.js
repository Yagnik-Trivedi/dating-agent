// Step 4, one viewer: dimension scores in code, ONE smart-tier judge call, verdict in code.
import { z } from 'zod';
import { KgFact } from '../../models/KgFact.js';
import { Message } from '../../models/Message.js';
import { Profile } from '../../models/Profile.js';
import { selfFacts } from '../brief/buildBrief.js';
import { cosine } from '../kg/similarity.js';
import { styleMetrics } from '../kg/styleProfile.js';
import { chatJSON } from '../llm/client.js';
import { otherUserId } from '../matches.js';
import * as alignment from '../prompts/alignment.js';
import * as icebreakersPrompt from '../prompts/icebreakers.js';
import * as verdictPrompt from '../prompts/verdict.js';
import { ALIGNMENT_SCORE, INTEREST_COSINE, MATCH_COSINE, verdictFor } from './config.js';

const r2 = (x) => Math.round(x * 100) / 100;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const UNKNOWN = { score: 0.5, confidence: 0 };
const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'them';
const structured = (f) => f.source === 'questionnaire_choice' || !f.evidence?.length; // onboarding B/D answers (stories carry a quote)

// One bad item drops that item, not the whole response.
const items = (item) => z.array(z.unknown()).default([]).transform((xs) => xs.map((x) => item.safeParse(x)).filter((r) => r.success).map((r) => r.data));
const alignmentSchema = z.object({ pairs: items(z.object({ id: z.string(), alignment: z.enum(['aligned', 'neutral', 'conflicting']) })) });
const cited = z.object({ text: z.string().trim().min(1).max(240), messageIds: z.array(z.string()).default([]) });
const judgeSchema = z.object({
  chemistry: z.coerce.number().min(0).max(1).catch(0.5),
  reasons: items(cited),
  concerns: items(cited),
  askYourself: items(z.string().trim().min(1).max(200)),
  summary: z.string().trim().max(600).catch(''),
});

const bestMatch = (f, candidates, min) => candidates
  .filter((o) => f.embedding?.length && o.embedding?.length)
  .map((o) => ({ o, score: cosine(f.embedding, o.embedding) }))
  .filter((x) => x.score >= min)
  .sort((a, b) => b.score - a.score)[0]?.o;

/** values/goals + lifestyle: pair each viewer fact with the closest observed fact, one batched fast call to judge alignment. */
async function alignmentDims({ self, observed, viewerId, matchId }) {
  const usable = (f) => structured(f) && f.disclosure !== 'private';
  const groups = {
    valuesGoals: self.filter((f) => ['values', 'goal'].includes(f.predicate) && usable(f)),
    lifestyle: self.filter((f) => f.predicate === 'lifestyle' && usable(f)),
  };
  const pairs = [];
  for (const [dim, facts] of Object.entries(groups)) {
    for (const f of facts) {
      const o = bestMatch(f, observed, MATCH_COSINE);
      if (o) pairs.push({ id: `p${pairs.length + 1}`, dim, f, o, mine: f.object, theirs: `${o.object}` });
    }
  }
  let verdicts = {};
  if (pairs.length) {
    try {
      const out = await chatJSON({ tier: 'fast', schema: alignmentSchema, purpose: 'compat-alignment', userId: viewerId, matchId, messages: alignment.build({ pairs }) });
      verdicts = Object.fromEntries(out.pairs.map((p) => [p.id, p.alignment]));
    } catch (err) {
      if (err.name === 'BudgetExceededError') throw err;
      console.error(`compat alignment unavailable: ${err.message}`); // pairs without a verdict count as neutral below
    }
  }
  const dims = {};
  for (const dim of Object.keys(groups)) {
    const ps = pairs.filter((p) => p.dim === dim);
    if (!ps.length) { dims[dim] = UNKNOWN; continue; }
    const weight = ps.reduce((s, p) => s + p.f.weight, 0);
    const score = ps.reduce((s, p) => s + p.f.weight * ALIGNMENT_SCORE[verdicts[p.id] ?? 'neutral'], 0) / weight;
    dims[dim] = { score: r2(score), confidence: r2(mean(ps.map((p) => p.o.confidence))) };
  }
  return { dims, pairs: pairs.map((p) => ({ mine: p.mine, theirs: p.theirs, alignment: verdicts[p.id] ?? 'neutral' })) };
}

/** Viewer's top 5 interests vs their likes, weighted by how much the viewer cares. */
export function interestsDim(self, observed) {
  const top = self.filter((f) => f.predicate === 'likes' && structured(f)).sort((a, b) => b.weight - a.weight).slice(0, 5);
  const likes = observed.filter((o) => o.predicate === 'likes');
  if (!top.length || !likes.length) return UNKNOWN;
  const hits = top.map((f) => ({ f, o: bestMatch(f, likes, INTEREST_COSINE) })).filter((h) => h.o);
  const score = hits.reduce((s, h) => s + h.f.weight, 0) / top.reduce((s, f) => s + f.weight, 0);
  return { score: r2(score), confidence: r2(mean((hits.length ? hits.map((h) => h.o) : likes).map((o) => o.confidence))) };
}

const words = (m) => m.text.split(/\s+/).filter(Boolean).length;
const asks = (ms) => (ms.length ? ms.filter((m) => m.text.includes('?')).length / ms.length : 0);

/** Length ratio, question balance, asking back, reply latency (human replies only). Confidence grows with their message count. */
export function communicationDim(mine, theirs) {
  if (!theirs.length || !mine.length) return UNKNOWN;
  const [a, b] = [median(mine.map(words)), median(theirs.map(words))];
  const parts = [
    Math.min(a, b) / Math.max(a, b, 1),
    1 - Math.abs(asks(mine) - asks(theirs)),
    Math.min(1, asks(theirs) / 0.4),
  ];
  const humanGaps = theirs
    .filter((m) => m.authoredBy === 'human' && m.prevAt)
    .map((m) => (new Date(m.createdAt) - new Date(m.prevAt)) / 60_000);
  if (humanGaps.length) {
    const gap = Math.max(5, median(humanGaps)); // ≤ 5 min = 1, a day = 0, log scale between
    parts.push(Math.max(0, 1 - Math.log10(gap / 5) / Math.log10(288)));
  }
  return { score: r2(mean(parts)), confidence: r2(Math.min(1, theirs.length / 6)) };
}

/** Light-touch: the viewer's extraversion vs the energy of their messages. Always low confidence. */
export function personalityDim(traits, theirs) {
  if (traits.extraversion == null || theirs.length < 3) return UNKNOWN;
  const m = styleMetrics(theirs.map((x) => x.text));
  const energy = 0.5 * Math.min(1, m.medianWords / 15) + 0.25 * m.exclamationRate + 0.25 * Math.min(1, m.emojiPerMessage);
  return { score: r2(1 - Math.abs(traits.extraversion - energy)), confidence: 0.3 };
}

const toneOf = (t) => [
  t.extraversion < 0.4 && 'prefers calm, low-key energy',
  t.extraversion > 0.7 && 'enjoys outgoing, playful energy',
  t.agreeableness > 0.7 && 'values kindness and warmth',
  t.openness > 0.7 && 'enjoys curious, idea-rich conversation',
].filter(Boolean).join('; ');

/** → the viewer's report: { verdict, score, dimensions, chemistry, reasons, concerns, askYourself, summary, icebreakers, evaluatedAt } */
export async function evaluateFor(match, viewerId) {
  const viewer = String(viewerId);
  const otherId = otherUserId(match, viewer);
  const matchId = match._id;
  const [viewerProfile, theirProfile, observed, messages] = await Promise.all([
    Profile.findOne({ userId: viewer }).lean(),
    Profile.findOne({ userId: otherId }, { name: 1 }).lean(),
    KgFact.find({ matchId, observerId: viewer, subjectId: otherId }).select('+embedding').lean(),
    Message.find({ matchId }).sort({ createdAt: 1 }).lean(),
  ]);
  const self = await selfFacts(viewer, viewerProfile);
  const traits = Object.fromEntries(self.filter((f) => f.predicate === 'trait').map((f) => [f.object, f.value]));
  const brief = match.brief?.[viewer];
  const [userName, matchName] = [firstName(viewerProfile?.name), firstName(theirProfile?.name)];

  // Hard gate: a dealbreaker clash found before (plan 07) or during (plan 08) the conversation.
  const stop = match.agentState?.stopReason === 'dealbreaker' && match.agentState.stopDetail?.viewerId === viewer ? match.agentState.stopDetail : null;
  const clash = brief?.earlyDealbreaker ?? stop;

  messages.forEach((m, i) => { m.prevAt = messages[i - 1]?.createdAt; });
  const mine = messages.filter((m) => String(m.senderId) === viewer);
  const theirs = messages.filter((m) => String(m.senderId) !== viewer);
  const { dims: aligned } = await alignmentDims({ self, observed, viewerId: viewer, matchId });
  const dimensions = {
    dealbreakers: { score: clash ? 0 : 1, confidence: clash ? 0.9 : 0.6 },
    ...aligned,
    interests: interestsDim(self, observed),
    communication: communicationDim(mine, theirs),
    personality: personalityDim(traits, theirs),
  };

  // Judge: one smart call. No conversation (early dealbreaker) = nothing to judge.
  let judged = { chemistry: 0.5, reasons: [], concerns: [], askYourself: [], summary: '' };
  const ids = new Map(messages.map((m, i) => [`m${i + 1}`, String(m._id)]));
  if (messages.length) {
    try {
      const out = await chatJSON({
        tier: 'smart', schema: judgeSchema, purpose: 'verdict', userId: viewer, matchId,
        messages: verdictPrompt.build({
          userName, matchName,
          facts: self.filter((f) => f.disclosure !== 'private' && !['trait', 'style'].includes(f.predicate)).sort((a, b) => b.weight - a.weight).slice(0, 25).map((f) => `${f.predicate}: ${f.object}`),
          tone: toneOf(traits),
          dimensions: Object.fromEntries(Object.entries(dimensions).map(([k, d]) => [k, d.score])),
          agenda: (brief?.agenda ?? []).map((a) => `${a.topic}: ${a.status}`),
          transcript: messages.map((m, i) => `[m${i + 1}] ${String(m.senderId) === viewer ? userName : matchName}: ${m.text}`),
        }),
      });
      // Every reason/concern must cite a message that exists; the rest are dropped.
      const withReceipts = (list) => list
        .map((x) => ({ text: x.text, messageIds: x.messageIds.map((id) => ids.get(String(id).replace(/[[\]]/g, ''))).filter(Boolean) }))
        .filter((x) => x.messageIds.length);
      judged = { chemistry: r2(out.chemistry), reasons: withReceipts(out.reasons).slice(0, 4), concerns: withReceipts(out.concerns).slice(0, 3), askYourself: out.askYourself.slice(0, 3), summary: out.summary };
    } catch (err) {
      if (err.name === 'BudgetExceededError') throw err;
      console.error(`verdict judge unavailable (${err.code ?? err.name}): ${err.message}`);
      judged.summary = "Your agent couldn't write the full report this time; the scores come from the conversation itself.";
    }
  }
  if (clash) {
    judged.concerns.unshift({ text: clash.why, messageIds: [], quote: clash.quote });
    if (!judged.summary) judged.summary = `This one ended early: ${clash.why}`;
  } else if (!messages.length) {
    judged.summary ||= "This one ended before a real conversation started: something important didn't line up on their side.";
  }

  const computed = verdictFor({ dimensions, chemistry: judged.chemistry });
  const { score, avgConf } = computed;
  // No conversation only happens after an early dealbreaker (theirs or ours): the match is closing either way.
  const verdict = messages.length ? computed.verdict : 'incompatible';
  const icebreakers = verdict === 'incompatible' ? [] : await writeIcebreakers({ viewer, matchId, matchName, brief, observed });
  return { verdict, score, avgConfidence: avgConf, dimensions, ...judged, icebreakers, evaluatedAt: new Date() };
}

async function writeIcebreakers({ viewer, matchId, matchName, brief, observed }) {
  try {
    const out = await chatJSON({
      tier: 'fast', purpose: 'icebreakers', userId: viewer, matchId,
      schema: z.object({ icebreakers: items(z.string().trim().min(1).max(160)) }),
      messages: icebreakersPrompt.build({
        matchName,
        overlaps: (brief?.overlaps ?? []).map((o) => o.topic),
        observed: observed.filter((o) => o.source === 'conversation').sort((a, b) => b.confidence - a.confidence).slice(0, 8).map((o) => o.object),
      }),
    });
    return out.icebreakers.slice(0, 3);
  } catch (err) {
    if (err.name === 'BudgetExceededError') throw err;
    return [];
  }
}
