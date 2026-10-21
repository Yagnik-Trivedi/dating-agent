// The act plan for one reply (plan 08 §2.3): deterministic sampling from MY voice distributions with the
// conversation's seeded rng, so the same seed + perceptions replay identically. Stored on the message.
import { KG } from '../kg/config.js';
import { agendaAttribute } from '../kg/questionnaireFacts.js';

// Plan 30 SN: what in a chat naturally leads to each section-B attribute. Broader than askedAboutMe's ATTRIBUTE_WORDS
// (which detect the attribute itself): a bar story leads to drinking, a nephew to kids, a job offer abroad to location.
const BRIDGES = {
  smoking: /\b(smok(e|es|ed|ing|ers?)|cigarettes?|sutta|hookah|vap(e|es|ing))\b/i,
  drinking: /\b(drinks?|drinking|bars?|pubs?|beers?|wine|cocktails?|whisk(e)?y|brewery|club(bing)?|party|parties|night out|daaru|daru|sober)\b/i,
  kids: /\b(kids?|children|child|nephews?|nieces?|bab(y|ies)|toddlers?|parenting|bacche|bachche)\b/i,
  religion: /\b(religio(n|us)|spiritual|temples?|church|mosque|gurudwara|pray(ing|er)?|puja|pooja|diwali|eid|christmas|navratri|fasting|festivals?)\b/i,
  diet: /\b(food|foodie|cook(ing)?|recipes?|restaurants?|dinner|lunch|breakfast|biryani|paneer|chicken|mutton|fish|meat|veg|vegan|vegetarian|non-veg|street food|dosa|momos)\b/i,
  location: /\b(move|moving|moved|relocat\w*|abroad|settle\w*|visa|masters|hometown|home town|grew up|another city|new city|onsite)\b/i,
  looking_for: /\b(dating|this app|on here|relationships?|serious|casual|settle down|situationship|exes?)\b/i,
  family: /\b(parents|mom|mum|mummy|dad|papa|sisters?|brothers?|siblings?|family|cousins?|relatives|weddings?)\b/i,
  career: /\b(work(ing)?|jobs?|office|startup|boss|promotion|deadlines?|career|launch|clients?|shifts?|internship|exams?|studies)\b/i,
  conflict: /\b(argu(e|ed|ing|ments?)|fights?|fought|disagree\w*|debates?|annoyed|upset|sorted (it|things) out)\b/i,
  alone_time: /\b(alone|introvert\w*|me[- ]time|recharge|solo|by myself|own space|homebody|quiet (night|weekend)s?)\b/i,
};
const STOPWORDS = new Set(['about', 'their', 'what', 'with', 'they', 'your', 'from', 'that', 'this', 'into', 'have', 'more', 'some']);
const topicWords = (t) => String(t).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !STOPWORDS.has(w));
/** Does what was just said lead to this agenda item? Attributes use BRIDGES; other topics (interests, clarify) their own words. */
export function bridgesTo(item, text = '') {
  if (!text) return false;
  const attr = agendaAttribute(item);
  if (attr && BRIDGES[attr]) return BRIDGES[attr].test(text);
  const said = topicWords(text);
  return topicWords(item.topic).some((w) => said.some((s) => s === w || (s.length >= 5 && w.length >= 5 && s.slice(0, 5) === w.slice(0, 5))));
}

export const MIN_MESSAGES_FOR_NATURAL_END = KG.NATURAL_END_FROM; // was 16 (tuning it2); plan 30 S1 shortens chats to 12–14
const pick = (xs, rng) => xs[Math.floor(rng() * xs.length)];
function pickWeighted(dist, rng) {
  const entries = Object.entries(dist ?? {}).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries.at(-1)?.[0] ?? null;
}

/**
 * Reply language (replaces the v1 Hinglish guard): sample my mix, with languages they just used (and I use) weighted up
 * by (1 + 2 × mirrorsLanguage). A hard "mirror with probability p" looped: two 70%-English users both drifted into
 * all-Hinglish (sim h, 9/13 replies). Code-switch at my rate, more in my trigger moods.
 */
export function pickLanguage(language = {}, incoming = [], rng, mood = null) {
  const mix = Object.keys(language.mix ?? {}).length ? language.mix : { en: 1 };
  const mine = Object.keys(mix).filter((l) => mix[l] > 0);
  const boost = 1 + 2 * (language.mirrorsLanguage ?? 0.5);
  const primary = pickWeighted(Object.fromEntries(mine.map((l) => [l, mix[l] * (incoming.includes(l) ? boost : 1)])), rng);
  const moodBoost = mood && (language.switchTriggers ?? []).includes(mood) ? 1.5 : 1;
  const others = mine.filter((l) => l !== primary);
  const codeSwitch = others.length > 0 && rng() < Math.min(1, (language.codeSwitchRate ?? 0) * moodBoost);
  return { primary, secondary: codeSwitch ? pickWeighted(Object.fromEntries(others.map((l) => [l, mix[l]])), rng) : null, codeSwitch };
}

const reactionOf = (own) => {
  if (!own) return 'unknown';
  if (own.polarity === -1) return 'dislike';
  if (own.strength >= 0.75) return 'excited';
  if (own.strength >= 0.5) return 'positive';
  return own.strength > 0 ? 'lukewarm' : 'unknown';
};

/**
 * state: agentState[me]; voice: my VoiceProfile; perception: { concepts: [{ text, own }], conflicts: [{ text, ownStrength }],
 * humor, language: { languages }, mood, dealbreakerHit, isQuestion, aboutMeQuestion }; agenda: my agenda items;
 * stories: my untold story facts; thread: { theirs, mine } = their latest message(s) and my last message.
 * → { targetWords, burst, move, askBack, emoji, laugh, reactions, mustDisagree, disagreeOn, topic, language, end }
 */
export function planAct({ state, voice = {}, perception = {}, rng, agenda = [], stories = [], msgCount = 0, opening = false, agendaSettled = false,
  maxMessages = KG.MAX_TURNS, naturalEndFrom = MIN_MESSAGES_FOR_NATURAL_END, thread = {} }) {
  const interest = state.interest ?? 0.5;
  const counts = voice.wordCounts?.length ? voice.wordCounts : [10];
  const targetWords = Math.max(2, Math.round(pick(counts, rng) * (0.5 + interest)));
  const burst = rng() < (voice.burstiness ?? 0) ? 2 : 1;
  // Plan 30 SN: a question isn't the default ending. questionBackRate comes from onboarding replies, where people rarely
  // ask back, so a floor keeps the chat going (v2: with none, both agents stopped asking), but at 0.45, not 0.7.
  // Fewer questions right after they answered mine (share or react instead) and when they asked me (answer it).
  const theirs = String(thread.theirs ?? '');
  const theyAsked = Boolean(perception.isQuestion || perception.aboutMeQuestion || theirs.includes('?'));
  const shortReply = theirs.split(/\s+/).filter(Boolean).length < KG.LULL_WORDS;
  let pAsk = interest < KG.LOW_INTEREST ? 0 : Math.max(KG.ASK_BACK_FLOOR, Math.min(0.9, (voice.questionBackRate ?? 0.4) * (0.5 + interest)));
  if (theyAsked) pAsk *= KG.ASK_WHEN_ASKED;
  else if (state.lastAsked) pAsk *= KG.ASK_AFTER_ANSWER;
  // Stall guard: neither of us asked last time and their reply is short → someone has to keep it going.
  const stall = !opening && !theyAsked && !state.lastAsked && shortReply && interest >= KG.LOW_INTEREST;
  const askBack = opening || stall || rng() < pAsk;
  const emoji = rng() < Math.min(1, voice.emojiPerMessage ?? 0) && voice.topEmojis?.length ? pick(voice.topEmojis, rng) : null;
  const laugh = perception.humor && rng() < (voice.laughRate ?? 0) ? pickWeighted(voice.laughForms, rng) : null;
  const reactions = (perception.concepts ?? []).map((c) => ({ text: c.text, kind: reactionOf(c.own) }));

  // Hold strong opinions; bend on middling ones half the time; concede on weak ones.
  const conflicts = perception.conflicts ?? [];
  const hold = conflicts.find((c) => c.ownStrength >= KG.STANCE_HOLD) ?? conflicts.find((c) => c.ownStrength >= KG.STANCE_BEND && rng() < 0.5);
  const mustDisagree = Boolean(hold);

  // New topic (plan 30 SN): only where a person would change the subject. A BRIDGE (what was just said leads to an open
  // agenda item) or a LULL (a short reply with no question, a thread that has had its run, or I'm bored). Never during
  // the warm-up, never on back-to-back turns, no timer and no forcing near the end. Dealbreakers are already checked by
  // the gate, so they come up only through a bridge, never cold.
  let topic = null;
  const turn = state.turn ?? 0;
  const sinceTopic = turn - (state.lastTopicTurn ?? -1);
  if (!opening && turn >= KG.WARMUP_TURNS && sinceTopic >= KG.TOPIC_GAP_TURNS) {
    const tries = (a) => state.topicTries?.[a.id] ?? ((state.topicsTouched ?? []).includes(a.id) ? 1 : 0);
    // Audit fix 3: never what they already stated, this turn included (a dealbreaker_hint reopen may still follow up).
    const heard = (a) => !a.reopened && (state.heardAttrs ?? []).includes(agendaAttribute(a));
    const open = agenda.filter((a) => a.status !== 'answered' && tries(a) < KG.TOPIC_TRIES && !heard(a)).sort((a, b) => b.priority - a.priority);
    const said = [theirs, thread.mine ?? ''].join('\n');
    const bridged = open.find((a) => bridgesTo(a, said));
    const lull = (shortReply && !theyAsked) || sinceTopic >= KG.THREAD_TURNS || interest < KG.LOW_INTEREST;
    // At a lull only untried, non-gate topics: a second try needs the chat to lead back to it.
    const cold = open.find((a) => tries(a) === 0 && !(a.dealbreaker && agendaAttribute(a)));
    const story = () => { const s = pick(stories, rng); return { kind: 'story', id: String(s._id), text: s.object }; };
    if (bridged) topic = { kind: 'agenda', id: bridged.id, text: bridged.topic, how: 'bridge' };
    else if (lull && cold && (!stories.length || rng() < KG.LULL_AGENDA_RATE)) topic = { kind: 'agenda', id: cold.id, text: cold.topic, how: 'lull' };
    else if (lull && stories.length) topic = story();
    else if (stories.length && rng() < KG.STORY_RATE) topic = story();
  }

  const language = pickLanguage(voice.language, perception.language?.languages ?? [], rng, perception.mood);
  let end = null;
  if (perception.dealbreakerHit) end = 'dealbreaker_hint';
  else if ((state.lowInterestTurns ?? 0) >= KG.END_AFTER_LOW_TURNS) end = 'interest';
  else if (msgCount + 1 >= maxMessages) end = 'max_turns';
  else if (agendaSettled && msgCount >= naturalEndFrom) end = 'natural';
  const answerFirst = Boolean(perception.aboutMeQuestion);
  // The shape of this message: answer their question, raise a topic, ask a follow-up on their thread, or (no question)
  // share something of mine that connects / just react. Not every message is "reaction + question".
  const move = end ? 'end' : answerFirst ? 'answer' : topic ? 'topic' : askBack ? 'follow_up' : rng() < 0.6 ? 'share' : 'react';
  // An agenda topic may always be raised with a question: a curious "oh are you a beer person?" is how a bridge sounds
  // natural, and whoever moves a slowed-down chat on usually asks. Topics are rare (warm-up, gap), so the rate stays low.
  return { targetWords, burst, move, answerFirst, askBack: end ? false : askBack || topic?.kind === 'agenda', emoji, laugh, reactions, mustDisagree, disagreeOn: hold?.text ?? null, topic: end ? null : topic, language, end };
}
