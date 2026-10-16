// Plan 05 acceptance: offline unit checks, then a live v2 build of a realistic sample user (LLM) with a planted
// contradiction, an injected failure that must leave the graph intact, and an "ask my human" answer.
//   node scripts/onboard-sample.js            offline + live (cleans up the test user)
//   node scripts/onboard-sample.js --offline  unit checks only
//   node scripts/onboard-sample.js --keep     keep the test user afterwards
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { KgEdge } from '../src/models/KgEdge.js';
import { KgFact } from '../src/models/KgFact.js';
import { Profile } from '../src/models/Profile.js';
import { User } from '../src/models/User.js';
import { VoiceProfile } from '../src/models/VoiceProfile.js';
import { VoiceSample } from '../src/models/VoiceSample.js';
import { learnFromAnswer } from '../src/routes/inbox.js';
import { answersSchema } from '../src/services/kg/answers.js';
import { buildUserGraph } from '../src/services/kg/buildUserGraph.js';
import { isVerbatim } from '../src/services/kg/extractFacts.js';
import { factKey } from '../src/services/kg/factKey.js';
import { userGraph } from '../src/services/kg/graph.js';
import { questionnaireFacts, traitScores } from '../src/services/kg/questionnaireFacts.js';
import { flushUsage } from '../src/services/llm/budget.js';

// --- sample answers (SFW, realistic). Planted contradiction: B drinking "never" vs the Sunday story's beers.
const I = { job: 'UX designer at a fintech startup', languages: ['english', 'hindi', 'marathi'] };
const A = {
  // extraversion a1,a6R,a11,a16R | agreeableness a2,a7R,a12,a17R | conscientiousness a3,a8R,a13,a18R
  // neuroticism a4,a9R,a14,a19R | openness a5,a10R,a15R,a20R
  a1: 5, a6: 2, a11: 4, a16: 1,
  a2: 4, a7: 1, a12: 5, a17: 2,
  a3: 2, a8: 4, a13: 3, a18: 3,
  a4: 2, a9: 4, a14: 1, a19: 5,
  a5: 5, a10: 1, a15: 2, a20: 1,
};
const all = (...v) => v;
const B = {
  kids: { answer: 'open', importance: 'medium' },
  religion: { answer: 'not_really', importance: 'low' },
  location: { answer: 'this_city', importance: 'medium' },
  smoking: { answer: 'never', importance: 'high', dealbreaker: true, accepts: ['never'] },
  drinking: { answer: 'never', importance: 'low' },
  family: { answer: 'somewhat', importance: 'medium' },
  career: { answer: 'balanced', importance: 'medium' },
  looking_for: { answer: 'long_term', importance: 'high', dealbreaker: true, accepts: all('long_term', 'open_to_long_term') },
  diet: { answer: 'veg', importance: 'low' },
  conflict: { answer: 'talk_it_out_immediately', importance: 'medium' },
  alone_time: { answer: 'some', importance: 'low' },
};
const C = {
  sunday: 'A sunrise trek to Sinhagad with two friends, then a long misal breakfast. Saturday nights usually end with a few beers at our usual bar.',
  hill: 'Pineapple absolutely belongs on pizza. I will also defend dal chawal as the best comfort food on earth.',
  argue: 'Remakes of old films are almost always worse than the originals. I feel very strongly about this and will argue for hours.',
  laugh: 'My grandmother tried to send a voice note and recorded four minutes of her pressure cooker whistling instead.',
  place: 'Spiti Valley, because I want to see a sky with that many stars and spend a week somewhere without network.',
};
const D = { interests: [
  { name: 'trekking', intensity: 'obsessed' }, { name: 'reading', intensity: 'into_it' }, { name: 'cooking', intensity: 'into_it' },
  { name: 'board games', intensity: 'casual' }, { name: 'photography', intensity: 'casual' },
] };
const E = {
  e1: 'haha thank you, yours made me smile too 😄',
  e2: 'mostly trekking or reading, sometimes cooking something ambitious that may or may not work haha',
  e3: 'yes!! fight me on this 🍍',
  e4: 'arre yaar Sinhagad like twice a month. which one are you thinking?',
  e5: 'no worries at all, hope the day got better',
  e6: 'something low-key, like a walk and chai somewhere quiet where we can actually talk',
  e7: 'haha I try 😄',
  e8: 'texting for sure, calls only for the important stuff',
  e9: 'WHATTT congrats!! 🎉 party kab hai?',
  e10: 'okay no. dogs are the best thing on this planet, I will not be taking questions',
  e11: 'saturday morning? there is this cafe near FC road with great filter coffee',
  e12: 'hey so sorry, something came up at work tomorrow 😕 can we do sunday instead?',
  e13: 'rude!! I am early to everything, ask anyone haha',
  e14: 'gn! sleep well 👋',
  e15: 'that sounds like a LOT, but pottery class!! you have to show me what you made. my week was calmer, mostly work and one sunrise trek',
};
const answers = { I, A, B, C, D, E };

// --- offline unit checks
const t = traitScores(A);
assert.deepEqual(t, {
  extraversion: 0.875, // (5 + (6-2) + 4 + (6-1)) / 4 = 4.5 → (4.5-1)/4
  agreeableness: 0.875, // (4 + 5 + 5 + 4) / 4 = 4.5
  conscientiousness: 0.375, // (2 + 2 + 3 + 3) / 4 = 2.5
  neuroticism: 0.125, // (2 + 2 + 1 + 1) / 4 = 1.5
  openness: 0.938, // (5 + 5 + 4 + 5) / 4 = 4.75 → 0.9375
});
assert.deepEqual(traitScores({ a1: 1, a6: 1 }), { extraversion: 0.5 }); // 1 and reverse(1)=5 → mean 3
assert.ok(answersSchema.safeParse(answers).success, 'sample answers pass the v2 schema');

const qf = questionnaireFacts(answers);
assert.equal(qf.filter((f) => f.predicate === 'trait').length, 5);
assert.ok(qf.filter((f) => f.predicate === 'trait').every((f) => f.disclosure === 'private'));
assert.equal(qf.filter((f) => f.predicate === 'dealbreaker').length, 0, 'no separate dealbreaker facts');
const smoking = qf.find((f) => f.attribute === 'smoking');
assert.deepEqual([smoking.isDealbreaker, smoking.importance, smoking.accepts, smoking.confidence], [true, 1, ['never'], 1]);
assert.equal(qf.find((f) => f.attribute === 'diet').importance, 0.3);
assert.equal(qf.find((f) => f.attribute === 'religion').disclosure, 'if_asked');
assert.equal(qf.find((f) => f.object === 'trekking').strength, 0.9);
assert.ok(qf.some((f) => f.predicate === 'background' && f.object === 'speaks marathi'));

assert.ok(isVerbatim('Pineapple  absolutely belongs', C.hill));
assert.ok(isVerbatim('pineapple absolutely BELONGS', C.hill)); // case/whitespace don't count
assert.ok(!isVerbatim('pineapple always belongs', C.hill));
assert.ok(!isVerbatim('pi', C.hill)); // too short to be evidence
console.log('✓ offline checks passed (trait reverse-scoring, v2 schema, B/D/identity mapping, verbatim quotes)');
if (process.argv.includes('--offline')) process.exit(0);

// --- live
env.LLM_DAILY_CALLS_PER_USER = Math.max(env.LLM_DAILY_CALLS_PER_USER, 5000);
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const user = await User.create({
  email: `onboard-sample-${Date.now().toString(36)}@check.test`, passwordHash: 'x', name: 'Asha',
  consentAgent: true, consentAt: new Date(), onboarding: { status: 'processing', answers },
});
await Profile.create({ userId: user._id, name: 'Asha', age: 27, city: 'Pune', gender: 'woman', interestedIn: ['man'] });
try {
  const started = Date.now();
  const result = await buildUserGraph(user._id);
  const facts = await KgFact.find({ subjectId: user._id, observerId: null }).select('+embedding').lean();
  console.log(`✓ built in ${Math.round((Date.now() - started) / 1000)} s: ${facts.length} facts, ${result.edges} edges, ${result.dropped} extracted facts dropped (unquoted/unsupported)`);
  console.log('  by predicate:', JSON.stringify(facts.reduce((m, f) => ({ ...m, [f.predicate]: (m[f.predicate] ?? 0) + 1 }), {})));

  const keys = facts.map(factKey);
  assert.equal(keys.length, new Set(keys).size, 'no duplicate factKeys');
  assert.equal(facts.filter((f) => f.predicate === 'dealbreaker').length, 0, 'no separate dealbreaker facts');
  assert.deepEqual(Object.fromEntries(facts.filter((f) => f.predicate === 'trait').map((f) => [f.object, f.value])), t);
  console.log('✓ no duplicate keys, no dealbreaker facts, traits correct');

  const stories = facts.filter((f) => f.source === 'questionnaire_story' && f.predicate !== 'story');
  const allText = Object.values(C).join('\n');
  for (const f of stories) assert.ok(isVerbatim(f.evidence[0].quote, allText), `quote not verbatim: ${f.evidence[0].quote}`);
  const edges = await KgEdge.find({ subjectId: user._id }).lean();
  const supported = (f) => edges.some((e) => e.type === 'SUPPORTS' && String(e.to.id) === String(f._id));
  assert.ok(stories.length >= 4 && stories.every(supported), 'every story-derived fact has a SUPPORTS edge');
  console.log(`✓ ${stories.length} story facts, all verbatim and all with SUPPORTS edges`);
  console.log('  sample:', stories.slice(0, 4).map((f) => `${f.predicate}${f.polarity < 0 ? '(−)' : ''} ${f.object} [${f.strength}]`).join(' | '));

  const drinking = facts.find((f) => f.attribute === 'drinking');
  const contra = edges.filter((e) => e.type === 'CONTRADICTS');
  assert.ok(contra.some((e) => [String(e.from.id), String(e.to.id)].includes(String(drinking._id))), 'planted contradiction (drinking: never vs beers) → CONTRADICTS edge');
  console.log(`✓ planted contradiction found (${contra.length} CONTRADICTS edge(s))`);

  const opinion = facts.find((f) => f.predicate === 'opinion' && /remake/i.test(f.object));
  assert.ok(opinion?.strength >= 0.8, `strong opinion keeps its strength (${opinion?.object} ${opinion?.strength})`);
  assert.ok(facts.filter((f) => f.embedding).every((f) => !f.conceptId), 'only concept-less facts carry their own vector');
  console.log(`✓ opinion strength ${opinion.strength}; ${facts.filter((f) => f.embedding).length}/${facts.length} facts embedded (concept-less only)`);

  const [samples, voice, gate, fresh] = await Promise.all([
    VoiceSample.find({ userId: user._id }).lean(), VoiceProfile.findOne({ userId: user._id }).lean(),
    Profile.findOne({ userId: user._id }).lean(), User.findById(user._id).lean(),
  ]);
  assert.equal(samples.length, 15);
  assert.ok(samples.every((s) => s.lang?.languages?.length && s.mood), 'every sample language-tagged with a mood');
  assert.ok(voice.language.mix.hi_latn > 0 && voice.language.codeSwitchRate > 0, `language mix ${JSON.stringify(voice.language)}`);
  assert.equal(voice.closingStyle, 'gn! sleep well 👋');
  assert.ok(voice.description?.length > 10);
  console.log(`✓ 15 voice samples; mix ${JSON.stringify(voice.language.mix)}, code-switch ${voice.language.codeSwitchRate}, closing "${voice.closingStyle}"`);
  assert.deepEqual(gate.gate.dealbreakers.sort(), ['looking_for', 'smoking']);
  assert.equal(fresh.onboarding.status, 'done');
  console.log('✓ Profile.gate built:', JSON.stringify(gate.gate.accepts));

  const graph = await userGraph(fresh);
  const hubs = graph.nodes.filter((n) => n.hubNode);
  assert.ok(hubs.length <= 8 && hubs.some((h) => h.id === 'hub:voice') && !graph.nodes.some((n) => n.type === 'trait'));
  assert.ok(!JSON.stringify(graph).includes('embedding'));
  console.log(`✓ hub graph: ${hubs.map((h) => h.label).join(' · ')}`);

  // Interrupted build: everything up to the commit happens, then it fails → the previous graph is untouched.
  const before = (await KgFact.find({ subjectId: user._id, observerId: null }, { _id: 1 }).lean()).map((f) => String(f._id)).sort();
  const sampleIds = samples.map((s) => String(s._id)).sort();
  await assert.rejects(buildUserGraph(user._id, { failBeforeCommit: true }), /injected failure/);
  const afterFail = (await KgFact.find({ subjectId: user._id, observerId: null }, { _id: 1 }).lean()).map((f) => String(f._id)).sort();
  assert.deepEqual(afterFail, before, 'same facts after the failed build');
  assert.deepEqual((await VoiceSample.find({ userId: user._id }, { _id: 1 }).lean()).map((s) => String(s._id)).sort(), sampleIds);
  assert.equal((await User.findById(user._id).lean()).graphVersion, fresh.graphVersion);
  console.log('✓ a build that fails before commit leaves the previous graph, samples and graphVersion intact');

  // "Ask my human" answer → user_answer facts + a voice sample.
  const learned = await learnFromAnswer({ _id: new mongoose.Types.ObjectId(), userId: user._id, question: 'Meera asked: do you have any pets?', answer: 'Yes, an indie dog called Momo who steals socks.' });
  assert.ok(learned.length >= 1 && learned.every((f) => f.source === 'user_answer' && f.confidence >= 0.9));
  assert.ok(await VoiceSample.exists({ userId: user._id, source: 'inbox' }));
  console.log(`✓ inbox answer → ${learned.length} user_answer fact(s) (${learned.map((f) => f.object).join(', ')}) + a voice sample`);
  console.log('\nOnboarding checks passed.');
} finally {
  await flushUsage();
  if (!process.argv.includes('--keep')) {
    await Promise.all([KgFact.deleteMany({ subjectId: user._id }), KgEdge.deleteMany({ subjectId: user._id }), VoiceSample.deleteMany({ userId: user._id }),
      VoiceProfile.deleteOne({ userId: user._id }), Profile.deleteOne({ userId: user._id }), User.deleteOne({ _id: user._id })]);
  }
  await mongoose.disconnect();
}
