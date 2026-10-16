// Tier mid, reasoning off, temperature 0. Tags each of a user's own messages with languages + script (plan 05 §5
// step 9). Any language mix, not only Hinglish. Output: { tags: [{ i, languages, script, codeSwitch }] }
// Language codes: ISO 639-1, with "_latn" for a language written in Latin script (hi_latn = romanised Hindi).

export function build({ texts }) {
  return [
    {
      role: 'system',
      content: [
        'For each numbered chat message, list the languages it uses and its script. Use ISO 639-1 codes; add "_latn" when a',
        'language that normally uses another script is written in Latin letters (e.g. "hi_latn" for romanised Hindi like',
        '"kya scene hai", "gu_latn" for romanised Gujarati like "kem cho"). English is "en".',
        'script: "latin", "devanagari", "gujarati", "other" or "mixed" (more than one script).',
        'codeSwitch: true if the message mixes two or more languages. Loanwords everyone uses ("ok", "chai") do not count.',
        'Output JSON: {"tags": [{"i": 1, "languages": ["en", "hi_latn"], "script": "latin", "codeSwitch": true}]}',
      ].join('\n'),
    },
    { role: 'user', content: texts.map((t, i) => `${i + 1}. ${t}`).join('\n') },
  ];
}
