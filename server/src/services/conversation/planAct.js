// The act plan for one reply (plan 08 §2.3): deterministic sampling from MY voice distributions with the
// conversation's seeded rng, so the same seed + perceptions replay identically. Stored on the message.
import { KG } from '../kg/config.js';

export const MIN_MESSAGES_FOR_NATURAL_END = 16; // 12 gave judges too little to go on (tuning it2: c1 and c7 ended at 13 → "unsure")
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
 * humor, language: { languages }, mood, dealbreakerHit }; agenda: my agenda items; stories: my untold story facts.
 * → { targetWords, burst, askBack, emoji, laugh, reactions, mustDisagree, disagreeOn, topic, language, end }
 */
export function planAct({ state, voice = {}, perception = {}, rng, agenda = [], stories = [], msgCount = 0, opening = false, agendaSettled = false,
  maxMessages = KG.MAX_TURNS, naturalEndFrom = MIN_MESSAGES_FOR_NATURAL_END }) {
  const interest = state.interest ?? 0.5;
  const counts = voice.wordCounts?.length ? voice.wordCounts : [10];
  const targetWords = Math.max(2, Math.round(pick(counts, rng) * (0.5 + interest)));
  const burst = rng() < (voice.burstiness ?? 0) ? 2 : 1;
  // questionBackRate comes from replies to onboarding prompts, where people rarely ask back; in a real chat someone has
  // to keep it going. If they didn't ask anything and I'm not bored, ask back at least ASK_BACK_FLOOR of the time
  // (first v2 run: without it both agents stopped asking and the chat stalled on coffee).
  const floor = interest < KG.LOW_INTEREST ? 0 : perception.isQuestion ? KG.ASK_BACK_FLOOR / 2 : KG.ASK_BACK_FLOOR;
  const askBack = opening || rng() < Math.max(floor, Math.min(0.95, (voice.questionBackRate ?? 0.4) * (0.5 + interest)));
  const emoji = rng() < Math.min(1, voice.emojiPerMessage ?? 0) && voice.topEmojis?.length ? pick(voice.topEmojis, rng) : null;
  const laugh = perception.humor && rng() < (voice.laughRate ?? 0) ? pickWeighted(voice.laughForms, rng) : null;
  const reactions = (perception.concepts ?? []).map((c) => ({ text: c.text, kind: reactionOf(c.own) }));

  // Hold strong opinions; bend on middling ones half the time; concede on weak ones.
  const conflicts = perception.conflicts ?? [];
  const hold = conflicts.find((c) => c.ownStrength >= KG.STANCE_HOLD) ?? conflicts.find((c) => c.ownStrength >= KG.STANCE_BEND && rng() < 0.5);
  const mustDisagree = Boolean(hold);

  // New topic: my next open agenda item, or an untold story.
  let topic = null;
  if (!opening && (state.turn ?? 0) >= 1) {
    const shift = KG.TOPIC_SHIFT + (interest < KG.LOW_INTEREST ? 0.25 : 0);
    const tries = (a) => state.topicTries?.[a.id] ?? ((state.topicsTouched ?? []).includes(a.id) ? 1 : 0);
    const steerable = (a) => a.status !== 'answered' && (tries(a) === 0 || ((a.dealbreaker || a.priority >= KG.STEER_RETRY_PRIORITY) && tries(a) < KG.STEER_TRIES));
    // Untried important topics first, then retries of important ones, then minor topics; by priority within each.
    const important = (a) => a.dealbreaker || a.priority >= KG.STEER_RETRY_PRIORITY;
    const rank = (a) => (important(a) ? (tries(a) ? 1 : 0) : 2);
    const nextAgenda = agenda.filter(steerable).sort((a, b) => rank(a) - rank(b) || b.priority - a.priority)[0];
    // After the warm-up, every other turn steers to my next open agenda topic (v1 measured: a soft chance was ignored
    // and chats looped on one topic); in between, a random shift (more likely when bored) or a story.
    const steerTurn = (state.turn ?? 0) >= KG.STEER_AFTER_TURNS && (state.lastTopicTurn ?? -2) < (state.turn ?? 0) - 1;
    // Near MAX_TURNS an open important item is the topic every turn, tries or not (owner's tuning spec).
    const nearEnd = msgCount >= maxMessages - KG.NEAR_END_MESSAGES && agenda.filter((a) => a.status !== 'answered' && important(a)).sort((a, b) => b.priority - a.priority)[0];
    if (nearEnd) topic = { kind: 'agenda', id: nearEnd.id, text: nearEnd.topic };
    else if (nextAgenda && (steerTurn || rng() < shift)) topic = { kind: 'agenda', id: nextAgenda.id, text: nextAgenda.topic };
    else if (stories.length && rng() < KG.STORY_RATE) { const s = pick(stories, rng); topic = { kind: 'story', id: String(s._id), text: s.object }; }
  }

  const language = pickLanguage(voice.language, perception.language?.languages ?? [], rng, perception.mood);
  let end = null;
  if (perception.dealbreakerHit) end = 'dealbreaker_hint';
  else if ((state.lowInterestTurns ?? 0) >= KG.END_AFTER_LOW_TURNS) end = 'interest';
  else if (msgCount + 1 >= maxMessages) end = 'max_turns';
  else if (agendaSettled && msgCount >= naturalEndFrom) end = 'natural';
  return { targetWords, burst, answerFirst: Boolean(perception.aboutMeQuestion), askBack: end ? false : askBack, emoji, laugh, reactions, mustDisagree, disagreeOn: hold?.text ?? null, topic: end ? null : topic, language, end };
}
