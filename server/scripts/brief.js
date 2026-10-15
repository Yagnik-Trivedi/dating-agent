// Plan 07: print a viewer's brief on a subject, or run the acceptance checks.
//   node scripts/brief.js <viewerEmail> <subjectEmail>   print the brief (uses their match if one exists)
//   node scripts/brief.js --check                        unit checks + live fixtures (trekking pair, smoking dealbreaker)
//   node scripts/brief.js --offline                      unit checks only (no LLM, no DB)
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { KgFact } from '../src/models/KgFact.js';
import { Match } from '../src/models/Match.js';
import { Profile } from '../src/models/Profile.js';
import { User } from '../src/models/User.js';
import { buildAgenda, buildBrief, findOverlaps, tagFacts, topicOf } from '../src/services/brief/buildBrief.js';
import { embedFacts } from '../src/services/kg/factEmbedding.js';
import { questionnaireFacts } from '../src/services/kg/questionnaireFacts.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { createMatch } from '../src/services/matches.js';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);

function printBrief(b) {
  console.log(`\nSummary: ${b.summary || '(none)'}`);
  console.log(`Overlaps: ${b.overlaps.map((o) => `${o.topic} ↔ ${o.theirs} (${o.score})`).join(' · ') || '(none)'}`);
  console.log('Agenda:');
  for (const a of b.agenda) console.log(`  ${a.id} [${a.priority.toFixed(2)}] ${a.topic}  (${a.why}; known ${a.confidence})`);
  console.log('Openers:');
  for (const o of b.openers) console.log(`  • ${o.text}   [${o.hook}]`);
  if (b.watchouts.length) console.log(`Watchouts: ${b.watchouts.join(' | ')}`);
  console.log(`Early dealbreaker: ${b.earlyDealbreaker ? `${b.earlyDealbreaker.why} ("${b.earlyDealbreaker.quote}")` : 'none'}`);
}

// --- offline unit checks (synthetic 3-d vectors)
{
  assert.equal(topicOf({ object: 'partner must be compatible on smoking (mine: never)' }), 'smoking');
  assert.equal(topicOf({ object: 'smoking: never' }), 'smoking');
  assert.equal(topicOf({ object: 'no smoking' }), 'smoking');
  assert.equal(topicOf({ object: 'trekking' }), 'trekking');
  assert.deepEqual(tagFacts({ tags: { interests: ['Trekking', 'Trekking'], lifestyle: { smoking: 'Regularly' }, wantsKids: 'yes' } })
    .map((f) => [f.predicate, f.object, f.confidence]), [['likes', 'trekking', 0.6], ['lifestyle', 'smoking: regularly', 0.6], ['goal', 'wants children: yes', 0.6]]);

  const v = (x, y, z) => [x, y, z];
  const self = [
    { predicate: 'likes', object: 'trekking', weight: 0.9, disclosure: 'public', embedding: v(1, 0, 0) },
    { predicate: 'lifestyle', object: 'smoking: never', weight: 0.7, disclosure: 'public', embedding: v(0, 1, 0) },
    { predicate: 'dealbreaker', object: 'partner must be compatible on smoking (mine: never)', weight: 1, disclosure: 'if_asked', embedding: v(0, 1, 0.2) },
    { predicate: 'values', object: 'religion in own life: central', weight: 0.7, disclosure: 'if_asked', embedding: v(0, 0, 1) },
    { predicate: 'goal', object: 'secretly moving abroad', weight: 1, disclosure: 'private', embedding: v(0.5, 0.5, 0.5) },
  ];
  const observed = [
    { predicate: 'likes', object: 'trekking', confidence: 0.6, evidence: [{ quote: 'tags.interests: trekking' }], embedding: v(1, 0, 0) },
    { predicate: 'lifestyle', object: 'smoking: regularly', confidence: 0.6, evidence: [{ quote: 'x' }], embedding: v(0, 1, 0) },
  ];
  const overlaps = findOverlaps(self, observed);
  assert.deepEqual(overlaps.map((o) => o.topic), ['trekking'], 'opposite answers ("smoking: never" vs "regularly") are not overlaps');
  const agenda = buildAgenda({ self, observed, clarify: ['drinking'] });
  assert.ok(agenda.every((a, i) => i === 0 || agenda[i - 1].priority >= a.priority), 'agenda sorted by priority');
  const smoking = agenda.find((a) => a.topic === 'smoking');
  assert.equal(smoking.priority, 0.4, 'dealbreaker + lifestyle merge: importance 1 × (1 − known 0.6)');
  assert.equal(smoking.why, 'A dealbreaker for you');
  assert.equal(agenda.find((a) => a.topic === 'drinking').priority, 0.6);
  assert.ok(!JSON.stringify(agenda).includes('abroad'), 'private facts never become agenda topics');
  assert.ok(!agenda.some((a) => a.topic.includes('religion')), 'if_asked values (religion) are never raised by the agent');
  console.log('✓ offline checks passed (topics, tag facts, overlaps, agenda merge/sort/privacy)');
}
if (flag('--offline')) process.exit(0);

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
try {
  if (!flag('--check')) {
    const [viewerEmail, subjectEmail] = args;
    if (!viewerEmail || !subjectEmail) throw new Error('usage: node scripts/brief.js <viewerEmail> <subjectEmail> | --check | --offline');
    const [viewer, subject] = await Promise.all([User.findOne({ email: viewerEmail }), User.findOne({ email: subjectEmail })]);
    if (!viewer || !subject) throw new Error('user not found');
    const match = await Match.findOne({ users: { $all: [viewer._id, subject._id] } });
    const matchId = match?._id ?? new mongoose.Types.ObjectId(); // no match yet: throwaway id, observed facts removed after
    printBrief(await buildBrief({ viewerId: viewer._id, subjectId: subject._id, matchId, trust: match?.trust?.[String(viewer._id)] }));
    if (!match) await KgFact.deleteMany({ matchId });
  } else {
    await runChecks();
  }
} finally {
  await flushUsage();
  await mongoose.disconnect();
}

async function runChecks() {
  const created = [];
  const tag = Date.now().toString(36);
  const mkUser = async (name, { answers, profile, extraFacts = [], style }) => {
    const user = await User.create({
      email: `brief-${name.toLowerCase()}-${tag}@check.test`, passwordHash: 'x', name, consentAgent: true, consentAt: new Date(),
      createdAt: new Date(Date.now() - 86_400_000), onboarding: { status: 'done' }, styleProfile: style,
    });
    created.push(user._id);
    await Profile.create({ userId: user._id, name, photos: [`https://api.dicebear.com/9.x/notionists/svg?seed=${name}`], ...profile });
    const facts = [...questionnaireFacts(answers), ...extraFacts].map((f) => ({ ...f, subjectId: user._id }));
    const vecs = await embedFacts(facts);
    await KgFact.insertMany(facts.map((f, i) => ({ ...f, ...vecs[i] })));
    return user;
  };
  const PRIVATE = 'recovering from a hard breakup last spring';

  const asha = await mkUser('Asha', {
    answers: {
      B: {
        smoking: { answer: 'never', importance: 'dealbreaker' },
        kids: { answer: 'yes', importance: 'important' },
        drinking: { answer: 'socially', importance: 'nice_to_have' },
        looking_for: { answer: 'long_term', importance: 'important' },
        religion: { answer: 'somewhat', importance: 'nice_to_have' },
      },
      D: { interests: [{ name: 'trekking', intensity: 'obsessed' }, { name: 'board games', intensity: 'into_it' }, { name: 'baking', intensity: 'casual' }] },
    },
    extraFacts: [{ predicate: 'background', object: PRIVATE, weight: 0.8, confidence: 0.9, source: 'user_answer', disclosure: 'private' }],
    style: { description: 'Lowercase, short messages, one emoji at most, asks a question back.', doList: ['keep it under 20 words'], dontList: ['no exclamation spam'] },
    profile: {
      age: 27, city: 'Pune', gender: 'woman', interestedIn: ['man'], bio: 'Product designer. Weekends are for the Sahyadris.',
      prompts: [{ q: 'A perfect Sunday', a: 'Sunrise trek, misal after, nap.' }],
      tags: { interests: ['trekking', 'board games'], lifestyle: { smoking: 'never', drinking: 'socially' }, wantsKids: 'yes', relationshipGoal: 'long-term' },
      dealbreakers: ['no smoking'],
    },
  });
  const kabir = await mkUser('Kabir', {
    answers: { B: { smoking: { answer: 'never', importance: 'important' } }, D: { interests: [{ name: 'trekking', intensity: 'obsessed' }, { name: 'photography', intensity: 'into_it' }] } },
    profile: {
      age: 29, city: 'Pune', gender: 'man', interestedIn: ['woman'],
      bio: 'Backend engineer who spends most monsoon weekends trekking around Lonavala with a camera.',
      prompts: [
        { q: 'A perfect Sunday', a: 'Rajmachi at sunrise, vada pav on the way down, then a long nap.' },
        { q: "I'm weirdly good at", a: 'Finding the one chai stall on any trail.' },
      ],
      tags: { interests: ['trekking', 'photography'], lifestyle: { smoking: 'never', drinking: 'socially' }, wantsKids: 'open', relationshipGoal: 'long-term' },
    },
  });
  const vikram = await mkUser('Vikram', {
    answers: { B: { smoking: { answer: 'regularly', importance: 'nice_to_have' } }, D: { interests: [{ name: 'cricket', intensity: 'obsessed' }] } },
    profile: {
      age: 28, city: 'Pune', gender: 'man', interestedIn: ['woman'], bio: 'Sales guy, cricket on weekends, chai and a smoke after.',
      prompts: [{ q: 'A perfect Sunday', a: 'Gully cricket in the morning, biryani for lunch.' }],
      tags: { interests: ['cricket'], lifestyle: { smoking: 'regularly', drinking: 'socially' }, relationshipGoal: 'long-term' },
    },
  });

  const waitStatus = async (match) => {
    for (let i = 0; i < 300; i++) {
      const m = await Match.findById(match._id);
      if (['agent_chatting', 'evaluating', 'flagged_fake'].includes(m.status)) return m;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`match stuck in ${(await Match.findById(match._id)).status}`);
  };

  try {
    const t0 = Date.now();
    const [trekMatch, smokeMatch] = await Promise.all([waitStatus(await createMatch(asha._id, kabir._id)), waitStatus(await createMatch(asha._id, vikram._id))]);
    console.log(`\npipelines finished in ${Math.round((Date.now() - t0) / 1000)} s`);

    // Trekking pair → overlap + an opener about it, conversation starts.
    const b = trekMatch.brief[String(asha._id)];
    console.log('\n=== Asha → Kabir'); printBrief(b);
    console.log('\n=== Kabir → Asha'); printBrief(trekMatch.brief[String(kabir._id)]);
    assert.equal(trekMatch.status, 'agent_chatting');
    assert.ok(b.overlaps.some((o) => /trek/i.test(o.topic)), 'trekking overlap');
    assert.ok(b.openers.length > 0 && b.openers.some((o) => /trek|rajmachi|lonavala|sunrise/i.test(o.text)), 'an opener references the trek');
    assert.ok(b.openers.every((o) => o.text.split(/[.!?]+(?:\s|$)/).filter((x) => x.trim()).length <= 2), 'openers ≤ 2 sentences');
    assert.ok(b.agenda.length > 0 && b.agenda.length <= 8);
    assert.ok(b.agenda.every((a, i) => i === 0 || b.agenda[i - 1].priority >= a.priority), 'agenda sorted by priority');
    assert.ok(!JSON.stringify(trekMatch.brief).toLowerCase().includes('breakup'), 'private fact text never appears in a brief');
    assert.equal(b.earlyDealbreaker, null);
    const observed = await KgFact.countDocuments({ matchId: trekMatch._id, observerId: asha._id, subjectId: kabir._id, source: 'profile', embeddingModel: { $exists: true } });
    assert.ok(observed >= 5, 'profile facts saved + embedded');
    console.log(`\n✓ trekking pair: overlap + trek opener, agenda sorted, no private text, ${observed} observed facts saved → agent_chatting`);

    // Smoking dealbreaker → earlyDealbreaker, conversation skipped.
    const s = smokeMatch.brief[String(asha._id)];
    console.log('\n=== Asha → Vikram'); printBrief(s);
    assert.equal(smokeMatch.status, 'evaluating', 'conversation skipped');
    assert.ok(s.earlyDealbreaker, 'earlyDealbreaker set');
    assert.equal(s.earlyDealbreaker.topic, 'smoking');
    assert.equal(s.openers.length, 0, 'no openers written for an early dealbreaker');
    console.log(`✓ smoking dealbreaker: "${s.earlyDealbreaker.why}" → evaluating (no conversation)`);
    console.log('\nBrief checks passed.');
  } finally {
    await Match.deleteMany({ users: { $in: created } });
    await Profile.deleteMany({ userId: { $in: created } });
    await KgFact.deleteMany({ $or: [{ subjectId: { $in: created } }, { observerId: { $in: created } }] });
    await User.deleteMany({ _id: { $in: created } });
  }
}
