// The judge (plan 09 §1): one job per side per conversation (`judge`, dedupeKey judge:<conversationId>:<userId>).
// Decides for MY user only, from MY full self graph (private facts and dealbreakers included: the output is a private
// decision), MY notes and chat moments, my agenda and the transcript. Never the other user's graph.
import { z } from 'zod';
import { ChatEvent } from '../../models/ChatEvent.js';
import { Conversation } from '../../models/Conversation.js';
import { KgFact } from '../../models/KgFact.js';
import { Match } from '../../models/Match.js';
import { MatchDecision } from '../../models/MatchDecision.js';
import { Message } from '../../models/Message.js';
import { Profile } from '../../models/Profile.js';
import { items } from '../../utils/zodItems.js';
import { asActor } from '../actor.js';
import { settle } from '../compat/index.js';
import { KG } from '../kg/config.js';
import { isVerbatim } from '../kg/extractFacts.js';
import { chatJSON, modelId } from '../llm/client.js';
import { nameOf, otherUserId } from '../matches.js';
import * as icebreakersPrompt from '../prompts/icebreakers.js';
import * as judgePrompt from '../prompts/judge.js';
import { debug } from '../../utils/log.js';

const quoted = { quote: z.string().trim().max(400).catch(''), why: z.string().trim().min(1).max(300), messageId: z.string().nullable().catch(null) };
export const judgeSchema = z.object({
  decision: z.enum(['yes', 'no', 'unsure']).catch('unsure'),
  confidence: z.coerce.number().min(0).max(1).catch(0),
  positives: items(z.object(quoted)).catch([]),
  frictions: items(z.object({ ...quoted, severity: z.coerce.number().int().min(1).max(3).catch(1) })).catch([]),
  dealbreakerRisk: items(z.object({ attribute: z.string().trim().min(1).max(60), quote: z.string().trim().max(400).catch('') })).catch([]),
  noFrictionJustification: z.string().trim().max(400).nullable().catch(null),
  summaryForUser: z.string().trim().max(800).catch(''),
});

const short = (s) => `"${String(s).slice(0, 60)}"`;

/**
 * Code validators (plan 09 §1). transcript: [{ id: 'm1', _id, text }]; hints: my dealbreaker_hint events.
 * → { value, problems, dropped }: `problems` trigger the one re-ask; `value` already has the offending items dropped,
 * every quote mapped to a real message _id, and a low-confidence yes turned into unsure.
 */
export function validateDecision(out, { transcript, hints = [], yesMin = KG.JUDGE_YES_MIN }) {
  const problems = [];
  const dropped = [];
  const byId = new Map(transcript.map((m) => [m.id, m]));
  const locate = (quote, id) => {
    const named = byId.get(String(id ?? '').replace(/[[\]\s]/g, ''));
    if (named && isVerbatim(quote, named.text)) return named;
    return transcript.find((m) => isVerbatim(quote, m.text)) ?? null;
  };
  const evidence = (list, kind) => list.flatMap((x) => {
    if ((x.quote ?? '').length < 3) {
      problems.push(`${kind} without a verbatim quote (${short(x.why)}): quote the transcript or remove it.`);
      dropped.push(`${kind} without quote: ${x.why}`);
      return [];
    }
    const msg = locate(x.quote, x.messageId);
    if (!msg) {
      problems.push(`${kind} quote ${short(x.quote)} is not verbatim in the transcript.`);
      dropped.push(`${kind} not verbatim: ${x.quote}`);
      return [];
    }
    return [{ ...x, messageId: String(msg._id) }];
  });

  const positives = evidence(out.positives, 'positive');
  const frictions = evidence(out.frictions, 'friction');
  // A dealbreaker risk is about THEM: its quote must be their own words (not mine, not my agent's).
  const dealbreakerRisk = out.dealbreakerRisk.filter((d) => {
    if (!d.quote) return true;
    const msg = transcript.find((m) => !m.mine && isVerbatim(d.quote, m.text));
    if (msg) return true;
    dropped.push(`dealbreakerRisk not their words: ${d.quote}`);
    return false;
  });
  const justification = out.noFrictionJustification?.trim() || null;
  if (!frictions.length && !justification) problems.push('frictions is empty and there is no noFrictionJustification.');
  if (hints.length && !dealbreakerRisk.length) problems.push(`a dealbreaker came up (${hints.map((h) => h.label).join(', ')}) but dealbreakerRisk is empty.`);

  let { decision } = out;
  if (decision === 'yes' && out.confidence < yesMin) decision = 'unsure';
  return {
    value: { ...out, decision, positives, frictions, dealbreakerRisk, noFrictionJustification: frictions.length ? null : justification },
    problems, dropped,
  };
}

/** Smart tier (JUDGE_MODEL if set) at t=0; if it's unavailable, mid with reasoning off. → { out, model } */
async function callJudge({ messages, userId, matchId, purpose, prefer }) {
  const smart = { tier: 'smart', model: KG.JUDGE_MODEL ?? undefined, retries: 0 }; // one 180 s attempt: the mid fallback covers Ultra's free-tier timeouts
  const mid = { tier: 'mid', reasoning: false };
  for (const opt of prefer ? [prefer] : [smart, mid]) {
    try {
      const out = await chatJSON({ ...opt, temperature: 0, schema: judgeSchema, purpose, userId, matchId, messages });
      return { out, opt, model: opt.model ?? modelId(opt.tier) };
    } catch (err) {
      if (prefer || opt === mid) throw err;
      console.warn(`judge ${matchId}: smart tier unavailable (${err.status ?? err.name}: ${err.message}); falling back to mid`);
    }
  }
}

async function writeIcebreakers({ userId, matchId, matchName, events, notes }) {
  const shared = [...new Set(events.filter((e) => e.type === 'shared_interest').sort((a, b) => b.weight - a.weight).map((e) => e.label).filter(Boolean))];
  if (!shared.length && !notes.length) return [];
  try {
    const out = await chatJSON({
      tier: 'fast', purpose: 'icebreakers', userId, matchId, schema: z.object({ icebreakers: items(z.string().trim().min(1).max(160)) }),
      messages: icebreakersPrompt.build({ matchName, overlaps: shared.slice(0, 5), observed: notes.slice(0, 8).map((n) => n.object) }),
    });
    return out.icebreakers.slice(0, 3);
  } catch (err) {
    if (err.name === 'BudgetExceededError') throw err;
    return [];
  }
}

const label = (f) => `${f.predicate}: ${f.object}${f.isDealbreaker ? ' [dealbreaker]' : ''}${f.importance >= 0.9 ? ' (matters a lot)' : ''}${f.disclosure === 'private' ? ' [private]' : ''}`;
const traitWords = (t) => [
  t.extraversion != null && (t.extraversion < 0.4 ? 'calm, low-key' : t.extraversion > 0.7 ? 'outgoing, playful' : null),
  t.agreeableness > 0.7 && 'values kindness and warmth',
  t.openness > 0.7 && 'curious, idea-rich',
].filter(Boolean).join('; ');

/** The judge for one side. Idempotent: an existing decision is reused. → the MatchDecision */
export async function judgeSide({ conversationId, userId }) {
  const me = String(userId);
  const conv = await Conversation.findById(conversationId).lean();
  if (!conv) return null;
  const existing = await MatchDecision.findOne({ conversationId, userId: me }).lean();
  if (existing) return existing;
  const match = await Match.findById(conv.matchId).lean();
  if (!match) return null;
  const otherId = otherUserId(match, me);

  return asActor({ role: 'judge', userId: me, otherId }, async () => {
    const [facts, profile, notes, events, messages] = await Promise.all([
      KgFact.find({ subjectId: me, observerId: null }).lean(),
      Profile.findOne({ userId: me }, { name: 1, gate: 1 }).lean(),
      KgFact.find({ observerId: me, matchId: match._id }, { predicate: 1, object: 1, evidence: 1, confidence: 1 }).sort({ confidence: -1 }).limit(30).lean(),
      ChatEvent.find({ observerId: me, matchId: match._id }).sort({ createdAt: 1 }).lean(),
      Message.find({ matchId: match._id }).sort({ createdAt: 1 }).lean(),
    ]);
    const userName = nameOf(match, me);
    const matchName = nameOf(match, otherId);
    const transcript = messages.map((m, i) => ({ id: `m${i + 1}`, _id: m._id, text: m.text, mine: String(m.senderId) === me, agent: m.authoredBy === 'agent' }));
    const hints = events.filter((e) => e.type === 'dealbreaker_hint');
    const base = { conversationId, matchId: match._id, userId: me, otherUserId: otherId };

    let value;
    let judgeModel = null;
    let validation = { reasked: false, dropped: [] };
    if (!messages.length) {
      value = { decision: 'unsure', confidence: 0, positives: [], frictions: [], dealbreakerRisk: [], noFrictionJustification: 'There was no conversation to judge.', summaryForUser: "This chat never really got going, so it's your call." };
    } else {
      const gate = profile?.gate ?? {};
      const traits = Object.fromEntries(facts.filter((f) => f.predicate === 'trait').map((f) => [f.object, f.value]));
      const prompt = {
        userName, matchName,
        facts: facts.filter((f) => !['trait', 'style'].includes(f.predicate)).sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0)).slice(0, 60).map(label),
        dealbreakers: (gate.dealbreakers ?? []).map((a) => `${a}: ${(gate.accepts?.[a] ?? []).join(', ') || '?'}`),
        traits: traitWords(traits),
        notes: notes.map((n) => `${n.predicate}: ${n.object}${n.evidence?.[0]?.quote ? ` ("${n.evidence[0].quote}")` : ''}`),
        events: events.map((e) => `${e.type}${e.label ? ` (${e.label})` : ''}, ${Math.round((e.weight ?? 0.5) * 100) / 100}${e.quote ? `: "${e.quote}"` : ''}`),
        agenda: (match.brief?.[me]?.agenda ?? []).map((a) => `${a.topic}${a.dealbreaker ? ' [dealbreaker]' : ''}: ${a.status}`),
        endedBy: conv.endedBy,
        transcript: transcript.map((m) => `[${m.id}] ${m.mine ? userName : matchName}${m.agent ? ' (agent)' : ''}: ${m.text}`),
      };
      const first = await callJudge({ messages: judgePrompt.build(prompt), userId: me, matchId: match._id, purpose: 'judge' });
      judgeModel = first.model;
      let checked = validateDecision(first.out, { transcript, hints });
      if (checked.problems.length) {
        validation.reasked = true;
        debug(`judge ${match._id}/${me}: re-asking (${checked.problems.join(' ')})`);
        try {
          const again = await callJudge({ messages: judgePrompt.build({ ...prompt, warning: checked.problems.join(' ') }), userId: me, matchId: match._id, purpose: 'judge-reask', prefer: first.opt });
          const second = validateDecision(again.out, { transcript, hints });
          if (second.problems.length <= checked.problems.length) checked = second;
        } catch (err) {
          if (err.name === 'BudgetExceededError') throw err;
          console.warn(`judge ${match._id}/${me}: re-ask failed (${err.message}); keeping the first answer minus its bad items`);
        }
      }
      value = checked.value;
      validation.dropped = checked.dropped;
      // Still no dealbreakerRisk after the re-ask: the recorded hint events are the evidence.
      if (hints.length && !value.dealbreakerRisk.length) value.dealbreakerRisk = hints.map((h) => ({ attribute: h.label?.split(':')[0] ?? 'dealbreaker', quote: h.quote ?? '' }));
    }
    const icebreakers = value.decision === 'no' ? [] : await writeIcebreakers({ userId: me, matchId: match._id, matchName, events, notes });
    const doc = { ...base, ...value, icebreakers, judgeModel, validation };
    await MatchDecision.updateOne({ conversationId, userId: me }, { $setOnInsert: doc }, { upsert: true });
    console.log(`judge ${match._id}/${me}: ${value.decision} (${value.confidence}) by ${judgeModel ?? 'code'}; ${value.positives.length} positives, ${value.frictions.length} frictions`);
    return MatchDecision.findOne({ conversationId, userId: me }).lean();
  });
}

/** When the judge can't run at all (its last job attempt failed): an honest "unsure", so the match never hangs. */
async function fallbackDecision({ conversationId, userId }) {
  const conv = await Conversation.findById(conversationId).lean();
  const match = conv && await Match.findById(conv.matchId).lean();
  if (!match) return;
  await MatchDecision.updateOne({ conversationId, userId }, { $setOnInsert: {
    conversationId, matchId: match._id, userId, otherUserId: otherUserId(match, userId), decision: 'unsure', confidence: 0,
    noFrictionJustification: 'The judge could not run.', summaryForUser: "Your agent couldn't finish its read on this one, so it's your call.",
  } }, { upsert: true });
}

/** Job handler: judge my side, then settle the match once both sides have decided. */
export async function runJudge(payload, { job } = {}) {
  const lastAttempt = job && job.attempts >= job.maxAttempts;
  try {
    await judgeSide(payload);
  } catch (err) {
    if (!lastAttempt || err.name === 'BudgetExceededError') throw err;
    console.error(`judge ${payload.conversationId}/${payload.userId}: giving up (${err.message}); recording unsure`);
    await fallbackDecision(payload);
  }
  const conv = await Conversation.findById(payload.conversationId, { matchId: 1 }).lean();
  if (conv) await settle(conv.matchId, payload.conversationId);
}
