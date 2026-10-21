// Plan 31 A2: public profile basics from my own B answers on every gate rebuild; a hidden basic (religion by default)
// never reaches the public profile, the brief's view of it or the other user; hand edits are kept; the gate is unchanged.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Profile, PUBLIC_PROFILE } from '../src/models/Profile.js';
import { User } from '../src/models/User.js';
import { saveProfile } from '../src/routes/profile.js';
import { buildGate, gateFrom } from '../src/services/match/gate.js';
import { publicProfile } from '../src/services/trust/checkProfile.js';
import { start, stop } from '../scripts/lib/testDb.js';

before(start);
after(stop);

const B = {
  kids: { answer: 'yes', importance: 'high' }, smoking: { answer: 'never', importance: 'high', dealbreaker: true, accepts: ['never'] },
  drinking: { answer: 'socially', importance: 'low' }, diet: { answer: 'veg', importance: 'medium' }, looking_for: { answer: 'long_term', importance: 'high' },
  religion: { answer: 'central', importance: 'high' }, location: { answer: 'abroad', importance: 'high' },
};
let n = 0;
async function person(answers = B, tags = {}) {
  const u = await User.create({ email: `b${++n}@t.local`, passwordHash: 'x', name: 'Arya', consentAgent: true, consentAt: new Date(), 'onboarding.answers.B': answers });
  await Profile.create({ userId: u._id, name: 'Arya', age: 27, city: 'Pune', gender: 'woman', interestedIn: ['man'], tags });
  return u._id;
}

test('basics are filled from my B answers when the gate is rebuilt; the gate itself is unchanged', async () => {
  const id = await person(B, { interests: ['trekking'], religionImportance: 'central' });
  const gate = await buildGate(id);
  const p = await Profile.findOne({ userId: id }).lean();
  assert.deepEqual(p.tags.lifestyle, { smoking: 'never', drinking: 'socially', diet: 'veg' });
  assert.deepEqual([p.tags.wantsKids, p.tags.relationshipGoal, p.tags.interests], ['yes', 'long_term', ['trekking']]);
  assert.deepEqual(gate, gateFrom(p, B));
  assert.deepEqual(gate.values.religion, 'central', 'the gate still has the hidden basic');
});

test('a hidden basic (religion by default) never appears in the public profile or what the brief sends the model', async () => {
  const id = await person(B, { religionImportance: 'central' });
  await buildGate(id);
  const pub = await Profile.findOne({ userId: id }).select(PUBLIC_PROFILE).lean();
  assert.equal(pub.tags.religionImportance, undefined);
  assert.equal(pub.tagsHidden, undefined, 'which basics I hide is private too');
  assert.ok(!JSON.stringify(publicProfile(pub)).includes('central'));
  // Hiding kids too: gone after the next rebuild.
  await saveProfile(id, { tagsHidden: ['religion', 'kids'] });
  const after2 = await Profile.findOne({ userId: id }).select(PUBLIC_PROFILE).lean();
  assert.equal(after2.tags.wantsKids, undefined);
  assert.equal(after2.tags.lifestyle.smoking, 'never');
  // Showing religion on purpose: then it's public.
  await saveProfile(id, { tagsHidden: [] });
  assert.equal((await Profile.findOne({ userId: id }).lean()).tags.religionImportance, 'central');
});

test('a basic set by hand is not overwritten by my B answer; a partial tags update keeps the other basics', async () => {
  const id = await person();
  await buildGate(id);
  await saveProfile(id, { tags: { lifestyle: { drinking: 'never' } } });
  await saveProfile(id, { tags: { interests: ['dosa'] } }); // the onboarding sends only interests
  await buildGate(id);
  const p = await Profile.findOne({ userId: id }).lean();
  assert.equal(p.tags.lifestyle.drinking, 'never', 'hand edit kept (B says socially)');
  assert.deepEqual([p.tags.lifestyle.smoking, p.tags.wantsKids, p.tags.interests], ['never', 'yes', ['dosa']]);
  assert.deepEqual(p.tagsEdited, ['drinking']);
});
