// perceive + observe (plan 08 §2.1): ONE LLM call reads their latest message(s); code then writes MY notes about them
// (verbatim quotes only), chat moments and agenda progress, and compares what they said with MY graph (never theirs).
import { z } from 'zod';
import { ChatEvent } from '../../models/ChatEvent.js';
import { Conversation } from '../../models/Conversation.js';
import { KgFact } from '../../models/KgFact.js';
import { Match } from '../../models/Match.js';
import { emitToUser } from '../../sockets/io.js';
import { items } from '../../utils/zodItems.js';
import { resolveConcept } from '../kg/canonicalize.js';
import { KG } from '../kg/config.js';
import { isVerbatim } from '../kg/extractFacts.js';
import { factKey } from '../kg/factKey.js';
import { TOPICS } from '../kg/questionnaireFacts.js';
import { QUESTIONS } from '../kg/questions.js';
import { chatJSON } from '../llm/client.js';
import * as perceivePrompt from '../prompts/perceive.js';

const B = QUESTIONS.sections.find((s) => s.id === 'B').items;
const ATTRIBUTES = B.map((i) => `${i.id} (${i.options.map((o) => o.value).join('|')})`).join('; ');
const ATTRIBUTE_IDS = B.map((i) => i.id);
const pol = z.coerce.number().transform((p) => (p < 0 ? -1 : 1)).catch(1);
const attr = z.string().nullable().catch(null).transform((a) => (ATTRIBUTE_IDS.includes(a) ? a : null));
const bool = z.preprocess((v) => v === true || v === 'true', z.boolean());

export const perceiveSchema = z.object({
  concepts: items(z.object({ text: z.string().trim().min(1).max(60), type: z.string().catch('other'), polarity: pol })),
  claims: items(z.object({ text: z.string().trim().min(1).max(200), conceptText: z.string().max(60).nullable().catch(null), attribute: attr, value: z.string().nullable().catch(null), polarity: pol })),
  isQuestion: bool, aboutMe: bool, lowEffort: bool, humor: bool, warmth: bool, acknowledgesDifference: bool,
  answeredMyQuestion: z.boolean().nullable().catch(null),
  dealbreakerHint: attr,
  language: z.object({ languages: z.array(z.string()).min(1).catch(['en']), script: z.string().catch('latin'), codeSwitch: z.boolean().catch(false) }).catch({ languages: ['en'], script: 'latin', codeSwitch: false }),
  mood: z.string().catch('casual'),
  notes: items(z.object({ predicate: z.enum(perceivePrompt.NOTE_PREDICATES), object: z.string().trim().min(1).max(100), attribute: attr, value: z.string().nullable().catch(null), polarity: pol, strength: z.coerce.number().min(0).max(1).catch(0.5), quote: z.string().trim().min(1).max(300) })),
  agendaHits: items(z.object({ id: z.string(), quote: z.string().trim().min(1).max(300) })),
});

const resolve = async (text, type, userId) => (await resolveConcept({ text, type, userId }, { tieBreak: async () => ({ same: false }) })).conceptId; // no LLM tie-break mid-chat (2-call budget)

/** My own reaction to a concept/attribute, from MY graph. → { strength, polarity, value, importance } | null */
function ownReaction(persona, { conceptId, attribute }) {
  const f = persona.facts.find((x) => (conceptId && String(x.conceptId) === String(conceptId) && ['likes', 'dislikes', 'opinion', 'values'].includes(x.predicate)) || (attribute && x.attribute === attribute));
  if (!f) return null;
  return { strength: f.strength ?? f.importance ?? 0.5, polarity: f.predicate === 'dislikes' ? -1 : (f.polarity ?? 1), value: f.value, importance: f.importance, object: f.object };
}

/**
 * → { perception (for interest + plan), notes (lean), events, dealbreakerHit }
 * persona: MY loaded persona; theirMsgs: their messages since my last one; conv: Conversation; agenda: my agenda.
 */
export async function perceiveObserve({ match, conv, persona, otherId, theirMsgs, context, myLast, agenda, turn }) {
  const out = await chatJSON({
    tier: 'mid', reasoning: false, temperature: 0, schema: perceiveSchema, purpose: 'agent-perceive', userId: persona.userId, matchId: match._id,
    messages: perceivePrompt.build(perceiveArgs({ persona, theirMsgs, context, myLast, agenda })),
  });
  return observe(out, { match, conv, persona, otherId, theirMsgs, myLast, agenda, turn });
}

/** The perceive prompt's inputs (also used by the merged turn call, plan 30 S1). */
export const perceiveArgs = ({ persona, theirMsgs, context, myLast, agenda }) => ({
  myName: persona.firstName, theirName: context.theirName, latest: theirMsgs.map((m) => m.text).join('\n'), context: context.lines, myLast,
  agenda: agenda.filter((a) => a.status !== 'answered'), attributes: ATTRIBUTES,
});

/** Code after the read: notes (verbatim quotes only), chat moments and agenda progress, compared with MY graph. */
export async function observe(out, { match, conv, persona, otherId, theirMsgs, myLast, agenda, turn }) {
  const viewer = persona.userId;
  const quoteMsg = (q) => theirMsgs.find((m) => isVerbatim(q, m.text));

  // Compare with MY graph: what I feel about what they brought up.
  const concepts = [];
  for (const c of out.concepts.slice(0, 6)) {
    const conceptId = await resolve(c.text, c.type, viewer);
    concepts.push({ text: c.text, conceptId, polarity: c.polarity, own: ownReaction(persona, { conceptId }) });
  }
  const conflicts = [];
  for (const cl of out.claims.slice(0, 6)) {
    const conceptId = cl.conceptText ? await resolve(cl.conceptText, null, viewer) : null;
    const own = ownReaction(persona, { conceptId, attribute: cl.attribute });
    if (!own) continue;
    const opposite = cl.attribute ? cl.value && own.value && cl.value !== own.value : own.polarity !== cl.polarity;
    if (opposite) conflicts.push({ text: cl.text, ownStrength: own.strength, attribute: cl.attribute });
  }

  // Dealbreaker hint: an attribute I marked as a dealbreaker, with a value I don't accept (my own gate).
  const g = persona.gate ?? {};
  // A question they asked is never a claim about themselves (live run: "do you ever think about cooking for a family someday?" → looking_for).
  const statements = theirMsgs.flatMap((m) => m.text.split(/(?<=[.!?])\s+/)).filter((s) => !s.trim().endsWith('?'));
  const stated = (c) => !c.text.trim().endsWith('?') && statements.length > 0;
  const hinted = [statements.length ? out.dealbreakerHint : null, ...out.claims.filter(stated).map((c) => c.attribute)].filter(Boolean);
  const dbClaim = out.claims.filter(stated).find((c) => c.attribute && hinted.includes(c.attribute) && (g.dealbreakers ?? []).includes(c.attribute) && c.value && !(g.accepts?.[c.attribute] ?? []).includes(c.value));

  // Notes about them: verbatim quotes only, merged by factKey within (me, them, this conversation).
  const notes = [];
  for (const n of out.notes) {
    const msg = quoteMsg(n.quote);
    if (!msg) continue;
    const conceptId = n.attribute ? null : await resolve(n.object, null, viewer);
    const doc = { subjectId: otherId, observerId: viewer, matchId: match._id, conversationId: conv._id, predicate: n.predicate, object: n.object, conceptId, attribute: n.attribute, value: n.value, polarity: n.polarity, strength: n.strength, weight: n.strength, confidence: 0.6, source: 'agent_observed', disclosure: 'private' };
    const key = factKey(doc);
    const existing = (await KgFact.find({ observerId: viewer, subjectId: otherId, conversationId: conv._id, predicate: n.predicate }).lean()).find((x) => factKey(x) === key);
    const evidence = { quote: n.quote, sourceRef: { kind: 'message', id: String(msg._id) }, messageId: msg._id, at: new Date() };
    notes.push(existing
      ? await KgFact.findByIdAndUpdate(existing._id, { $set: { confidence: Math.min(0.95, existing.confidence + 0.15), lastConfirmed: new Date() }, $push: { evidence } }, { new: true }).lean()
      : (await KgFact.create({ ...doc, evidence: [evidence] })).toObject());
  }

  // Chat moments (mine only).
  const events = [];
  const ev = (type, quote, extra = {}) => { const msg = quote && quoteMsg(quote); events.push({ conversationId: conv._id, matchId: match._id, observerId: viewer, turn, messageId: msg?._id ?? theirMsgs.at(-1)?._id, quote: msg ? quote : theirMsgs.at(-1)?.text?.slice(0, 200), type, ...extra }); };
  for (const c of concepts.filter((x) => x.own)) {
    if (c.own.polarity === 1 && c.polarity === 1 && c.own.strength >= 0.5) ev('shared_interest', null, { conceptId: c.conceptId, label: c.text, weight: c.own.strength });
    else if (c.own.polarity !== c.polarity) ev('interest_clash', null, { conceptId: c.conceptId, label: c.text, weight: c.own.strength });
  }
  for (const c of conflicts.filter((x) => x.ownStrength >= KG.STANCE_BEND)) ev('disagreement', null, { label: c.text, weight: c.ownStrength });
  if (out.humor && (persona.voice.laughRate ?? 0) > 0) ev('laugh', null);
  if (out.warmth) ev('warmth', null);
  if (out.lowEffort) ev('low_effort', null);
  if (myLast?.includes('?') && out.answeredMyQuestion === false) ev('question_dodged', null);
  if (out.acknowledgesDifference && await ChatEvent.exists({ conversationId: conv._id, observerId: viewer, type: 'disagreement', turn: { $gte: turn - KG.RESOLVE_WINDOW } })) ev('disagreement_resolved', null);
  // One possibly vague signal never ends the chat (B1 it3: "just looking for real connection" ended Meera × Ishaan at 7
  // messages): the first hint is recorded for the judge and reopens that topic so my agent asks; a second one ends it.
  const confirmed = Boolean(dbClaim) && Boolean(await ChatEvent.exists({ conversationId: conv._id, observerId: viewer, type: 'dealbreaker_hint', label: new RegExp(`^${dbClaim.attribute}:`) }));
  if (dbClaim) ev('dealbreaker_hint', null, { label: `${dbClaim.attribute}: ${dbClaim.value}`, weight: confirmed ? 1 : 0.6 });
  if (events.length) await ChatEvent.insertMany(events);

  // Agenda progress: a topic counts as answered only with a verbatim quote.
  let updated = agenda;
  const hits = new Set(out.agendaHits.filter((h) => quoteMsg(h.quote)).map((h) => h.id));
  const reopen = dbClaim && !confirmed ? agenda.find((a) => a.topic === TOPICS[dbClaim.attribute]) : null;
  if (hits.size || reopen) {
    updated = agenda.map((a) => (a === reopen ? { ...a, status: 'open' } : hits.has(a.id) ? { ...a, status: 'answered', confidence: 0.6 } : a));
    await Match.updateOne({ _id: match._id }, { $set: { [`brief.${viewer}.agenda`]: updated } });
    if (reopen) await Conversation.updateOne({ _id: conv._id }, { $unset: { [`agentState.${viewer}.topicTries.${reopen.id}`]: 1 } });
  }
  const payload = { matchId: String(match._id), facts: notes, events, agenda: updated };
  emitToUser(viewer, 'notes:update', payload);
  emitToUser(viewer, 'kg:update', payload); // v1 client listener until plan 10

  return {
    perception: {
      concepts, conflicts, humor: out.humor, lowEffort: out.lowEffort, aboutMeQuestion: out.isQuestion && out.aboutMe, isQuestion: out.isQuestion,
      language: out.language, mood: out.mood, dealbreakerHit: confirmed,
      likes: concepts.filter((c) => c.own && c.own.polarity === 1 && c.polarity === 1).map((c) => c.own.strength),
      dislikes: concepts.filter((c) => c.own && c.own.polarity !== c.polarity).map((c) => c.own.strength),
      topics: concepts.map((c) => String(c.conceptId)),
    },
    notes, events, agenda: updated,
  };
}
