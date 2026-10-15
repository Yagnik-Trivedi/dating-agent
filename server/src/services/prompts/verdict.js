// Tier smart (one call per viewer per evaluation). Reads the early conversation and writes the user's report.
// Output: { chemistry, reasons: [{ text, messageIds }], concerns: [{ text, messageIds }], askYourself: [], summary }

export function build({ userName, matchName, facts, tone, dimensions, agenda, transcript }) {
  return [
    {
      role: 'system',
      content: [
        `You are ${userName}'s dating assistant. You and ${matchName}'s side just had the first conversation on ${userName}'s behalf.`,
        `Write ${userName}'s private report: does ${matchName} seem worth ${userName}'s time?`,
        'Pre-meeting compatibility prediction is weak; your job is to surface clear matches and mismatches with evidence,',
        'not to predict love. Be kind, specific and honest.',
        '',
        '- "chemistry" (0 to 1): your read of rapport in the transcript: warmth, curiosity, back-and-forth, humour.',
        '- "reasons": 2 to 4 things that line up well. "concerns": 0 to 3 things that might not. Each item is one short',
        '  sentence addressed to the user ("You both…", "They mentioned…") and MUST cite the ids of the messages it is based on.',
        '- "askYourself": 1 to 3 questions the user should think about before deciding.',
        '- "summary": 2 plain sentences.',
        'Never mention scores, agendas or "the agent". Never infer religion, caste, ethnicity, race, health or sexuality.',
        'Never reveal anything about the user that is marked private; tone notes are for you only.',
        '',
        'Output JSON: {"chemistry": 0.6, "reasons": [{"text": "...", "messageIds": ["m3"]}], "concerns": [], "askYourself": ["..."], "summary": "..."}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `What matters to ${userName}:\n${facts.join('\n') || '(nothing recorded)'}`,
        tone ? `${userName}'s tone preferences (private): ${tone}` : '',
        `Scores computed so far (0-1): ${JSON.stringify(dimensions)}`,
        `What ${userName} wanted to find out:\n${agenda.join('\n') || '(nothing)'}`,
        `Conversation (message id, sender):\n${transcript.join('\n') || '(no messages)'}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
}
