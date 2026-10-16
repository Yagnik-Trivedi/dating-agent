// Tier mid, reasoning off. Reflections (plan 05 §7, ref Phase 6.5): 3–5 higher-level insights about a user from their
// own facts. Output: { insights: [{ text, supportingFactIds: [String] }] }

export function build({ facts }) {
  return [
    {
      role: 'system',
      content: [
        'You read facts a person stated about themselves and write 3 to 5 short insights that connect several facts,',
        'e.g. "plans weekends around being outdoors" from trekking, cycling and early mornings.',
        'Each insight must be supported by at least two listed facts (cite their ids) and must not add anything new.',
        'Never infer religion, caste, ethnicity, health, sexuality or income. Neutral wording, no subject, max 12 words.',
        'Output JSON: {"insights": [{"text": "...", "supportingFactIds": ["F1", "F4"]}]}',
      ].join('\n'),
    },
    { role: 'user', content: facts.map((f) => `[${f.id}] ${f.predicate}: ${f.object}`).join('\n') },
  ];
}
