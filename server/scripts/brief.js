// Plan 07 checks: offline unit checks (agenda from my own graph, opener validation), then the live match-created
// pipeline: gate re-check → trust → brief → conversation doc.
//   node scripts/brief.js --check                         offline + live (fixture users, cleaned up)
//   node scripts/brief.js --offline                       unit checks only (no LLM, no DB)
//   node scripts/brief.js <viewerEmail> <subjectEmail>    print the brief one existing user would get on another
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Conversation } from '../src/models/Conversation.js';
import { KgFact } from '../src/models/KgFact.js';
import { Match } from '../src/models/Match.js';
import { Profile } from '../src/models/Profile.js';
import { Usage } from '../src/models/Usage.js';
import { User } from '../src/models/User.js';
import { buildAgenda, buildBrief, validOpeners } from '../src/services/brief/buildBrief.js';
import { KG } from '../src/services/kg/config.js';
import { questionnaireFacts } from '../src/services/kg/questionnaireFacts.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { buildGate } from '../src/services/match/gate.js';
import { createMatch, nameOf } from '../src/services/matches.js';
import { readsOfOther, startSpy, stopSpy } from './lib/dbSpy.js';
import './lib/worker.js'; // job worker for the match pipeline (plan 17)

const args = process.argv.slice(2);
const printBrief = (b) => {
  console.log(`Summary: ${b.summary || '(none)'}`);
  console.log('Agenda:'); for (const a of b.agenda) console.log(`  [${a.id}] ${a.priority.toFixed(2)} ${a.topic}${a.dealbreaker ? ' (dealbreaker)' : ''} — ${a.why}`);
  console.log('Openers:'); for (const o of b.openers) console.log(`  "${o.text}" (${o.hook}${o.usedFactIds?.length ? `, ${o.usedFactIds.length} fact(s)` : ''})`);
  if (b.watchouts?.length) console.log(`Watchouts: ${b.watchouts.join(' · ')}`);
};

// --- offline: agenda from my own graph; openers must cite my facts for anything about me
{
  const self = [
    { predicate: 'lifestyle', attribute: 'smoking', object: 'smoking: never', importance: 1, isDealbreaker: true, disclosure: 'public' },
    { predicate: 'goal', attribute: 'kids', object: 'wants children: yes', importance: 0.6, disclosure: 'public' },
    { predicate: 'values', attribute: 'religion', object: 'religion in own life: central', importance: 0.9, disclosure: 'if_asked' },
    { predicate: 'goal', attribute: 'location', object: 'living in 3-5 years: abroad', importance: 0.9, disclosure: 'private' },
    { predicate: 'likes', object: 'trekking', strength: 0.9, disclosure: 'public' },
    { predicate: 'likes', object: 'crowds', strength: 0.9, polarity: -1, disclosure: 'public' },
    { predicate: 'story', object: 'visit Hampi', strength: 0.9, disclosure: 'public' },
  ];
  const agenda = buildAgenda({ self, clarify: ['drinking'] });
  assert.deepEqual(agenda.map((a) => [a.topic, a.priority, a.dealbreaker ?? false]), [
    ['smoking', 1, true], ['wants children', 0.6, false], ['drinking', 0.6, false], ['trekking', 0.45, false],
  ]);
  assert.ok(!JSON.stringify(agenda).includes('abroad') && !JSON.stringify(agenda).includes('living'), 'private facts never become topics');
  assert.ok(!agenda.some((a) => a.topic.includes('religion')), 'if_asked values only when they are a dealbreaker');
  assert.ok(!agenda.some((a) => /hampi|crowds/i.test(a.topic)), 'stories and dislikes are not agenda dimensions');
  const ids = new Set(['F1', 'F2']);
  const ok = validOpeners([
    { text: 'Rajmachi at sunrise sounds unreal, how early do you start?', hook: 'Prompt', factIds: [] },
    { text: 'I do Sinhagad most weekends, which trail is your favourite?', hook: 'Shared', factIds: ['F1'] },
    { text: 'I make the best misal in Pune, fight me.', hook: 'Food', factIds: [] }, // claims about me without a fact
    { text: 'Love that.', hook: 'x', factIds: ['F9'] }, // unknown id
    { text: 'One. Two. Three sentences is too many.', hook: 'x', factIds: [] },
  ], ids);
  assert.deepEqual(ok.map((o) => o.hook), ['Prompt', 'Shared']);
  console.log('✓ offline checks passed (agenda from own graph: dealbreakers first, no private/if_asked/story topics; opener grounding)');
}
if (args.includes('--offline')) process.exit(0);

env.LLM_DAILY_CALLS_PER_USER = Math.max(env.LLM_DAILY_CALLS_PER_USER, 5000);
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
try {
  if (!args.includes('--check')) {
    const [viewerEmail, subjectEmail] = args;
    if (!viewerEmail || !subjectEmail) throw new Error('usage: node scripts/brief.js <viewerEmail> <subjectEmail> | --check | --offline');
    const [viewer, subject] = await Promise.all([User.findOne({ email: viewerEmail }), User.findOne({ email: subjectEmail })]);
    const name = (await Profile.findOne({ userId: viewer._id }, { name: 1 }).lean())?.name ?? viewer.name;
    printBrief(await buildBrief({ viewerId: viewer._id, subjectId: subject._id, viewerName: name.split(' ')[0] }));
  } else {
    await live();
  }
} finally {
  await flushUsage();
  await mongoose.disconnect();
}

async function live() {
  const created = [];
  const tag = Date.now().toString(36);
  const PRIVATE = 'recovering from a hard breakup last spring';
  const mkUser = async (name, { answers, profile, extraFacts = [] }) => {
    const user = await User.create({
      email: `brief-${name.toLowerCase()}-${tag}@check.test`, passwordHash: 'x', name, consentAgent: true, consentAt: new Date(),
      createdAt: new Date(Date.now() - 86_400_000), agentMode: 'off', onboarding: { status: 'done', answers }, // agents off: no chat tokens
    });
    created.push(user._id);
    await Profile.create({ userId: user._id, name, photos: [`https://api.dicebear.com/9.x/notionists/svg?seed=${name}`], ...profile });
    await KgFact.insertMany([...questionnaireFacts(answers), ...extraFacts].map(({ conceptText, conceptType, ...f }) => ({ ...f, subjectId: user._id, weight: f.importance ?? f.strength ?? 0.5 })));
    await buildGate(user._id);
    return user;
  };
  const asha = await mkUser('Asha', {
    answers: {
      B: {
        smoking: { answer: 'never', importance: 'high', dealbreaker: true, accepts: ['never'] },
        kids: { answer: 'yes', importance: 'medium' },
        looking_for: { answer: 'long_term', importance: 'medium' },
      },
      D: { interests: [{ name: 'trekking', intensity: 'obsessed' }, { name: 'board games', intensity: 'into_it' }] },
    },
    extraFacts: [{ predicate: 'background', object: PRIVATE, strength: 0.8, confidence: 0.9, source: 'user_answer', disclosure: 'private' }],
    profile: { age: 27, city: 'Pune', gender: 'woman', interestedIn: ['man'], bio: 'Product designer. Weekends are for the Sahyadris.', prompts: [{ q: 'A perfect Sunday', a: 'Sunrise trek, misal after, nap.' }], tags: { interests: ['trekking', 'board games'] } },
  });
  const kabir = await mkUser('Kabir', {
    answers: { B: { smoking: { answer: 'never', importance: 'medium' } }, D: { interests: [{ name: 'trekking', intensity: 'obsessed' }, { name: 'photography', intensity: 'into_it' }] } },
    profile: {
      age: 29, city: 'Pune', gender: 'man', interestedIn: ['woman'],
      bio: 'Backend engineer who spends most monsoon weekends trekking around Lonavala with a camera.',
      prompts: [{ q: 'A perfect Sunday', a: 'Rajmachi at sunrise, vada pav on the way down, then a long nap.' }, { q: "I'm weirdly good at", a: 'Finding the one chai stall on any trail.' }],
      tags: { interests: ['trekking', 'photography'] },
    },
  });
  const vikram = await mkUser('Vikram', {
    answers: { B: { smoking: { answer: 'regularly', importance: 'low' } }, D: { interests: [{ name: 'cricket', intensity: 'obsessed' }] } },
    profile: { age: 28, city: 'Pune', gender: 'man', interestedIn: ['woman'], bio: 'Sales guy, cricket on weekends, chai and a smoke after.', prompts: [{ q: 'A perfect Sunday', a: 'Gully cricket, biryani for lunch.' }], tags: { interests: ['cricket'] } },
  });

  const waitStatus = async (match) => {
    for (let i = 0; i < 300; i++) {
      const m = await Match.findById(match._id);
      if (['agent_chatting', 'closed', 'flagged_fake'].includes(m.status)) return m;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`match stuck in ${(await Match.findById(match._id)).status}`);
  };

  try {
    startSpy();
    const t0 = Date.now();
    const [trekMatch, gated] = await Promise.all([waitStatus(await createMatch(asha._id, kabir._id)), waitStatus(await createMatch(asha._id, vikram._id))]);
    const recs = stopSpy();
    await flushUsage();
    console.log(`\npipelines finished in ${Math.round((Date.now() - t0) / 1000)} s`);

    // Gate fail (Asha's smoking dealbreaker vs Vikram's answer): closed, no detail, no LLM spent.
    assert.deepEqual([gated.status, gated.closedReason], ['closed', 'gate']);
    assert.equal(await Usage.countDocuments({ matchId: gated._id }), 0, 'no trust/brief/agent calls for a gated match');
    assert.ok(!gated.trust && !gated.brief, 'nothing ran after the gate');
    console.log('✓ gate re-check: Asha × Vikram → closed (reason "gate", no detail), 0 LLM calls');

    // Passing pair: trust → brief → conversation doc → agent_chatting.
    const b = trekMatch.brief[String(asha._id)];
    console.log('\n=== Asha → Kabir'); printBrief(b);
    console.log('\n=== Kabir → Asha'); printBrief(trekMatch.brief[String(kabir._id)]);
    assert.equal(trekMatch.status, 'agent_chatting');
    assert.deepEqual([nameOf(trekMatch, asha._id), nameOf(trekMatch, kabir._id)], ['Asha', 'Kabir'], 'display names stored on the match');
    assert.ok(b.openers.length > 0 && b.openers.some((o) => /trek|rajmachi|lonavala|sunrise|chai|camera/i.test(o.text)), 'an opener reacts to his profile');
    assert.ok(b.openers.every((o) => !/\b(i|i'm|my|me)\b/i.test(o.text) || o.usedFactIds?.length), 'anything about Asha cites her facts');
    assert.deepEqual([b.agenda[0].topic, b.agenda[0].priority, b.agenda[0].dealbreaker], ['smoking', 1, true], 'my dealbreaker topic first');
    assert.ok(b.agenda.every((a, i) => i === 0 || b.agenda[i - 1].priority >= a.priority), 'agenda sorted by priority');
    assert.ok(!JSON.stringify(trekMatch.brief).toLowerCase().includes('breakup'), 'private fact text never appears in a brief');
    assert.equal(await KgFact.countDocuments({ matchId: trekMatch._id, source: 'profile' }), 0, 'the brief stores nothing about the other user');
    const conv = await Conversation.findOne({ matchId: trekMatch._id }).lean();
    const temps = Object.values(conv.agentState).map((s) => s.temperature);
    assert.ok(Number.isInteger(conv.seed) && temps.length === 2 && temps.every((x) => x >= KG.TEMP_RANGE[0] && x <= KG.TEMP_RANGE[1]), 'conversation: seed + 2 sampled temperatures');
    console.log(`\n✓ Asha × Kabir: trust → brief (opener about his profile, dealbreaker topic first, no private text, 0 facts stored about him) → conversation (seed ${conv.seed}, temperatures ${temps.join(' / ')}) → agent_chatting`);

    // Boundary: during the brief, the only reads of the other user were their public profile.
    const theirs = readsOfOther(recs, 'brief');
    const bad = theirs.filter((r) => !(r.model === 'Profile' && ['gate', 'dealbreakers', 'geo'].every((f) => r.projection[f] === 0)));
    assert.ok(theirs.length >= 2 && !bad.length, `brief reads of the other user: ${theirs.map((r) => r.model).join(', ')}; bad: ${bad.map((r) => r.model).join(', ')}`);
    console.log(`✓ boundary: ${theirs.length} brief reads of the other user, all Profile with the public projection`);
    console.log('\nBrief checks passed.');
  } finally {
    const matchIds = await Match.distinct('_id', { users: { $in: created } });
    await Promise.all([
      Match.deleteMany({ _id: { $in: matchIds } }), Conversation.deleteMany({ matchId: { $in: matchIds } }),
      Profile.deleteMany({ userId: { $in: created } }), KgFact.deleteMany({ $or: [{ subjectId: { $in: created } }, { observerId: { $in: created } }] }),
      User.deleteMany({ _id: { $in: created } }),
    ]);
  }
}
