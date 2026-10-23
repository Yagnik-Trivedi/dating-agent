// Plan 33 C1 (A7): how deep a piece of evidence goes and which part of a life it's about, from MY fact it bears on, plus
// chemistry measured in code from the transcript. Q1's brain map will set KgFact.depthTier / branch; until then today's
// facts are mapped here. No LLM, no DB.
import { KG } from '../kg/config.js';

// Section-B answers. Kids, the future, family, belief, work and how you handle things are deep; daily habits personal.
const ATTRIBUTE = {
  kids: ['deep', 'future'], looking_for: ['deep', 'future'], location: ['deep', 'future'],
  family: ['deep', 'family & beliefs'], religion: ['deep', 'family & beliefs'],
  career: ['deep', 'work'], conflict: ['deep', 'how you handle things'], alone_time: ['deep', 'how you handle things'],
  smoking: ['personal', 'lifestyle'], drinking: ['personal', 'lifestyle'], diet: ['personal', 'lifestyle'],
};
const PREDICATE_TIER = {
  values: 'deep', goal: 'deep', reflection: 'deep',
  story: 'personal', background: 'personal', humor: 'personal', lifestyle: 'personal', trait: 'personal',
  likes: 'surface', dislikes: 'surface', opinion: 'surface',
};
// Today's story questions (plan 33 A4's mapping to the new modules).
const STORY_BRANCH = { sunday: 'daily life', hill: 'opinions', argue: 'opinions', weirdly_good: 'humour', laugh: 'humour', place: 'travel', friends_rely: 'friends' };
const CONCEPT_BRANCH = { food: 'food', activity: 'outdoors & activities', place: 'travel', media: 'films & music', value: 'values', lifestyle: 'lifestyle', topic: 'opinions' };

const storyQuestion = (f) => (f.evidence ?? []).map((e) => /^C\.(\w+)$/.exec(e.sourceRef?.id ?? '')?.[1]).find(Boolean) ?? null;

/** surface | personal | deep */
export function tierOf(f = {}) {
  if (f.depthTier) return f.depthTier;
  if (f.attribute && ATTRIBUTE[f.attribute]) return ATTRIBUTE[f.attribute][0];
  return PREDICATE_TIER[f.predicate] ?? 'surface';
}

/** The life area a fact sits in (for "evidence from at least 5 different branches"). conceptType: the fact's concept type. */
export function branchOf(f = {}, conceptType = null) {
  if (f.branch?.length) return f.branch[0];
  if (f.attribute && ATTRIBUTE[f.attribute]) return ATTRIBUTE[f.attribute][1];
  const q = storyQuestion(f);
  if (q && STORY_BRANCH[q]) return STORY_BRANCH[q];
  if (['likes', 'dislikes'].includes(f.predicate)) return CONCEPT_BRANCH[conceptType ?? f.conceptType] ?? 'interests';
  return { values: 'values', goal: 'future', reflection: 'values', story: 'stories', background: 'where I come from', humor: 'humour', opinion: 'opinions', lifestyle: 'lifestyle', trait: 'personality' }[f.predicate] ?? 'other';
}

const LAUGH = /\b(ha(ha)+h?|he(he)+|lo+l+|lmao+|rofl|xd)\b|[😂🤣😆😹]/iu;
const wordsOf = (t) => String(t ?? '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Chemistry in the chat itself (A7.5), from my side's point of view. transcript: [{ text, mine, session }] in order;
 * interestEnds: my agent's interest at the end of each finished session, oldest first.
 * → { ok, missing: [plain reasons], asks: { mine, theirs }, laughs: { mine, theirs }, shrink, interestEnds }
 */
export function chemistry(transcript = [], interestEnds = [], cfg = KG.CHEMISTRY) {
  const count = (fn, mine) => transcript.filter((m) => m.mine === mine && fn(m.text)).length;
  const asks = { mine: count((t) => String(t).includes('?'), true), theirs: count((t) => String(t).includes('?'), false) };
  const laughs = { mine: count((t) => LAUGH.test(String(t)), true), theirs: count((t) => LAUGH.test(String(t)), false) };
  const sessions = [...new Set(transcript.map((m) => m.session ?? 1))].sort((a, b) => a - b);
  const theirLen = (s) => mean(transcript.filter((m) => !m.mine && (m.session ?? 1) === s).map((m) => wordsOf(m.text)));
  const first = theirLen(sessions[0]);
  const shrink = sessions.length > 1 && first > 0 ? Math.round((theirLen(sessions.at(-1)) / first) * 100) / 100 : 1;
  const lastEnds = interestEnds.slice(-cfg.INTEREST_SESSIONS);
  const missing = [
    (asks.mine < cfg.MIN_QUESTIONS || asks.theirs < cfg.MIN_QUESTIONS) && 'you both asked each other things',
    (laughs.mine < cfg.MIN_LAUGHS || laughs.theirs < cfg.MIN_LAUGHS) && 'you laughed together',
    shrink < cfg.SHRINK_MIN && 'their messages kept their length',
    (lastEnds.length < cfg.INTEREST_SESSIONS || lastEnds.some((i) => (i ?? 0) < cfg.MIN_INTEREST)) && 'the interest held up at the end of the last sessions',
  ].filter(Boolean);
  return { ok: !missing.length, missing, asks, laughs, shrink, interestEnds };
}
