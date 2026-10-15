// Tier fast. Batched: for each (user fact, match fact) pair, are they aligned, neutral or conflicting for a relationship?
// Output: { pairs: [{ id: "p1", alignment: "aligned" | "neutral" | "conflicting" }] }

export function build({ pairs }) {
  return [
    {
      role: 'system',
      content: [
        'You compare two people on a dating app, one topic at a time. For each pair, say whether what the user wants/is and',
        'what the match wants/is are "aligned" (same or compatible), "neutral" (different but easy to live with) or',
        '"conflicting" (hard to reconcile in a relationship).',
        'Examples: smoking never vs smoking never = aligned; drinking socially vs drinking never = neutral;',
        'wants children yes vs wants children no = conflicting; looking for long-term vs open to long-term = aligned.',
        'Judge only the stated facts. Output JSON: {"pairs": [{"id": "p1", "alignment": "aligned"}]}',
      ].join('\n'),
    },
    { role: 'user', content: pairs.map((p) => `[${p.id}] user: ${p.mine} | match: ${p.theirs}`).join('\n') },
  ];
}
