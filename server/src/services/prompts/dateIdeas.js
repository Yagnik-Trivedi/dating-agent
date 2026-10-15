// Tier fast. Web search results → 3 first-date ideas tied to what the two people share.
// Output: { ideas: [{ title, why, link }] }

export function build({ city, interests, results }) {
  return [
    {
      role: 'system',
      content: [
        `Suggest 3 relaxed, public, SFW first-date ideas in ${city} for two people who both like ${interests.join(' and ') || 'good conversation'}.`,
        'Use ONLY places or events from the search results. "title" = the place or activity, "why" = one short sentence tying',
        'it to what they share, "link" = the exact URL of the result it came from.',
        'Output JSON: {"ideas": [{"title": "...", "why": "...", "link": "https://..."}]}',
      ].join('\n'),
    },
    { role: 'user', content: results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${String(r.content ?? '').slice(0, 400)}`).join('\n\n') },
  ];
}
