// Tier mid. Compares a dating profile's declared tags with its free text, and looks for scam-script patterns.
// Output: { contradictions: [{ a, b, topic, severity 1-3 }], scamSignals: [{ signal, quote }], genericBio, summary }

export function build({ profile }) {
  return [
    {
      role: 'system',
      content: [
        "You review a dating-app profile on behalf of another user's assistant, before any conversation starts.",
        'Real people are messy: mild contradictions are normal and are NOT evidence of a fake. Be fair and specific.',
        '',
        'Find:',
        '1. contradictions between the DECLARED tags/fields and what the FREE TEXT (bio, prompt answers) says,',
        '   e.g. tags say drinking "never" but a prompt says "best nights end with a few beers".',
        '   "a" = the tag or field value (e.g. "tags.lifestyle.drinking: never") or a quote; "b" = an EXACT quote copied',
        '   character-for-character from the bio or a prompt answer; "topic" = 1-3 neutral words (e.g. "drinking");',
        '   "severity" guide:',
        '     1 = minor nuance or exception (tags "never drinks" vs "only a glass of wine at weddings").',
        '     2 = a different habit than declared (tags "never smokes" vs "the occasional cigarette"; "workout: rarely" vs "run 10k every Sunday").',
        '     3 = the direct opposite of a declared goal or value (tags "wants kids: yes" vs "kids are not for me";',
        '         "long-term" vs "not looking for anything serious").',
        '2. scamSignals: sob stories, urgency, money or investment talk, pushing to another app, claims of being abroad,',
        '   in the military or on an oil rig. "quote" must be an EXACT excerpt from the free text.',
        '3. genericBio: true only if the bio reads like a template or generic generated text with nothing personal.',
        '',
        'Never infer or comment on religion, caste, ethnicity, race, health or sexuality. Return empty arrays when nothing applies.',
        'Output JSON: {"contradictions": [], "scamSignals": [], "genericBio": false, "summary": "one neutral sentence"}',
      ].join('\n'),
    },
    { role: 'user', content: `Profile:\n${JSON.stringify(profile, null, 2)}` },
  ];
}
