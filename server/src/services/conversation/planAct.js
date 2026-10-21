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

// Voice samples (and so switchTriggers) use the onboarding moods; the read uses plan 31's list.
const VOICE_MOOD = { playful: 'tease', flirty: 'tease', chill: 'casual', serious: 'opinion', tired: 'closing' };
const voiceMood = (mood) => VOICE_MOOD[mood] ?? mood;

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
 * mode: 'sn' (plan 30 SN, unchanged) | 'human' (plan 31: planHuman).
 * → { targetWords, burst, move, askBack, emoji, laugh, reactions, mustDisagree, disagreeOn, topic, language, end }
 */
export function planAct(args) {
  if (args.mode === 'human') return planHuman(args);
  return planSN(args);
}

function planSN({ state, voice = {}, perception = {}, rng, agenda = [], stories = [], msgCount = 0, opening = false, agendaSettled = false,
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

  const language = pickLanguage(voice.language, perception.language?.languages ?? [], rng, voiceMood(perception.mood));
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

// --- Plan 31 (CONVO_MODE=human): simple, mood-matched talk. The agent sees whether two people get along; it doesn't
// fill in a form. Most messages are a reply or a reaction; questions are rare and about what they just said; at most
// one plain matching question per chat (an askOnce item), only when the chat is warm and already near it.
const wordCount = (s) => String(s ?? '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const TIRED = /\b(ugh+|so tired|exhausted|long day|sleepy|dead tired|i'?m dead|drained)\b/i;
const DOWN = /\b(worst|yelled|sad|upset|crying|cried|stressed|annoyed|frustrat\w*|rough day|bad day|hate (this|my|it))\b/i;
const NEWS = /\b(got (in|into|the|selected|promoted)|passed|cleared|promotion|finally (did|got)|guess what|i did it)\b/i;
const TELLING = /\b(so basically|long story|you won'?t believe|so (yesterday|today|this morning|last night)|and then)\b/i;
const BUSY = /\b(busy|swamped|in a meeting|at work rn|gtg|got to go|gotta go)\b/i;
const CLOSING = /\b(should sleep|going to sleep|off to bed|good ?night|gn|talk (later|tomorrow)|ttyl|catch you later)\b/i;
const ACRONYMS = /\b(OK|LOL|OMG|IPL|BTW|TBH|IMO|IDK|LMAO|ROFL)\b/g;

/** What code can tell about their latest message on its own (plan 31 B3). → { mood?, energy?, doing? } (only what it saw) */
export function readHeuristics(text = '') {
  const t = String(text);
  const n = wordCount(t);
  const caps = /\b[A-Z]{3,}\b/.test(t.replace(ACRONYMS, ''));
  const out = {};
  if (CLOSING.test(t)) Object.assign(out, { mood: 'tired', energy: 'low', doing: 'winding_down' });
  else if (BUSY.test(t)) Object.assign(out, { mood: 'busy', energy: 'low', doing: 'winding_down' });
  else if (DOWN.test(t)) Object.assign(out, { mood: 'down', doing: 'venting' });
  else if (TIRED.test(t)) Object.assign(out, { mood: 'tired', energy: 'low' });
  else if (/!!/.test(t) || caps) Object.assign(out, { mood: 'excited', energy: 'high', ...(NEWS.test(t) && { doing: 'sharing_news' }) });
  if (!out.doing && (TELLING.test(t) || (n >= 25 && !t.includes('?')))) out.doing = 'telling';
  if (!out.energy && n > 0 && n < 4) out.energy = 'low';
  return out;
}

const LOW_MOODS = new Set(['tired', 'busy', 'down', 'bored']);

function planHuman({ state, voice = {}, perception = {}, rng, agenda = [], stories = [], msgCount = 0, opening = false, agendaSettled = false,
  maxMessages = KG.MAX_TURNS, naturalEndFrom = MIN_MESSAGES_FOR_NATURAL_END, thread = {} }) {
  const interest = state.interest ?? 0.5;
  const theirs = String(thread.theirs ?? '');
  const theirWords = wordCount(theirs);
  // Their mood: this turn's read when there is one (split mode), else code heuristics on this turn, else last turn's read.
  const h = readHeuristics(theirs);
  const theyAsked = Boolean(perception.isQuestion || perception.aboutMeQuestion || theirs.includes('?'));
  const last = state.lastRead ?? {};
  const mood = perception.doing ? perception.mood : h.mood ?? perception.mood ?? last.mood ?? 'chill';
  const energy = perception.energy ?? h.energy ?? (mood === 'excited' ? 'high' : 'medium');
  const stillTelling = ['telling', 'venting'].includes(last.doing) && theirWords >= 8;
  const doing = perception.doing ?? h.doing ?? (stillTelling ? last.doing : theyAsked ? 'asking' : 'chatting');
  const low = energy === 'low' || LOW_MOODS.has(mood);
  const theyAreTelling = doing === 'telling' || doing === 'venting';

  // Length: my own sampled length pulled toward theirs (a 4-word message gets a short reply, not a paragraph).
  const counts = voice.wordCounts?.length ? voice.wordCounts : [10];
  const sampled = pick(counts, rng) * (0.5 + interest);
  const targetWords = Math.max(2, Math.round(opening || !theirWords ? sampled : sampled + KG.LENGTH_PULL * (theirWords - sampled)));
  const burst = !low && rng() < (voice.burstiness ?? 0) ? 2 : 1;

  // Questions: no floor. Fewer when they're low or telling; none right after my own question unless they asked me.
  let pAsk = interest < KG.LOW_INTEREST ? 0 : Math.min(KG.ASK_HUMAN_MAX, (voice.questionBackRate ?? 0.3) * (0.5 + interest));
  if (low) pAsk *= KG.ASK_LOW_ENERGY;
  if (theyAreTelling) pAsk *= KG.ASK_WHEN_TOLD;
  if (theyAsked) pAsk *= KG.ASK_WHEN_ASKED;
  if ((state.lastAsked && !theyAsked) || doing === 'winding_down') pAsk = 0;
  const askBack = opening || rng() < pAsk;
  const emoji = rng() < Math.min(1, voice.emojiPerMessage ?? 0) && voice.topEmojis?.length ? pick(voice.topEmojis, rng) : null;
  const laugh = (perception.humor || mood === 'playful') && !theyAreTelling && rng() < (voice.laughRate ?? 0) ? pickWeighted(voice.laughForms, rng) : null;
  const reactions = (perception.concepts ?? []).map((c) => ({ text: c.text, kind: reactionOf(c.own) }));
  const conflicts = perception.conflicts ?? [];
  const hold = conflicts.find((c) => c.ownStrength >= KG.STANCE_HOLD) ?? conflicts.find((c) => c.ownStrength >= KG.STANCE_BEND && rng() < 0.5);

  // The one matching question (plan 31 A6): an askOnce item still open, the chat warm, they're just chatting, what was
  // just said is near it, no matching question yet (a reopened dealbreaker may be followed up once), and it wouldn't be
  // my second question in a row.
  let topic = null;
  const warm = Boolean(state.warm || perception.humor || theyAsked) && interest >= KG.LOW_INTEREST;
  const heard = (a) => !a.reopened && (state.heardAttrs ?? []).includes(agendaAttribute(a));
  const said = [theirs, thread.mine ?? ''].join('\n');
  const askedOne = (state.matchingQuestions ?? 0) >= KG.MAX_MATCHING_QUESTIONS;
  if (!opening && warm && doing === 'chatting' && !(state.lastAsked && !theyAsked)) {
    const item = agenda.filter((a) => a.askOnce && a.status !== 'answered' && !heard(a) && !(state.topicTries?.[a.id] >= 1) && (!askedOne || a.reopened))
      .sort((a, b) => b.priority - a.priority).find((a) => bridgesTo(a, said));
    if (item) topic = { kind: 'agenda', id: item.id, text: item.topic, how: 'ask_once' };
  }
  // A short thing of mine only after they told a story (or asked me) and one of my stories connects.
  if (!topic && stories.length && !theyAreTelling && (state.theyTold || perception.aboutMeQuestion)) {
    const s = stories.find((x) => bridgesTo({ topic: x.object }, theirs));
    if (s) topic = { kind: 'story', id: String(s._id), text: s.object };
  }

  const language = pickLanguage(voice.language, perception.language?.languages ?? [], rng, voiceMood(mood));
  let end = null;
  if (perception.dealbreakerHit) end = 'dealbreaker_hint';
  else if ((state.lowInterestTurns ?? 0) >= KG.END_AFTER_LOW_TURNS) end = 'interest';
  else if (msgCount + 1 >= maxMessages) end = 'max_turns';
  // A natural end after the minimum, on a good moment or when they're tired or bored; never mid-story or with their question open.
  else if (agendaSettled && msgCount >= naturalEndFrom && !theyAreTelling && (low || doing === 'winding_down' || !theyAsked)) end = 'natural';
  const answerFirst = Boolean(perception.aboutMeQuestion);
  const stall = !opening && !theyAsked && !state.lastAsked && theirWords < KG.LULL_WORDS;
  const move = end ? 'close'
    : theyAreTelling ? 'stay'
      : answerFirst ? 'reply'
        : topic?.kind === 'story' ? 'share'
          : topic ? 'react'
            : askBack ? 'ask_theirs'
              : stall || rng() < 0.35 ? 'share' : 'react';
  return {
    mode: 'human', targetWords, burst, move, answerFirst, askBack: end ? false : askBack || topic?.kind === 'agenda',
    emoji, laugh, reactions, mustDisagree: Boolean(hold), disagreeOn: hold?.text ?? null, topic: end ? null : topic, language, end,
    read: { mood, energy, doing },
  };
}
