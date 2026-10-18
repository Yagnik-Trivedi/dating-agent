// Plan 05 §6 acceptance against a running server + the same DB: hub graph, trait lock, edit + delete surviving a
// re-submit, contradiction resolve, "I never use emojis".   node scripts/kg-review-check.js [baseUrl]
// A throwaway user onboards through the API with seed01's answers (2 builds, LLM ~1–2 min) and is deleted at the end.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { KgEdge } from '../src/models/KgEdge.js';
import { KgFact } from '../src/models/KgFact.js';
import { KgTombstone } from '../src/models/KgTombstone.js';
import { User } from '../src/models/User.js';
import { VoiceProfile } from '../src/models/VoiceProfile.js';
import { buildUserGraph } from '../src/services/kg/buildUserGraph.js';
import { factKey } from '../src/services/kg/factKey.js';
import { flushUsage } from '../src/services/llm/budget.js';

const BASE = process.argv[2] ?? 'http://localhost:5000';
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
env.LLM_DAILY_CALLS_PER_USER = Math.max(env.LLM_DAILY_CALLS_PER_USER, 5000);
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const persona = JSON.parse(readFileSync(new URL('../seed/personas.json', import.meta.url))).find((p) => p.email === 'seed01@demo.local');
const email = `kg-review-${Date.now().toString(36)}@check.test`;
const { body: signup } = await call('POST', '/auth/signup', { body: { name: 'Mira', email, password: 'password123', consentAgent: true, dob: '1998-03-02', gender: 'woman', interestedIn: ['man'], city: 'Pune' } });
const token = signup.token;
assert.ok(token, 'signup');
await call('PUT', '/profile', { token, body: { name: 'Mira', age: 27, city: 'Pune', gender: 'woman', interestedIn: ['man'] } });
assert.equal((await call('POST', '/onboarding/submit', { token, body: { answers: persona.answers } })).status, 200, 'onboarding submit');
for (let i = 0; i < 90 && (await call('GET', '/onboarding/status', { token })).body.status === 'processing'; i++) await new Promise((r) => setTimeout(r, 2000));
assert.equal((await call('GET', '/onboarding/status', { token })).body.status, 'done', 'build job finished');
const user = await User.findOne({ email });
console.log('✓ throwaway user onboarded through the API (build job)');

try {
  // Graph: center + ≤ 8 hubs incl. How I text, no traits, no vectors.
  const g = (await call('GET', '/kg/me', { token })).body;
  const hubs = g.nodes.filter((n) => n.hubNode);
  assert.ok(g.nodes.find((n) => n.center), 'center node');
  assert.ok(hubs.length <= 8 && hubs.some((h) => h.id === 'hub:voice'), `hubs: ${hubs.map((h) => h.label).join(', ')}`);
  assert.ok(!g.nodes.some((n) => n.type === 'trait'), 'traits hidden');
  assert.ok(!JSON.stringify(g).includes('embedding'), 'no embedding bytes');
  console.log(`✓ hub graph: ${hubs.map((h) => h.label).join(' · ')}; ${g.nodes.filter((n) => n.type === 'voice').map((n) => n.label).join(' | ')}`);

  const trait = await KgFact.findOne({ subjectId: user._id, predicate: 'trait' });
  assert.equal((await call('PATCH', `/kg/facts/${trait._id}`, { token, body: { disclosure: 'public' } })).status, 422);
  assert.equal((await call('DELETE', `/kg/facts/${trait._id}`, { token })).status, 422);
  console.log('✓ trait PATCH/DELETE → 422');

  // Edit one interest, delete another; both must survive a re-submit.
  const [edit, gone] = await KgFact.find({ subjectId: user._id, observerId: null, predicate: 'likes', source: 'questionnaire_choice' }).limit(2).lean();
  const edited = await call('PATCH', `/kg/facts/${edit._id}`, { token, body: { object: `${edit.object} (my favourite)`, strength: 0.95, disclosure: 'if_asked' } });
  assert.equal(edited.status, 200);
  assert.equal((await call('DELETE', `/kg/facts/${gone._id}`, { token })).status, 204);
  assert.ok(await KgTombstone.exists({ subjectId: user._id, key: factKey(gone) }), 'tombstone written');

  // Planted contradiction → listed → resolved (loser tombstoned).
  const [a, b] = await KgFact.find({ subjectId: user._id, observerId: null, predicate: 'story' }).limit(2).lean();
  const plantedEdge = await KgEdge.create({ subjectId: user._id, from: { kind: 'fact', id: a._id }, to: { kind: 'fact', id: b._id }, type: 'CONTRADICTS' });
  const list = (await call('GET', '/kg/contradictions', { token })).body.contradictions; // the build may have found real ones too
  assert.ok(list.some((c) => c.id === String(plantedEdge._id)), 'planted contradiction is listed');
  assert.equal((await call('POST', `/kg/contradictions/${plantedEdge._id}/resolve`, { token, body: { keepFactId: String(a._id) } })).status, 200);
  const left = (await call('GET', '/kg/contradictions', { token })).body.contradictions;
  assert.ok(!left.some((c) => c.id === String(plantedEdge._id)) && left.length < list.length, 'resolved contradiction leaves the panel');
  assert.ok(await KgTombstone.exists({ subjectId: user._id, key: factKey(b) }), 'loser tombstoned');
  console.log('✓ edit, delete (tombstone) and contradiction resolve');

  const fix = await call('POST', '/kg/voice/corrections', { token, body: { nodeId: 'voice:emoji', text: 'I never use emojis' } });
  assert.equal(fix.status, 200);
  console.log('✓ "I never use emojis" →', fix.body.voice.find((n) => n.field === 'emoji').label);

  // Re-submit: same answers, full v2 build.
  await buildUserGraph(user._id);
  const after = await KgFact.find({ subjectId: user._id, observerId: null }).lean();
  const kept = after.find((f) => String(f._id) === String(edit._id));
  assert.ok(kept?.userEdited && kept.object.endsWith('(my favourite)') && kept.disclosure === 'if_asked', 'edit survives re-submit');
  assert.ok(!after.some((f) => factKey(f) === factKey(gone)), 'deleted fact does not come back');
  assert.ok(!after.some((f) => factKey(f) === factKey(b)), 'resolved loser does not come back');
  const v = await VoiceProfile.findOne({ userId: user._id }).lean();
  assert.ok(v.emojiPerMessage === 0 && v.neverSay.includes('emoji'), 'emoji correction survives the rebuild');
  console.log('✓ re-submit keeps the edit, never restores deleted facts, keeps the emoji correction');
  console.log('\nKG review checks passed.');
} finally {
  await call('DELETE', '/me', { token });
  await flushUsage();
  await mongoose.disconnect();
}
