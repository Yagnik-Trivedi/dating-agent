// Plan 30 S2 gating: browse_only isn't shown and can't match, its likes are delivered once active (the live check that
// set it was removed on 2026-10-19: waiting accounts are activated at boot, new ones start active);
// the scam self-check holds a seed-fake profile and not a normal one; an admin release sticks to that profile
// version. Plus the photo moderation decision. No LLM (the consistency check's cache is pre-filled).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Like } from '../src/models/Like.js';
import { Match } from '../src/models/Match.js';
import { Profile } from '../src/models/Profile.js';
import { ProfileCheck } from '../src/models/ProfileCheck.js';
import { User } from '../src/models/User.js';
import { buildGate, discoverQuery } from '../src/services/match/gate.js';
import { createMatch } from '../src/services/matches.js';
import { decidePhoto } from '../src/services/photos.js';
import { activateWaiting, initialStatus, releaseProfile, settleStatus } from '../src/services/profileStatus.js';
import { profileVersion } from '../src/services/trust/checkProfile.js';
import { start, stop } from '../scripts/lib/testDb.js';

before(start);
after(stop);

const NO_LLM_FINDINGS = { contradictions: [], scamSignals: [], genericBio: false, summary: '' };
let n = 0;
async function person(profile) {
  const u = await User.create({ email: `ps${++n}@t.local`, passwordHash: 'x', name: profile.name, consentAgent: true, consentAt: new Date() });
  await Profile.create({ userId: u._id, age: 28, city: 'Pune', photos: ['https://api.dicebear.com/9.x/notionists/svg?seed=x'], ...profile });
  await buildGate(u._id);
  const saved = await Profile.findOne({ userId: u._id }).lean();
  await ProfileCheck.create({ userId: u._id, version: profileVersion(saved), llm: NO_LLM_FINDINGS });
  return u._id;
}
const normal = { bio: 'Product designer, weekend cyclist, terrible at karaoke but I keep trying.', prompts: [{ q: 'A perfect Sunday', a: 'Long ride, dosa, nap.' }] };

test('browse_only: not in Discover, no match; activated at boot (live check removed) and the kept likes delivered', async () => {
  assert.equal(initialStatus(), 'active', 'new accounts start active');
  const a = await person({ name: 'Asha', gender: 'woman', interestedIn: ['man'], status: 'browse_only', ...normal });
  const b = await person({ name: 'Bilal', gender: 'man', interestedIn: ['woman'], ...normal }); // no status = active
  const deck = async (id) => (await Profile.find(discoverQuery((await Profile.findOne({ userId: id }).lean()).gate, [id])).lean()).map((p) => String(p.userId));
  assert.ok(!(await deck(b)).includes(String(a)), 'browse_only is never shown');
  assert.ok((await deck(a)).includes(String(b)), 'but can browse');

  await Like.create([{ fromUserId: a, toUserId: b, liked: true }, { fromUserId: b, toUserId: a, liked: true }]);
  assert.equal(await createMatch(a, b), null, 'no match while browse_only');

  assert.equal(await activateWaiting(), 1);
  assert.equal((await Profile.findOne({ userId: a }).lean()).status, 'active');
  assert.equal(await activateWaiting(), 0, 'once');
  assert.ok(await Match.exists({ users: { $all: [a, b] } }), 'the kept likes became a match');
  assert.ok((await deck(b)).includes(String(a)), 'active → shown to others');
});

test('self-check: a seed-fake profile is held, a normal one is not; a release sticks to that version', async () => {
  const fake = await person({
    name: 'Daniel', gender: 'man', interestedIn: ['woman'], status: 'active',
    bio: 'Army doctor serving on a UN mission abroad, balancing duty with a passion for forex trading.',
    prompts: [{ q: 'I\'ll fall for you if', a: 'you value honesty. I mentor people in a forex investment opportunity with guaranteed returns. Add me on whatsapp.' }],
  });
  assert.equal(await settleStatus(fake), 'held');
  const held = await Profile.findOne({ userId: fake }).lean();
  assert.equal(held.selfCheck.level, 'high');
  assert.ok(held.selfCheck.reasons.length);
  assert.equal(await createMatch(fake, await person({ name: 'X', gender: 'woman', interestedIn: ['man'], ...normal })), null, 'held can’t match');

  assert.equal(await releaseProfile(fake), 'active', 'admin release');
  assert.equal(await settleStatus(fake), 'active', 'stays released while the profile is unchanged');

  const ok = await person({ name: 'Meera', gender: 'woman', interestedIn: ['man'], status: 'active', ...normal });
  assert.equal(await settleStatus(ok), 'active');
  assert.equal((await Profile.findOne({ userId: ok }).lean()).selfCheck.level, 'low');
});

test('photo moderation is decided in code', () => {
  const clean = { personVisible: true, faceCount: 1, nudity: false, violence: false, mostlyText: false, contactDetails: false, qrCode: false, socialHandle: false };
  assert.deepEqual(decidePhoto(clean, { first: true }), { status: 'ok', reasons: [] });
  assert.equal(decidePhoto({ ...clean, contactDetails: true }, { first: false }).status, 'rejected');
  assert.equal(decidePhoto({ ...clean, qrCode: true }, { first: false }).status, 'rejected');
  assert.equal(decidePhoto({ ...clean, mostlyText: true, personVisible: false }, { first: false }).status, 'rejected');
  assert.equal(decidePhoto({ ...clean, personVisible: false }, { first: false }).status, 'ok', 'a landscape is fine after photo 1');
  assert.equal(decidePhoto({ ...clean, personVisible: false }, { first: true }).status, 'rejected');
});
