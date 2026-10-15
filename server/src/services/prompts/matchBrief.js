// Tier mid. The pre-conversation brief: who the match seems to be, 3 openers in the user's own voice, watchouts.
// Output: { summary, openers: [{ text, hook }], watchouts: [] }

export function build({ userName, profile, overlaps, agendaTopics, style }) {
  return [
    {
      role: 'system',
      content: [
        `You prepare ${userName}'s assistant for a first conversation with a new dating-app match.`,
        '',
        '1. "summary": 3 short lines on who this person seems to be, based only on their profile. Kind, specific, no judgement.',
        `2. "openers": 3 first messages ${userName} could send. Each must reference something SPECIFIC from the match's profile`,
        '   (a prompt answer, an interest or a shared thing), be written in the style below, and be at most 2 sentences.',
        '   Prefer the shared things when there are any. "hook" names what it uses, e.g. "Prompt: A perfect Sunday" or "Shared: trekking".',
        '   No pickup lines, no compliments on looks, no questions about religion, caste, money or past relationships.',
        '3. "watchouts": 0 to 3 short notes for the assistant (tone to match, sensitive areas, things to clarify gently).',
        '',
        `How ${userName} texts:`,
        style || '(no style notes; keep it warm, casual and short)',
        '',
        'Output JSON: {"summary": "...", "openers": [{"text": "...", "hook": "..."}], "watchouts": ["..."]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Match's profile:\n${JSON.stringify(profile, null, 2)}`,
        `Things in common: ${overlaps.length ? overlaps.join(', ') : 'none found yet'}`,
        `Topics ${userName} wants to learn about (steer gently, never interrogate): ${agendaTopics.join(', ') || 'none'}`,
      ].join('\n\n'),
    },
  ];
}
