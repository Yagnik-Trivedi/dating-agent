// Tier mid, reasoning off. Tie-break for concept resolution (plan 05 §3): is this phrase the same thing as one of the
// candidate concepts? Output: { same: boolean, conceptId: string | null }

export function build({ text, type, candidates }) {
  return [
    {
      role: 'system',
      content: [
        'You normalise short phrases from dating-profile answers into a shared vocabulary.',
        'Decide whether the phrase means the SAME thing as one of the candidates (synonym, plural, spelling variant, or a',
        'common name for it). A broader, narrower or merely related thing is NOT the same ("hiking" = "trekking", but',
        '"mountaineering" ≠ "trekking"; "films" = "movies", but "film editing" ≠ "films").',
        'Output JSON: {"same": true|false, "conceptId": "<id of the matching candidate>" or null}.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Phrase: "${text}" (type: ${type ?? 'unknown'})\nCandidates:\n${candidates.map((c) => `- id ${c.id}: "${c.label}" (aliases: ${c.aliases.join(', ') || 'none'})`).join('\n')}`,
    },
  ];
}
