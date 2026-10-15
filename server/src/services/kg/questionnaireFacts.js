// Deterministic facts from onboarding sections A (traits), B (values/goals/dealbreakers) and D (interests). No LLM.
import { QUESTIONS } from './questions.js';

const section = (id) => QUESTIONS.sections.find((s) => s.id === id);
const IMPORTANCE_WEIGHT = Object.fromEntries(section('B').importance.map((i) => [i.value, i.weight]));
const INTENSITY_WEIGHT = Object.fromEntries(section('D').intensities.map((i) => [i.value, i.weight]));

// How each section-B item reads as a fact ("smoking: never"). The brief phrases profile tags the same way.
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

const base = { source: 'questionnaire', confidence: 0.9, disclosure: 'public' };

/** → plain fact objects (no subjectId yet) for sections A, B and D. */
export function questionnaireFacts(answers = {}) {
  const facts = [];

  // A — traits: shape tone only, never said.
  for (const [trait, value] of Object.entries(traitScores(answers.A))) {
    facts.push({ ...base, predicate: 'trait', object: trait, value, weight: 0.5, confidence: 0.8, disclosure: 'private' });
  }

  // B — values, goals, lifestyle (+ a dealbreaker fact when marked so).
  for (const item of section('B').items) {
    const a = answers.B?.[item.id];
    const option = item.options.find((o) => o.value === a?.answer);
    if (!option) continue;
    const weight = IMPORTANCE_WEIGHT[a.importance] ?? IMPORTANCE_WEIGHT.important;
    const topic = TOPICS[item.id] ?? item.id;
    // Religion is sensitive: the agent may answer if asked, but never raises it on its own.
    const disclosure = item.id === 'religion' ? 'if_asked' : 'public';
    facts.push({ ...base, predicate: item.predicate, object: `${topic}: ${option.label.toLowerCase()}`, value: option.value, weight, disclosure });
    if (a.importance === 'dealbreaker') {
      facts.push({ ...base, predicate: 'dealbreaker', object: `partner must be compatible on ${topic} (mine: ${option.label.toLowerCase()})`, value: option.value, weight: 1, disclosure: 'if_asked' });
    }
  }

  // D — interests with intensity.
  const seen = new Set();
  for (const i of answers.D?.interests ?? []) {
    const name = String(i.name ?? '').trim().toLowerCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    facts.push({ ...base, predicate: 'likes', object: name, weight: INTENSITY_WEIGHT[i.intensity] ?? INTENSITY_WEIGHT.into_it });
  }
  return facts;
}
