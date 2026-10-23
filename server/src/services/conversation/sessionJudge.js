// Plan 33 C1 (A7): the judge for full / demo chats. One evidence pass per side per session (mid tier) adds to a ledger
// on the conversation; code decides from the ledger (judgeDecision.js, the high bar). The final verdict reuses the
// ledger: no extra model call. Decides for MY user only, from MY graph and the transcript (DB spy: never theirs).
import { z } from 'zod';
import { ChatEvent } from '../../models/ChatEvent.js';
import { Concept } from '../../models/Concept.js';
import { Conversation } from '../../models/Conversation.js';
import { KgFact } from '../../models/KgFact.js';
import { Match } from '../../models/Match.js';
import { Message } from '../../models/Message.js';
import { Profile } from '../../models/Profile.js';
import { items } from '../../utils/zodItems.js';
import { debug } from '../../utils/log.js';
import { asActor } from '../actor.js';
import { KG } from '../kg/config.js';
import { isVerbatim } from '../kg/extractFacts.js';
import { chatJSON, modelId } from '../llm/client.js';
import { nameOf, otherUserId } from '../matches.js';
import * as judgePrompt from '../prompts/judge.js';
import { branchOf, chemistry, tierOf } from './evidence.js';
import { fromAgenda, judgeSchema, label, OPTIONS, traitWords, validateDecision } from './judge.js';
import { decideFor } from './judgeDecision.js';
import { depthCfg, depthOf } from './sessions.js';

// Built on first use: judge.js and this module import each other (judgeSide → judgeFromLedger).
let passSchema;
const schemaOf = () => (passSchema ??= judgeSchema.extend({
  inconsistencies: items(z.object({ quote: z.string().trim().min(3).max(300), earlier: z.string().trim().min(3).max(300) })).catch([]),
}));
const MID = { tier: 'mid', reasoning: false }; // short and cheap; the decision is code's

/** Which session a message (by its index in the match) belongs to. */
export const sessionAt = (sessions, i) => [...sessions].reverse().find((s) => s.startCount <= i)?.n ?? 1;

const dealbreakersOf = (gate = {}) => Object.fromEntries((gate.dealbreakers ?? []).map((a) => [a, gate.accepts?.[a] ?? []]));

/**
 * Session n's evidence pass for my side (idempotent: a pass already in my ledger is skipped). Positives and frictions
 * carry MY fact's _id, tier and branch; an inconsistency needs both quotes verbatim in THEIR messages.
 */
export async function evidencePass({ conversationId, userId, n }) {
  const me = String(userId);
  const conv = await Conversation.findById(conversationId).lean();
  if (!conv || (conv.ledger?.[me]?.passes ?? []).includes(n)) return null;
  const match = await Match.findById(conv.matchId).lean();
  if (!match) return null;
  const otherId = otherUserId(match, me);
  const s = conv.sessions[n - 1];
  return asActor({ role: 'judge', userId: me, otherId }, async () => {
    const until = s.endedAt ?? conv.endedAt;
    const [facts, profile, notes, events, all] = await Promise.all([
      KgFact.find({ subjectId: me, observerId: null }).lean(),
      Profile.findOne({ userId: me }, { name: 1, gate: 1 }).lean(),
      KgFact.find({ observerId: me, matchId: match._id }, { predicate: 1, object: 1, evidence: 1, confidence: 1 }).sort({ confidence: -1 }).limit(30).lean(),
      ChatEvent.find({ observerId: me, matchId: match._id }).sort({ createdAt: 1 }).lean(),
      Message.find({ matchId: match._id, ...(until && { createdAt: { $lte: until } }) }).sort({ createdAt: 1 }).lean(),
    ]);
    const msgs = all.slice(s.startCount);
    const userName = nameOf(match, me);
    const matchName = nameOf(match, otherId);
    const transcript = msgs.map((m, i) => ({ id: `m${s.startCount + i + 1}`, _id: m._id, text: m.text, mine: String(m.senderId) === me, agent: m.authoredBy === 'agent', filler: m.checks?.fallback === 'template' }));
    const theirEarlier = all.slice(0, s.startCount).filter((m) => String(m.senderId) !== me).map((m) => m.text);
    const dealbreakers = dealbreakersOf(profile?.gate);
    const shown = facts.filter((f) => !['trait', 'style'].includes(f.predicate)).sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0)).slice(0, 60);
    const factById = new Map(shown.map((f, i) => [`F${i + 1}`, f]));
    const types = new Map((await Concept.find({ _id: { $in: shown.map((f) => f.conceptId).filter(Boolean) } }, { type: 1 }).lean()).map((c) => [String(c._id), c.type]));
    const hints = events.filter((e) => e.type === 'dealbreaker_hint');
    const entry = { passes: [n], positives: [], frictions: [], dealbreakerRisk: [], inconsistencies: [] };
    let model = null;
    if (transcript.length) {
      const traits = Object.fromEntries(facts.filter((f) => f.predicate === 'trait').map((f) => [f.object, f.value]));
      const prompt = {
        userName, matchName,
        facts: [...factById].map(([id, f]) => `${id} ${label(f)}`),
        dealbreakers: Object.entries(dealbreakers).map(([a, acc]) => `${a}: accepts ${acc.join(', ') || '?'} (options: ${(OPTIONS[a] ?? []).join(', ')})`),
        traits: traitWords(traits),
        notes: notes.map((x) => `${x.predicate}: ${x.object}${x.evidence?.[0]?.quote ? ` ("${x.evidence[0].quote}")` : ''}`),
        events: events.map((e) => `${e.type}${e.label ? ` (${e.label})` : ''}, ${Math.round((e.weight ?? 0.5) * 100) / 100}${e.quote ? `: "${e.quote}"` : ''}`),
        agenda: (match.brief?.[me]?.agenda ?? []).map((a) => `${a.topic}${a.dealbreaker ? ' [dealbreaker]' : ''}: ${a.status}`),
        transcript: transcript.map((m) => `[${m.id}] ${m.mine ? userName : matchName}${m.agent ? ' (agent)' : ''}${m.filler ? ' [system filler, not their words]' : ''}: ${m.text}`),
        session: { n, earlier: conv.sessions.slice(0, n - 1).map((x) => x.summary).filter(Boolean).map((t, i) => `Sitting ${i + 1}: ${t}`), theirEarlier },
      };
      try {
        const out = await chatJSON({ ...MID, temperature: 0, schema: schemaOf(), purpose: 'judge-session', userId: me, matchId: match._id, messages: judgePrompt.build(prompt) });
        model = modelId(MID.tier);
        const { value } = validateDecision(out, { transcript, hints, factIds: new Set(factById.keys()), options: OPTIONS });
        const tag = (x) => {
          const f = x.factId ? factById.get(x.factId) : null;
          return { ...x, factId: f ? String(f._id) : null, ...(f && { tier: tierOf(f), branch: branchOf(f, types.get(String(f.conceptId))) }), session: n };
        };
        const theirs = transcript.filter((m) => !m.mine && !m.filler);
        Object.assign(entry, {
          positives: value.positives.map(tag), frictions: value.frictions.map(tag), dealbreakerRisk: value.dealbreakerRisk,
          // Both quotes must be THEIR words: one from this sitting, one from an earlier sitting.
          inconsistencies: out.inconsistencies.filter((x) => theirs.some((m) => isVerbatim(x.quote, m.text)) && theirEarlier.some((t) => isVerbatim(x.earlier, t))),
          summaryForUser: value.summaryForUser,
        });
      } catch (err) {
        if (err.name === 'BudgetExceededError') throw err;
        console.error(`evidence pass ${match._id}/${me} #${n} failed (${err.message}); this session adds no evidence`);
      }
    }
    const path = `ledger.${me}`;
    await Conversation.updateOne({ _id: conv._id }, {
      $push: Object.fromEntries(['passes', 'positives', 'frictions', 'dealbreakerRisk', 'inconsistencies'].map((k) => [`${path}.${k}`, { $each: entry[k] }])),
      ...(entry.summaryForUser && { $set: { [`${path}.summaryForUser`]: entry.summaryForUser, [`${path}.model`]: model } }),
    });
    debug(`evidence pass ${match._id}/${me} #${n}: +${entry.positives.length} positives, +${entry.frictions.length} frictions`);
    return entry;
  });
}

/** My side's decision from the ledger so far (code only). → judgeDecision's result + { bar } */
export async function sessionDecision(conversationId, userId) {
  const me = String(userId);
  const conv = await Conversation.findById(conversationId).lean();
  const match = await Match.findById(conv.matchId).lean();
  return asActor({ role: 'judge', userId: me, otherId: otherUserId(match, me) }, () => decideFromLedger(conv, match, me));
}

async function decideFromLedger(conv, match, me) {
  const L = conv.ledger?.[me] ?? {};
  const cfg = depthCfg(depthOf(conv));
  const ended = conv.sessions.filter((s) => s.endedAt);
  const until = ended.at(-1)?.endedAt ?? conv.endedAt;
  const ids = [...(L.positives ?? []), ...(L.frictions ?? [])].map((x) => x.factId).filter(Boolean);
  const [profile, messages, factDocs, hints] = await Promise.all([
    Profile.findOne({ userId: me }, { gate: 1 }).lean(),
    Message.find({ matchId: match._id, ...(until && { createdAt: { $lte: until } }) }, { text: 1, senderId: 1 }).sort({ createdAt: 1 }).lean(),
    KgFact.find({ _id: { $in: ids }, subjectId: me }).lean(),
    ChatEvent.find({ observerId: me, matchId: match._id, type: 'dealbreaker_hint' }).lean(),
  ]);
  // No dealbreakerRisk in any pass but a recorded hint: the hint is the evidence (as in a short chat's judge).
  const risk = L.dealbreakerRisk?.length ? L.dealbreakerRisk : hints.map((h) => ({ attribute: h.label?.split(':')[0] ?? 'dealbreaker', quote: h.quote ?? '', value: null }));
  const dealbreakers = dealbreakersOf(profile?.gate);
  const { undiscussed, profileFrictions } = fromAgenda(match.brief?.[me]?.agenda ?? [], dealbreakers);
  const interestEnds = ended.map((s) => s.interestEnd?.[me] ?? null);
  let lowInterestRun = 0;
  for (const i of [...interestEnds].reverse()) { if (i != null && i < KG.SESSION_BAR.LOW_INTEREST) lowInterestRun++; else break; }
  const bar = {
    sessions: ended.length, messages: messages.length, minSessions: cfg.minSessionsForYes, minMessages: cfg.minMessagesForYes,
    chemistry: chemistry(messages.map((m, i) => ({ text: m.text, mine: String(m.senderId) === me, session: sessionAt(conv.sessions, i) })), interestEnds),
    inconsistencies: (L.inconsistencies ?? []).length, lowInterestRun,
  };
  const decided = decideFor(depthOf(conv), {
    positives: L.positives ?? [], frictions: [...(L.frictions ?? []), ...profileFrictions], dealbreakerRisk: risk,
    facts: new Map(factDocs.map((f) => [String(f._id), f])), dealbreakers, undiscussed, bar,
  });
  return { ...decided, bar };
}

/** The sessionEnd job's decision step: both sides' evidence passes (in parallel), then each side's decision. */
export async function decideSession(conv, match) {
  await Promise.all(match.users.map((u) => evidencePass({ conversationId: conv._id, userId: u, n: conv.sessionIndex })));
  const out = {};
  for (const u of match.users.map(String)) {
    const d = await sessionDecision(conv._id, u);
    out[u] = { decision: d.decision, confidence: d.confidence, reason: d.reason };
  }
  return out;
}

/**
 * judgeSide for full / demo chats: the passes still missing (a chat stopped mid-session), then the ledger decides.
 * → the MatchDecision fields (no icebreakers; judgeSide adds them as for a short chat).
 */
export async function judgeFromLedger(conv, match, me) {
  const count = await Message.countDocuments({ matchId: match._id });
  for (const s of conv.sessions) if (s.startCount < count) await evidencePass({ conversationId: conv._id, userId: me, n: s.n });
  const L = (await Conversation.findById(conv._id).lean()).ledger?.[me] ?? {};
  const decided = await sessionDecision(conv._id, me);
  const gate = (await Profile.findOne({ userId: me }, { gate: 1 }).lean())?.gate ?? {};
  const { worthAsking } = fromAgenda(match.brief?.[me]?.agenda ?? [], dealbreakersOf(gate));
  const ask = decided.frictions.filter((x) => x.attribute && !x.quote).map((x) => x.attribute.replace(/_/g, ' '));
  const quoted = (x) => ({ quote: x.quote, why: x.why, messageId: x.messageId, factId: x.factId, theirs: x.theirs });
  return {
    value: {
      decision: decided.decision, confidence: decided.confidence,
      positives: (L.positives ?? []).map(quoted),
      frictions: decided.frictions.map((x) => ({ ...quoted(x), severity: x.severity, attribute: x.attribute, source: x.source })),
      dealbreakerRisk: L.dealbreakerRisk ?? [],
      noFrictionJustification: decided.frictions.length ? null : 'Nothing gave pause across the sessions.',
      summaryForUser: [L.summaryForUser,
        decided.decision === 'unsure' && decided.missing?.length && `Still to find out: ${decided.missing.slice(0, 3).join('; ')}.`,
        ask.length && `You never found out where they stand on ${ask.join(' and ')}, so it's worth asking.`,
        worthAsking.length && `Worth asking yourself: ${worthAsking.join('; ')}.`].filter(Boolean).join(' '),
    },
    judgeModel: L.model ?? null,
    validation: { reasked: false, dropped: [], reason: decided.reason },
    worthAsking,
    counts: decided.counts,
  };
}
