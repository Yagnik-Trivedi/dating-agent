// Plan 11 Part A: generate seed personas ONCE (tier mid), review by hand, commit seed/personas.json. Never run on deploy.
// What decides verdicts is fixed here (values/goals answers, dealbreakers, interests, which tags the profile shows);
// the model only writes the voice: bio, prompts, stories, texting samples and a Big Five sketch.
//   node scripts/generate-personas.js            generate personas missing from seed/personas.json (seed01–04 are hand-written)
//   node scripts/generate-personas.js seed07     (re)generate one
import { readFileSync, writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../src/config/env.js';
import { QUESTIONS } from '../src/services/kg/questions.js';
import { TOPICS } from '../src/services/kg/questionnaireFacts.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { chatJSON } from '../src/services/llm/client.js';
import * as generatePersona from '../src/services/prompts/generatePersona.js';

const FILE = new URL('../seed/personas.json', import.meta.url);
const section = (id) => QUESTIONS.sections.find((s) => s.id === id);

// B answers: "value" = nice to have, "value+" = important, "value!" = dealbreaker. Unlisted items use BASE.
const BASE = { kids: 'open', religion: 'somewhat', location: 'this_city', smoking: 'never', drinking: 'socially', family: 'somewhat', career: 'balanced', looking_for: 'long_term+', diet: 'no_preference', conflict: 'talk_it_out_immediately', alone_time: 'some' };
const I = (list) => list.split(',').map((x) => { const [name, lvl = 'into_it'] = x.trim().split(':'); return { name, intensity: { o: 'obsessed', i: 'into_it', c: 'casual' }[lvl] ?? lvl }; });

const CAST = [
  // --- designed compatible pairs (05×06, 07×08, 09×10, 11×12, 13×14, 15×16)
  { id: 'seed05', name: 'Riya', age: 26, gender: 'woman', interestedIn: ['man'], city: 'Bengaluru', kind: 'normal',
    archetype: 'UX researcher, indie-music gig regular, cycles to work, warm and chatty.', style: 'emoji-heavy, lowercase, lots of "haha", 8-14 words',
    b: { kids: 'yes+', career: 'balanced+', smoking: 'never+', drinking: 'socially', looking_for: 'long_term!', alone_time: 'some' }, d: I('indie music:o,cycling:i,coffee:i,podcasts:c') },
  { id: 'seed06', name: 'Aditya', age: 28, gender: 'man', interestedIn: ['woman'], city: 'Bengaluru', kind: 'normal',
    archetype: 'Backend engineer who plays guitar in a small band, weekend cyclist, gentle and curious.', style: 'lowercase, a few emoji, "haha", 8-14 words',
    b: { kids: 'yes+', career: 'balanced+', smoking: 'never+', drinking: 'socially', looking_for: 'long_term+', alone_time: 'some' }, d: I('indie music:o,cycling:o,coffee:i,cooking:c') },
  { id: 'seed07', name: 'Sana', age: 31, gender: 'woman', interestedIn: ['woman'], city: 'Hyderabad', kind: 'normal',
    archetype: 'Children\'s book illustrator, potter on weekends, quiet humour, loves old-city food walks.', style: 'full sentences, sentence case, rare emoji, gentle and witty, 10-18 words',
    b: { kids: 'open+', drinking: 'never', family: 'somewhat+', career: 'life_first', looking_for: 'long_term!', alone_time: 'lots+' }, d: I('reading:o,pottery:o,food walks:i,art:i') },
  { id: 'seed08', name: 'Leela', age: 29, gender: 'woman', interestedIn: ['woman'], city: 'Hyderabad', kind: 'normal',
    archetype: 'Librarian turned bookshop owner, makes ceramics badly but happily, calm and observant.', style: 'sentence case, thoughtful, occasional 🙂, 10-18 words',
    b: { kids: 'open', drinking: 'never', family: 'somewhat+', career: 'life_first+', looking_for: 'long_term+', alone_time: 'lots' }, d: I('reading:o,pottery:i,food walks:i,gardening:c') },
  { id: 'seed09', name: 'Dev', age: 33, gender: 'man', interestedIn: ['man'], city: 'Mumbai', kind: 'normal',
    archetype: 'Film editor, marathon runner, cooks elaborate Sunday meals, dry humour, ambitious.', style: 'short, dry, sentence case, almost no emoji, 5-10 words',
    b: { kids: 'open', career: 'career_first+', conflict: 'need_space_first+', looking_for: 'long_term+', diet: 'non_veg' }, d: I('films:o,running:o,cooking:i,theatre:c') },
  { id: 'seed10', name: 'Nikhil', age: 30, gender: 'man', interestedIn: ['man'], city: 'Mumbai', kind: 'normal',
    archetype: 'Product manager at a fintech, runs the Bandra seaface every morning, film-club regular, organised and driven.', style: 'brief, lowercase, the occasional 😂, 6-12 words',
    b: { kids: 'open', career: 'career_first+', conflict: 'need_space_first', looking_for: 'long_term+', diet: 'non_veg' }, d: I('films:o,running:i,cooking:i,travel:c') },
  { id: 'seed11', name: 'Ananya', age: 24, gender: 'woman', interestedIn: ['man'], city: 'Chennai', kind: 'mild',
    kindNote: 'her tags say drinking "never", but one prompt answer mentions "a glass of wine with friends on Fridays"',
    archetype: 'Junior data analyst, trained in Carnatic vocals, loves filter coffee and beach walks, family-oriented.', style: 'polite, sentence case, a 🙂 now and then, 8-14 words',
    b: { kids: 'yes+', family: 'closely+', diet: 'veg', drinking: 'never', looking_for: 'long_term+', religion: 'somewhat' }, d: I('carnatic music:o,coffee:i,beach walks:i,coding:c') },
  { id: 'seed12', name: 'Karthik', age: 26, gender: 'man', interestedIn: ['woman'], city: 'Chennai', kind: 'normal',
    archetype: 'Software engineer who plays mridangam, morning beach walks with his dad, earnest and kind.', style: 'sentence case, earnest, few emoji, 8-15 words',
    b: { kids: 'yes+', family: 'closely+', diet: 'veg', drinking: 'never+', looking_for: 'long_term+', religion: 'somewhat', career: 'balanced' }, d: I('carnatic music:o,coffee:i,beach walks:i,cricket:c') },
  { id: 'seed13', name: 'Pooja', age: 30, gender: 'woman', interestedIn: ['man'], city: 'Delhi', kind: 'normal',
    archetype: 'Consultant who travels for work, does CrossFit, loves stand-up comedy nights, loud and funny.', style: 'Hinglish mix (yaar, arre), exclamation marks, 😂, 8-14 words',
    b: { kids: 'yes+', career: 'career_first+', drinking: 'socially', smoking: 'never', looking_for: 'long_term+', alone_time: 'little' }, d: I('fitness:o,travel:i,stand-up comedy:o,food:c') },
  { id: 'seed14', name: 'Rohit', age: 32, gender: 'man', interestedIn: ['woman'], city: 'Delhi', kind: 'mild',
    kindNote: 'his tags say workout "rarely", but a prompt answer says he runs 10k every Sunday',
    archetype: 'Startup founder (logistics), weekend runner, does open-mic comedy badly, high energy.', style: 'Hinglish mix (yaar, bhai), 😂, punchy, 6-12 words',
    workoutTag: 'rarely',
    b: { kids: 'yes+', career: 'career_first+', drinking: 'socially', smoking: 'never', looking_for: 'long_term+', alone_time: 'little' }, d: I('fitness:i,travel:i,stand-up comedy:o,startups:o') },
  { id: 'seed15', name: 'Hetal', age: 27, gender: 'woman', interestedIn: ['man'], city: 'Ahmedabad', kind: 'mild',
    kindNote: 'her interests include "gaming", but a prompt answer says "I have never played a video game in my life"',
    archetype: 'Runs a small snack-brand startup, garba every Navratri, food explorer, family-first and practical.', style: 'cheerful, sentence case, 😊, some Gujarati-English words, 8-14 words',
    b: { kids: 'yes+', family: 'closely+', diet: 'veg+', drinking: 'never', looking_for: 'long_term+', career: 'career_first' }, d: I('food:o,dance:i,startups:o,gaming:c') },
  { id: 'seed16', name: 'Parth', age: 29, gender: 'man', interestedIn: ['woman'], city: 'Ahmedabad', kind: 'normal',
    archetype: 'Chartered accountant who quit to build a D2C food brand, garba enthusiast, steady and warm.', style: 'sentence case, friendly, 😊, 8-14 words',
    b: { kids: 'yes+', family: 'closely+', diet: 'veg', drinking: 'never', looking_for: 'long_term+', career: 'career_first+' }, d: I('food:o,dance:i,startups:o,cricket:i') },

  // --- dealbreakers that only surface in conversation (the other side's tags hide the conflicting answer)
  { id: 'seed17', name: 'Nisha', age: 28, gender: 'woman', interestedIn: ['man'], city: 'Pune', kind: 'normal',
    archetype: 'Paediatric physiotherapist, loves kids and big family Sundays, birdwatching on weekends.', style: 'warm, lowercase, 😊, 8-14 words',
    b: { kids: 'yes!', family: 'closely+', looking_for: 'long_term+' }, d: I('birdwatching:o,trekking:i,baking:i') },
  { id: 'seed18', name: 'Varun', age: 30, gender: 'man', interestedIn: ['woman'], city: 'Pune', kind: 'normal', hideTags: ['wantsKids'],
    archetype: 'Wildlife photographer, birdwatcher, quietly sure he does not want children (wants a life of travel and fieldwork).', style: 'calm, sentence case, few emoji, 8-14 words',
    b: { kids: 'no+', family: 'somewhat', looking_for: 'long_term+' }, d: I('birdwatching:o,photography:o,trekking:i') },
  { id: 'seed19', name: 'Tara', age: 25, gender: 'woman', interestedIn: ['man'], city: 'Bengaluru', kind: 'normal',
    archetype: 'Asthmatic marathon trainee and plant-parent, can\'t be around smoke at all, bright and direct.', style: 'lowercase, emoji, direct, 6-12 words',
    b: { smoking: 'never!', drinking: 'socially', looking_for: 'long_term+' }, d: I('running:o,gardening:i,indie music:i') },
  { id: 'seed20', name: 'Sameer', age: 27, gender: 'man', interestedIn: ['woman'], city: 'Bengaluru', kind: 'normal', hideTags: ['smoking'],
    archetype: 'Sound engineer, gig-goer, smokes regularly (has tried to quit, says so honestly when asked), funny.', style: 'lowercase, slangy, 😅, 6-12 words',
    b: { smoking: 'regularly', drinking: 'socially', looking_for: 'long_term' }, d: I('indie music:o,gardening:c,running:c') },
  { id: 'seed21', name: 'Meghna', age: 32, gender: 'woman', interestedIn: ['man'], city: 'Mumbai', kind: 'normal',
    archetype: 'Architect, done with casual dating, wants marriage-track long-term, sails at the Gateway on weekends.', style: 'crisp sentence case, few emoji, 8-14 words',
    b: { looking_for: 'long_term!', kids: 'open', career: 'balanced+' }, d: I('sailing:o,architecture:o,films:i') },
  { id: 'seed22', name: 'Kunal', age: 29, gender: 'man', interestedIn: ['woman'], city: 'Mumbai', kind: 'normal', hideTags: ['relationshipGoal'],
    archetype: 'Travel-content creator, always on the move, honest that he wants something short-term and fun right now.', style: 'lowercase, 🌍, energetic, 6-12 words',
    b: { looking_for: 'short_term+', kids: 'open', career: 'career_first' }, d: I('sailing:i,travel:o,films:i') },
  { id: 'seed23', name: 'Aisha', age: 29, gender: 'woman', interestedIn: ['man'], city: 'Hyderabad', kind: 'normal',
    archetype: 'Doctor with her own clinic in Hyderabad, will never leave the city (parents, practice), loves badminton.', style: 'sentence case, warm, 🙂, 8-14 words',
    b: { location: 'this_city!', family: 'closely+', looking_for: 'long_term+' }, d: I('badminton:o,food walks:i,films:i') },
  { id: 'seed24', name: 'Vikram', age: 31, gender: 'man', interestedIn: ['woman'], city: 'Hyderabad', kind: 'normal',
    archetype: 'Aerospace engineer moving to Germany next year for a job he is excited about, badminton league player.', style: 'sentence case, friendly, 🙂, 8-14 words',
    b: { location: 'abroad+', family: 'somewhat', looking_for: 'long_term+' }, d: I('badminton:o,food walks:i,travel:i') },
  { id: 'seed25', name: 'Gauri', age: 26, gender: 'woman', interestedIn: ['man'], city: 'Delhi', kind: 'normal',
    archetype: 'Kathak dancer and school teacher, has never drunk alcohol and wants a partner who doesn\'t either.', style: 'graceful sentence case, 🌸, 8-14 words',
    b: { drinking: 'never!', smoking: 'never+', looking_for: 'long_term+' }, d: I('dance:o,theatre:i,coffee:i') },
  { id: 'seed26', name: 'Arnav', age: 28, gender: 'man', interestedIn: ['woman'], city: 'Delhi', kind: 'normal', hideTags: ['drinking'],
    archetype: 'Craft-beer brewer and theatre actor, drinks regularly (it is literally his job), charming.', style: 'playful sentence case, 🍻, 8-14 words',
    b: { drinking: 'regularly', smoking: 'never', looking_for: 'long_term' }, d: I('theatre:o,craft beer:o,coffee:c') },

  // --- fakes, thin profile, and a lifestyle-mismatch persona
  { id: 'seed27', name: 'Elena', age: 30, gender: 'woman', interestedIn: ['woman'], city: 'Mumbai', kind: 'fake', noPhotos: true,
    archetype: 'Claims to be a Mumbai-born offshore engineer working in Dubai who made money in crypto.', style: 'over-friendly, generic, "dear", 10-20 words',
    b: {}, d: I('travel:i,reading:c') },
  { id: 'seed28', name: 'Daniel', age: 34, gender: 'man', interestedIn: ['woman'], city: 'Delhi', kind: 'fake', noPhotos: true,
    archetype: 'Claims to be an army doctor on a UN mission abroad with a forex investment side business.', style: 'formal, "dear", long sentences',
    b: {}, d: I('fitness:i,travel:c') },
  { id: 'seed29', name: 'Ira', age: 24, gender: 'woman', interestedIn: ['man'], city: 'Ahmedabad', kind: 'thin',
    archetype: 'Just installed the app, low effort.', style: 'one or two words, lowercase', b: { looking_for: 'figuring_it_out' }, d: I('music:c') },
  { id: 'seed30', name: 'Zoya', age: 27, gender: 'woman', interestedIn: ['man'], city: 'Mumbai', kind: 'normal',
    archetype: 'Events manager who loves nightlife and clubbing, career-first, wants to move abroad someday, avoids conflict, not looking for anything serious yet.', style: 'lowercase, lots of emoji, party energy, 6-12 words',
    b: { kids: 'no', career: 'career_first+', drinking: 'regularly', smoking: 'socially', family: 'not_much', looking_for: 'figuring_it_out', conflict: 'avoid_it', alone_time: 'little', location: 'abroad', diet: 'non_veg' }, d: I('dance:o,travel:i,fashion:i') },
];

function bAnswers(spec) {
  const all = { ...BASE, ...spec };
  return Object.fromEntries(Object.entries(all).map(([id, v]) => {
    const importance = v.endsWith('!') ? 'dealbreaker' : v.endsWith('+') ? 'important' : 'nice_to_have';
    const answer = v.replace(/[!+]$/, '');
    if (!label(id, answer)) throw new Error(`B.${id}: "${answer}" is not an option`);
    return [id, { answer, importance }];
  }));
}
const label = (id, value) => section('B').items.find((i) => i.id === id).options.find((o) => o.value === value)?.label;

// Big Five level → Mini-IPIP answers (reverse items mirrored).
const SCORE = { high: [5, 4], mid: [3, 3], low: [1, 2] };
function aAnswers(personality) {
  return Object.fromEntries(section('A').items.map((item, i) => {
    const s = SCORE[personality[item.trait] ?? 'mid'][i % 2];
    return [item.id, item.reverse ? 6 - s : s];
  }));
}

const level = z.enum(['low', 'mid', 'high']).catch('mid');
const schema = z.object({
  bio: z.string().trim().min(1).max(260),
  prompts: z.array(z.object({ q: z.string().trim().min(1).max(150), a: z.string().trim().min(1).max(300) })).min(1).max(2),
  stories: z.record(z.string(), z.string().max(600)),
  samples: z.record(z.string(), z.string().max(300)),
  personality: z.object({ extraversion: level, agreeableness: level, conscientiousness: level, neuroticism: level, openness: level }),
});

async function generate(c) {
  const B = bAnswers(c.b);
  const facts = [
    ...Object.entries(B).map(([id, a]) => `${TOPICS[id] ?? id}: ${label(id, a.answer)} (${a.importance.replace('_', ' ')})`),
    `interests: ${c.d.map((x) => `${x.name} (${x.intensity.replace('_', ' ')})`).join(', ')}`,
  ];
  const out = await chatJSON({
    tier: 'mid', reasoning: false, temperature: 0.9, schema, purpose: 'generate-persona',
    messages: generatePersona.build({ persona: c, facts, storyQuestions: section('C').items, sampleQuestions: section('E').items, kind: c.kind, kindNote: c.kindNote }),
  });
  const tags = {
    interests: c.d.map((x) => x.name),
    lifestyle: { smoking: label('smoking', B.smoking.answer).toLowerCase(), drinking: label('drinking', B.drinking.answer).toLowerCase(), workout: c.workoutTag ?? 'sometimes', diet: label('diet', B.diet.answer).toLowerCase() },
    wantsKids: label('kids', B.kids.answer).toLowerCase(),
    relationshipGoal: label('looking_for', B.looking_for.answer).toLowerCase(),
    religionImportance: label('religion', B.religion.answer).toLowerCase(),
  };
  // Hidden tags: the conflicting answer exists in their graph (their agent can say it) but not on their profile.
  for (const t of c.hideTags ?? []) {
    if (t in tags.lifestyle) delete tags.lifestyle[t];
    else delete tags[t];
  }
  const dealbreakers = Object.entries(B).filter(([, a]) => a.importance === 'dealbreaker').map(([id]) => TOPICS[id] ?? id);
  return {
    email: `${c.id}@demo.local`,
    agentMode: 'auto',
    isSeed: true,
    designNotes: `${c.kind}: ${c.archetype}${c.kindNote ? ` Inconsistency: ${c.kindNote}.` : ''}${c.hideTags ? ` Hidden tags: ${c.hideTags.join(', ')}.` : ''}`,
    profile: {
      name: c.name, age: c.age, city: c.city, gender: c.gender, interestedIn: c.interestedIn,
      photos: c.noPhotos ? [] : [`https://api.dicebear.com/9.x/notionists/svg?seed=${c.name}`],
      bio: out.bio, prompts: out.prompts, tags, dealbreakers,
    },
    answers: {
      A: aAnswers(out.personality),
      B,
      C: Object.fromEntries(section('C').items.map((q) => [q.id, out.stories[q.id] ?? ''])),
      D: { interests: c.d },
      E: Object.fromEntries(section('E').items.map((q) => [q.id, out.samples[q.id] ?? ''])),
    },
  };
}

for (const c of CAST) bAnswers(c.b); // fail fast on a typo before spending any tokens
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 }); // usage log
const only = process.argv[2];
const personas = JSON.parse(readFileSync(FILE));
const todo = CAST.filter((c) => (only ? c.id === only : !personas.some((p) => p.email === `${c.id}@demo.local`)));
console.log(`generating ${todo.length} persona(s)…`);
for (const c of todo) {
  const p = await generate(c);
  const i = personas.findIndex((x) => x.email === p.email);
  if (i >= 0) personas[i] = p; else personas.push(p);
  personas.sort((a, b) => a.email.localeCompare(b.email));
  writeFileSync(FILE, `${JSON.stringify(personas, null, 2)}\n`); // after each one, so a failure keeps the rest
  console.log(`✓ ${c.id} ${c.name} (${c.kind})`);
}
await flushUsage();
await mongoose.disconnect();
