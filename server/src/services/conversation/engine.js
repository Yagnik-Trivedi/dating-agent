// One agent turn for my side (plan 08 §2): perceive+observe → interest → act plan → generate → checks (≤ 1
// regeneration) → the messages to send. Inputs are MY persona + the transcript (+ my brief built from their public
// profile); nothing else about the other user. The caller (agent/scheduler.js) handles locks, pacing and sending.
import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { ChatEvent } from '../../models/ChatEvent.js';
import { Conversation } from '../../models/Conversation.js';
import { KgFact } from '../../models/KgFact.js';
import { Match } from '../../models/Match.js';
import { Message } from '../../models/Message.js';
import { rng as seeded } from '../../utils/rng.js';
import { asActor } from '../actor.js';
import { KG } from '../kg/config.js';
import { embed } from '../llm/client.js';
import { nameOf, otherUserId } from '../matches.js';
import { loadPersona } from '../persona/cache.js';
import { lookupConcept } from '../kg/canonicalize.js';
import { inboxDecision, knowsTopic, questionToMe, topicOf } from '../persona/askedAboutMe.js';
import { groundingCheck, hedgeSentences, leakCheck, stanceCheck, styleCheck, styleNotes } from '../persona/checks.js';
import { privateGuidance, selectExemplars, selectFacts, storyCandidates, toneRules } from '../persona/contextBuilder.js';
import { echoOf, norm, oneQuestion, sentencesOf, words } from '../persona/text.js';
import { startConversationDoc } from '../pipeline/index.js';
import { generate } from './generate.js';
import { updateInterest } from './interest.js';
import { perceiveObserve } from './perceive.js';
import { MIN_MESSAGES_FOR_NATURAL_END, planAct } from './planAct.js';

// "are you a bot?", "am I talking to an AI?", "is this a real person?" → the honest answer (consent covers AI handling).
export const AI_QUESTION = /\b(are|r)\s+(you|u)\s+(an?\s+)?(bot|ai|robot|real|human|chatgpt|gpt)\b|talking\s+to\s+(an?\s+)?(bot|ai|robot|machine|chatgpt|real\s+person|human)\b|\b(is\s+this|this\s+is)\s+(an?\s+)?(bot|ai|chatgpt|real\s+person|human)\b|\b(bot|chatgpt|automated)\b[^.!]*\?/i;
// When every sentence of the best draft was dropped: a short, engaged question (on my planned topic when there is one),
// never a filler line (eval: "haha fair 😄" repeated read as low effort to both judges).
const TOPIC_QUESTIONS = {
  smoking: 'do you smoke, by the way?', drinking: 'how do you feel about drinking?', 'wants children': 'do you see kids in your future?',
  'looking for': "what are you hoping to find on here?", 'living in 3-5 years': 'where do you see yourself living in a few years?',
  'family involvement in relationship decisions': 'how involved is your family in this stuff?', 'career ambition': 'how do you balance work and everything else?',
  'conflict style': 'how do you usually handle disagreements?', 'alone time needed': 'how much alone time do you need?', diet: 'what do you usually eat, any rules?',
};
/**
 * RULES=off (plan 11 B4 ablation): a plain agent. No act plan (no sampled length, emoji, steering, disagreement or
 * language choice), no stance check (mustDisagree is never set), no exemplars, no interest meter; only MAX_TURNS ends
 * it, or the model's own end after the minimum. Grounding, leak and style safety checks stay on in both modes.
 */
const plainPlan = (voice, msgCount) => {
  const mix = voice.language?.mix ?? { en: 1 };
  const primary = Object.keys(mix).sort((a, b) => mix[b] - mix[a])[0] ?? 'en';
  return { plain: true, targetWords: 15, burst: 1, answerFirst: false, askBack: false, emoji: null, laugh: null, reactions: [], mustDisagree: false, disagreeOn: null, topic: null, language: { primary, secondary: null, codeSwitch: Object.keys(mix).length > 1 }, end: msgCount + 1 >= KG.MAX_TURNS ? 'max_turns' : null };
};
const constrainedWarning = (problems) => `every sentence of your drafts broke a rule (${problems.join(' ') || 'nothing could be sent'}). `
  + 'Write ONE short message (under 12 words) that reacts to what they just said: either one thing about yourself backed by a listed fact (cite it) '
  + "or honestly say you're not sure, then one short question about their message. No other claims about yourself or them, no goodbye.";
const OPEN_QUESTIONS = ['haha tell me more?', 'oh nice, how did that start?', 'ha fair, what got you into that?'];
const fallbackQuestion = (topic, rng) => (topic?.kind === 'agenda'
  ? `haha ok, ${TOPIC_QUESTIONS[topic.text] ?? `are you into ${topic.text} at all?`}`
  : OPEN_QUESTIONS[Math.floor(rng() * OPEN_QUESTIONS.length)]);
const turnSeed = (seed, userId, turn) => (seed + parseInt(createHash('md5').update(`${userId}:${turn}`).digest('hex').slice(0, 8), 16)) >>> 0;

/** Is my agenda settled enough for a natural end? Dealbreaker topics and everything with priority ≥ END_BLOCK_PRIORITY answered. */
const agendaSettled = (agenda) => agenda.length > 0 && agenda.filter((a) => a.dealbreaker || a.priority >= KG.END_BLOCK_PRIORITY).every((a) => a.status === 'answered');

function draftProblems({ draft, plan, persona, facts, sources, theirTexts, recent, answering }) {
  const text = draft.messages.join(' ');
  const style = styleCheck(text, plan, persona.voice, recent);
  const myLikes = persona.facts.filter((f) => f.predicate === 'likes' && f.polarity !== -1).flatMap((f) => [f.object, f.conceptLabel].filter(Boolean));
  const grounding = groundingCheck({ text, claims: draft.claims, aboutThem: draft.aboutThem, facts, sources, theirTexts, myLikes, answering });
  return { text, style, grounding, problems: [...style, ...grounding.problems] };
}

/**
 * → { messages: [text], actPlan, checks, end, unknownAboutMe, usedFactIds } or null when there's nothing to answer.
 * Runs as the 'agent' actor (the DB spy checks it never reads the other user's graph or voice).
 */
export const composeTurn = (match, userId) => asActor({ role: 'agent', userId, otherId: otherUserId(match, userId) }, async () => {
  const me = String(userId);
  const otherId = otherUserId(match, me);
  const conv = (await Conversation.findOne({ matchId: match._id, status: 'active' })) ?? await startConversationDoc(match);
  const persona = await loadPersona(me);
  const brief = match.brief?.[me] ?? {};
  const agenda = brief.agenda ?? [];
  const history = await Message.find({ matchId: match._id }).sort({ createdAt: 1 }).lean();
  const lastMineIdx = history.map((m) => String(m.senderId)).lastIndexOf(me);
  const theirMsgs = history.slice(lastMineIdx + 1).filter((m) => String(m.senderId) !== me);
  if (history.length && !theirMsgs.length) return null; // nothing new to answer
  const state = { interest: null, lowInterestTurns: 0, turn: 0, toldStoryIds: [], topicsTouched: [], ...(conv.agentState?.[me] ?? {}) };
  const rng = seeded(turnSeed(conv.seed, me, state.turn));
  const matchName = nameOf(match, otherId);
  const lower = (persona.voice.lowercaseStartRatio ?? 0) >= 0.7;
  const save = (patch) => Conversation.updateOne({ _id: conv._id }, { $set: Object.fromEntries(Object.entries(patch).map(([k, v]) => [`agentState.${me}.${k}`, v])) });

  // A sincere "are you a bot?" always gets the honest answer. Deterministic: the model hedged in v1 testing.
  if (theirMsgs.length && AI_QUESTION.test(theirMsgs.at(-1).text)) {
    const reply = lower ? "haha fair question! yes, i use the app's AI assistant for the first few chats 🙂" : "Haha fair question! Yes, I use the app's AI assistant for the first few chats 🙂";
    await save({ turn: state.turn + 1 });
    return { messages: [reply], actPlan: { honestAI: true }, checks: { deterministic: true }, end: null, unknownAboutMe: null, usedFactIds: [] };
  }

  const opening = history.length === 0;
  const rulesOn = env.RULES !== 'off';
  let perception = {};
  if (!opening) {
    const myLast = lastMineIdx >= 0 ? history[lastMineIdx].text : null;
    const context = { theirName: matchName, lines: history.slice(Math.max(0, lastMineIdx - 6), lastMineIdx + 1).map((m) => `${String(m.senderId) === me ? persona.firstName : matchName}: ${m.text}`) };
    ({ perception } = await perceiveObserve({ match, conv, persona, otherId, theirMsgs, context, myLast, agenda, turn: state.turn }));
    if (rulesOn) Object.assign(state, updateInterest(state, { ...perception, laughsEasily: (persona.voice.laughRate ?? 0) > 0.2 }, { extraversion: persona.traits.extraversion }));
    if (rulesOn && state.interest < KG.LOW_INTEREST) await ChatEvent.create({ conversationId: conv._id, matchId: match._id, observerId: me, turn: state.turn, messageId: theirMsgs.at(-1)._id, type: 'boredom', weight: 1 - state.interest });
  }
  const freshAgenda = opening ? agenda : (await Match.findById(match._id, { brief: 1 }).lean())?.brief?.[me]?.agenda ?? agenda;
  const stories = storyCandidates(persona, state.toldStoryIds);
  const plan = rulesOn
    ? planAct({ state, voice: persona.voice, perception, rng, agenda: freshAgenda, stories, msgCount: history.length, opening, agendaSettled: agendaSettled(freshAgenda) })
    : plainPlan(persona.voice, history.length);
  plan.closingStyle = persona.voice.closingStyle ?? null;
  plan.opening = opening;
  // "Ask my human", structurally: their question to me → its topic (dictionary only) → does my graph have ANY fact on it?
  const question = opening ? null : questionToMe(theirMsgs.map((m) => m.text).join('\n'));
  const asked = question ? await topicOf(question, lookupConcept) : null;
  const known = asked ? knowsTopic(asked, persona.facts) : null;
  if (asked && !known) plan.unknownTopic = asked.label;

  // Opening with a brief opener (already grounded + validated): no LLM call.
  if (opening && brief.openers?.length && !plan.end) {
    const o = brief.openers[Math.floor(rng() * brief.openers.length)];
    const leaks = leakCheck(sentencesOf(o.text), persona.privateFacts);
    if (!leaks.length) {
      await save({ turn: state.turn + 1, interest: state.interest, lowInterestTurns: state.lowInterestTurns });
      return { messages: [o.text], actPlan: { ...plan, fromBrief: true }, checks: { leak: [] }, end: null, unknownAboutMe: null, usedFactIds: o.usedFactIds ?? [] };
    }
  }

  // Context: sampled facts + stories, notes about them, my own exemplars, guidance.
  const latest = theirMsgs.map((m) => m.text).join('\n');
  const [incomingVec] = latest ? await embed([latest], { purpose: 'agent-incoming', userId: me, inputType: 'query' }) : [null];
  const picked = selectFacts(persona, { incomingVec, incomingText: latest, rng });
  const facts = new Map(picked.map((f, i) => [`F${i + 1}`, f]));
  stories.forEach((s, i) => facts.set(`S${i + 1}`, s));
  if (plan.topic?.kind === 'story') plan.topic.storyId = [...facts].find(([, f]) => String(f._id) === plan.topic.id)?.[0];
  const myFacts = [...facts].map(([id, f]) => `[${id}] ${f.predicate}: ${f.conceptLabel && !f.userEdited ? f.conceptLabel : f.object}${f.predicate === 'story' ? ` (in their words: "${f.evidence?.[0]?.quote?.slice(0, 200) ?? ''}")` : ''}${f.disclosure === 'if_asked' ? ' [only because they asked]' : ''}`);
  const notes = await KgFact.find({ observerId: me, subjectId: otherId, matchId: match._id }, { object: 1, predicate: 1, confidence: 1 }).sort({ confidence: -1 }).limit(15).lean();
  const sources = new Set(notes.map((_, i) => `N${i + 1}`));
  const aboutThem = notes.map((n, i) => `[N${i + 1}] ${n.predicate}: ${n.object}`);
  if (brief.summary) { aboutThem.push(`[P1] from their profile: ${brief.summary}`); sources.add('P1'); }
  const transcript = history.slice(-20).map((m) => `${String(m.senderId) === me ? 'You' : matchName}: ${m.text}`);
  const prompt = {
    firstName: persona.firstName, matchName, myFacts, aboutThem, transcript, plan,
    style: [persona.voice.description, persona.voice.doList?.length && `Do: ${persona.voice.doList.join('; ')}`, persona.voice.dontList?.length && `Don't: ${persona.voice.dontList.join('; ')}`, persona.voice.corrections?.length && `Corrections from ${persona.firstName}: ${persona.voice.corrections.map((c) => c.rule).join('; ')}`].filter(Boolean).join('\n'),
    exemplars: rulesOn ? selectExemplars(persona, { incomingVec, rng }) : [], guidance: privateGuidance(persona), tone: toneRules(persona),
  };
  // What counts as said by/about them: their messages + my brief summary of their PUBLIC profile (allowed source).
  const theirTexts = [...history.filter((m) => String(m.senderId) !== me).map((m) => m.text), brief.summary ?? '', `${matchName} profile`];
  const recent = history.slice(-6).map((m) => m.text);
  const tier = state.model ?? 'mid';

  // Generate → checks → at most ONE regeneration (MAX_REGENERATIONS) → send the best draft minus failing sentences.
  const attempts = [];
  let warning = null;
  // The model's own "end" counts only once my agenda is settled (eval i2: it closed at 14 messages before smoking came up).
  const mayEnd = history.length >= MIN_MESSAGES_FOR_NATURAL_END && (!rulesOn || agendaSettled(freshAgenda));
  for (let i = 0; i <= KG.MAX_REGENERATIONS; i++) {
    const draft = await generate({ prompt, tier, temperature: state.temperature ?? 0.8, userId: me, matchId: match._id, warning });
    if (lower) draft.messages = draft.messages.map((m) => m.charAt(0).toLowerCase() + m.slice(1));
    draft.messages = draft.messages.map(oneQuestion);
    const c = draftProblems({ draft, plan, persona, facts, sources, theirTexts, recent, answering: Boolean(question) });
    if (plan.mustDisagree && i === 0) c.stance = await stanceCheck({ draft: c.text, disagreeOn: plan.disagreeOn, userId: me, matchId: match._id });
    c.problems.push(...(c.stance ?? []));
    if (draft.end && !plan.end && !mayEnd) c.problems.push("you wrapped up the chat, but there's more to talk about: don't say goodbye, keep it going with a question.");
    attempts.push({ draft, ...c });
    if (!c.problems.length) break;
    warning = c.problems.join(' ');
    console.warn(`agent ${match._id}: draft rejected: ${warning}`);
  }
  // A clean draft wins; otherwise the one that keeps the most words once failing sentences are dropped (eval: picking
  // by fewest problems often left nothing, and the fixed fallback read as low effort to the judges).
  const kept = (a) => words(a.draft.messages.flatMap((m) => sentencesOf(m)).filter((s) => !a.grounding.drop.includes(s) && !echoOf(s, recent)).join(' ')).length;
  let best = attempts.find((a) => !a.problems.length)
    ?? attempts.reduce((a, b) => (kept(b) > kept(a) || (kept(b) === kept(a) && b.problems.length < a.problems.length) ? b : a));
  // Only failing sentences are dropped: grounding failures, leaks (keywords + embeddings vs my private facts, on every
  // outgoing message) and echoes that survived the regeneration (first v2 run: his kids question bounced back verbatim).
  const mySent = new Set(history.filter((m) => String(m.senderId) === me).flatMap((m) => sentencesOf(m.text)).map((s) => norm(s).join(' ')));
  async function survivors(attempt) {
    const sentences = attempt.draft.messages.flatMap((m) => sentencesOf(m));
    const sentVecs = persona.privateFacts.length && sentences.length ? await embed(sentences, { purpose: 'agent-leak-check', userId: me, inputType: 'query' }) : [];
    const leaks = leakCheck(sentences, persona.privateFacts, sentVecs);
    const drop = new Set([...attempt.grounding.drop, ...leaks.map((l) => l.sentence), ...sentences.filter((s) => echoOf(s, recent))]);
    // A sentence I already sent is dropped too (tuning it2: "undhiyu chhe?" ×3), and a scrap of under 3 words counts as
    // nothing surviving, so the constrained regeneration writes a real message instead.
    for (const s of sentences) if (mySent.has(norm(s).join(' '))) drop.add(s);
    const messages = attempt.draft.messages.map((m) => sentencesOf(m).filter((s) => !drop.has(s)).join(' ').trim()).filter(Boolean);
    return { leaks, drop, messages: words(messages.join(' ')).length >= 3 ? messages : [] };
  }
  let { leaks, drop, messages } = await survivors(best);
  // Nothing survived: ONE constrained regeneration (owner's tuning spec): short, in-voice, on their last message, a
  // cited fact or honest uncertainty. Never a fixed filler line: "haha fair 😄" read as low effort to the judges.
  let fallback = 'none';
  if (!messages.length && !plan.end && !opening) {
    fallback = 'constrained';
    const cPlan = { ...plan, targetWords: Math.min(plan.targetWords, 12), burst: 1, topic: null, askBack: true };
    const draft = await generate({ prompt: { ...prompt, plan: cPlan }, tier, temperature: 0.4, userId: me, matchId: match._id, warning: constrainedWarning(best.problems) });
    if (lower) draft.messages = draft.messages.map((m) => m.charAt(0).toLowerCase() + m.slice(1));
    draft.messages = draft.messages.map(oneQuestion);
    const c = draftProblems({ draft, plan: cPlan, persona, facts, sources, theirTexts, recent, answering: Boolean(question) });
    const constrained = { draft, ...c };
    ({ leaks, drop, messages } = await survivors(constrained));
    if (messages.length) { attempts.push(constrained); best = constrained; }
  }
  if (!messages.length) {
    // Last resort, logged per message (target < 5% of agent messages): a question on my planned topic.
    if (!plan.end && !opening) fallback = 'template';
    const opener = `hey ${matchName}! your profile made me smile 😄 how's your week going?`;
    const line = plan.end ? (persona.voice.closingStyle ?? 'take care! 👋') : opening ? opener : fallbackQuestion(plan.topic, rng);
    messages = [lower || plan.end ? line : line[0].toUpperCase() + line.slice(1)];
  }
  // A resolved topic with no fact → inbox even if the reply sounds confident ("cheering for rcb!" in agent-check);
  // a topic I have a fact on → none. Unresolved → the draft's own unknown, an unsupported claim, or a hedge (fallback).
  const hedged = messages.some((m) => hedgeSentences(m).length);
  const decision = inboxDecision({ question, topic: asked, known, draftUnknown: best.draft.unknownAboutMe, unsupported: best.grounding.unsupported, hedged });
  const inbox = decision && { ...decision, askedBy: matchName };
  const unknownAboutMe = inbox?.question ?? null;

  const used = [...new Set(best.draft.claims.flatMap((c) => c.factIds))].map((id) => facts.get(id)?._id).filter(Boolean);
  const told = plan.topic?.kind === 'story' ? [plan.topic.id] : [];
  await save({
    turn: state.turn + 1, interest: state.interest, lowInterestTurns: state.lowInterestTurns,
    ...(plan.topic && { lastTopicTurn: state.turn }),
    topicsTouched: [...new Set([...(state.topicsTouched ?? []), ...(plan.topic ? [plan.topic.id] : []), ...(perception.topics ?? [])])],
    ...(plan.topic?.kind === 'agenda' && { topicTries: { ...(state.topicTries ?? {}), [plan.topic.id]: (state.topicTries?.[plan.topic.id] ?? 0) + 1 } }),
    toldStoryIds: [...(state.toldStoryIds ?? []), ...told],
  });
  const end = plan.end ?? (best.draft.end && mayEnd ? 'natural' : null);
  return {
    messages, end, unknownAboutMe, inbox, usedFactIds: used,
    actPlan: { ...plan, interest: state.interest },
    checks: { style: best.style, styleNotes: styleNotes(best.text, plan), grounding: best.grounding.problems, stance: best.stance ?? null, leak: leaks.map((l) => l.sentence), regenerated: attempts.length > 1, dropped: [...drop], fallback },
  };
});
