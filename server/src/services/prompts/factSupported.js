// Tier mid, reasoning off, temperature 0. Support check (plan 05 §5 step 2, F9): does the answer really state each fact?
// Output: { results: [{ i, supported: 'yes' | 'no' | 'unclear' }] }

export function build({ answer, facts }) {
  return [
    {
      role: 'system',
      content: [
        'You check facts extracted from a person\'s written answer. For each numbered fact, decide whether the answer itself states it.',
        '"yes": the answer clearly says it. "unclear": implied or partly said. "no": not said, exaggerated, or the opposite.',
        'Judge polarity and strength too: "likes X" when they said they tolerate X is "no"; "strongly" when they said "a bit" is "no".',
        'Output JSON: {"results": [{"i": 1, "supported": "yes"}]} with one entry per fact.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Answer: ${answer}\n\nFacts:\n${facts.map((f, i) => `${i + 1}. ${f.predicate} (${f.polarity === -1 ? 'dislikes/rejects' : 'likes/holds'}, strength ${f.strength}): ${f.object}`).join('\n')}`,
    },
  ];
}
