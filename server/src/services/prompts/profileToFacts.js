// Tier mid. Turns a match's profile free text (bio + prompt answers) into low-confidence facts about them.
// Structured tags are turned into facts in code (brief/buildBrief.js), so this prompt only reads free text.
// Output: { facts: [{ predicate, object, weight, quote }] }

export const PREDICATES = ['likes', 'dislikes', 'values', 'goal', 'lifestyle', 'background', 'story'];

export function build({ profile }) {
  return [
    {
      role: 'system',
      content: [
        "You read a dating-app profile on behalf of another user's assistant and note what the profile says about its owner.",
        'These are first impressions from a profile, not certainties. Be literal.',
        '',
        'Rules:',
        '- Only what the bio or prompt answers explicitly say about the owner. No guessing, no generalising.',
        '- Each fact needs "quote": an EXACT, contiguous excerpt copied character-for-character from the bio or a prompt answer (3 to 15 words).',
        `- "predicate" is one of: ${PREDICATES.join(', ')}.`,
        '- "object" is a short neutral phrase without a subject, 1 to 6 words, e.g. "trekking", "honesty", "works in product design".',
        '- "weight" (0 to 1) is how much this seems to matter to them.',
        '- At most 10 facts. Return [] if the text says nothing about them.',
        '- Never infer religion, caste, ethnicity, race, health, sexuality or income.',
        '',
        'Output JSON: {"facts": [{"predicate": "likes", "object": "...", "weight": 0.7, "quote": "..."}]}',
      ].join('\n'),
    },
    { role: 'user', content: `Profile:\n${JSON.stringify(profile, null, 2)}` },
  ];
}
