// Tier mid, reasoning off. The pre-conversation brief (plan 07 §4): who the match seems to be (from their PUBLIC
// profile only), 3 openers in the user's own voice, watchouts.
// Output: { summary, openers: [{ text, hook, factIds }], watchouts: [] }

export function build({ userName, profile, myFacts, agendaTopics, style, exemplars }) {
  return [
    {
      role: 'system',
      content: [
        `You prepare ${userName}'s assistant for a first conversation with a new dating-app match.`,
        '',
        '1. "summary": 3 short lines on who this person seems to be, based only on their public profile. Kind, specific, no judgement.',
        `2. "openers": 4 first messages ${userName} could send (the best 3 valid ones are used). Each must react to something SPECIFIC in the match's profile`,
        '   (a prompt answer, an interest, their bio). At most 2 sentences, written exactly in the style below.',
        `   An opener may mention something about ${userName} ONLY if it is in "${userName}'s facts" below, and must then list`,
        '   the fact ids it uses in "factIds". "Same here" / "me too" covers ONLY what the cited fact says (a trekking fact',
        '   does not make them a photographer). Never invent anecdotes, habits or plans. "hook" names what it reacts to,',
        '   e.g. "Prompt: A perfect Sunday". No pickup lines, no compliments on looks, no questions about religion, caste,',
        '   money or past relationships. Never mention dealbreakers, scores or that anyone is being evaluated.',
        '3. "watchouts": 0 to 3 short notes for the assistant (tone to match, sensitive areas, things to clarify gently).',
        '',
        `How ${userName} texts:`,
        style || '(no style notes; keep it warm, casual and short)',
        exemplars.length ? `\nReal messages ${userName} wrote:\n${exemplars.map((e) => `- "${e}"`).join('\n')}` : '',
        '',
        'Output JSON: {"summary": "...", "openers": [{"text": "...", "hook": "...", "factIds": []}], "watchouts": ["..."]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Match's public profile:\n${JSON.stringify(profile, null, 2)}`,
        `${userName}'s facts (the only things the openers may say about ${userName}):\n${myFacts.join('\n') || '(none)'}`,
        `Topics ${userName} wants to learn about over the chat (don't open with these): ${agendaTopics.join(', ') || 'none'}`,
      ].join('\n\n'),
    },
  ];
}
