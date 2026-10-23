// Plan 33 C1 (A5): the session lifecycle on an ephemeral replica set, with the LLM switched off (summary and evidence
// passes fail gracefully): close → goodbye → gap → next session → … → the verdict after the last session.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Conversation } from '../src/models/Conversation.js';
import { Job } from '../src/models/Job.js';
import { Match } from '../src/models/Match.js';
import { Message } from '../src/models/Message.js';
import { endSession, markClosing, runSessionEnd, startNextSession } from '../src/services/agent/sessionFlow.js';
import { newSession } from '../src/services/conversation/sessions.js';
import { start, stop } from '../scripts/lib/testDb.js';

const oid = () => new mongoose.Types.ObjectId();
before(async () => { await start(); env.LLM_ENABLED = false; });
after(stop);

async function setup() {
  const [a, b] = [oid(), oid()];
  const match = await Match.create({ users: [a, b], pairKey: `${a}_${b}`, status: 'agent_chatting', perUser: [{ userId: a, name: 'Meera', agentActive: true }, { userId: b, name: 'Ishaan', agentActive: true }] });
  const conv = await Conversation.create({ matchId: match._id, seed: 42, depth: 'demo', sessionIndex: 1, phase: 'chatting', sessions: [newSession({ seed: 42, depth: 'demo', n: 1, startCount: 0 })], agentState: { [a]: { interest: 0.7 }, [b]: { interest: 0.4 } } });
  const say = (who, text) => Message.create({ matchId: match._id, senderId: who, authoredBy: 'agent', text });
  return { a, b, match, conv, say };
}

test('a session closes, ends once, and the next one starts after the gap; the last one goes to the verdict', async () => {
  const { a, b, match, conv, say } = await setup();
  for (let i = 0; i < 14; i++) await say(i % 2 ? b : a, `message ${i}`);
  assert.equal(await markClosing(conv._id, 1, a), true);
  assert.equal(await markClosing(conv._id, 1, b), false, 'only one close per session');
  await say(a, 'ok i need to sleep, talk tomorrow?');
  await say(b, 'haha night!');
  assert.equal(await endSession(conv._id, 1), true);
  assert.equal(await endSession(conv._id, 1), false, 'ends once');
  let c = await Conversation.findById(conv._id).lean();
  assert.equal(c.phase, 'gap');
  assert.deepEqual(c.sessions[0].interestEnd, { [a]: 0.7, [b]: 0.4 });
  assert.equal(await Job.countDocuments({ type: 'sessionEnd' }), 1);

  await runSessionEnd({ conversationId: conv._id, n: 1 });
  c = await Conversation.findById(conv._id).lean();
  assert.ok(c.nextSessionAt > Date.now(), 'the next session waits for the gap');
  assert.equal(typeof c.sessions[0].tokens, 'number');
  assert.equal((await Job.findOne({ type: 'nextSession' }).lean()).payload.n, 2);

  await startNextSession({ conversationId: conv._id, n: 2 });
  c = await Conversation.findById(conv._id).lean();
  assert.deepEqual([c.sessionIndex, c.phase, c.sessions[1].startCount, c.sessions[1].target], [2, 'chatting', 16, 32]);
  assert.equal(await Job.countDocuments({ type: 'agentTurn' }), 1, 'one agent opens the session');
  assert.deepEqual((await startNextSession({ conversationId: conv._id, n: 2 })), { skipped: true }, 'starts once');

  // Sessions 2 and 3 end without a yes or a no (no evidence: the LLM is off) → after the last one, the verdict.
  for (const n of [2, 3]) {
    if (n === 3) await startNextSession({ conversationId: conv._id, n: 3 });
    await endSession(conv._id, n);
    await runSessionEnd({ conversationId: conv._id, n });
  }
  c = await Conversation.findById(conv._id).lean();
  assert.deepEqual([c.status, c.endedBy, c.sessions.length], ['ended', 'sessions_done', 3]);
  assert.equal((await Match.findById(match._id).lean()).status, 'evaluating');
});
