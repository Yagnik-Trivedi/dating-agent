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
import { nameOf, otherUserId, side } from '../matches.js';
import { loadPersona } from '../persona/cache.js';
import { lookupConcept } from '../kg/canonicalize.js';
import { tagLanguageHeuristic } from '../kg/language.js';
import { factsOnTopic, inboxDecision, knowsTopic, questionToMe, topicOf, attributesIn } from '../persona/askedAboutMe.js';
import { covers, groundingCheck, hedgeSentences, leakCheck, orphaned, stanceCheck, styleCheck, styleNotes } from '../persona/checks.js';
import { isQuestion, privateGuidance, selectExemplars, selectFacts, storyCandidates, toneRules } from '../persona/contextBuilder.js';
import { echoOf, norm, oneQuestion, ownEmojiOnly, sentencesOf, splitBurst, words } from '../persona/text.js';
import { startConversationDoc } from '../pipeline/index.js';
import { generate, generateTurn } from './generate.js';
import { updateInterest } from './interest.js';
import { observe, perceiveArgs, perceiveObserve } from './perceive.js';
import { bridgesTo, MIN_MESSAGES_FOR_NATURAL_END, planAct } from './planAct.js';
import { tierOf } from './evidence.js';
import { currentSession, inSessions, sessionLimits, sessionPlan, tierRank, unlockedTier } from './sessions.js';
import { agendaAttribute } from '../kg/questionnaireFacts.js';
import { debug } from '../../utils/log.js';

// "are you a bot?", "am I talking to an AI?", "is this a real person?" → the honest answer (consent covers AI handling).
export const AI_QUESTION = /\b(are|r)\s+(you|u)\s+(an?\s+)?(bot|ai|robot|real|human|chatgpt|gpt)\b|talking\s+to\s+(an?\s+)?(bot|ai|robot|machine|chatgpt|real\s+person|human)\b|\b(is\s+this|this\s+is)\s+(an?\s+)?(bot|ai|chatgpt|real\s+person|human)\b|\b(bot|chatgpt|automated)\b[^.!]*\?/i;
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
// When every sentence of the best draft was dropped: a short, engaged follow-up on their message. Never a filler line
// (eval: "haha fair 😄" repeated read as low effort) and never a form question on a topic (plan 30 SN: "do you smoke,
// by the way?" read as an interview).
const OPEN_QUESTIONS = ['haha tell me more?', 'oh nice, how did that start?', 'ha fair, what got you into that?'];
const fallbackQuestion = (rng) => OPEN_QUESTIONS[Math.floor(rng() * OPEN_QUESTIONS.length)];
const turnSeed = (seed, userId, turn) => (seed + parseInt(createHash('md5').update(`${userId}:${turn}`).digest('hex').slice(0, 8), 16)) >>> 0;

/**
 * What code can read from their turn on its own (merged mode, before the one model call). Audit fix 2b: the shared
 * question detector over every message of their turn (bursts, "…? 😄"), not only a "?" check.
 */
export function quickRead(texts) {
  const all = texts.join('\n');
  return { language: tagLanguageHeuristic(all), aboutMeQuestion: Boolean(questionToMe(all)), isQuestion: isQuestion(all) };
}

/** Audit fix 3: section-B attributes they stated themselves, up to and including the turn being answered. */
export const heardIn = (before = [], texts = []) => [...new Set([...before, ...texts.flatMap((t) => attributesIn(t, { questions: false }))])];

/** Did my sent text raise this planned agenda topic? An attribute by its words; another topic by its own words. */
const raisedIn = (topic, text) => { const attr = agendaAttribute({ topic: topic.text }); return attr ? attributesIn(text).includes(attr) : bridgesTo({ topic: topic.text }, text); };

/**
 * Audit fix 4: count only what was actually sent. Claims covered by a sent sentence → used facts; a story fact among
 * them → told; a planned agenda topic → tried only if the sent text raised it.
 * → { used: [fact _id], told: [story _id], raised: bool }
 */
export function sentRecord({ messages, claims = [], facts, plan }) {
  const sent = messages.flatMap((m) => sentencesOf(m));
  const cited = [...new Set(claims.filter((c) => sent.some((s) => covers(c.text, s))).flatMap((c) => c.factIds ?? []))].map((id) => facts.get(id)).filter(Boolean);
  return {
    used: cited.map((f) => f._id).filter(Boolean),
    told: cited.filter((f) => f.predicate === 'story').map((f) => String(f._id)),
    raised: plan.topic?.kind === 'agenda' && raisedIn(plan.topic, messages.join(' ')),
  };
}

// --- Plan 31 (CONVO_MODE=human). Section-B attributes whose question reads as a form question (a question about their
// family or work is small talk too, so those don't count).
export const FORM_ATTRS = ['kids', 'looking_for', 'smoking', 'drinking', 'religion', 'diet', 'location'];
const SMALL = new Set(['what', 'when', 'where', 'which', 'wait', 'that', 'this', 'there', 'with', 'have', 'does', 'your', 'about', 'really', 'then', 'okay', 'sounds', 'happened', 'mean', 'think', 'feel', 'doing', 'going', 'said', 'like', 'just', 'kind', 'were', 'they', 'them', 'would', 'could', 'some', 'much', 'more']);
const topicWordsOf = (s) => new Set(norm(s).filter((w) => w.length >= 4 && !SMALL.has(w)));
const HUMAN_CONSTRAINED = 'every sentence of your drafts broke a rule. Write ONE short reaction (under 10 words) to what they just said, '
  + "in your own style: no claims about yourself or them, no new topic, no goodbye. A question only if it's about what they said.";
/** Human-mode last resort: a simple reaction that fits their mood, never a question on a topic. */
const fallbackReaction = (voice, read = {}) => {
  const laugh = Object.entries(voice.laughForms ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'haha';
  if (['down', 'tired', 'busy'].includes(read.mood) || read.doing === 'venting') return 'ugh, that sounds rough';
  if (read.mood === 'excited' || read.doing === 'sharing_news') return "wait that's amazing!";
  return read.mood === 'playful' ? `${laugh} fair` : 'oh nice';
};

/**
 * Plan 31 B3, the new draft problems (they share the one regeneration). read: this turn's read (or the plan's own);
 * theirText: their latest message(s); facts: the F/S ids shown to the model; state: agentState before this turn.
 * → { problems, drop }: drop = the offending sentences, cut before sending if the regeneration doesn't fix them.
 */
export function humanProblems({ text, draft, plan, read = {}, state = {}, theyAsked = false, theirText = '', facts = new Map() }) {
  const problems = [];
  const drop = new Set();
  const sentences = draft.messages.flatMap((m) => sentencesOf(m));
  const questions = sentences.filter((s) => s.includes('?'));
  const planned = plan.topic?.kind === 'agenda' ? agendaAttribute({ topic: plan.topic.text }) : null;
  // A matching question the plan didn't call for: something known, for the humans, not important enough, or a second one.
  const unplannedIn = (s) => attributesIn(s, { questions: true }).filter((a) => FORM_ATTRS.includes(a) && a !== planned);
  const unplanned = [...new Set(questions.flatMap(unplannedIn))];
  if (unplanned.length) {
    problems.push(`you asked about ${unplanned.join(' and ').replace(/_/g, ' ')}, which you don't need to ask: reply to what they said instead.`);
    questions.filter((q) => unplannedIn(q).length).forEach((q) => drop.add(q));
  }
  const storyClaims = (draft.claims ?? []).filter((c) => (c.factIds ?? []).some((id) => facts.get(id)?.predicate === 'story'));
  const storySentences = sentences.filter((s) => storyClaims.some((c) => covers(c.text, s)));
  const telling = read.doing === 'telling' || read.doing === 'venting';
  if (telling) {
    // A new topic while they tell something: any matching question, my story, or a question about my things, not theirs.
    const theirWords = topicWordsOf(theirText);
    const mine = new Set([...facts.values()].flatMap((f) => [...topicWordsOf(`${f.object ?? ''} ${f.conceptLabel ?? ''}`)]));
    const off = questions.filter((q) => attributesIn(q, { questions: true }).length || [...topicWordsOf(q)].some((w) => mine.has(w) && !theirWords.has(w)));
    if (off.length || storyClaims.length) {
      problems.push("they're telling you something: stay on THEIR thing, no new topic and no story of yours.");
      [...off, ...storySentences].forEach((s) => drop.add(s));
    }
  } else if (storyClaims.length && !(state.theyTold || plan.answerFirst)) {
    problems.push("don't tell a story of yours now: they haven't told one or asked; just reply simply.");
    storySentences.forEach((s) => drop.add(s));
  }
  if (state.lastAsked && !theyAsked && draft.messages.some((m) => m.trim().endsWith('?'))) {
    problems.push("you asked a question last time and they didn't ask you anything: no question now, just reply.");
    questions.forEach((q) => drop.add(q));
  }
  const theirs = words(theirText).length;
  if (read.energy === 'low' && theirs > 0 && words(text).length > KG.MAX_LENGTH_RATIO * theirs + KG.LENGTH_SLACK) problems.push(`they're low energy: keep it about as short as their message (under ${KG.MAX_LENGTH_RATIO * theirs + KG.LENGTH_SLACK} words).`);
  return { problems, drop: [...drop] };
}

/**
 * Is my agenda settled enough for a natural end? Everything with priority ≥ END_BLOCK_PRIORITY answered. A dealbreaker
 * on a section-B attribute is already settled by the gate (plan 30 SN: it comes up only if the chat leads there).
 * Human mode never calls this: known, for-you and askOnce items never block the end after NATURAL_END_FROM.
 */
const gateChecked = (a) => a.dealbreaker && agendaAttribute(a);
const agendaSettled = (agenda) => agenda.length > 0 && agenda.filter((a) => !gateChecked(a) && (a.dealbreaker || a.priority >= KG.END_BLOCK_PRIORITY)).every((a) => a.status === 'answered');

function draftProblems({ draft, plan, persona, facts, sources, theirTexts, recent, answering }) {
  const text = draft.messages.join(' ');
  const style = styleCheck(text, plan, persona.voice, recent);
  const myLikes = persona.facts.filter((f) => f.predicate === 'likes' && f.polarity !== -1).flatMap((f) => [f.object, f.conceptLabel].filter(Boolean));
  const myAttributes = Object.fromEntries(persona.facts.filter((f) => f.attribute && typeof f.value === 'string').map((f) => [f.attribute, f.value]));
  const grounding = groundingCheck({ text, claims: draft.claims, aboutThem: draft.aboutThem, facts, sources, theirTexts, myLikes, answering, myAttributes });
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
  // Plan 30 S3: a photo message reads as "(sent a photo)"; a like comment carries what it was about.
  const history = (await Message.find({ matchId: match._id }).sort({ createdAt: 1 }).lean()).map((m) => ({
    ...m,
    text: (m.like?.kind === 'prompt' ? `(on the prompt "${m.like.ref}") ` : m.like?.kind === 'photo' ? '(on a photo) ' : '') + (m.text || (m.attachments?.length ? '(sent a photo)' : '')),
  }));
  const lastMineIdx = history.map((m) => String(m.senderId)).lastIndexOf(me);
  const theirMsgs = history.slice(lastMineIdx + 1).filter((m) => String(m.senderId) !== me);
  // Plan 33 C1: in a session-mode chat, nobody replies between sessions; once I said "talk tomorrow?" only their goodbye
  // is due; the first message of a later session may open without anything new to answer (a callback).
  const sessionMode = inSessions(conv);
  const session = sessionMode ? currentSession(conv) : null;
  if (sessionMode && (conv.phase === 'gap' || (conv.phase === 'closing' && session.closedBy === me))) return null;
  const goodbye = sessionMode && conv.phase === 'closing';
  const sessionStart = sessionMode && session.n > 1 && history.length === session.startCount;
  if (history.length && !theirMsgs.length && !sessionStart) return null; // nothing new to answer
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
  const human = rulesOn && env.CONVO_MODE === 'human'; // plan 31; sn = plan 30 SN exactly
  let perception = {};
  const myLast = lastMineIdx >= 0 ? history[lastMineIdx].text : null;
  const context = { theirName: matchName, lines: history.slice(Math.max(0, lastMineIdx - 6), lastMineIdx + 1).map((m) => `${String(m.senderId) === me ? persona.firstName : matchName}: ${m.text}`) };
  const observeArgs = { match, conv, persona, otherId, theirMsgs, myLast, agenda, turn: state.turn };
  const afterRead = async (p) => {
    perception = p;
    if (rulesOn) Object.assign(state, updateInterest(state, { ...perception, laughsEasily: (persona.voice.laughRate ?? 0) > 0.2 }, { extraversion: persona.traits.extraversion }));
    if (rulesOn && state.interest < KG.LOW_INTEREST) await ChatEvent.create({ conversationId: conv._id, matchId: match._id, observerId: me, turn: state.turn, messageId: theirMsgs.at(-1)._id, type: 'boredom', weight: 1 - state.interest });
  };
  // Plan 30 S1: by default the read happens inside the reply call (one model round-trip). Until then the plan uses what
  // code can see on its own (a question to me, their language); a strong conflict or a dealbreaker found by the read
  // still forces the stance check / the ending through the one allowed regeneration.
  // Plan 33: a session's first message may have nothing of theirs to read (a callback after the gap).
  const reading = !opening && theirMsgs.length > 0;
  const merged = reading && env.AGENT_TURN_MODE === 'merged';
  if (reading && !merged) await afterRead((await perceiveObserve({ ...observeArgs, context })).perception);
  if (merged) perception = quickRead(theirMsgs.map((m) => m.text));
  state.heardAttrs = heardIn(state.heardAttrs, theirMsgs.map((m) => m.text));
  const freshAgenda = opening ? agenda : (await Match.findById(match._id, { brief: 1 }).lean())?.brief?.[me]?.agenda ?? agenda;
  // Plan 33 (A5): each session unlocks deeper things to share: 1 small talk, 2 stories and people, 3+ everything.
  const unlocked = sessionMode ? tierRank(unlockedTier(session.n)) : tierRank('deep');
  const stories = tierRank('personal') <= unlocked ? storyCandidates(persona, state.toldStoryIds) : [];
  const limits = sessionMode ? sessionLimits(conv, { otherAgent: Boolean(side(match, otherId)?.agentActive) })
    : { maxMessages: conv.endAfter ?? KG.MAX_TURNS, naturalEndFrom: conv.naturalEndFrom ?? MIN_MESSAGES_FOR_NATURAL_END };
  const plan = rulesOn
    ? planAct({ mode: human ? 'human' : 'sn', state, voice: persona.voice, perception, rng, agenda: freshAgenda, stories, msgCount: history.length, opening, agendaSettled: human || agendaSettled(freshAgenda),
      ...limits, thread: { theirs: theirMsgs.map((m) => m.text).join('\n'), mine: myLast } })
    : plainPlan(persona.voice, history.length);
  if (sessionMode) sessionPlan(plan, { conv, otherId, goodbye, sessionStart, theirMsgs });
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
      await save({ turn: state.turn + 1, interest: state.interest, lowInterestTurns: state.lowInterestTurns, lastAsked: o.text.includes('?') });
      return { messages: [o.text], actPlan: { ...plan, fromBrief: true }, checks: { leak: [] }, end: null, unknownAboutMe: null, usedFactIds: o.usedFactIds ?? [] };
    }
  }

  // Context: sampled facts + stories, notes about them, my own exemplars, guidance.
  const latest = theirMsgs.map((m) => m.text).join('\n');
  const [incomingVec] = latest ? await embed([latest], { purpose: 'agent-incoming', userId: me, inputType: 'query' }) : [null];
  // Asked about something my graph covers: its sayable facts are always in the prompt (B4 run: "haven't thought much
  // about kids yet" while her answer is "open" made his judge say no).
  const topicFacts = asked && known ? factsOnTopic(asked, persona.facts).filter((f) => f.disclosure !== 'private') : [];
  const picked = [...topicFacts, ...selectFacts(persona, { incomingVec, incomingText: latest, rng }).filter((f) => !topicFacts.includes(f) && tierRank(tierOf(f)) <= unlocked)];
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
    style: [persona.voice.description,
      // Plan 30 S2: a short onboarding leaves few samples (confidence low): plain and short beats an invented style.
      (persona.voice.sampleCount ?? 0) < KG.VOICE_CONFIDENT_SAMPLES && `Only a few examples of how ${persona.firstName} texts are known: keep replies short and plain, and don't invent quirks.`,
      persona.voice.doList?.length && `Do: ${persona.voice.doList.join('; ')}`, persona.voice.dontList?.length && `Don't: ${persona.voice.dontList.join('; ')}`, persona.voice.corrections?.length && `Corrections from ${persona.firstName}: ${persona.voice.corrections.map((c) => c.rule).join('; ')}`].filter(Boolean).join('\n'),
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
  const mayEnd = history.length >= limits.naturalEndFrom && (!rulesOn || human || agendaSettled(freshAgenda));
  const readNow = () => (perception.doing ? perception : plan.read ?? {}); // this turn's read once the merged call ran
  for (let i = 0; i <= KG.MAX_REGENERATIONS; i++) {
    let draft;
    if (merged && i === 0) {
      // A broken merged answer (longer JSON) falls back to the two-call path for this turn instead of failing it.
      const out = await generateTurn({ prompt, read: perceiveArgs({ persona, theirMsgs, context, myLast, agenda }), tier, temperature: state.temperature ?? 0.8, userId: me, matchId: match._id })
        .catch((err) => { if (err.name !== 'LLMJsonError') throw err; console.warn(`agent ${match._id}: merged turn unreadable, using two calls`); return null; });
      if (out) {
        draft = out.draft;
        await afterRead((await observe(out.read, observeArgs)).perception);
      } else {
        await afterRead((await perceiveObserve({ ...observeArgs, context })).perception);
        draft = await generate({ prompt, tier, temperature: state.temperature ?? 0.8, userId: me, matchId: match._id });
      }
      // What the read found that the plan needed up front: a view I hold firmly → disagree; a dealbreaker → end.
      const hold = rulesOn && perception.conflicts?.find((c) => c.ownStrength >= KG.STANCE_HOLD);
      if (hold) Object.assign(plan, { mustDisagree: true, disagreeOn: hold.text });
      if (rulesOn && perception.dealbreakerHit) Object.assign(plan, { end: 'dealbreaker_hint', topic: null, askBack: false });
      plan.reactions = (perception.concepts ?? []).map((c) => ({ text: c.text, kind: !c.own ? 'unknown' : c.own.polarity === -1 ? 'dislike' : c.own.strength >= 0.75 ? 'excited' : c.own.strength >= 0.5 ? 'positive' : 'lukewarm' }));
    } else draft = await generate({ prompt, tier, temperature: state.temperature ?? 0.8, userId: me, matchId: match._id, warning });
    if (lower) draft.messages = draft.messages.map((m) => m.charAt(0).toLowerCase() + m.slice(1));
    draft.messages = draft.messages.map(oneQuestion);
    const c = draftProblems({ draft, plan, persona, facts, sources, theirTexts, recent, answering: Boolean(question) });
    if (topicFacts.length && hedgeSentences(c.text).length) c.problems.push(`you DO know your answer about ${asked.label}: say it from the listed facts instead of sounding unsure.`);
    if (plan.mustDisagree && i === 0) c.stance = await stanceCheck({ draft: c.text, disagreeOn: plan.disagreeOn, userId: me, matchId: match._id });
    c.problems.push(...(c.stance ?? []));
    if (human && !plan.end) {
      const hp = humanProblems({ text: c.text, draft, plan, read: readNow(), state, theyAsked: Boolean(perception.isQuestion || perception.aboutMeQuestion), theirText: latest, facts });
      c.problems.push(...hp.problems);
      c.humanDrop = hp.drop;
    }
    if (draft.end && !plan.end && !mayEnd) c.problems.push(human ? "you wrapped up the chat too early: don't say goodbye yet, just reply." : "you wrapped up the chat, but there's more to talk about: don't say goodbye, keep it going with a question.");
    if (plan.end === 'dealbreaker_hint' && !draft.end) c.problems.push('end the conversation now: one short, kind closing line, no question.');
    attempts.push({ draft, ...c });
    if (!c.problems.length) break;
    // AGENT_REGEN=lean (plan 30 S1): when every problem is a grounding one, the failing sentences are dropped before
    // sending anyway, so keep the rest instead of paying a second model call, if at least 3 words survive.
    const onlyGrounding = c.problems.length === c.grounding.problems.length && c.grounding.drop.length;
    // Audit fix 2c: only questions left after the drops counts as nothing left (a bare "do you smoke?" read as cold).
    const keptHere = draft.messages.flatMap((m) => sentencesOf(m)).filter((s) => !c.grounding.drop.includes(s) && !echoOf(s, recent));
    if (env.AGENT_REGEN === 'lean' && onlyGrounding && words(keptHere.join(' ')).length >= 3 && !orphaned(keptHere, c.grounding.drop)) break;
    warning = c.problems.join(' ');
    debug(`agent ${match._id}: draft rejected: ${warning}`);
  }
  // A clean draft wins; otherwise the one that keeps the most words once failing sentences are dropped (eval: picking
  // by fewest problems often left nothing, and the fixed fallback read as low effort to the judges).
  const kept = (a) => words(a.draft.messages.flatMap((m) => sentencesOf(m)).filter((s) => !a.grounding.drop.includes(s) && !(a.humanDrop ?? []).includes(s) && !echoOf(s, recent)).join(' ')).length;
  let best = attempts.find((a) => !a.problems.length)
    ?? attempts.reduce((a, b) => (kept(b) > kept(a) || (kept(b) === kept(a) && b.problems.length < a.problems.length) ? b : a));
  // Only failing sentences are dropped: grounding failures, leaks (keywords + embeddings vs my private facts, on every
  // outgoing message) and echoes that survived the regeneration (first v2 run: his kids question bounced back verbatim).
  const mySent = new Set(history.filter((m) => String(m.senderId) === me).flatMap((m) => sentencesOf(m.text)).map((s) => norm(s).join(' ')));
  async function survivors(attempt) {
    const sentences = attempt.draft.messages.flatMap((m) => sentencesOf(m));
    const sentVecs = persona.privateFacts.length && sentences.length ? await embed(sentences, { purpose: 'agent-leak-check', userId: me, inputType: 'query' }) : [];
    const leaks = leakCheck(sentences, persona.privateFacts, sentVecs);
    const drop = new Set([...attempt.grounding.drop, ...(attempt.humanDrop ?? []), ...leaks.map((l) => l.sentence), ...sentences.filter((s) => echoOf(s, recent))]);
    // A sentence I already sent is dropped too (tuning it2: "undhiyu chhe?" ×3), and a scrap of under 3 words counts as
    // nothing surviving, so the constrained regeneration writes a real message instead.
    for (const s of sentences) if (mySent.has(norm(s).join(' '))) drop.add(s);
    const messages = attempt.draft.messages.map((m) => sentencesOf(m).filter((s) => !drop.has(s)).join(' ').trim()).filter(Boolean);
    const enough = words(messages.join(' ')).length >= 3 && !orphaned(sentences.filter((s) => !drop.has(s)), [...drop]);
    return { leaks, drop, messages: enough ? messages : [] };
  }
  let { leaks, drop, messages } = await survivors(best);
  // Nothing survived: ONE constrained regeneration (owner's tuning spec): short, in-voice, on their last message, a
  // cited fact or honest uncertainty. Never a fixed filler line: "haha fair 😄" read as low effort to the judges.
  let fallback = 'none';
  if (!messages.length && !plan.end && !opening) {
    fallback = 'constrained';
    // Human mode: a short reaction on their message, no question (plan 31: fallbacks are simple reactions).
    const cPlan = human ? { ...plan, targetWords: Math.min(plan.targetWords, 10), burst: 1, topic: null, askBack: false, move: 'react' }
      : { ...plan, targetWords: Math.min(plan.targetWords, 12), burst: 1, topic: null, askBack: true, move: 'follow_up' };
    const draft = await generate({ prompt: { ...prompt, plan: cPlan }, tier, temperature: 0.4, userId: me, matchId: match._id, warning: human ? HUMAN_CONSTRAINED : constrainedWarning(best.problems) });
    if (lower) draft.messages = draft.messages.map((m) => m.charAt(0).toLowerCase() + m.slice(1));
    draft.messages = draft.messages.map(oneQuestion);
    const c = draftProblems({ draft, plan: cPlan, persona, facts, sources, theirTexts, recent, answering: Boolean(question) });
    if (human) c.humanDrop = humanProblems({ text: c.text, draft, plan: cPlan, read: readNow(), state, theyAsked: Boolean(perception.isQuestion || perception.aboutMeQuestion), theirText: latest, facts }).drop;
    const constrained = { draft, ...c };
    ({ leaks, drop, messages } = await survivors(constrained));
    if (messages.length) { attempts.push(constrained); best = constrained; }
  }
  // Plan 32 KP1: only my own emoji (an emoji from an example's context, like 🍍 or 😞, read oddly in the H1 run).
  const myEmoji = new Set([...(persona.voice.topEmojis ?? []), plan.emoji].filter(Boolean));
  messages = messages.map((m) => ownEmojiOnly(m, myEmoji)).filter((m) => words(m).length);
  if (!messages.length) {
    // Last resort, logged per message (target < 5% of agent messages): a question on my planned topic.
    if (!plan.end && !opening) fallback = 'template';
    const opener = `hey ${matchName}! your profile made me smile 😄 how's your week going?`;
    const line = plan.end ? (persona.voice.closingStyle ?? 'take care! 👋') : opening ? opener : human ? fallbackReaction(persona.voice, readNow()) : fallbackQuestion(rng);
    messages = [lower || plan.end ? line : line[0].toUpperCase() + line.slice(1)];
  }
  // Plan 32 KP1: a burst is sent as separate bubbles (the scheduler sends each message on its own).
  if (!opening) messages = splitBurst(messages, plan.burst);
  // A resolved topic with no fact → inbox even if the reply sounds confident ("cheering for rcb!" in agent-check);
  // a topic I have a fact on → none. Unresolved → the draft's own unknown, an unsupported claim, or a hedge (fallback).
  const hedged = messages.some((m) => hedgeSentences(m).length);
  const decision = inboxDecision({ question, topic: asked, known, draftUnknown: best.draft.unknownAboutMe, unsupported: best.grounding.unsupported, hedged });
  const inbox = decision && { ...decision, askedBy: matchName };
  const unknownAboutMe = inbox?.question ?? null;

  // Audit fix 4: what was actually sent (a dropped sentence or a fallback line tells no story and raises no topic).
  const { used, told, raised } = sentRecord({ messages, claims: best.draft.claims, facts, plan });
  const touched = plan.topic && (plan.topic.kind === 'agenda' ? raised : plan.topic.kind === 'story' ? told.includes(plan.topic.id) : true);
  await save({
    turn: state.turn + 1, interest: state.interest, lowInterestTurns: state.lowInterestTurns,
    lastAsked: messages.join(' ').includes('?'), // planAct: once they answer my question, share or react more often
    ...(plan.topic && { lastTopicTurn: state.turn }),
    topicsTouched: [...new Set([...(state.topicsTouched ?? []), ...(touched ? [plan.topic.id] : []), ...(perception.topics ?? [])])],
    ...(raised && { topicTries: { ...(state.topicTries ?? {}), [plan.topic.id]: (state.topicTries?.[plan.topic.id] ?? 0) + 1 } }),
    toldStoryIds: [...new Set([...(state.toldStoryIds ?? []), ...told])],
    // What my agent asked / they stated themselves, per section-B attribute (replay and eval).
    askedAttrs: [...new Set([...(state.askedAttrs ?? []), ...attributesIn(messages.join(' '), { questions: true })])],
    heardAttrs: state.heardAttrs,
    // Plan 31: the matching questions actually sent, whether the chat got warm, whether they told a story, and their
    // last read (the next turn's plan starts from it: in merged mode this turn's read arrives after the plan).
    ...(human && {
      matchingQuestions: (state.matchingQuestions ?? 0) + (attributesIn(messages.join(' '), { questions: true }).some((a) => FORM_ATTRS.includes(a)) ? 1 : 0),
      warm: Boolean(state.warm || perception.humor || perception.isQuestion || perception.aboutMeQuestion),
      theyTold: Boolean(state.theyTold || readNow().doing === 'telling'),
      lastRead: { mood: readNow().mood ?? 'chill', energy: readNow().energy ?? 'medium', doing: readNow().doing ?? 'chatting' },
    }),
  });
  let end = plan.end ?? (best.draft.end && mayEnd ? 'natural' : null);
  if (sessionMode && end === 'natural') end = 'session';
  return {
    messages, end, unknownAboutMe, inbox, usedFactIds: used,
    // Human mode: the mood the reply was matched to, refined by this turn's read once it arrived (replay and eval labels).
    actPlan: { ...plan, interest: state.interest, ...(human && { read: { mood: readNow().mood, energy: readNow().energy, doing: readNow().doing } }) },
    checks: { style: best.style, styleNotes: styleNotes(best.text, plan), grounding: best.grounding.problems, stance: best.stance ?? null, leak: leaks.map((l) => l.sentence), regenerated: attempts.length > 1, dropped: [...drop], fallback },
  };
});
