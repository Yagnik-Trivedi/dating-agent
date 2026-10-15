// Tier fast. 3 conversation starters for the user to use themselves after the handoff.
// Output: { icebreakers: ["...", "...", "..."] }

export function build({ matchName, overlaps, observed }) {
  return [
    {
      role: 'system',
      content: [
        `Suggest 3 short conversation starters the user can send ${matchName} now that they're chatting directly.`,
        'Each one builds on something they share or something the match said, is specific, light and SFW, and is phrased as',
        `a suggestion that uses their name, never "he" or "she" ("Ask ${matchName} which monsoon trek to pick for a first-timer").`,
        'Max 15 words each.',
        'Output JSON: {"icebreakers": ["...", "...", "..."]}',
      ].join('\n'),
    },
    { role: 'user', content: `Shared: ${overlaps.join(', ') || '(none found)'}\nWhat ${matchName} shared: ${observed.join('; ') || '(little)'}` },
  ];
}
