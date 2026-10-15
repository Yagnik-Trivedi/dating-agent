// Tier mid. Describes how a user texts, from their replies to sample messages.
// Output: { description: "5 short lines", doList: string[], dontList: string[] }

export function build({ samples, metrics }) {
  const transcript = samples.map((s, i) => `${i + 1}. They received: "${s.incoming}"\n   They replied: "${s.reply}"`).join('\n');
  return [
    {
      role: 'system',
      content: [
        'You analyse how a person texts on a dating app so an assistant can later write messages that sound exactly like them.',
        'Describe only their texting style: tone, humor type, formality, warmth, length, punctuation, emoji, slang or Hinglish, quirks.',
        'Base everything on the replies shown. Do not guess personal facts, and never mention religion, caste, ethnicity, race, health or sexuality.',
        'Output JSON: {"description": "exactly 5 short lines separated by \\n", "doList": ["imperative style rules to follow"], "dontList": ["things this person would never do in a text"]}.',
        'doList and dontList: 3 to 6 short items each, e.g. "start messages in lowercase", "use haha instead of lol".',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Measured metrics (computed from the replies): ${JSON.stringify(metrics)}\n\nReplies:\n${transcript}`,
    },
  ];
}
