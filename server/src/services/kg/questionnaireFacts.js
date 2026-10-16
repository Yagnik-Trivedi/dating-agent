// Deterministic facts from onboarding (plan 05 §5 step 1): identity, A (traits), B (structured values/goals/lifestyle
// with accepts + dealbreaker flag) and D (interests). No LLM. `conceptText` / `conceptType` feed concept resolution.
import { QUESTIONS } from './questions.js';

const section = (id) => QUESTIONS.sections.find((s) => s.id === id);
const IMPORTANCE = Object.fromEntries(section('B').importance.map((i) => [i.value, i.weight]));
// v1 answers (seed personas before conversion): nice_to_have / important / dealbreaker.
const V1_IMPORTANCE = { nice_to_have: 0.3, important: 0.6, dealbreaker: 1 };
const INTENSITY = Object.fromEntries(section('D').intensities.map((i) => [i.value, i.weight]));

// How each section-B item reads as a fact label ("smoking: never").
export const TOPICS = {
  kids: 'wants children',
  religion: 'religion in own life',
  location: 'living in 3-5 years',
  smoking: 'smoking',
  drinking: 'drinking',
  family: 'family involvement in relationship decisions',
  career: 'career ambition',
  looking_for: 'looking for',
  diet: 'diet',
  conflict: 'conflict style',
  alone_time: 'alone time needed',
};

/**
 * Mini-IPIP: reverse items score 6 − answer; trait = mean of its answered items, normalized 1..5 → 0..1.
 * → { extraversion, agreeableness, conscientiousness, neuroticism, openness } (traits with no answers are omitted)
 */
export function traitScores(answersA = {}) {
  const sums = {};
  for (const item of section('A').items) {
    const raw = Number(answersA[item.id]);
    if (!(raw >= 1 && raw <= 5)) continue;
    const score = item.reverse ? 6 - raw : raw;
    (sums[item.trait] ??= []).push(score);
  }
  return Object.fromEntries(Object.entries(sums).map(([trait, xs]) => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    return [trait, Math.round(((mean - 1) / 4) * 1000) / 1000];
  }));
}

const choice = { source: 'questionnaire_choice', confidence: 1, disclosure: 'public', polarity: 1 };
const answerRef = (id) => [{ quote: null, sourceRef: { kind: 'answer', id }, at: new Date() }];

/** → plain v2 fact objects (no subjectId yet). */
export function questionnaireFacts(answers = {}) {
  const facts = [];

  // Identity → background (public by default, editable). Job/family are free text: no concept, embedded.
  const I = answers.I ?? {};
  if (I.job?.trim()) facts.push({ ...choice, predicate: 'background', object: `works as: ${I.job.trim()}`, attribute: 'job', value: I.job.trim(), evidence: [{ quote: I.job.trim(), sourceRef: { kind: 'answer', id: 'I.job' } }] });
  for (const lang of [...new Set((I.languages ?? []).map((l) => String(l).trim().toLowerCase()).filter(Boolean))]) {
    facts.push({ ...choice, predicate: 'background', object: `speaks ${lang}`, conceptText: lang, conceptType: 'other', evidence: answerRef('I.languages') });
  }
  if (I.family?.trim()) facts.push({ ...choice, predicate: 'background', object: `family: ${I.family.trim()}`, attribute: 'family_setup', value: I.family.trim(), evidence: [{ quote: I.family.trim(), sourceRef: { kind: 'answer', id: 'I.family' } }] });

  // A — traits: shape tone only, never said; read-only in the review.
  for (const [trait, value] of Object.entries(traitScores(answers.A))) {
    facts.push({ ...choice, predicate: 'trait', object: trait, attribute: trait, value, confidence: 0.8, disclosure: 'private', evidence: answerRef('A') });
  }

  // B — one structured fact per item; a dealbreaker is a flag on it (no separate dealbreaker facts).
  for (const item of section('B').items) {
    const a = answers.B?.[item.id];
    const option = item.options.find((o) => o.value === a?.answer);
    if (!option) continue;
    const isDealbreaker = Boolean(a.dealbreaker || a.importance === 'dealbreaker');
    const importance = isDealbreaker ? 1 : IMPORTANCE[a.importance] ?? V1_IMPORTANCE[a.importance] ?? 0.6;
    const accepts = a.accepts?.length ? a.accepts : isDealbreaker ? [option.value] : item.options.map((o) => o.value);
    facts.push({
      ...choice,
      predicate: item.predicate,
      object: `${TOPICS[item.id] ?? item.id}: ${option.label.toLowerCase()}`,
      attribute: item.id, value: option.value, accepts, importance, isDealbreaker,
      // Religion is sensitive: answerable if asked, never raised by the agent.
      disclosure: item.id === 'religion' ? 'if_asked' : 'public',
      ...(item.id === 'religion' && { sensitivity: { topic: 'religion', sensitive: true } }),
      conceptText: `${item.id.replace(/_/g, ' ')}: ${option.label.toLowerCase()}`, conceptType: item.predicate === 'lifestyle' ? 'lifestyle' : 'value',
      evidence: answerRef(`B.${item.id}`),
    });
  }

  // D — interests with intensity → strength.
  const seen = new Set();
  for (const i of answers.D?.interests ?? []) {
    const name = String(i.name ?? '').trim().toLowerCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    facts.push({ ...choice, predicate: 'likes', object: name, strength: INTENSITY[i.intensity] ?? INTENSITY.into_it, conceptText: name, conceptType: 'activity', evidence: answerRef('D') });
  }
  return facts;
}
