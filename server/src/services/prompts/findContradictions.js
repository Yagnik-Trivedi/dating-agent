// Tier mid, reasoning off, temperature 0. One batched call per build (plan 05 §5 step 6): do the user's own stories
// contradict their section-B lifestyle answers? Output: { contradictions: [{ attribute, fact, why }] }

export function build({ answers, facts }) {
  return [
    {
      role: 'system',
      content: [
        'A person answered lifestyle questions and also wrote short stories about themselves. Find clear contradictions',
        'between an answer and a story fact (e.g. answer "drinking: never" vs story "best nights end with a few beers").',
        'Meanings: drinking = alcohol (coffee, tea and juice are NOT drinking); smoking = cigarettes or other smoking;',
        'diet = what they eat (e.g. "veg" vs a story about eating chicken).',
        'Flag a pair only when the story fact makes the answer false. Ignore anything loosely related or that could easily',
        'both be true. Return [] when there is none (most people have none).',
        'Output JSON: {"contradictions": [{"attribute": "<answer key, e.g. drinking>", "fact": <story fact number>, "why": "short"}]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Answers:\n${answers.map((a) => `- ${a.attribute}: ${a.label}`).join('\n')}\n\nStory facts:\n${facts.map((f, i) => `${i + 1}. ${f.predicate}: ${f.object} ("${f.quote}")`).join('\n')}`,
    },
  ];
}
