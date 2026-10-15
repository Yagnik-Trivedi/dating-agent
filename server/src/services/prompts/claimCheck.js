// Grounding check on a draft message (Nano + Super, reasoning off, in parallel): every self-claim must cite the fact that supports it.
// Output: { claims: [{ claim, factId: "F3" | null }] }. A claim without a valid factId is unsupported.

export function build({ firstName, reply, sayable, theirLast }) {
  return [
    {
      role: 'system',
      content: [
        `You check a chat message written on behalf of ${firstName}. List EVERY clause where ${firstName} says something about`,
        "themselves (I, I'm, I've, my, me, we): what they like, do, did, own, plan, where they live or work, people in their life,",
        'habits, things that happened to them. Funny or casual stories are claims too. An answer to a question about',
        `${firstName} ("what music are you into?" → "slow music and coffee") is a claim even without "I".`,
        'For each claim, give the id of the fact below that supports it, or null if no fact does.',
        'Supported: a paraphrase, or a natural detail that the fact or its quoted words contain.',
        'Not supported: anything new, or overstating a fact (a [level: casual] interest described as a passion, a wish described as a habit).',
        'A specific event or anecdote ("I got lost on a trek", "I burnt toast yesterday") is supported ONLY if a fact or its quoted',
        'words describe that same event. Liking an activity does not support a story about it.',
        'Skip only: reactions or opinions about what the other person said or did ("that sounds fun", "rajmachi in the rain',
        'sounds epic!", "goats make terrible guides"),',
        'questions, greetings and deflections ("tell you later").',
        'Output JSON: {"claims": [{"claim": "short quote from the message", "factId": "F3"}]} (empty list if no claims).',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Facts about ${firstName}:\n${sayable.join('\n') || '(none)'}\n\n${theirLast ? `The other person just wrote: ${theirLast}\n\n` : ''}${firstName}'s reply to check:\n${reply}`,
    },
  ];
}
