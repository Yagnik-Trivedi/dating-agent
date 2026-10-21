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
import { QUESTIONS } from '../kg/questions.js';
import { agendaAttribute } from '../kg/questionnaireFacts.js';
import { judgeDecision } from './judgeDecision.js';
import { isVerbatim } from '../kg/extractFacts.js';
import { chatJSON, modelId } from '../llm/client.js';
import { nameOf, otherUserId } from '../matches.js';
import * as icebreakersPrompt from '../prompts/icebreakers.js';
import * as judgePrompt from '../prompts/judge.js';
import { topicText } from '../prompts/agentReply.js';
import { debug } from '../../utils/log.js';

// The LLM lists evidence only; judgeDecision.js decides (owner's judge fix). factId: which of MY facts (F1…) it bears on.
const quoted = { quote: z.string().trim().max(400).catch(''), why: z.string().trim().min(1).max(300), messageId: z.string().nullable().catch(null), factId: z.string().trim().nullable().catch(null) };
export const judgeSchema = z.object({
  positives: items(z.object(quoted)).catch([]),
  frictions: items(z.object({ ...quoted, severity: z.coerce.number().int().min(1).max(3).catch(1) })).catch([]),
  // value: the option THEY stated for my dealbreaker attribute (null when they didn't say clearly)
  dealbreakerRisk: items(z.object({ attribute: z.string().trim().min(1).max(60), quote: z.string().trim().max(400).catch(''), value: z.string().trim().nullable().catch(null) })).catch([]),
  noFrictionJustification: z.string().trim().max(400).nullable().catch(null),
  summaryForUser: z.string().trim().max(800).catch(''),
});

const short = (s) => `"${String(s).slice(0, 60)}"`;

/**
 * Code validators (plan 09 §1). transcript: [{ id: 'm1', _id, text, mine, filler }]; hints: my dealbreaker_hint events;
 * factIds: the F-ids shown to the judge; options: { attribute: [option values] }.
 * → { value, problems, dropped }: `problems` trigger the one re-ask; `value` has the offending items dropped, every quote
 * mapped to a real message _id (+ `theirs`), unknown fact ids nulled and dealbreaker values outside the options nulled.
 */
export function validateDecision(out, { transcript, hints = [], factIds = null, options = {} }) {
  const problems = [];
  const dropped = [];
  const byId = new Map(transcript.map((m) => [m.id, m]));
  const locate = (quote, id) => {
    const named = byId.get(String(id ?? '').replace(/[[\]\s]/g, ''));
    if (named && !named.filler && isVerbatim(quote, named.text)) return named;
    return transcript.find((m) => !m.filler && isVerbatim(quote, m.text)) ?? null; // app filler lines are nobody's words
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
    const factId = x.factId && (!factIds || factIds.has(x.factId)) ? x.factId : null;
    return [{ ...x, factId, messageId: String(msg._id), theirs: !msg.mine }];
  });

  const positives = evidence(out.positives, 'positive');
  const frictions = evidence(out.frictions, 'friction');
  // A dealbreaker risk is about THEM: its quote must be their own words (not mine, not my agent's).
  const dealbreakerRisk = out.dealbreakerRisk.filter((d) => {
    if (!d.quote) return true;
    const msg = transcript.find((m) => !m.mine && !m.filler && isVerbatim(d.quote, m.text));
    if (msg) return true;
    dropped.push(`dealbreakerRisk not their words: ${d.quote}`);
    return false;
  }).map((d) => ({ ...d, value: options[d.attribute]?.includes(d.value) ? d.value : null }));
  const justification = out.noFrictionJustification?.trim() || null;
  if (!frictions.length && !justification) problems.push('frictions is empty and there is no noFrictionJustification.');
  if (hints.length && !dealbreakerRisk.length) problems.push(`a dealbreaker came up (${hints.map((h) => h.label).join(', ')}) but dealbreakerRisk is empty.`);

  return {
    value: { ...out, positives, frictions, dealbreakerRisk, noFrictionJustification: frictions.length ? null : justification },
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

const OPTIONS = Object.fromEntries(QUESTIONS.sections.find((x) => x.id === 'B').items.map((i) => [i.id, i.options.map((o) => o.value)]));
const label = (f) => `${f.predicate}: ${f.object}${f.isDealbreaker ? ' [dealbreaker]' : ''}${f.importance >= 0.9 ? ' (matters a lot)' : ''}${f.disclosure === 'private' ? ' [private]' : ''}`;
const traitWords = (t) => [
  t.extraversion != null && (t.extraversion < 0.4 ? 'calm, low-key' : t.extraversion > 0.7 ? 'outgoing, playful' : null),
  t.agreeableness > 0.7 && 'values kindness and warmth',
  t.openness > 0.7 && 'curious, idea-rich',
].filter(Boolean).join('; ');

/**
 * What my agenda tells the judge (code only). → { undiscussed, profileFrictions, worthAsking }
 * SN agendas: every dealbreaker the chat didn't settle is "undiscussed" (a severity-2 friction).
 * Plan 31 agendas (built with needToAsk): gate- and profile-settled items are known, never undiscussed; only a
 * dealbreaker reopened by a hint and still open is. A basic on their profile that differs from mine on something that
 * matters a lot (not a dealbreaker: the gate handles those) is a friction from their profile. askOnce items that never
 * came up are "worth asking yourself", never against the match.
 */
export function fromAgenda(agenda = [], dealbreakers = {}) {
  const human = agenda.some((a) => a.settledBy || a.askOnce || a.kind || a.status === 'for_you');
  const settledAttrs = new Set(agenda.filter((a) => a.status === 'answered').map(agendaAttribute));
  if (!human) return { undiscussed: Object.keys(dealbreakers).filter((a) => !settledAttrs.has(a)), profileFrictions: [], worthAsking: [] };
  const reopened = new Set(agenda.filter((a) => a.reopened && a.status !== 'answered').map(agendaAttribute));
  return {
    undiscussed: Object.keys(dealbreakers).filter((a) => reopened.has(a)),
    profileFrictions: agenda.filter((a) => a.settledBy === 'profile' && a.differs && !a.dealbreaker && a.priority >= KG.JUDGE_NO_IMPORTANCE).map((a) => ({
      quote: '', messageId: null, severity: 2, source: 'their profile',
      why: `From their profile: ${a.topic} is "${String(a.profileValue).replace(/_/g, ' ')}", and yours is "${String(a.value ?? '?').replace(/_/g, ' ')}". That matters a lot to you.`,
    })),
    worthAsking: agenda.filter((a) => a.askOnce && a.status !== 'answered').map((a) => topicText(a.topic)),
  };
}

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
      // Up to the end of this conversation: never a wind-down or a later human message (re-judging, rejudge.js).
      Message.find({ matchId: match._id, ...(conv.endedAt && { createdAt: { $lte: conv.endedAt } }) }).sort({ createdAt: 1 }).lean(),
    ]);
    const userName = nameOf(match, me);
    const matchName = nameOf(match, otherId);
    const transcript = messages.map((m, i) => ({ id: `m${i + 1}`, _id: m._id, text: m.text, mine: String(m.senderId) === me, agent: m.authoredBy === 'agent', filler: m.checks?.fallback === 'template' }));
    const hints = events.filter((e) => e.type === 'dealbreaker_hint');
    const base = { conversationId, matchId: match._id, userId: me, otherUserId: otherId };

    const gate = profile?.gate ?? {};
    const dealbreakers = Object.fromEntries((gate.dealbreakers ?? []).map((a) => [a, gate.accepts?.[a] ?? []]));
    const shown = facts.filter((f) => !['trait', 'style'].includes(f.predicate)).sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0)).slice(0, 60);
    const factById = new Map(shown.map((f, i) => [`F${i + 1}`, f]));
    // My dealbreakers the chat never settled: a severity-2 friction, not a pass (plan 31: the gate and their profile settle some).
    const { undiscussed, profileFrictions, worthAsking } = fromAgenda(match.brief?.[me]?.agenda ?? [], dealbreakers);

    let value;
    let judgeModel = null;
    let validation = { reasked: false, dropped: [] };
    if (!messages.length) {
      value = { decision: 'unsure', confidence: 0, positives: [], frictions: [], dealbreakerRisk: [], noFrictionJustification: 'There was no conversation to judge.', summaryForUser: "This chat never really got going, so it's your call." };
    } else {
      const traits = Object.fromEntries(facts.filter((f) => f.predicate === 'trait').map((f) => [f.object, f.value]));
      const prompt = {
        userName, matchName,
        facts: [...factById].map(([id, f]) => `${id} ${label(f)}`),
        dealbreakers: Object.entries(dealbreakers).map(([a, acc]) => `${a}: accepts ${acc.join(', ') || '?'} (options: ${(OPTIONS[a] ?? []).join(', ')})`),
        traits: traitWords(traits),
        notes: notes.map((n) => `${n.predicate}: ${n.object}${n.evidence?.[0]?.quote ? ` ("${n.evidence[0].quote}")` : ''}`),
        events: events.map((e) => `${e.type}${e.label ? ` (${e.label})` : ''}, ${Math.round((e.weight ?? 0.5) * 100) / 100}${e.quote ? `: "${e.quote}"` : ''}`),
        agenda: (match.brief?.[me]?.agenda ?? []).map((a) => `${a.topic}${a.dealbreaker ? ' [dealbreaker]' : ''}: ${a.status}${a.settledBy ? ` (${a.settledBy === 'gate' ? 'settled before you matched' : a.settledBy === 'profile' ? `their profile: ${a.profileValue}` : 'in the chat'})` : ''}`),
        endedBy: conv.endedBy,
        transcript: transcript.map((m) => `[${m.id}] ${m.mine ? userName : matchName}${m.agent ? ' (agent)' : ''}${m.filler ? ' [system filler, not their words]' : ''}: ${m.text}`),
      };
      const first = await callJudge({ messages: judgePrompt.build(prompt), userId: me, matchId: match._id, purpose: 'judge' });
      judgeModel = first.model;
      const vopts = { transcript, hints, factIds: new Set(factById.keys()), options: OPTIONS };
      let checked = validateDecision(first.out, vopts);
      if (checked.problems.length) {
        validation.reasked = true;
        debug(`judge ${match._id}/${me}: re-asking (${checked.problems.join(' ')})`);
        try {
          const again = await callJudge({ messages: judgePrompt.build({ ...prompt, warning: checked.problems.join(' ') }), userId: me, matchId: match._id, purpose: 'judge-reask', prefer: first.opt });
          const second = validateDecision(again.out, vopts);
          if (second.problems.length <= checked.problems.length) checked = second;
        } catch (err) {
          if (err.name === 'BudgetExceededError') throw err;
          console.warn(`judge ${match._id}/${me}: re-ask failed (${err.message}); keeping the first answer minus its bad items`);
        }
      }
      value = checked.value;
      validation.dropped = checked.dropped;
      // Still no dealbreakerRisk after the re-ask: the recorded hint events are the evidence.
      if (hints.length && !value.dealbreakerRisk.length) value.dealbreakerRisk = hints.map((h) => ({ attribute: h.label?.split(':')[0] ?? 'dealbreaker', quote: h.quote ?? '', value: null }));
      const decided = judgeDecision({ positives: value.positives, frictions: [...value.frictions, ...profileFrictions], dealbreakerRisk: value.dealbreakerRisk, facts: factById, dealbreakers, undiscussed });
      const ask = decided.frictions.filter((x) => x.attribute && !x.quote).map((x) => x.attribute.replace(/_/g, ' '));
      value = { ...value, decision: decided.decision, confidence: decided.confidence, frictions: decided.frictions,
        summaryForUser: [value.summaryForUser, ask.length && `You never found out where they stand on ${ask.join(' and ')}, so it's worth asking.`,
          worthAsking.length && `Worth asking yourself: ${worthAsking.join('; ')}.`].filter(Boolean).join(' ') };
      validation.reason = decided.reason;
    }
    const icebreakers = value.decision === 'no' ? [] : await writeIcebreakers({ userId: me, matchId: match._id, matchName, events, notes });
    const doc = { ...base, ...value, icebreakers, judgeModel, validation, worthAsking };
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
