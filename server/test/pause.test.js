// Pause / Resume (owner's design, plan 10): pause turns my agent off in one match; resume turns it back on and replies
// if it's my turn; neither works after Take over or a decision. No LLM.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Job } from '../src/models/Job.js';
import { Match } from '../src/models/Match.js';
import { Message } from '../src/models/Message.js';
import { User } from '../src/models/User.js';
import { pauseAgent, resumeAgent } from '../src/services/agent/index.js';
import { matchDetail } from '../src/services/matches.js';
import { start, stop } from '../scripts/lib/testDb.js';

before(start);
after(stop);

test('pause → resume → my agent answers their last message; after Take over nothing comes back', async () => {
  const [me, them] = await User.create(['p1', 'p2'].map((n) => ({ email: `${n}@t.local`, passwordHash: 'x', name: n, consentAgent: true, consentAt: new Date(), agentMode: 'auto' })));
  const m = await Match.create({ users: [me._id, them._id], pairKey: `${me._id}_${them._id}`, status: 'agent_chatting', perUser: [me, them].map((u) => ({ userId: u._id, name: u.name, agentActive: true })) });
  await Message.create({ matchId: m._id, senderId: them._id, authoredBy: 'agent', text: 'so what do you do on sundays?' });

  const paused = await pauseAgent(m._id, me._id);
  assert.equal(paused.perUser.find((p) => String(p.userId) === String(me._id)).agentActive, false);
  assert.equal((await matchDetail(paused, me._id)).paused, true);
  assert.equal(await pauseAgent(m._id, me._id), null, 'already paused');

  await Job.deleteMany({ type: 'agentTurn' });
  const resumed = await resumeAgent(m._id, me._id);
  assert.equal((await matchDetail(resumed, me._id)).paused, false);
  assert.deepEqual((await Job.find({ type: 'agentTurn' }).lean()).map((j) => j.payload.userId), [String(me._id)], 'my turn → my agent replies');

  await pauseAgent(m._id, me._id);
  await Match.updateOne({ _id: m._id, 'perUser.userId': me._id }, { $set: { 'perUser.$.tookOverAt': new Date() } });
  assert.equal(await resumeAgent(m._id, me._id), null, 'Take over is final');
});
