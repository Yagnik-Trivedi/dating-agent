// "Ask my human", structurally (owner's step 2): did they ask MY user something, about which topic, and does my
// graph have anything on it? All code: dictionary-only concept lookup, no LLM. The hedge regex in checks.js is the
// fallback when the topic can't be resolved.
import { normalise } from '../kg/canonicalize.js';
import { tokensOf } from '../kg/language.js';

const QUESTION_WORD = /^\W*(what|what's|whats|how|do|did|does|have|has|are|is|would|will|where|when|which|who|why|could|can|should|any)\b|\b(kya|kaun|kaunsa|kaunsi|konsa|konsi|kab|kaise|kyun|kyu|kahan|kidhar)\b/i;
const YOU = /\b(you|your|yours|u|ur|tu|tum|aap|tera|teri|tere|tumhara|tumhari|tumhare|aapka|aapki|aapke|tujhe|tumhe|aapko)\b/i;
const THIRD = /\b(he|she|they|him|her|their|his|woh|wo|uska|uski|unka|unki)\b/i;

// Section B attributes by the words people use for them (en + Hinglish). Checked before the dictionary.
const ATTRIBUTE_WORDS = {
  smoking: /\b(smoke|smoking|smoker|cigarettes?|sutta)\b/i,
  drinking: /\b(drink|drinks|drinking|drinker|alcohol|beer|daaru|daru)\b/i,
  kids: /\b(kids|children|child|bacche|bachche|babies)\b/i,
  religion: /\b(religion|religious|pray|praying|spiritual)\b/i,
  diet: /\b(vegetarian|veg|non-veg|nonveg|vegan|meat|eggetarian)\b/i,
  location: /\b(settle|settling|relocate|relocating|see yourself living|(move|moving|live|living) abroad|stay in (this|the) city)\b/i,
  looking_for: /\b(looking for|long[- ]term|something serious|casual dating|hoping to find|brings you here|here for)\b/i,
  family: /\b(family|parents|fam)\b/i,
  career: /\b(career|ambition|ambitious|work[- ]life)\b/i,
  conflict: /\b(disagree|disagreements?|conflicts?|fights?|argue|arguments?)\b/i,
  alone_time: /\b(alone time|me[- ]time|time alone|own space|time to myself)\b/i,
};
const sentences = (text) => String(text).split(/(?<=[?.!])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
/** Section-B attributes a text names. questions: only its question sentences; statements: only the others. */
export function attributesIn(text, { questions } = {}) {
  const parts = sentences(text).filter((x) => questions === undefined || questions === (x.includes('?') || QUESTION_WORD.test(x)));
  return Object.keys(ATTRIBUTE_WORDS).filter((k) => parts.some((x) => ATTRIBUTE_WORDS[k].test(x)));
}
// Words that never name the topic of a question about me.
const NOT_TOPIC = new Set(['what', 'whats', "what's", 'how', 'do', 'does', 'did', 'you', 'your', 'yours', 'u', 'ur', 'the', 'a', 'an', 'is', 'are',
  'favourite', 'favorite', 'fav', 'like', 'love', 'into', 'think', 'about', 'any', 'have', 'has', 'kind', 'of', 'type', 'one', 'most', 'best', 'random',
  'question', 'but', 'so', 'and', 'or', 'on', 'in', 'to', 'for', 'with', 'at', 'tu', 'tum', 'aap', 'tera', 'teri', 'tere', 'tumhara', 'tumhari', 'aapka',
  'aapki', 'kya', 'kaun', 'kaunsa', 'kaunsi', 'konsa', 'konsi', 'hai', 'hain', 'ho', 'kab', 'kaise', 'kyun', 'kahan', 'ka', 'ki', 'ke', 'se', 'me', 'mein',
  'haha', 'lol', 'okay', 'ok', 'wait', 'also', 'really', 'usually', 'these', 'days', 'thing', 'things', 'stuff', 'team', 'go', 'to']);

/** The last question in their text, if it asks MY user something: a "?" or an interrogative, addressed to "you" or to no one else. */
export function questionToMe(text = '') {
  const parts = String(text).split(/(?<=[?.!])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const q = parts.reverse().find((s) => s.includes('?') || QUESTION_WORD.test(s));
  return q && (YOU.test(q) || !THIRD.test(q)) ? q : null;
}

/** Topic of the question: a section B attribute, else the longest dictionary hit among its n-grams. lookup(text) → { id, label } | null */
export async function topicOf(question, lookup) {
  for (const [key, re] of Object.entries(ATTRIBUTE_WORDS)) if (re.test(question)) return { kind: 'attribute', key, label: key.replace(/_/g, ' ') };
  const words = tokensOf(question).filter((w) => !NOT_TOPIC.has(w));
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const hit = await lookup(words.slice(i, i + n).join(' '));
      if (hit) return { kind: 'concept', id: String(hit.id), label: hit.label };
    }
  }
  return null;
}

/** Does my graph hold ANY fact on the topic (any polarity, any disclosure)? */
/** My facts on the topic (any polarity, any disclosure). */
export function factsOnTopic(topic, facts) {
  if (topic.kind === 'attribute') return facts.filter((f) => f.attribute === topic.key);
  const label = normalise(topic.label);
  return facts.filter((f) => String(f.conceptId ?? '') === topic.id
    || [f.object, f.conceptLabel].some((t) => t && ` ${normalise(t)} `.includes(` ${label} `)));
}
export const knowsTopic = (topic, facts) => factsOnTopic(topic, facts).length > 0;

export const topicKey = (topic) => (topic.kind === 'attribute' ? `attr:${topic.key}` : `concept:${topic.id}`);

/**
 * Should this turn file an "ask my human" item? Resolved topic → only when my graph has nothing on it (even if the
 * reply sounds confident). Unresolved → the draft's own unknownAboutMe, an unsupported claim, or a hedged reply.
 * → { question, topicKey, topicLabel } | null
 */
export function inboxDecision({ question, topic, known, draftUnknown = null, unsupported = [], hedged = false }) {
  if (question && topic) return known ? null : { question, topicKey: topicKey(topic), topicLabel: topic.label };
  if (draftUnknown) return { question: draftUnknown, topicKey: null, topicLabel: null };
  if (unsupported.length) return { question: `Is this true for you: "${unsupported[0]}"?`, topicKey: null, topicLabel: null };
  if (question && hedged) return { question, topicKey: null, topicLabel: null };
  return null;
}
