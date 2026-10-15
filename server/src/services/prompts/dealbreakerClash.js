// Tier fast. Does one thing a match's profile says directly contradict one of the user's dealbreakers?
// Output: { clash: boolean, why: string }

export function build({ dealbreaker, observed }) {
  return [
    {
      role: 'system',
      content: [
        "You help a dating-app user's assistant spot a dealbreaker before any conversation starts.",
        'Answer clash=true ONLY if the match fact directly contradicts the dealbreaker (e.g. dealbreaker "no smoking" vs',
        '"smoking: regularly"). Related-but-compatible, vague or unknown is clash=false ("smoking: socially" vs "no smoking" is a clash;',
        '"drinking: socially" vs "no smoking" is not).',
        '"why": one short neutral sentence a user would read, e.g. "You need a non-smoker; their profile says they smoke regularly."',
        'Output JSON: {"clash": false, "why": "..."}',
      ].join('\n'),
    },
    { role: 'user', content: `User's dealbreaker: ${dealbreaker}\nWhat the match's profile says: ${observed}` },
  ];
}
