// Deleting an account (DELETE /me and scripts/delete-demo-accounts.js share services/account.js): everything about the
// user goes; a match with someone still here is closed and anonymised; a match nobody is left in goes entirely.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { Conversation } from '../src/models/Conversation.js';
import { Job } from '../src/models/Job.js';
import { KgFact } from '../src/models/KgFact.js';
import { Match } from '../src/models/Match.js';
import { Message } from '../src/models/Message.js';
import { Profile } from '../src/models/Profile.js';
import { User } from '../src/models/User.js';
import { deleteAccount } from '../src/services/account.js';
import { start, stop } from '../scripts/lib/testDb.js';

before(start);
after(stop);

const user = (email, o = {}) => User.create({ email, passwordHash: 'x', name: email.split('@')[0], consentAgent: true, consentAt: new Date(), ...o });
const match = (a, b, status) => Match.create({ users: [a._id, b._id], pairKey: `${a._id}_${b._id}`, status, perUser: [{ userId: a._id, name: a.name, agentActive: true }, { userId: b._id, name: b.name, agentActive: true }] });

test('demo accounts go with their data; a real user keeps a closed, anonymised match', async () => {
  const [seedA, seedB, real] = [await user('seed01@demo.local', { isSeed: true }), await user('seed02@demo.local', { isSeed: true }), await user('asha@example.com')];
  await Profile.create([{ userId: seedA._id, name: 'Meera' }, { userId: seedB._id, name: 'Kabir' }, { userId: real._id, name: 'Asha' }]);
  const demoMatch = await match(seedA, seedB, 'agent_chatting');
  const realMatch = await match(seedA, real, 'agent_chatting');
  await Conversation.create({ matchId: demoMatch._id, seed: 1 });
  await Message.create([{ matchId: demoMatch._id, senderId: seedA._id, authoredBy: 'agent', text: 'hi' }, { matchId: realMatch._id, senderId: seedA._id, authoredBy: 'agent', text: 'hey' }, { matchId: realMatch._id, senderId: real._id, authoredBy: 'human', text: 'hello' }]);
  await KgFact.create({ subjectId: seedA._id, observerId: null, predicate: 'likes', object: 'trekking', source: 'questionnaire_choice' });
  await Job.create({ type: 'agentTurn', payload: { matchId: String(demoMatch._id), userId: String(seedA._id) }, runAt: new Date(Date.now() + 60_000) });

  for (const u of [seedA, seedB]) await deleteAccount(u._id);

  assert.equal(await User.countDocuments(), 1);
  assert.equal(await Profile.countDocuments(), 1);
  assert.equal(await KgFact.countDocuments({ subjectId: seedA._id }), 0);
  assert.equal(await Match.exists({ _id: demoMatch._id }), null, 'nobody is left in the demo-only match');
  assert.equal(await Conversation.countDocuments({ matchId: demoMatch._id }), 0);
  assert.equal(await Job.countDocuments({ status: 'queued', 'payload.matchId': String(demoMatch._id) }), 0, 'its queued agent turn is gone');
  const kept = await Match.findById(realMatch._id).lean();
  assert.equal(kept.status, 'closed');
  assert.equal(kept.perUser.find((p) => String(p.userId) === String(seedA._id)).name, 'Deleted user');
  assert.deepEqual((await Message.find({ matchId: realMatch._id }).lean()).map((m) => m.text), ['hello'], "the real user's own words stay; the demo side's go");
});
