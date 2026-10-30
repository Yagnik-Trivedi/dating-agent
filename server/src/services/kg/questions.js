// Onboarding question set (plan 05 §1), served at GET /api/onboarding/questions.
//
// Submitted answers shape (POST /api/onboarding/submit { answers }):
//   I: { job?: string, languages: [string], family?: string }
//   A: { [itemId]: 1..5 }
//   B: { [itemId]: { answer: optionValue, importance: 'low'|'medium'|'high' (required, no default),
//                    accepts: [optionValue] (default: all), dealbreaker: boolean (needs >= 1 option not accepted) } }
//   C: { [promptId]: string }  (at least MIN_STORIES answered)
//   D: { interests: [{ name: string, intensity: 'casual'|'into_it'|'obsessed' }] }
//   E: { [sampleId]: string }  (VOICE_SAMPLES_ONBOARDING prompts across moods)

//   B[itemId].more?: string (plan 33: the optional "say more" line under a value)
//   M: { [moduleId]: { [questionId]: answer } } (plan 33 modules, questionBank.js; saved per module)
import { CORE_VALUES } from './questionBank.js';

export { ALIASES, CORE_VALUES, MODULE_IDS, MODULES, moduleOf, QUESTION_BY_ID, STRENGTH_OF } from './questionBank.js';

const opts = (...labels) => labels.map((label) => ({ value: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), label }));
// Plan 33 A4: the core values reworded casually, each with an optional "say more". Option values never change.
const core = (item) => ({ ...item, text: CORE_VALUES[item.id]?.text ?? item.text, oldText: item.text, ...(CORE_VALUES[item.id]?.more && { more: { text: CORE_VALUES[item.id].more, type: CORE_VALUES[item.id].moreType ?? 'line' } }) });

export const QUESTIONS = {
  sections: [
    {
      id: 'I',
      title: 'About you',
      intro: 'A few basics your agent can mention. You can hide any of them later.',
      type: 'identity',
      items: [
        { id: 'job', text: 'What do you do (work or studies)?', kind: 'text', placeholder: 'e.g. UX designer at a fintech startup' },
        { id: 'languages', text: 'Which languages do you speak?', kind: 'multi', options: opts('English', 'Hindi', 'Gujarati', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Punjabi', 'Malayalam'), allowOther: true },
        { id: 'family', text: 'Family setup (optional)', kind: 'text', optional: true, placeholder: 'e.g. live with my parents and younger brother' },
      ],
    },
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
        // Not Mini-IPIP (owner, 2026-10-30): how much my agent may flirt, a 0..1 trait fact the reply prompt reads.
        { id: 'a21', text: 'Want my agent to flirt with my matches.', trait: 'flirtiness', reverse: false },
      ],
    },
    {
      id: 'B',
      title: 'Values & life goals',
      intro: 'Pick your answer, say how much it matters, and what you would accept in a partner. Mark a dealbreaker only if it truly is one.',
      type: 'choice_importance',
      // No default: every item needs an explicit importance (F7). A dealbreaker sets importance 1.0.
      importance: [
        { value: 'low', label: 'Nice to have', weight: 0.3 },
        { value: 'medium', label: 'Important', weight: 0.6 },
        { value: 'high', label: 'Very important', weight: 0.9 },
      ],
      accepts: { label: "In a partner I'd accept" }, // multi-select over the item's options, default all
      dealbreaker: { label: 'Dealbreaker', weight: 1.0 },
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
      ].map(core),
    },
    {
      id: 'C',
      title: 'Your stories',
      intro: 'Answer at least 4, one to four sentences each. Your agent uses these as real anecdotes, so keep them true.',
      type: 'text',
      minAnswers: 4, // KG.MIN_STORIES
      items: [
        { id: 'sunday', text: 'Describe a perfect Sunday.', placeholder: 'e.g. Slow breakfast, a long walk by the lake, then cooking something new with my sister.' },
        { id: 'hill', text: "A hill you'd die on (a small or silly opinion).", placeholder: 'e.g. Filter coffee beats any fancy cafe latte, and I will argue about it.' },
        { id: 'argue', text: "Something you'll argue about with friends, and how strongly you feel about it.", placeholder: 'e.g. Remakes of old films are almost always worse. Very strongly, ask anyone.', strength: true },
        { id: 'weirdly_good', text: "Something you're weirdly good at.", placeholder: 'e.g. Guessing the ending of any thriller in the first ten minutes.' },
        { id: 'laugh', text: 'The last thing that made you laugh out loud.', placeholder: 'e.g. My dad trying to send a voice note and recording his pocket for two minutes.' },
        { id: 'place', text: 'A place you want to go and why.', placeholder: 'e.g. Spiti, because I want to see a sky with no city lights at all.' },
        { id: 'friends_rely', text: 'What do your close friends rely on you for?', placeholder: 'e.g. Honest advice, and remembering everyone\u2019s birthdays.' },
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
      intro: "Reply exactly like you would, in whatever languages you mix. Typos, emoji, 'haha' — all welcome. This is how your agent learns your voice.",
      type: 'style',
      items: [
        { id: 'e1', text: 'hey! your profile made me smile 😄', mood: 'greeting' },
        { id: 'e2', text: "so what do you do when you're not working?", mood: 'curious' },
        { id: 'e3', text: 'pineapple on pizza — yes or no?', mood: 'opinion' },
        { id: 'e4', text: "I'm thinking of trying a trek this weekend, ever done one?", mood: 'casual' },
        { id: 'e5', text: 'sorry for the late reply, crazy day', mood: 'apologetic' },
        { id: 'e6', text: "what's your idea of a good first date?", mood: 'plan' },
        { id: 'e7', text: 'haha you seem fun', mood: 'tease' },
        { id: 'e8', text: 'do you prefer texting or calls?', mood: 'casual' },
        { id: 'e9', text: 'I GOT THE JOB!! 🎉', mood: 'excited' },
        { id: 'e10', text: 'honestly I think dogs are overrated', mood: 'disagree' },
        { id: 'e11', text: 'we should grab coffee sometime, when are you free?', mood: 'plan' },
        { id: 'e12', text: '(you have to cancel plans you made with them for tomorrow: write that message)', mood: 'apologetic', prompt: true },
        { id: 'e13', text: "you're definitely the type who's late everywhere 😏", mood: 'tease' },
        { id: 'e14', text: 'anyway I should sleep, early day tomorrow', mood: 'closing' },
        { id: 'e15', text: "ok long story but my week has been insane. work had this huge launch, my flatmate moved out without telling anyone, and I finally started that pottery class I keep talking about. the teacher says I'm a natural which I don't believe at all. how's yours been?", mood: 'long_reply' },
      ],
    },
  ],
};
