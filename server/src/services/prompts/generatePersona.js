// Tier mid (offline, scripts/generate-personas.js only). Writes the VOICE of a seed persona whose values, interests and
// dealbreakers are already fixed in code: bio, prompts, onboarding stories, texting samples and a personality sketch.
// Output: { bio, prompts: [{ q, a }], stories: { [storyId]: text }, samples: { [sampleId]: text },
//           personality: { extraversion|agreeableness|conscientiousness|neuroticism|openness: "low"|"mid"|"high" } }

export function build({ persona, facts, storyQuestions, sampleQuestions, kind, kindNote }) {
  const kinds = {
    normal: 'A real, specific, likeable person. Concrete details (places, foods, small habits), no clichés.',
    mild: `A real, likeable person, BUT include exactly this inconsistency in a prompt answer: ${kindNote}. Nothing else contradicts their facts.`,
    thin: 'A low-effort profile: bio of 4-8 words, ONE prompt with a 3-6 word answer, stories of 1 short sentence each (2 of them empty strings), samples of 1-4 words.',
    fake: 'A romance-scam profile for testing a fake-profile detector. Bio and prompts claim to be working abroad, talk about an investment or crypto opportunity that "changed my life", and push to continue on Telegram or WhatsApp. Stories are vague and generic. Keep it SFW and not explicit.',
  };
  return [
    {
      role: 'system',
      content: [
        'You write seed personas for a dating-app demo (India, SFW, fictional people; never real or famous people).',
        kinds[kind],
        '',
        'Write in the persona\'s own voice. Keep EVERYTHING consistent with the fixed facts below (except the one requested inconsistency, if any).',
        'Never mention religion, caste or ethnicity unless a fixed fact states it. No surnames, no contact details (except for the scam profile\'s app push).',
        '- "bio": 1-2 sentences (max 200 chars).',
        '- "prompts": exactly 2 { q, a } (q from: "A perfect Sunday", "I\'ll fall for you if", "My most controversial opinion", "I geek out on", "My friends call me", "Two truths and a lie"); a max 150 chars.',
        '- "stories": answer each story question in 1-3 first-person sentences with concrete details.',
        '- "samples": reply to each message exactly as this person texts (their casing, emoji, slang, length per the style note).',
        '- "personality": low/mid/high for each Big Five trait, matching the archetype.',
        'Output JSON: {"bio": "...", "prompts": [{"q": "...", "a": "..."}], "stories": {"sunday": "..."}, "samples": {"e1": "..."}, "personality": {"extraversion": "mid", "agreeableness": "high", "conscientiousness": "mid", "neuroticism": "low", "openness": "high"}}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Persona: ${persona.name}, ${persona.age}, ${persona.gender}, ${persona.city}. ${persona.archetype}`,
        `Texting style: ${persona.style}`,
        `Fixed facts:\n${facts.join('\n')}`,
        `Story questions:\n${storyQuestions.map((q) => `${q.id}: ${q.text}`).join('\n')}`,
        `Messages to reply to (samples):\n${sampleQuestions.map((q) => `${q.id}: ${q.text}`).join('\n')}`,
      ].join('\n\n'),
    },
  ];
}
