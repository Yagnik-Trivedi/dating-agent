// Plan 17: the gate filters both directions, returns a boolean only, and the discover query agrees with passesGate,
// uses an index, and is random (never ranked by overlap).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { Profile } from '../src/models/Profile.js';
import { discoverQuery, gateFrom, passesGate } from '../src/services/match/gate.js';
import { start, stop } from '../scripts/lib/testDb.js';

const base = (o = {}) => ({ age: 28, gender: 'woman', interestedIn: ['man'], city: 'Pune', ...o });
const man = (o = {}) => ({ age: 30, gender: 'man', interestedIn: ['woman'], city: 'Pune', ...o });

test('dealbreakers filter both directions; basics filter both directions', () => {
  const nonSmoker = gateFrom(base(), { smoking: { answer: 'never', importance: 'high', dealbreaker: true, accepts: ['never'] } });
  const smoker = gateFrom(man(), { smoking: { answer: 'regularly', importance: 'low' } });
  const social = gateFrom(man(), { smoking: { answer: 'never', importance: 'low' } });
  assert.equal(passesGate(nonSmoker, smoker), false, 'my dealbreaker vs their value');
  assert.equal(passesGate(smoker, nonSmoker), false, 'their dealbreaker vs my value');
  assert.equal(passesGate(nonSmoker, social), true);
  assert.equal(passesGate(gateFrom(base()), gateFrom(man({ city: 'Mumbai' }))), false, 'city');
  assert.equal(passesGate(gateFrom(base({ ageMax: 29 })), gateFrom(man())), false, 'their age outside my range');
  assert.equal(passesGate(gateFrom(base()), gateFrom(man({ ageMin: 29 }))), false, 'my age outside their range');
  assert.equal(passesGate(gateFrom(base()), gateFrom(man({ interestedIn: ['man'] }))), false, 'gender preference');
  assert.equal(passesGate(gateFrom(base({ interestedIn: [] })), gateFrom(man())), true, 'empty interestedIn = open');
  // v1 answers: a dealbreaker accepts only the same answer.
  const v1 = gateFrom(base(), { kids: { answer: 'yes', importance: 'dealbreaker' } });
  assert.equal(passesGate(v1, gateFrom(man(), { kids: { answer: 'no' } })), false);
  assert.equal(passesGate(v1, gateFrom(man(), { kids: { answer: 'yes' } })), true);
  assert.equal(passesGate(v1, gateFrom(man())), false, 'no answer on my dealbreaker = mismatch');
  assert.equal(typeof passesGate(nonSmoker, social), 'boolean', 'boolean only, no score or reasons');
});

// --- with a database
const rnd = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];

before(async () => { await start(); await Profile.syncIndexes(); });
after(stop);

test('discover query = passesGate, uses a gate index, random order, no overlap bias (2,000 profiles)', async () => {
  const r = rnd(42);
  const docs = Array.from({ length: 2000 }, (_, i) => {
    const gender = pick(r, ['man', 'woman']);
    const answers = {
      smoking: { answer: pick(r, ['never', 'socially', 'regularly']), ...(r() < 0.2 && { dealbreaker: true, accepts: ['never'] }) },
      kids: { answer: pick(r, ['yes', 'no', 'open']), ...(r() < 0.2 && { dealbreaker: true, accepts: ['yes', 'open'] }) },
    };
    const profile = { age: 21 + Math.floor(r() * 14), gender, interestedIn: [gender === 'man' ? 'woman' : 'man'], city: pick(r, ['Pune', 'Mumbai']) };
    return { userId: new mongoose.Types.ObjectId(), name: `u${i}`, ...profile, tags: { interests: r() < 0.5 ? ['trekking', 'films', 'cooking'] : [] }, gate: gateFrom(profile, answers) };
  });
  await Profile.insertMany(docs);

  for (const me of docs.slice(0, 40)) {
    const got = new Set((await Profile.find(discoverQuery(me.gate, [me.userId]), { userId: 1 }).lean()).map((p) => String(p.userId)));
    const want = new Set(docs.filter((d) => d !== me && passesGate(me.gate, d.gate)).map((d) => String(d.userId)));
    assert.deepEqual([...got].sort(), [...want].sort(), `query and passesGate disagree for ${me.name}`);
  }

  const plan = await Profile.find(discoverQuery(docs[0].gate, [docs[0].userId])).explain('queryPlanner');
  const text = JSON.stringify(plan.queryPlanner.winningPlan);
  assert.ok(!text.includes('COLLSCAN') && text.includes('gate.'), 'discover uses a gate.* index');

  const me = docs.find((d) => d.gate.interestedIn.length);
  const deck = () => Profile.aggregate([{ $match: discoverQuery(me.gate, [me.userId]) }, { $sample: { size: 10 } }, { $project: { userId: 1, tags: 1 } }]);
  const [a, b] = [await deck(), await deck()];
  assert.notDeepEqual(a.map((p) => String(p.userId)), b.map((p) => String(p.userId)), 'random order');

  // Many shared interests vs none: same chance to be drawn (within noise).
  const eligible = docs.filter((d) => d !== me && passesGate(me.gate, d.gate));
  const share = eligible.filter((d) => d.tags.interests.length).length / eligible.length;
  let withInterests = 0, total = 0;
  for (let i = 0; i < 30; i++) for (const p of await deck()) { total++; if (p.tags?.interests?.length) withInterests++; }
  assert.ok(Math.abs(withInterests / total - share) < 0.15, `drawn ${withInterests}/${total} vs eligible share ${share.toFixed(2)}`);
});
