// Tier mid, reasoning off. Plan 33 Q1: a module's longer answers (stories, long lines) → finer facts about the user, in
// ONE call per module. Each answer is numbered; every fact names its answer and quotes it exactly (checked in code).
// Output: { facts: [{ n, predicate, object, conceptText, conceptType, polarity, strength, isCurrent, sensitiveTopic, quote }] }
import { CONCEPT_TYPES, PREDICATES, SENSITIVE_TOPICS } from './extractStoryFacts.js';

export { CONCEPT_TYPES, PREDICATES, SENSITIVE_TOPICS };

export function build({ items }) {
  return [
    {
      role: 'system',
      content: [
        'You extract facts about a dating-app user from their own written answers. Another assistant will later speak AS this user,',
        'so every fact must be something the user actually said about themselves.',
        '',
        'Rules:',
        '- Only facts explicitly supported by the answer. No guessing, no generalising beyond the words.',
        '- "n": the number of the answer the fact comes from.',
        '- "quote": an EXACT, contiguous excerpt copied character-for-character from THAT answer (3 to 15 words).',
        `- "predicate": one of ${PREDICATES.join(', ')}. "dislikes" for things they avoid or dislike, "opinion" for a view they hold,`,
        '  "humor" for what they find funny, "values" for what matters to them and why, "background" for what they do or have done.',
        '- "object": a short neutral label without a subject, 1 to 8 words, e.g. "trekking in the Sahyadris", "remakes are worse than originals".',
        '- "conceptText": the core thing as a short noun phrase (1 to 4 words), or "" if there is none.',
        `- "conceptType": one of ${CONCEPT_TYPES.join(', ')}.`,
        '- "polarity": 1 if they like/hold it, -1 if they dislike/reject it.',
        '- "strength" (0 to 1): how much they like it or how firmly they hold it. Hedged words ("i think", "kinda", "idk") ≈ 0.3–0.4.',
        '- "isCurrent": true if it is ongoing and could change soon (exams this week, learning guitar).',
        `- "sensitiveTopic": one of ${SENSITIVE_TOPICS.join(', ')}.`,
        '- At most 5 facts per answer. Fewer is fine. Don\'t repeat the whole answer as one fact: pick out the specific things (a place, a person\'s role, a reason, a feeling).',
        '- Never infer religion, caste, ethnicity, race, health, sexuality or income.',
        '',
        'Output JSON: {"facts": [{"n": 1, "predicate": "likes", "object": "...", "conceptText": "...", "conceptType": "activity",',
        '"polarity": 1, "strength": 0.7, "isCurrent": false, "sensitiveTopic": "none", "quote": "..."}]}',
      ].join('\n'),
    },
    { role: 'user', content: items.map((it, i) => `[${i + 1}] Question: ${it.question}\nAnswer: ${it.answer}`).join('\n\n') },
  ];
}
