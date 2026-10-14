// Onboarding question set (plan 05 §1), served at GET /api/onboarding/questions.
//
// Submitted answers shape (POST /api/onboarding/submit { answers }):
//   A: { [itemId]: 1..5 }
//   B: { [itemId]: { answer: optionValue, importance: 'nice_to_have'|'important'|'dealbreaker' } }
//   C: { [promptId]: string }
//   D: { interests: [{ name: string, intensity: 'casual'|'into_it'|'obsessed' }] }
//   E: { [sampleId]: string }

const opts = (...labels) => labels.map((label) => ({ value: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), label }));

export const QUESTIONS = {
  sections: [
    {
      id: 'A',
      title: 'Personality',
      intro: 'How accurately does each statement describe you? There are no right answers.',
      type: 'likert',
      scale: [
        { value: 1, label: 'Very inaccurate' },
        { value: 2, label: 'Inaccurate' },
        { value: 3, label: 'Neutral' },
        { value: 4, label: 'Accurate' },
        { value: 5, label: 'Very accurate' },
      ],
      // Mini-IPIP (public domain). R = reverse-scored.
      items: [
        { id: 'a1', text: 'Am the life of the party.', trait: 'extraversion', reverse: false },
        { id: 'a2', text: "Sympathize with others' feelings.", trait: 'agreeableness', reverse: false },
        { id: 'a3', text: 'Get chores done right away.', trait: 'conscientiousness', reverse: false },
        { id: 'a4', text: 'Have frequent mood swings.', trait: 'neuroticism', reverse: false },
        { id: 'a5', text: 'Have a vivid imagination.', trait: 'openness', reverse: false },
        { id: 'a6', text: "Don't talk a lot.", trait: 'extraversion', reverse: true },
        { id: 'a7', text: "Am not interested in other people's problems.", trait: 'agreeableness', reverse: true },
        { id: 'a8', text: 'Often forget to put things back in their proper place.', trait: 'conscientiousness', reverse: true },
        { id: 'a9', text: 'Am relaxed most of the time.', trait: 'neuroticism', reverse: true },
        { id: 'a10', text: 'Am not interested in abstract ideas.', trait: 'openness', reverse: true },
        { id: 'a11', text: 'Talk to a lot of different people at parties.', trait: 'extraversion', reverse: false },
        { id: 'a12', text: "Feel others' emotions.", trait: 'agreeableness', reverse: false },
        { id: 'a13', text: 'Like order.', trait: 'conscientiousness', reverse: false },
        { id: 'a14', text: 'Get upset easily.', trait: 'neuroticism', reverse: false },
        { id: 'a15', text: 'Have difficulty understanding abstract ideas.', trait: 'openness', reverse: true },
        { id: 'a16', text: 'Keep in the background.', trait: 'extraversion', reverse: true },
        { id: 'a17', text: 'Am not really interested in others.', trait: 'agreeableness', reverse: true },
        { id: 'a18', text: 'Make a mess of things.', trait: 'conscientiousness', reverse: true },
        { id: 'a19', text: 'Seldom feel blue.', trait: 'neuroticism', reverse: true },
        { id: 'a20', text: 'Do not have a good imagination.', trait: 'openness', reverse: true },
      ],
    },
    {
      id: 'B',
      title: 'Values & life goals',
      intro: 'Pick an answer, then say how much it matters to you in a partner.',
      type: 'choice_importance',
      importance: [
        { value: 'nice_to_have', label: 'Nice to have', weight: 0.3 },
        { value: 'important', label: 'Important', weight: 0.7 },
        { value: 'dealbreaker', label: 'Dealbreaker', weight: 1.0 },
      ],
      items: [
        { id: 'kids', text: 'Do you want children someday?', predicate: 'goal', options: opts('Yes', 'No', 'Open', 'Have already') },
        { id: 'religion', text: 'How important is religion or spirituality in your own life?', predicate: 'values', options: opts('Central', 'Somewhat', 'Not really') },
        { id: 'location', text: 'Where do you see yourself living in 3–5 years?', predicate: 'goal', options: opts('This city', 'Another Indian city', 'Abroad', 'Flexible') },
        { id: 'smoking', text: 'Smoking?', predicate: 'lifestyle', options: opts('Never', 'Socially', 'Regularly') },
        { id: 'drinking', text: 'Drinking?', predicate: 'lifestyle', options: opts('Never', 'Socially', 'Regularly') },
        { id: 'family', text: 'How involved should families be in your relationship decisions?', predicate: 'values', options: opts('Closely', 'Somewhat', 'Not much') },
        { id: 'career', text: 'Career ambition right now?', predicate: 'values', options: opts('Career-first', 'Balanced', 'Life-first') },
        { id: 'looking_for', text: 'What are you looking for?', predicate: 'goal', options: opts('Long-term', 'Open to long-term', 'Short-term', 'Figuring it out') },
        { id: 'diet', text: 'Diet?', predicate: 'lifestyle', options: opts('Veg', 'Non-veg', 'Vegan', 'Jain', 'Eggetarian', 'No preference') },
        { id: 'conflict', text: 'How do you handle conflict?', predicate: 'values', options: opts('Talk it out immediately', 'Need space first', 'Avoid it') },
        { id: 'alone_time', text: 'How much alone time do you need?', predicate: 'lifestyle', options: opts('Lots', 'Some', 'Little') },
      ],
    },
    {
      id: 'C',
      title: 'Your stories',
      intro: 'One to four sentences each. Your agent uses these as real anecdotes, so keep them true.',
      type: 'text',
      items: [
        { id: 'sunday', text: 'Describe a perfect Sunday.' },
        { id: 'hill', text: "A hill you'd die on (a small or silly opinion)." },
        { id: 'weirdly_good', text: "Something you're weirdly good at." },
        { id: 'laugh', text: 'The last thing that made you laugh out loud.' },
        { id: 'place', text: 'A place you want to go and why.' },
        { id: 'friends_rely', text: 'What do your close friends rely on you for?' },
      ],
    },
    {
      id: 'D',
      title: 'Interests',
      intro: 'Pick what you are into and how much. Add your own too.',
      type: 'interests',
      suggestions: [
        'music', 'trekking', 'cricket', 'cooking', 'gaming', 'reading', 'startups', 'films',
        'travel', 'fitness', 'art', 'dance', 'photography', 'football', 'board games', 'coffee',
        'stand-up comedy', 'podcasts', 'yoga', 'cycling', 'theatre', 'anime', 'gardening', 'baking',
      ],
      intensities: [
        { value: 'casual', label: 'Casual', weight: 0.3 },
        { value: 'into_it', label: 'Into it', weight: 0.6 },
        { value: 'obsessed', label: 'Obsessed', weight: 0.9 },
      ],
    },
    {
      id: 'E',
      title: 'How you text',
      intro: "Reply exactly like you would. Typos, emoji, 'haha' — all welcome. This is how your agent learns your voice.",
      type: 'style',
      items: [
        { id: 'e1', text: 'hey! your profile made me smile 😄' },
        { id: 'e2', text: "so what do you do when you're not working?" },
        { id: 'e3', text: 'pineapple on pizza — yes or no?' },
        { id: 'e4', text: "I'm thinking of trying a trek this weekend, ever done one?" },
        { id: 'e5', text: 'sorry for the late reply, crazy day' },
        { id: 'e6', text: "what's your idea of a good first date?" },
        { id: 'e7', text: 'haha you seem fun' },
        { id: 'e8', text: 'do you prefer texting or calls?' },
      ],
    },
  ],
};
