// A realistic test user's onboarding answers (seed-check, speed-check): answers most seed personas accept.
const B = Object.fromEntries(Object.entries({
  kids: 'yes', religion: 'somewhat', location: 'this_city', smoking: 'never', drinking: 'socially', family: 'somewhat',
  career: 'balanced', looking_for: 'long_term', diet: 'no_preference', conflict: 'talk_it_out_immediately', alone_time: 'some',
}).map(([k, answer]) => [k, { answer, importance: 'medium' }]));
const replies = ['haha thanks! yours made me smile too', 'mostly treks and trying new recipes tbh', 'no. just no 😂', 'yes! sinhagad last month, which one?',
  'no worries at all', 'a long walk and street food tbh', 'haha i try', 'texting mostly, calls are for emergencies', 'CONGRATS!! party when?',
  'okay that is a hot take but go on', 'this weekend works, saturday morning?', 'hey really sorry, something came up tomorrow, can we move it?',
  'rude. accurate, but rude', 'gn! sleep well', 'okay that week sounds wild, mine was calm, mostly work and one good trek'];
export const answers = {
  I: { job: 'backend developer', languages: ['english', 'hindi'] },
  A: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`a${i + 1}`, 3])), B,
  C: {
    sunday: 'A slow breakfast, then a trek up Sinhagad with friends and vada pav at the top.',
    hill: 'Filter coffee beats any fancy latte.',
    place: 'Spiti, for the night sky.',
    friends_rely: 'Planning trips and remembering birthdays.',
  },
  D: { interests: [{ name: 'trekking', intensity: 'into_it' }, { name: 'cooking', intensity: 'casual' }] },
  E: Object.fromEntries(replies.map((r, i) => [`e${i + 1}`, r])),
};

