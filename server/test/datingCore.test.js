// Plan 30 S3: a like comment opens the chat and the other agent answers it; "Chat myself now" makes a human chat;
// block hides both people everywhere and closes the match; unmatch hides the match for both. No LLM.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Job } from '../src/models/Job.js';
import { Like } from '../src/models/Like.js';
import { Match } from '../src/models/Match.js';
import { Message } from '../src/models/Message.js';
import { Profile } from '../src/models/Profile.js';
import { User } from '../src/models/User.js';
import { startConversation } from '../src/services/agent/index.js';
import { buildGate, discoverQuery } from '../src/services/match/gate.js';
import { createMatch, getMatchFor } from '../src/services/matches.js';
import { startHumanChat } from '../src/services/pipeline/index.js';
import { block, blockedIds, unmatch } from '../src/services/safety.js';
import { start, stop } from '../scripts/lib/testDb.js';

before(start);
after(stop);

let n = 0;
async function person(name, gender, agentMode = 'auto') {
  const u = await User.create({ email: `dc${++n}@t.local`, passwordHash: 'x', name, consentAgent: true, consentAt: new Date(), agentMode });
  await Profile.create({ userId: u._id, name, age: 28, city: 'Pune', gender, interestedIn: [gender === 'man' ? 'woman' : 'man'] });
  await buildGate(u._id);
  return u._id;
}
const deck = async (id) => {
  const gate = (await Profile.findOne({ userId: id }).lean()).gate;
  return (await Profile.find(discoverQuery(gate, [id, ...await blockedIds(id)])).lean()).map((p) => String(p.userId));
};

test('a like comment is the first message; the other side’s agent replies to it first', async () => {
  const [a, b] = [await person('Asha', 'woman'), await person('Bilal', 'man')];
  await Like.create([
    { fromUserId: a, toUserId: b, liked: true, target: { kind: 'prompt', ref: 'My Sundays look like' }, comment: 'Which dosa place though?' },
    { fromUserId: b, toUserId: a, liked: true },
  ]);
  const match = await createMatch(b, a);
  const msgs = await Message.find({ matchId: match._id }).lean();
  assert.deepEqual(msgs.map((m) => [String(m.senderId), m.text, m.like?.ref]), [[String(a), 'Which dosa place though?', 'My Sundays look like']]);
  assert.deepEqual(match.perUser.map((p) => p.choice), ['agents', 'agents']);

  await Job.deleteMany({ type: 'agentTurn' });
  await startConversation(match);
  assert.deepEqual((await Job.find({ type: 'agentTurn' }).lean()).map((j) => j.payload.userId), [String(b)]);
});

test('Chat myself: agent mode off defaults to self; startHumanChat stops both agents', async () => {
  const [a, b] = [await person('Chitra', 'woman', 'off'), await person('Dev', 'man')];
  await Like.create([{ fromUserId: a, toUserId: b, liked: true }, { fromUserId: b, toUserId: a, liked: true }]);
  const match = await createMatch(a, b);
  assert.equal(match.perUser.find((p) => String(p.userId) === String(a)).choice, 'self');
  await Match.updateOne({ _id: match._id }, { $set: { status: 'agent_chatting' } });
  const chat = await startHumanChat(match);
  assert.equal(chat.status, 'handed_off');
  assert.ok(chat.perUser.every((p) => !p.agentActive));
  assert.equal(await startHumanChat(chat), null, 'only once');
});

test('block hides both people everywhere and closes the match; unmatch hides the match', async () => {
  const [a, b, c] = [await person('Esha', 'woman'), await person('Farhan', 'man'), await person('Gaurav', 'man')];
  assert.ok((await deck(a)).includes(String(b)));
  await Like.create([{ fromUserId: a, toUserId: b, liked: true }, { fromUserId: b, toUserId: a, liked: true }]);
  const match = await createMatch(a, b);
  await block(b, a);
  assert.ok(!(await deck(a)).includes(String(b)), 'hidden for the blocked side');
  assert.ok(!(await deck(b)).includes(String(a)), 'and for the blocker');
  const closed = await Match.findById(match._id).lean();
  assert.deepEqual([closed.status, closed.closedReason], ['closed', 'blocked']);
  await assert.rejects(getMatchFor(match._id, a), /not found/i, 'the match disappears');
  assert.equal(await Like.countDocuments({ fromUserId: a, toUserId: b }), 0, 'their like is gone from Likes you');

  await Like.create([{ fromUserId: a, toUserId: c, liked: true }, { fromUserId: c, toUserId: a, liked: true }]);
  const m2 = await createMatch(a, c);
  await unmatch(c, a);
  await assert.rejects(getMatchFor(m2._id, a), /not found/i);
  await assert.rejects(getMatchFor(m2._id, c), /not found/i);
});
