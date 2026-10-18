// Tier mid, reasoning off. A user's correction of how their agent texts ("I never say 'dude'", "I'd write that shorter")
// → one rule (plan 05 §6, plan 08 §3). Output: { rule, kind: 'style' | 'never_say' | 'fact', phrase? }

export function build({ correction, about, original, fix }) {
  return [
    {
      role: 'system',
      content: [
        'Turn a dating-app user\'s correction of their AI texting assistant into ONE short rule the assistant must follow.',
        '"never_say": a word, phrase, emoji or topic they never use. "style": how they write (length, tone, punctuation,',
        'language mix). "fact": the assistant got a fact about them wrong; state the corrected fact as "<thing>: <truth>".',
        'For "never_say", also give "phrase": the exact word, phrase or emoji to avoid, lowercase, as it would appear in a message.',
        'Output JSON: {"rule": "imperative, max 15 words", "kind": "style" | "never_say" | "fact", "phrase": "only for never_say"}.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [about && `About: ${about}`, original && `Agent wrote: "${original}"`, fix && `They'd write: "${fix}"`, correction && `Their note: ${correction}`].filter(Boolean).join('\n'),
    },
  ];
}
