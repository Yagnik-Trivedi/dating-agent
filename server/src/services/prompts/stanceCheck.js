// Tier fast, reasoning off, temperature 0. Only when the act plan says the user must disagree (plan 08 §1.3):
// does the drafted reply agree with or concede the other person's claim? Output: { concedes: boolean }

export function build({ draft, disagreeOn }) {
  return [
    {
      role: 'system',
      content: [
        'The other person said something the writer firmly disagrees with. Does the reply agree with it, concede it, or',
        'drop the writer\'s own view ("you\'re right", "fair point, maybe", "haha true")? A friendly reply that still',
        'clearly keeps the opposite view does NOT concede. Output JSON: {"concedes": true|false}',
      ].join('\n'),
    },
    { role: 'user', content: `Their claim: "${disagreeOn}"\nThe reply: "${draft}"` },
  ];
}
