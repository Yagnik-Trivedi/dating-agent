// Deterministic facts from onboarding (plan 05 §5 step 1): identity, A (traits), B (structured values/goals/lifestyle
// with accepts + dealbreaker flag) and D (interests). No LLM. `conceptText` / `conceptType` feed concept resolution.
import { coreValueFacts, coreValuePlace, moduleTraitScores } from './moduleFacts.js';
import { IF_ASKED_ATTRIBUTES, jobPhrase, promptPhrase, promptPredicate, valuePhrase } from './phrases.js';
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
const ATTRIBUTE_OF_TOPIC = Object.fromEntries(Object.entries(TOPICS).map(([attr, topic]) => [topic, attr]));
/** An agenda item's section-B attribute (agendas built before it was stored only carry the topic label). */
export const agendaAttribute = (a) => a.attribute ?? ATTRIBUTE_OF_TOPIC[String(a.topic ?? '').toLowerCase()] ?? null;

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

/** Likert traits, with each trait the module picks cover replaced by their score (plan 33 A4). */
export const allTraitScores = (answers = {}) => ({ ...traitScores(answers.A), ...moduleTraitScores(answers.M) });

const choice = { source: 'questionnaire_choice', confidence: 1, disclosure: 'public', polarity: 1 };
const answerRef = (id) => [{ quote: null, sourceRef: { kind: 'answer', id }, at: new Date() }];

/** → plain v2 fact objects (no subjectId yet). prompts: the profile's prompt answers (UX P0-4: claimable facts). */
export function questionnaireFacts(answers = {}, { prompts = [] } = {}) {
  const facts = [];

  // Identity → background (public by default, editable). Job/family are free text: no concept, embedded.
  const I = answers.I ?? {};
  if (I.job?.trim()) facts.push({ ...choice, predicate: 'background', object: jobPhrase(I.job.trim()), attribute: 'job', value: I.job.trim(), evidence: [{ quote: I.job.trim(), sourceRef: { kind: 'answer', id: 'I.job' } }] });
  for (const lang of [...new Set((I.languages ?? []).map((l) => String(l).trim().toLowerCase()).filter(Boolean))]) {
    facts.push({ ...choice, predicate: 'background', object: `speaks ${lang}`, conceptText: lang, conceptType: 'other', evidence: answerRef('I.languages') });
  }
  if (I.family?.trim()) facts.push({ ...choice, predicate: 'background', object: `family: ${I.family.trim()}`, attribute: 'family_setup', value: I.family.trim(), evidence: [{ quote: I.family.trim(), sourceRef: { kind: 'answer', id: 'I.family' } }] });

  // A — traits: shape tone only, never said; read-only in the review. Plan 33: a module's trait picks replace the
  // agree/disagree statements for that trait when present.
  for (const [trait, value] of Object.entries(allTraitScores(answers))) {
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
      object: valuePhrase(item.id, option.value) ?? `${TOPICS[item.id] ?? item.id}: ${option.label.toLowerCase()}`, // UX P0-4
      attribute: item.id, value: option.value, accepts, importance, isDealbreaker,
      // UX P0-4: kids, drinking, smoking and religion are answerable if asked, never raised by the agent.
      disclosure: IF_ASKED_ATTRIBUTES.has(item.id) ? 'if_asked' : 'public',
      ...(item.id === 'religion' && { sensitivity: { topic: 'religion', sensitive: true } }),
      conceptText: `${item.id.replace(/_/g, ' ')}: ${option.label.toLowerCase()}`, conceptType: item.predicate === 'lifestyle' ? 'lifestyle' : 'value',
      evidence: answerRef(`B.${item.id}`),
      ...coreValuePlace(item.id), // plan 33: its place in the brain map
    });
  }
  facts.push(...coreValueFacts(answers.B)); // plan 33: the optional "say more" under a value

  // UX P0-4: each profile prompt answer is a claimable fact in the user's own words (source prompt_<n>).
  prompts.forEach((p, i) => {
    const q = String(p?.q ?? '').trim(), a = String(p?.a ?? '').trim();
    if (!q || !a) return;
    facts.push({ ...choice, predicate: promptPredicate(q), object: promptPhrase(q, a), slot: `prompt_${i + 1}`, strength: 0.7, sourceAnswerId: `prompt_${i + 1}`,
      evidence: [{ quote: a, sourceRef: { kind: 'profile', id: `prompt_${i + 1}` }, at: new Date() }] });
  });

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
