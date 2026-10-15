// Tier mid. Turns one free-text answer by a user into knowledge-graph facts about that user.
// Output: { summary: string, facts: [{ predicate, object, weight, quote }] }
// Used for onboarding stories (plan 05) and "ask my human" answers (plan 05 §4).

export const PREDICATES = ['likes', 'dislikes', 'values', 'story', 'background', 'goal'];

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
        '- Each fact needs "quote": an EXACT, contiguous excerpt copied character-for-character from the answer (3 to 15 words) that supports it.',
        `- "predicate" is one of: ${PREDICATES.join(', ')}.`,
        '- "object" is a short neutral phrase without a subject, 1 to 6 words, e.g. "trekking", "honesty", "works in product design".',
        '- "weight" (0 to 1) is how much this seems to matter to them.',
        '- At most 8 facts. Fewer is fine; return [] if nothing is stated.',
        '- Never infer religion, caste, ethnicity, race, health, sexuality or income.',
        '- "summary": one line (max 15 words, no subject, past or present tense) capturing the answer as a reusable anecdote,',
        '  e.g. "got lost on Kalsubai and found the best chai stall". Empty string if the answer has no content.',
        '',
        'Output JSON: {"summary": "...", "facts": [{"predicate": "likes", "object": "...", "weight": 0.7, "quote": "..."}]}',
      ].join('\n'),
    },
    { role: 'user', content: `Question: ${question}\nAnswer: ${answer}` },
  ];
}
