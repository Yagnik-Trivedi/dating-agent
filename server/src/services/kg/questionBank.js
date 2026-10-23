// Plan 33 Q1 (A2–A4): the question bank. A core (today's sections in questions.js, reworded, plus an optional "say more"
// per value) and 15 modules, each written to leave the agent something true to bring up casually.
//
// A question: { id, module, type, text, topic, branch, tier, as, uses, disclosure, options?, multi?, concept?, current?,
//   trait?, alias?, incoming?/mood? (reply), subs: [{ id, type, text, topic, options?, role? }] }
// - type: tap | pick | line | story | reply | why (A2)
// - branch: where the answer goes in the brain map (A3), e.g. ['food & drink', 'chai or coffee']
// - tier: surface | personal | deep (A7), from the module unless the question says otherwise
// - as: the fact predicate an answer becomes; concept: the answer is a thing (food, place, media…) for the dictionary
// - uses: agent | judge | both. disclosure: public, or if_asked for [J] and [for you] answers (the agent never raises
//   them, it only answers if asked); private never reaches a prompt another user sees
// - current: expires after CURRENT_DAYS and is asked again (cur). trait: a Big Five score per option (trait picks)
// - an option { unsure: true } ("can't decide", "idk", "depends") is saved as real uncertainty
// - subs: follow-ups (↳), shown once the question is answered. role 'strength' sets the parent fact's strength,
//   role 'why' adds a reason linked by a WHY edge; anything else is a child fact on the parent's branch (BRANCH_OF)
// - alias: today's story id (A4's mapping); an old answer there counts toward this question

const slug = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const UNSURE = /^(can.?t decide|depends|depends on the day|idk|not sure)$/i;
/** Options from labels; "can't decide" / "depends" / "idk" style labels are marked unsure. */
const o = (...labels) => labels.map((label) => ({ value: slug(label), label, ...(UNSURE.test(label) && { unsure: true }) }));
const STRENGTH = o('A little', 'Fairly', 'Very strongly');
export const STRENGTH_OF = { a_little: 0.4, fairly: 0.65, very_strongly: 0.9 };

// sub-question shorthands
const line = (text, topic, extra = {}) => ({ type: 'line', text, topic, ...extra });
const pick = (text, topic, options, extra = {}) => ({ type: 'pick', text, topic, options, ...extra });
const tap = (text, topic, options, extra = {}) => ({ type: 'tap', text, topic, options, ...extra });
const story = (text, topic, extra = {}) => ({ type: 'story', text, topic, ...extra });
const strength = (text = 'How strongly?') => ({ type: 'tap', text, topic: 'how strongly', options: STRENGTH, role: 'strength' });
const why = (text = 'What does it give you?') => ({ type: 'line', text, topic: 'why', role: 'why' });

// [id, type, text, { topic, as, ... }, subs?]
const MODULE_DEFS = [
  {
    id: 'W', title: 'Your world right now', area: 'right now', minutes: 8, required: true, tier: 'surface',
    intro: 'Your agent’s small talk. Most of this changes, so we’ll ask again in a few weeks.',
    talksAbout: 'what you’re up to this week',
    questions: [
      ['W1', 'line', 'What’s keeping you busy this week?', { topic: 'busy with', as: 'background', current: true }, [pick('Good busy or bad busy?', 'kind of busy', o('Good busy', 'Bad busy', 'Bit of both'))]],
      ['W2', 'line', 'Something you’re looking forward to?', { topic: 'looking forward to', as: 'goal', current: true }, [line('When is it?', 'when')]],
      ['W3', 'line', 'Last thing you did just for fun?', { topic: 'last fun thing', as: 'likes', current: true }, [pick('Would you do it again?', 'again', o('Yes', 'Maybe', 'Never'))]],
      ['W4', 'line', 'What are you a little obsessed with lately? A show, a song, a food, a hobby…', { topic: 'obsessed with lately', as: 'likes', concept: 'other', current: true }, [line('How did you get into it?', 'how I got into it')]],
      ['W5', 'line', 'Something mildly annoying you right now?', { topic: 'mildly annoying', as: 'dislikes', current: true }],
      ['W6', 'line', 'Best thing you ate this week?', { topic: 'best thing I ate', as: 'likes', concept: 'food', current: true }, [line('Where?', 'where')]],
      ['W7', 'pick', 'Morning person or night owl?', { topic: 'morning or night', as: 'lifestyle', options: o('Morning person', 'Night owl', 'Depends on the day') }],
      ['W8', 'story', 'Walk me through a normal weekday, roughly.', { topic: 'a normal weekday', as: 'background', tier: 'personal', uses: 'both' }, [line('Best part of it?', 'best part')]],
      ['W9', 'line', 'What do your weekends usually look like?', { topic: 'weekends', as: 'likes', alias: 'C.sunday' }],
      ['W10', 'line', 'Song or artist on repeat right now?', { topic: 'on repeat', as: 'likes', concept: 'media', current: true }],
      ['W11', 'line', 'The last photo on your phone that isn’t a screenshot. What is it?', { topic: 'last photo', as: 'background', current: true }],
      ['W12', 'line', 'Where in your city do you end up most often?', { topic: 'where I end up', as: 'likes', concept: 'place' }, [line('What’s there?', 'what’s there')]],
    ],
  },
  {
    id: 'L', title: 'Your story', area: 'my story', minutes: 6, tier: 'deep',
    intro: 'The life-story questions. Say as much or as little as you like.',
    talksAbout: 'where you come from and what shaped you',
    questions: [
      ['L1', 'story', 'If your life so far were a book, what would the chapters be called?', { topic: 'life chapters', as: 'background', uses: 'both' }, [line('Which chapter are you in now?', 'current chapter'), line('What ended the last one?', 'what ended the last one')]],
      ['L2', 'line', 'Where did you grow up, and what was it like?', { topic: 'where I grew up', as: 'background', tier: 'personal', concept: 'place' }, [line('Something only people from there would get?', 'only locals get')]],
      ['L3', 'story', 'A moment you felt most like yourself?', { topic: 'most like myself', as: 'story', uses: 'both' }, [line('Who was there?', 'who was there')]],
      ['L4', 'story', 'A stretch that changed you. Not the worst, just one that mattered.', { topic: 'a stretch that changed me', as: 'story', uses: 'judge' }],
      ['L5', 'story', 'Something you changed your mind about?', { topic: 'changed my mind about', as: 'opinion', uses: 'both' }],
      ['L6', 'line', 'A decision you’re kind of stuck on right now?', { topic: 'stuck deciding', as: 'goal', tier: 'personal', current: true, unsure: true }],
      ['L7', 'line', 'Someone who shaped how you see things? (a role is fine)', { topic: 'who shaped me', as: 'background', uses: 'judge' }, [line('What did they teach you?', 'what they taught me')]],
      ['L8', 'line', 'Proudest small win lately?', { topic: 'small win', as: 'background', tier: 'personal', current: true }],
    ],
  },
  {
    id: 'F', title: 'Food & drink', area: 'food & drink', minutes: 4, tier: 'surface',
    intro: 'Easy ones. Food is half of all small talk.', talksAbout: 'food',
    questions: [
      ['F1', 'line', 'Food you could eat every day?', { topic: 'could eat every day', as: 'likes', concept: 'food' }],
      ['F2', 'pick', 'Street food or a nice restaurant?', { topic: 'street food or restaurant', as: 'likes', options: o('Street food', 'Nice restaurant', 'Can’t decide') }],
      ['F3', 'line', 'A food opinion people argue with you about?', { topic: 'food hot take', as: 'opinion' }, [strength()]],
      ['F4', 'line', 'Can you cook? Your one reliable dish?', { topic: 'my reliable dish', as: 'background', concept: 'food' }, [line('Who taught you?', 'who taught me')]],
      ['F5', 'tap', 'Chai or coffee?', { topic: 'chai or coffee', as: 'likes', concept: 'food', options: o('Chai', 'Coffee', 'Both', 'Neither') }, [line('How do you take it?', 'how I take it'), line('Favourite place for it?', 'favourite place', { concept: 'place' })]],
      ['F6', 'line', 'Best place to eat in your city?', { topic: 'best place to eat', as: 'likes', concept: 'place' }],
      ['F7', 'story', 'A food you’ll never eat again, and the story?', { topic: 'never again', as: 'dislikes' }],
      ['F8', 'line', 'Midnight snack of choice?', { topic: 'midnight snack', as: 'likes', concept: 'food' }],
    ],
  },
  {
    id: 'O', title: 'Outdoors, travel & places', area: 'outdoors & travel', minutes: 5, tier: 'personal',
    intro: 'Trips, places and the things you do outside.', talksAbout: 'travel and the outdoors',
    questions: [
      ['O1', 'tap', 'Mountains, beach, city, or stay home?', { topic: 'favourite kind of place', as: 'likes', concept: 'place', multi: true, tier: 'surface', options: o('Mountains', 'Beach', 'City', 'Stay home') }],
      ['O2', 'line', 'Best trip you’ve taken?', { topic: 'best trip', as: 'likes', concept: 'place', uses: 'both' }, [line('Who were you with?', 'who I was with'), story('One moment from it you still think about?', 'a moment I still think about')]],
      ['O3', 'line', 'Next place you really want to go, and why?', { topic: 'next place', as: 'goal', alias: 'C.place' }],
      ['O4', 'pick', 'Planned trip or spontaneous?', { topic: 'planned or spontaneous', as: 'lifestyle', uses: 'both', options: o('Planned', 'Spontaneous', 'Depends'), trait: { conscientiousness: { planned: 0.75, spontaneous: 0.3, depends: 0.5 } } }],
      ['O5', 'story', 'A travel disaster story?', { topic: 'travel disaster', as: 'story' }],
      ['O6', 'line', 'Something outdoors you love doing?', { topic: 'outdoors I love', as: 'likes', concept: 'activity' }, [tap('How often?', 'how often', o('Every week', 'Every month', 'A few times a year')), line('Favourite spot?', 'favourite spot', { concept: 'place' }), why()]],
      ['O7', 'line', 'A place in your city you’d take someone to show it off?', { topic: 'showing off my city', as: 'likes', concept: 'place' }],
    ],
  },
  {
    id: 'E', title: 'Films, shows, music, books, games', area: 'films, music & books', minutes: 5, tier: 'surface',
    intro: 'What you watch, hear and play.', talksAbout: 'films, music and books',
    questions: [
      ['E1', 'line', 'A film or show you’ve rewatched more than twice?', { topic: 'rewatched', as: 'likes', concept: 'media' }, [line('Why that one?', 'why that one', { role: 'why' })]],
      ['E2', 'line', 'Watching or reading anything right now?', { topic: 'watching or reading now', as: 'likes', concept: 'media', current: true }],
      ['E3', 'tap', 'Genres you go for', { topic: 'genres', as: 'likes', concept: 'media', multi: true, options: o('Thriller', 'Comedy', 'Romance', 'Horror', 'Documentary', 'Anime', 'Sci-fi', 'Drama', 'Other') }],
      ['E4', 'line', 'Music for a long drive?', { topic: 'long-drive music', as: 'likes', concept: 'media' }],
      ['E5', 'line', 'A song that takes you straight back to a memory?', { topic: 'a song with a memory', as: 'likes', concept: 'media' }, [line('What memory?', 'the memory')]],
      ['E6', 'line', 'A book, game or podcast you’d recommend to anyone?', { topic: 'I’d recommend', as: 'likes', concept: 'media' }],
      ['E7', 'line', 'Something everyone loves that you think is overrated?', { topic: 'overrated', as: 'opinion' }],
      ['E8', 'line', 'A concert or live event you’d go to again?', { topic: 'live event', as: 'likes' }],
    ],
  },
  {
    id: 'S', title: 'Friends & people', area: 'friends & people', minutes: 4, tier: 'personal',
    intro: 'Your people, and how you are with them.', talksAbout: 'your friends',
    questions: [
      ['S1', 'line', 'Describe your friend group in a few words.', { topic: 'my friend group', as: 'background' }, [line('What do you usually do together?', 'what we do together')]],
      ['S2', 'pick', 'At a party you’re usually…', { topic: 'at a party', as: 'lifestyle', uses: 'both', options: o('In the middle', 'With a few people', 'Near the food', 'Leaving early'), trait: { extraversion: { in_the_middle: 0.85, with_a_few_people: 0.5, near_the_food: 0.45, leaving_early: 0.2 } } }],
      ['S3', 'line', 'What do your friends come to you for?', { topic: 'friends come to me for', as: 'background', uses: 'both', alias: 'C.friends_rely' }],
      ['S4', 'line', 'The friend who knows you best: what would they say about you?', { topic: 'what my best friend would say', as: 'background', uses: 'both' }],
      ['S5', 'pick', 'Plans: you make them or you join them?', { topic: 'making plans', as: 'lifestyle', uses: 'judge', options: o('I make them', 'I join them', 'Depends'), trait: { extraversion: { i_make_them: 0.7, i_join_them: 0.4, depends: 0.5 } } }],
      ['S6', 'story', 'Funniest thing that happened with friends recently?', { topic: 'funny thing with friends', as: 'story', current: true }],
      ['S7', 'pick', 'After a lot of people, you recharge…', { topic: 'how I recharge', as: 'lifestyle', uses: 'judge', options: o('Alone', 'With one close person', 'With more people'), trait: { extraversion: { alone: 0.2, with_one_close_person: 0.5, with_more_people: 0.85 } } }],
    ],
  },
  {
    id: 'H', title: 'Humour & fun', area: 'humour', minutes: 4, tier: 'personal',
    intro: 'What makes you laugh.', talksAbout: 'what makes you laugh',
    questions: [
      ['H1', 'line', 'Last thing that made you laugh out loud?', { topic: 'made me laugh', as: 'humor', alias: 'C.laugh' }],
      ['H2', 'line', 'Funniest person you know, and why? (a role is fine)', { topic: 'funniest person I know', as: 'humor' }],
      ['H3', 'story', 'A story you always end up telling at parties?', { topic: 'my party story', as: 'story' }],
      ['H4', 'tap', 'Your humour', { topic: 'my humour', as: 'humor', multi: true, uses: 'both', options: o('Sarcastic', 'Silly', 'Dry', 'Dark-ish', 'Wholesome', 'Puns', 'Memes') }],
      ['H5', 'line', 'Something you’re weirdly good at?', { topic: 'weirdly good at', as: 'background', alias: 'C.weirdly_good' }],
      ['H6', 'line', 'A harmless lie you told as a kid?', { topic: 'a lie I told as a kid', as: 'story' }],
      ['H7', 'reply', 'you’re definitely the type who’s late everywhere 😏', { topic: 'taking a tease', mood: 'tease' }],
    ],
  },
  {
    id: 'T', title: 'Hot takes & opinions', area: 'opinions', minutes: 4, tier: 'surface',
    intro: 'Where your real “i think” and “idk” come from. “Can’t decide” is a fine answer.', talksAbout: 'your hot takes',
    questions: [
      ['T1', 'pick', 'Pineapple on pizza?', { topic: 'pineapple on pizza', as: 'opinion', options: o('Yes', 'No', 'Never tried', 'Don’t care') }],
      ['T2', 'line', 'A small hill you’d die on?', { topic: 'hill I’d die on', as: 'opinion', alias: 'C.hill' }, [strength()]],
      ['T3', 'line', 'Something you’ll argue about with friends?', { topic: 'I’ll argue about', as: 'opinion', alias: 'C.argue' }, [strength()]],
      ['T4', 'pick', 'Texting or calls?', { topic: 'texting or calls', as: 'opinion', options: o('Texting', 'Calls', 'Depends') }],
      ['T5', 'pick', 'Dogs or cats?', { topic: 'dogs or cats', as: 'likes', concept: 'activity', options: o('Dogs', 'Cats', 'Both', 'Neither') }],
      ['T6', 'line', 'An unpopular opinion about your city?', { topic: 'unpopular opinion about my city', as: 'opinion' }],
      ['T7', 'line', 'Something you used to hate but now like?', { topic: 'used to hate, now like', as: 'likes' }],
      ['T8', 'pick', 'Your opinions are usually…', { topic: 'how sure I usually am', as: 'style', options: o('Very sure', 'Depends', 'I change my mind a lot') }],
      ['T9', 'line', 'Something you honestly can’t decide about?', { topic: 'can’t decide about', as: 'opinion', unsure: true }],
      ['T10', 'pick', 'Astrology?', { topic: 'astrology', as: 'opinion', options: o('Into it', 'For fun', 'No', 'Idk') }],
    ],
  },
  {
    id: 'D', title: 'Daily life & little things', area: 'daily life', minutes: 4, tier: 'surface',
    intro: 'The small stuff people actually bond over.', talksAbout: 'your days',
    questions: [
      ['D1', 'line', 'First thing you do in the morning?', { topic: 'first thing in the morning', as: 'lifestyle' }],
      ['D2', 'line', 'Your comfort thing on a bad day?', { topic: 'comfort on a bad day', as: 'likes', uses: 'both', tier: 'personal' }],
      ['D3', 'line', 'Small pet peeves?', { topic: 'pet peeves', as: 'dislikes' }],
      ['D4', 'line', 'Something in your room that says a lot about you?', { topic: 'in my room', as: 'background' }],
      ['D5', 'pick', 'Messy or tidy, honestly?', { topic: 'messy or tidy', as: 'lifestyle', uses: 'both', options: o('Messy', 'Tidy', 'Somewhere in between'), trait: { conscientiousness: { messy: 0.3, tidy: 0.8, somewhere_in_between: 0.5 } } }],
      ['D6', 'line', 'The app you open way too much?', { topic: 'app I open too much', as: 'background' }],
      ['D7', 'line', 'A habit you’re trying to build?', { topic: 'habit I’m building', as: 'goal', current: true }, [line('How’s it going?', 'how it’s going')]],
      ['D8', 'pick', 'Early to everything, on time, or slightly late?', { topic: 'punctuality', as: 'lifestyle', uses: 'both', options: o('Early', 'On time', 'Slightly late'), trait: { conscientiousness: { early: 0.85, on_time: 0.65, slightly_late: 0.3 } } }],
    ],
  },
  {
    id: 'K', title: 'Work, study & ambition', area: 'work & ambition', minutes: 4, tier: 'personal',
    intro: 'What you do and where it’s going.', talksAbout: 'your work',
    questions: [
      ['K1', 'line', 'What do you actually do all day?', { topic: 'what I do all day', as: 'background' }],
      ['K2', 'line', 'Best and worst part of it?', { topic: 'best and worst part', as: 'opinion' }],
      ['K3', 'line', 'Why this path?', { topic: 'why this path', as: 'values', uses: 'both', tier: 'deep' }, [pick('Would you pick it again?', 'pick it again', o('Yes', 'Not sure', 'No'))]],
      ['K4', 'line', 'Something you’re working toward this year?', { topic: 'working toward', as: 'goal', uses: 'both' }, [why()]],
      ['K5', 'pick', 'Work talk after hours?', { topic: 'work talk after hours', as: 'opinion', options: o('Love it', 'A bit', 'Please no') }],
      ['K6', 'line', 'Dream job if money didn’t matter?', { topic: 'dream job', as: 'goal' }],
      ['K7', 'line', 'Something new you learned recently?', { topic: 'learned recently', as: 'background', current: true }],
    ],
  },
  {
    id: 'FA', title: 'Family & home', area: 'family & home', minutes: 3, tier: 'deep', disclosure: 'if_asked',
    intro: 'For your agent to understand you. It won’t bring these up; it answers only if asked.', talksAbout: 'festivals and family food (if asked)',
    questions: [
      ['FA1', 'line', 'Who’s at home?', { topic: 'who’s at home', as: 'background', uses: 'judge' }],
      ['FA2', 'line', 'Something your family does that you love?', { topic: 'family thing I love', as: 'values', uses: 'judge' }],
      ['FA3', 'line', 'A festival or family tradition you love?', { topic: 'festival I love', as: 'likes', uses: 'both', tier: 'personal', disclosure: 'public' }, [line('What happens?', 'what happens')]],
      ['FA4', 'line', 'The sibling or cousin you’re closest to? (a role is fine)', { topic: 'closest sibling or cousin', as: 'background', uses: 'judge' }],
      ['FA5', 'pick', 'How often do you talk to family?', { topic: 'talking to family', as: 'lifestyle', uses: 'judge', options: o('Daily', 'Weekly', 'Less') }],
      ['FA6', 'line', 'A family food you’d miss?', { topic: 'family food I’d miss', as: 'likes', concept: 'food', tier: 'personal', disclosure: 'public' }],
    ],
  },
  {
    id: 'V', title: 'How you handle things', area: 'how I handle things', minutes: 5, tier: 'deep', uses: 'judge',
    intro: 'Values in action. Mostly for judging a match, not small talk.', talksAbout: 'how you handle things (if it comes up)',
    questions: [
      ['V1', 'story', 'The last real disagreement with someone close. What happened?', { topic: 'last real disagreement', as: 'story', disclosure: 'if_asked' }],
      ['V2', 'line', 'When you’re stressed, what do you do?', { topic: 'when I’m stressed', as: 'lifestyle', uses: 'both' }, [line('What actually helps?', 'what helps')]],
      ['V3', 'line', 'When someone lets you down, what do you do first?', { topic: 'when someone lets me down', as: 'values', disclosure: 'if_asked' }],
      ['V4', 'story', 'A time you stood up for something, even when it was awkward?', { topic: 'stood up for something', as: 'story', disclosure: 'if_asked' }],
      ['V5', 'line', 'What does a good apology look like to you?', { topic: 'a good apology', as: 'values', disclosure: 'if_asked' }],
      ['V6', 'pick', 'Big decisions: how do you make them?', { topic: 'big decisions', as: 'lifestyle', uses: 'both', options: o('Gut', 'Pros and cons', 'Ask people'), trait: { conscientiousness: { gut: 0.4, pros_and_cons: 0.75, ask_people: 0.5 } } }],
      ['V7', 'line', 'A value you won’t bend on?', { topic: 'value I won’t bend on', as: 'values', disclosure: 'if_asked' }, [story('A time it mattered?', 'a time it mattered')]],
      ['V8', 'why', 'Your 3 strongest likes: what does each give you, and why does that matter?', { topic: 'why I love what I love', as: 'values', uses: 'both' }],
    ],
  },
  {
    id: 'R', title: 'Love & dating', area: 'love & dating', minutes: 5, tier: 'deep', uses: 'judge', disclosure: 'if_asked',
    intro: 'Only for judging a match and pacing. Your agent never brings these up.', talksAbout: 'nothing: this one is only for the judge',
    questions: [
      ['R1', 'line', 'What does a good relationship feel like day to day?', { topic: 'a good relationship', as: 'values' }],
      ['R2', 'line', 'Green flags you notice early?', { topic: 'green flags', as: 'values' }],
      ['R3', 'line', 'Something you used to put up with that you wouldn’t now?', { topic: 'won’t put up with now', as: 'values' }],
      ['R4', 'line', 'When you’re into someone, what do you start doing differently?', { topic: 'when I’m into someone', as: 'background' }],
      ['R5', 'tap', 'What makes you feel cared for?', { topic: 'feeling cared for', as: 'values', multi: true, options: o('Time', 'Words', 'Help', 'Small gifts', 'Touch', 'Not sure') }],
      ['R6', 'line', 'A moment you realised you really liked someone. What did they do?', { topic: 'when I realised I liked someone', as: 'story' }],
      ['R7', 'line', 'What would you want a match to know early?', { topic: 'want a match to know', as: 'values' }],
      ['R8', 'line', 'Anything you’d hate an AI to bring up for you?', { topic: 'never bring up', as: 'values', disclosure: 'private' }],
    ],
  },
  {
    id: 'FU', title: 'The future, as scenes', area: 'the future', minutes: 3, tier: 'deep',
    intro: 'Not plans on a form: little pictures of later.', talksAbout: 'where life is going',
    questions: [
      ['FU1', 'story', 'Picture a normal Sunday ten years from now. Who’s there?', { topic: 'a Sunday in ten years', as: 'goal', uses: 'judge', disclosure: 'if_asked' }],
      ['FU2', 'line', 'Where could you see yourself living, and where never?', { topic: 'where I’d live', as: 'goal', uses: 'both', concept: 'place' }],
      ['FU3', 'line', 'Something you want to have done by 35?', { topic: 'by 35', as: 'goal', uses: 'both' }],
      ['FU4', 'line', 'When you’re around kids, what usually happens?', { topic: 'around kids', as: 'background', uses: 'judge', disclosure: 'if_asked' }],
      ['FU5', 'pick', 'Plan the future or take it as it comes?', { topic: 'planning the future', as: 'lifestyle', uses: 'both', options: o('Plan it', 'Take it as it comes', 'Depends'), trait: { conscientiousness: { plan_it: 0.75, take_it_as_it_comes: 0.35, depends: 0.5 } } }],
    ],
  },
  {
    id: 'X', title: 'How you talk', area: 'how I talk', minutes: 6, tier: 'surface',
    intro: 'Reply exactly like you’d text: typos, “haha”, “hmm”, “idk”, any language mix. This is how your agent learns your voice.', talksAbout: 'nothing new: it learns how you say things',
    questions: [
      ['X1', 'reply', 'ugh today was so long', { topic: 'tired', mood: 'tired' }],
      ['X2', 'reply', 'I GOT INTO THE PROGRAM!!', { topic: 'excited', mood: 'excited' }],
      ['X3', 'reply', 'lol ok', { topic: 'low effort', mood: 'low_effort' }],
      ['X4', 'reply', 'my manager yelled at me today', { topic: 'venting', mood: 'venting' }],
      ['X5', 'reply', 'you’re kinda cute you know 😏', { topic: 'flirty', mood: 'flirty' }],
      ['X6', 'reply', 'sorry, super busy today', { topic: 'busy', mood: 'busy' }],
      ['X7', 'reply', 'so what’s your 5 year plan?', { topic: 'honest idk', mood: 'unsure' }],
      ['X8', 'reply', 'do you believe in astrology?', { topic: 'i think', mood: 'opinion' }],
      ['X9', 'reply', 'what’s something you’re bad at?', { topic: 'self-deprecating', mood: 'self_deprecating' }],
      ['X10', 'reply', 'ok so the weirdest thing happened on my way home', { topic: 'a story starting', mood: 'story' }],
      ['X11', 'reply', 'so do you want kids someday?', { topic: 'a big question too early', mood: 'big_question' }],
      ['X12', 'reply', 'what do you think about long distance?', { topic: 'thinking out loud', mood: 'thinking' }],
    ],
  },
];

const disclosureOf = (mod, extra) => extra.disclosure ?? ((extra.uses ?? mod.uses) === 'judge' ? 'if_asked' : mod.disclosure ?? 'public');

export const MODULES = MODULE_DEFS.map((mod) => ({
  id: mod.id, title: mod.title, area: mod.area, minutes: mod.minutes, required: Boolean(mod.required), intro: mod.intro, talksAbout: mod.talksAbout,
  questions: mod.questions.map(([id, type, text, extra, subs = []]) => {
    const branch = [mod.area, extra.topic];
    const q = {
      id, module: mod.id, type, text, ...extra,
      uses: extra.uses ?? mod.uses ?? 'agent', tier: extra.tier ?? mod.tier, branch, disclosure: disclosureOf(mod, extra),
      ...(type === 'reply' && { incoming: text }),
    };
    q.subs = subs.map((s, i) => ({ ...s, id: `${id}_${i + 1}`, branch: [...branch, s.topic] }));
    return q;
  }),
}));

export const MODULE_IDS = MODULES.map((m) => m.id);
export const moduleOf = (id) => MODULES.find((m) => m.id === id) ?? null;
/** Every question and follow-up by id (W1, W1_1…). */
export const QUESTION_BY_ID = new Map(MODULES.flatMap((m) => m.questions.flatMap((q) => [[q.id, q], ...q.subs.map((s) => [s.id, { ...s, module: m.id, parent: q.id }])])));
/** Today's story ids → the module question that replaces them (A4's mapping). */
export const ALIASES = Object.fromEntries(MODULES.flatMap((m) => m.questions.filter((q) => q.alias).map((q) => [q.alias, q.id])));

// Core values (A4 "Core"): the reworded question and an optional "say more" per section-B item. Option values stay
// exactly as before (the gate, profile basics and needToAsk depend on them). Area/tier place the answer in the brain map.
export const CORE_VALUES = {
  kids: { text: 'Kids someday?', more: 'What does that look like for you?', area: 'the future', tier: 'deep', uses: 'judge' },
  religion: { text: 'How much does religion or spirituality show up in your life?', more: 'What does that look like day to day?', area: 'family & beliefs', tier: 'deep', uses: 'judge', disclosure: 'if_asked' },
  location: { text: 'Where do you see yourself living in a few years?', more: 'What’s pulling you there?', area: 'the future', tier: 'deep', uses: 'both' },
  smoking: { text: 'Smoking?', area: 'lifestyle', tier: 'personal', uses: 'judge' },
  drinking: { text: 'Drinking?', more: 'What’s a good night out for you?', area: 'lifestyle', tier: 'personal', uses: 'both' },
  family: { text: 'How involved is your family in your big decisions?', more: 'Tell me a bit about that.', area: 'family & beliefs', tier: 'deep', uses: 'judge', disclosure: 'if_asked' },
  career: { text: 'Work right now is…', more: 'What are you working toward?', area: 'work & ambition', tier: 'deep', uses: 'both' },
  looking_for: { text: 'What are you looking for?', more: 'What would a good relationship feel like day to day?', area: 'love & dating', tier: 'deep', uses: 'judge', disclosure: 'if_asked' },
  diet: { text: 'Diet?', more: 'A food you could eat every day?', area: 'food & drink', tier: 'personal', uses: 'agent' },
  conflict: { text: 'When you disagree with someone close, you usually…', more: 'Tell me about the last time.', moreType: 'story', area: 'how I handle things', tier: 'deep', uses: 'judge', disclosure: 'if_asked' },
  alone_time: { text: 'After a busy week you need…', area: 'how I handle things', tier: 'deep', uses: 'both' },
};
