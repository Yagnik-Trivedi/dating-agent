// Tier mid, reasoning off. One free-text answer by a user → facts about that user (plan 05 §5 step 2, ref Phase 3).
// Output: { summary, facts: [{ predicate, object, conceptText, conceptType, polarity, strength, isCurrent, sensitiveTopic, quote }] }
// Used for onboarding stories and "ask my human" answers.

export const PREDICATES = ['likes', 'dislikes', 'values', 'goal', 'background', 'opinion', 'humor'];
export const CONCEPT_TYPES = ['activity', 'food', 'place', 'value', 'lifestyle', 'topic', 'media', 'other'];
export const SENSITIVE_TOPICS = ['none', 'health', 'family_conflict', 'past_relationships', 'money', 'religion', 'politics', 'sexuality'];

export function build({ question, answer }) {
  return [
    {
      role: 'system',
      content: [
        'You extract facts about a dating-app user from their own written answer. Another assistant will later speak AS this user,',
        'so every fact must be something the user actually said about themselves.',
        '',
        'Rules:',
        '- Only facts explicitly supported by the answer. No guessing, no generalising beyond the words.',
        '- "quote": an EXACT, contiguous excerpt copied character-for-character from the answer (3 to 15 words) that supports the fact.',
        `- "predicate": one of ${PREDICATES.join(', ')}. Use "dislikes" for things they avoid or dislike, "opinion" for a view they`,
        '  hold or would argue for, "humor" for what they find funny.',
        '- "object": a short neutral label without a subject, 1 to 8 words, e.g. "trekking", "remakes are worse than originals".',
        '- "conceptText": the core thing as a short noun phrase (1 to 4 words), e.g. "trekking", "filter coffee", "film remakes".',
        `- "conceptType": one of ${CONCEPT_TYPES.join(', ')}.`,
        '- "polarity": 1 if they like/hold it, -1 if they dislike/reject it.',
        '- "strength" (0 to 1): how much they like it, or how firmly they hold the opinion ("very strongly" ≈ 0.9, "kind of" ≈ 0.4).',
        '- "isCurrent": true if it describes something ongoing that could change (learning guitar, training for a marathon).',
        `- "sensitiveTopic": one of ${SENSITIVE_TOPICS.join(', ')}.`,
        '- At most 8 facts. Fewer is fine; return [] if nothing is stated.',
        '- Never infer religion, caste, ethnicity, race, health, sexuality or income.',
        '- "summary": one line (max 15 words, no subject) capturing the answer as a reusable anecdote,',
        '  e.g. "got lost on Kalsubai and found the best chai stall". Empty string if the answer has no content.',
        '',
        'Output JSON: {"summary": "...", "facts": [{"predicate": "likes", "object": "...", "conceptText": "...", "conceptType": "activity",',
        '"polarity": 1, "strength": 0.7, "isCurrent": false, "sensitiveTopic": "none", "quote": "..."}]}',
      ].join('\n'),
    },
    { role: 'user', content: `Question: ${question}\nAnswer: ${answer}` },
  ];
}
