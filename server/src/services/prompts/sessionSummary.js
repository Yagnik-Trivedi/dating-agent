// Tier mid, reasoning off, temperature 0. ONE call when a session ends (plan 33 A5): the agents' memory of earlier
// sessions. Input: that session's transcript (+ the summary so far) only, never anyone's graph: both people saw every
// line of it. Output: { summary, threads: [{ about, text }], topicsCovered: [string] }

export function build({ names, previous, transcript }) {
  const [a, b] = names;
  return [
    {
      role: 'system',
      content: [
        `${a} and ${b} matched on a dating app and are texting over a few days. One sitting of their chat just ended.`,
        'Write the short memory they will both carry into the next sitting.',
        '',
        `- summary: 2 or 3 plain sentences on what they talked about and how it went (who shared what). Names, not "they".`,
        `- threads: up to 4 open threads worth picking up next time, each about ONE person ("about": "${a}" or "${b}"):`,
        '  something coming up for them (an exam on Friday, a trip, a decision), or a story left half-told. Short, in plain words',
        '  ("her exam on Friday", "the trek he was planning"). Only what was actually said.',
        '- topicsCovered: up to 8 short topics already talked through ("what she does for work", "his trekking"), so nobody',
        '  asks about them again.',
        '- Never add anything that was not said. Never judge whether they are a match. Keep it SFW.',
        '',
        'Output JSON: {"summary": "...", "threads": [{"about": "...", "text": "..."}], "topicsCovered": ["..."]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        previous ? `Earlier sittings, in short:\n${previous}` : '',
        `This sitting:\n${transcript.join('\n') || '(no messages)'}`,
        '\nReturn JSON only.',
      ].filter(Boolean).join('\n\n'),
    },
  ];
}
