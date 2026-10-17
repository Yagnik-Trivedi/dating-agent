// Tier mid, reasoning off. When a match closes: my agent's raw notes + chat moments about one match → a short summary
// kept on MY MatchDecision before the raw notes are archived (TTL). Mine only; never shown to the other side.
// Output: { summary }

export function build({ matchName, decision, notes, events }) {
  return [
    {
      role: 'system',
      content: [
        `Summarise what an AI dating agent learned about ${matchName} in one early chat, for its own user's records.`,
        'At most 120 words. Plain sentences. Keep the most telling short quotes verbatim, in quotation marks.',
        'Only what the notes and moments say: no guesses, no advice. Never infer religion, caste, ethnicity, race, health or sexuality.',
        'Output JSON: {"summary": "..."}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Decision on this match: ${decision ?? 'none'}`,
        `Notes about ${matchName} (with quotes):\n${notes.join('\n') || '(none)'}`,
        `Moments (type: quote):\n${events.join('\n') || '(none)'}`,
      ].join('\n\n'),
    },
  ];
}
