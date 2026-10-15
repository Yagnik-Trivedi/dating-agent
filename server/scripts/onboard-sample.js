// Plan 05 check: offline unit checks (trait math, style metrics, quote verification, B/D mapping), then a live run
// that builds a realistic sample user's knowledge graph via the LLM and verifies it.
//   node scripts/onboard-sample.js            offline + live (cleans up the test user)
//   node scripts/onboard-sample.js --offline  unit checks only
//   node scripts/onboard-sample.js --keep     keep the test user afterwards
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { KgFact } from '../src/models/KgFact.js';
import { User } from '../src/models/User.js';
import { learnFromAnswer } from '../src/routes/inbox.js';
import { buildUserGraph } from '../src/services/kg/buildUserGraph.js';
import { isVerbatim } from '../src/services/kg/extractFacts.js';
import { userGraph } from '../src/services/kg/graph.js';
import { questionnaireFacts, traitScores } from '../src/services/kg/questionnaireFacts.js';
import { styleMetrics } from '../src/services/kg/styleProfile.js';
import { flushUsage } from '../src/services/llm/budget.js';

// --- sample answers (SFW, realistic)
const A = {
  // extraversion a1,a6R,a11,a16R | agreeableness a2,a7R,a12,a17R | conscientiousness a3,a8R,a13,a18R
  // neuroticism a4,a9R,a14,a19R | openness a5,a10R,a15R,a20R
  a1: 5, a6: 2, a11: 4, a16: 1,
  a2: 4, a7: 1, a12: 5, a17: 2,
  a3: 2, a8: 4, a13: 3, a18: 3,
  a4: 2, a9: 4, a14: 1, a19: 5,
  a5: 5, a10: 1, a15: 2, a20: 1,
};
const B = {
  kids: { answer: 'open', importance: 'important' },
  religion: { answer: 'not_really', importance: 'nice_to_have' },
  location: { answer: 'this_city', importance: 'important' },
  smoking: { answer: 'never', importance: 'dealbreaker' },
  drinking: { answer: 'socially', importance: 'nice_to_have' },
  family: { answer: 'somewhat', importance: 'important' },
  career: { answer: 'balanced', importance: 'important' },
  looking_for: { answer: 'long_term', importance: 'dealbreaker' },
  diet: { answer: 'veg', importance: 'nice_to_have' },
  conflict: { answer: 'talk_it_out_immediately', importance: 'important' },
  alone_time: { answer: 'some', importance: 'nice_to_have' },
};
const C = {
  sunday: 'A sunrise trek to Sinhagad with two friends, then a long misal breakfast. Afternoon nap, and I end the day reading on the balcony with filter coffee.',
  hill: 'Pineapple absolutely belongs on pizza. I will also defend dal chawal as the best comfort food on earth.',
  weirdly_good: 'I can parallel park a car in one go on the first try, and I can guess the exact time without looking at a clock.',
  laugh: 'My grandmother tried to send a voice note and recorded four minutes of her pressure cooker whistling instead.',
  place: 'Spiti Valley, because I want to see a sky with that many stars and spend a week somewhere without network.',
  friends_rely: 'Planning trips nobody else wants to plan, and being the calm one when things go wrong.',
};
const D = { interests: [
  { name: 'trekking', intensity: 'obsessed' }, { name: 'reading', intensity: 'into_it' }, { name: 'cooking', intensity: 'into_it' },
  { name: 'board games', intensity: 'casual' }, { name: 'photography', intensity: 'casual' },
] };
const E = {
  e1: 'haha thank you, yours made me smile too 😄',
  e2: 'mostly trekking or reading, sometimes cooking something ambitious that may or may not work haha',
  e3: 'yes!! fight me on this 🍍',
  e4: 'omg yes, Sinhagad like twice a month. which one are you thinking?',
  e5: 'no worries at all, hope the day got better',
  e6: 'something low-key, like a walk and chai somewhere quiet where we can actually talk',
  e7: 'haha I try 😄',
  e8: 'texting for sure, calls only for the important stuff',
};
const answers = { A, B, C, D, E };

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
assert.deepEqual(traitScores({ a1: 9 }), {}); // out-of-range answers ignored

const qf = questionnaireFacts(answers);
assert.equal(qf.filter((f) => f.predicate === 'trait').length, 5);
assert.ok(qf.filter((f) => f.predicate === 'trait').every((f) => f.disclosure === 'private'));
const db = qf.filter((f) => f.predicate === 'dealbreaker');
assert.deepEqual(db.map((f) => f.object), ['partner must be compatible on smoking (mine: never)', 'partner must be compatible on looking for (mine: long-term)']);
assert.ok(db.every((f) => f.disclosure === 'if_asked' && f.weight === 1));
assert.equal(qf.find((f) => f.object === 'smoking: never').weight, 1);
assert.equal(qf.find((f) => f.object === 'diet: veg').weight, 0.3);
assert.equal(qf.find((f) => f.object.startsWith('religion in own life')).disclosure, 'if_asked');
assert.equal(qf.find((f) => f.object === 'trekking').weight, 0.9);

const m = styleMetrics(['haha yes 😄', 'Sure.', 'what about you?', 'lol ok yaar']);
assert.equal(m.messages, 4);
assert.equal(m.medianWords, 2.5);
assert.equal(m.emojiPerMessage, 0.25);
assert.equal(m.lowercaseStartRatio, 0.75);
assert.equal(m.questionRate, 0.25);
assert.equal(m.laughRate, 0.5);
assert.equal(m.hinglishRatio, 0.11); // "yaar" = 1 of 9 tokens
assert.equal(styleMetrics(['', '  ']), null);

assert.ok(isVerbatim('Pineapple  absolutely belongs', C.hill));
assert.ok(isVerbatim('pineapple absolutely BELONGS', C.hill)); // case/whitespace don't count
assert.ok(!isVerbatim('pineapple always belongs', C.hill));
assert.ok(!isVerbatim('pi', C.hill)); // too short to be evidence
console.log('✓ offline checks passed (trait reverse-scoring, B/D mapping, style metrics, verbatim quotes)');
if (process.argv.includes('--offline')) process.exit(0);

// --- live
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const user = await User.create({
  email: `onboard-sample-${Date.now().toString(36)}@check.test`, passwordHash: 'x', name: 'Asha',
  consentAgent: true, consentAt: new Date(), onboarding: { status: 'processing', answers },
});
try {
  const started = Date.now();
  const result = await buildUserGraph(user._id);
  const facts = await KgFact.find({ subjectId: user._id, observerId: null }).select('+embedding').lean();
  const fresh = await User.findById(user._id).lean();
  console.log(`✓ built in ${Math.round((Date.now() - started) / 1000)} s: ${facts.length} facts, ${result.dropped} LLM facts dropped for non-verbatim quotes`);

  const by = (p) => facts.filter((f) => f.predicate === p);
  console.log('  by predicate:', JSON.stringify(Object.fromEntries([...new Set(facts.map((f) => f.predicate))].map((p) => [p, by(p).length]))));
  assert.ok(facts.length >= 40 && facts.length <= 70, `expected 40–70 facts, got ${facts.length}`);

  const traits = Object.fromEntries(by('trait').map((f) => [f.object, f.value]));
  assert.deepEqual(traits, t);
  console.log('✓ 5 trait facts with correct reverse scoring:', JSON.stringify(traits));

  const isSummary = (f) => f.predicate === 'story' && Object.values(C).includes(f.evidence?.[0]?.quote);
  const llmFacts = facts.filter((f) => f.evidence?.length && !isSummary(f));
  const allAnswers = Object.values(C).join('\n');
  for (const f of llmFacts) assert.ok(isVerbatim(f.evidence[0].quote, allAnswers), `quote not verbatim: ${f.evidence[0].quote}`);
  assert.equal(facts.filter(isSummary).length, Object.keys(C).length);
  console.log(`✓ ${llmFacts.length} LLM facts all have verbatim quotes; ${facts.filter(isSummary).length} story summaries keep the full answers`);
  console.log('  sample:', llmFacts.slice(0, 4).map((f) => `${f.predicate}: ${f.object} ← "${f.evidence[0].quote}"`).join(' | '));

  assert.ok(facts.every((f) => f.embedding?.length > 0 && f.embeddingModel === env.MODEL_EMBED), 'every fact embedded with MODEL_EMBED');
  console.log(`✓ every fact embedded (${facts[0].embedding.length}-dim, ${facts[0].embeddingModel})`);

  const sp = fresh.styleProfile;
  assert.equal(fresh.onboarding.status, 'done');
  assert.ok(sp?.metrics?.messages === 8 && sp.description?.length > 20 && sp.doList?.length && sp.dontList?.length, 'styleProfile populated');
  console.log('✓ styleProfile:', JSON.stringify(sp.metrics));
  console.log(`  description: ${sp.description.replace(/\n/g, ' / ')}`);

  const graph = await userGraph(fresh);
  const ids = new Set(graph.nodes.map((n) => n.id));
  assert.equal(graph.nodes.length, facts.length + 1);
  assert.ok(graph.links.every((l) => ids.has(l.source) && ids.has(l.target)));
  assert.ok(graph.nodes.slice(1).every((n) => n.label && n.group && n.confidence != null && n.disclosure && n.source));
  console.log(`✓ GET /api/kg/me graph valid: ${graph.nodes.length} nodes, ${graph.links.length} links`);

  // "Ask my human" answer → user_answer facts that survive a re-submit.
  const learned = await learnFromAnswer({ userId: user._id, question: 'Meera asked: do you have any pets?', answer: 'Yes, an indie dog called Momo who steals socks.' });
  assert.ok(learned.length >= 1 && learned.every((f) => f.source === 'user_answer' && f.confidence === 0.9));
  console.log(`✓ inbox answer → ${learned.length} user_answer fact(s): ${learned.map((f) => `${f.predicate}: ${f.object}`).join(', ')}`);
  await User.updateOne({ _id: user._id }, { $set: { 'onboarding.answers': { A, B, D } } }); // re-submit without stories/style: no extra LLM calls
  await buildUserGraph(user._id);
  const after = await KgFact.find({ subjectId: user._id, observerId: null }).lean();
  assert.equal(after.filter((f) => f.source === 'user_answer').length, learned.length);
  assert.equal(after.filter((f) => f.source === 'questionnaire').length, qf.length);
  console.log('✓ re-submit replaces questionnaire facts and keeps user_answer facts');
  console.log('\nOnboarding checks passed.');
} finally {
  await flushUsage();
  if (!process.argv.includes('--keep')) {
    await KgFact.deleteMany({ subjectId: user._id });
    await User.deleteOne({ _id: user._id });
  }
  await mongoose.disconnect();
}
