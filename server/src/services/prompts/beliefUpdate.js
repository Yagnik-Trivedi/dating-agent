// Tier mid. After each message from the match: what did we just learn about them?
// Output: { facts: [{ predicate, object, weight, confidence, quote, agendaId }], agendaUpdates: [{ id, status, note }], redFlags: [{ flag, quote }] }

export const PREDICATES = ['likes', 'dislikes', 'values', 'goal', 'lifestyle', 'background', 'story', 'trait'];

export function build({ matchName, transcript, observed, agenda }) {
  return [
    {
      role: 'system',
      content: [
        `You help a dating-app user's assistant learn about ${matchName} from their chat. Read ${matchName}'s latest messages.`,
        '',
        `1. "facts": new things ${matchName} said about THEMSELVES in the conversation below (not what the other person said).`,
        '   "quote" = their EXACT words copied character-for-character from one of their messages (3 to 15 words).',
        `   "predicate" is one of: ${PREDICATES.join(', ')}. "object" = short neutral phrase, 1 to 6 words.`,
        '   "confidence" (0 to 1): 0.9 for a clear direct statement, 0.6 for an implied one, 0.4 for a hint or joke.',
        '   Include facts already known if they are restated (that raises confidence). At most 6.',
        '2. "agendaUpdates": for each topic below that their messages address, "answered" (clear answer),',
        '   "partially" (some signal) or "open". Only list topics that changed. Use the topic ids.',
        '3. "redFlags": pressure, asking for money, pushing to another app, inconsistency with what they said earlier,',
        '   disrespect. "quote" = their exact words. Usually empty.',
        '',
        'Never infer religion, caste, ethnicity, race, health or sexuality. Return empty arrays when nothing applies.',
        'Output JSON: {"facts": [{"predicate": "likes", "object": "...", "weight": 0.6, "confidence": 0.9, "quote": "...", "agendaId": null}], "agendaUpdates": [], "redFlags": []}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Known so far about ${matchName}:\n${observed.join('\n') || '(nothing yet)'}`,
        `Topics to find out:\n${agenda.join('\n') || '(none)'}`,
        `Latest messages:\n${transcript.join('\n')}`,
      ].join('\n\n'),
    },
  ];
}
