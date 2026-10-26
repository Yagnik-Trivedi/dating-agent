// UX P0-5 "Try a demo match": only a demo persona from my own deck (gate both ways, same city), never a scam persona,
// never one I already liked or matched; it creates the mutual like and the match. No LLM.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Like } from '../src/models/Like.js';
import { Match } from '../src/models/Match.js';
import { Profile } from '../src/models/Profile.js';
import { User } from '../src/models/User.js';
import { pickDemoPersona, startDemoMatch } from '../src/services/demo.js';
import { buildGate } from '../src/services/match/gate.js';
import { start, stop } from '../scripts/lib/testDb.js';

before(start);
after(stop);

let n = 0;
async function person({ name, gender, city = 'Ahmedabad', seed = false, email }) {
  const u = await User.create({ email: email ?? `dm${++n}@t.local`, passwordHash: 'x', name, consentAgent: true, consentAt: new Date(), isSeed: seed, agentMode: 'auto' });
  await Profile.create({ userId: u._id, name, age: 27, city, gender, interestedIn: [gender === 'man' ? 'woman' : 'man'], ...(seed && { demo: true }) });
  await buildGate(u._id);
  return u._id;
}

test('a demo persona comes from my deck and never a scam persona; starting it makes a match', async () => {
  const me = await person({ name: 'Riya', gender: 'woman' });
  await person({ name: 'ScamGuy', gender: 'man', seed: true, email: 'seed28@demo.local' }); // a "fake:" persona in seed/personas.json
  await person({ name: 'Elsewhere', gender: 'man', seed: true, city: 'Mumbai' }); // not in my city
  await person({ name: 'RealUser', gender: 'man' }); // in my deck but not a demo persona
  assert.equal(await pickDemoPersona(me), null, 'nothing fits yet');

  const kabir = await person({ name: 'Kabir', gender: 'man', seed: true });
  assert.equal(String(await pickDemoPersona(me)), String(kabir));

  const match = await startDemoMatch(me);
  assert.deepEqual(match.users.map(String).sort(), [String(me), String(kabir)].sort());
  assert.equal(await Like.countDocuments({ $or: [{ fromUserId: me, toUserId: kabir }, { fromUserId: kabir, toUserId: me }], liked: true }), 2);
  assert.equal(await pickDemoPersona(me), null, 'an already matched persona is not offered again');
  assert.equal(await Match.countDocuments({ users: me }), 1);
});
