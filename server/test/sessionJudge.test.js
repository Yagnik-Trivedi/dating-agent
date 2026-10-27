// Plan 33 C1 (A7): the session judge on an ephemeral replica set. Evidence in the ledger (as the per-session passes
// leave it) → code decides at each session's end; a yes from both ends the chat and the verdict is written from the
// ledger with no model call; two low-interest sessions are a no. DB spy: the judge never reads the other user.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Conversation } from '../src/models/Conversation.js';
import { KgFact } from '../src/models/KgFact.js';
import { Match } from '../src/models/Match.js';
import { MatchDecision } from '../src/models/MatchDecision.js';
import { Message } from '../src/models/Message.js';
import { Profile } from '../src/models/Profile.js';
import { runSessionEnd } from '../src/services/agent/sessionFlow.js';
import { judgeSide } from '../src/services/conversation/judge.js';
import { sessionDecision } from '../src/services/conversation/sessionJudge.js';
import { settle } from '../src/services/compat/index.js';
import { readsOfOther, startSpy, stopSpy } from '../scripts/lib/dbSpy.js';
import { start, stop } from '../scripts/lib/testDb.js';

const oid = () => new mongoose.Types.ObjectId();
before(async () => { await start(); env.LLM_ENABLED = false; });
after(stop);

const FACTS = [
  { predicate: 'likes', object: 'filter coffee', strength: 0.9 },
  { predicate: 'likes', object: 'thrillers', strength: 0.8 },
  { predicate: 'story', object: 'stuck at Hampta Pass camp in the rain', evidence: [{ sourceRef: { kind: 'answer', id: 'C.place' } }] },
  { predicate: 'story', object: 'my friends rely on me for advice', evidence: [{ sourceRef: { kind: 'answer', id: 'C.friends_rely' } }] },
  { predicate: 'story', object: 'slow Sunday breakfasts with my sister', evidence: [{ sourceRef: { kind: 'answer', id: 'C.sunday' } }] },
  { predicate: 'goal', attribute: 'kids', value: 'yes', object: 'wants children: yes', importance: 0.9 },
  { predicate: 'goal', attribute: 'location', value: 'same_city', object: 'living in 3-5 years: same city', importance: 0.6 },
  { predicate: 'values', attribute: 'conflict', value: 'talk', object: 'conflict: talk it out', importance: 0.6 },
];

/** A demo chat of 4 ended sessions (120 messages: questions and laughs on both sides), my facts, and a ledger per side. */
async function setup({ interest = 0.7, positivesFor = 'both' } = {}) {
  const [a, b] = [oid(), oid()];
  const match = await Match.create({ users: [a, b], pairKey: `${a}_${b}`, status: 'agent_chatting', perUser: [{ userId: a, name: 'Meera', agentActive: true }, { userId: b, name: 'Ishaan', agentActive: true }] });
  await Profile.create([{ userId: a, name: 'Meera' }, { userId: b, name: 'Ishaan' }]);
  const msgs = [];
  for (let i = 0; i < 120; i++) msgs.push(await Message.create({ matchId: match._id, senderId: i % 2 ? b : a, authoredBy: 'agent', text: i % 6 === 0 ? 'haha what was the best part?' : i % 6 === 1 ? 'haha the view, honestly. what about you?' : 'that sounds really lovely, tell me more about it' }));
  const ledgerFor = async (me, them) => {
    const facts = await KgFact.insertMany(FACTS.map((f) => ({ ...f, subjectId: me, observerId: null, source: 'questionnaire_choice' })));
    const theirMsgs = msgs.filter((m) => String(m.senderId) === String(them));
    const positives = facts.map((f, i) => ({ quote: 'the view', why: 'w', messageId: String(theirMsgs[i]._id), factId: String(f._id), theirs: true }));
    return { passes: [1, 2, 3, 4], positives, frictions: [], dealbreakerRisk: [], inconsistencies: [], summaryForUser: 'You two clicked on treks and Sundays.' };
  };
  const empty = { passes: [1, 2, 3, 4], positives: [], frictions: [], dealbreakerRisk: [], inconsistencies: [], summaryForUser: 'A friendly chat.' };
  const ledger = { [a]: await ledgerFor(a, b), [b]: positivesFor === 'both' ? await ledgerFor(b, a) : empty };
  const ends = (n) => ({ [a]: interest, [b]: interest });
  const at = (i) => msgs[i].createdAt;
  const conv = await Conversation.create({
    matchId: match._id, seed: 7, depth: 'demo', sessionIndex: 4, phase: 'gap', ledger, agentState: { [a]: {}, [b]: {} },
    sessions: [0, 30, 60, 90].map((startCount, i) => ({ n: i + 1, startedAt: at(startCount), startCount, target: startCount + 30, endedAt: at(startCount + 29), summary: '', threads: [], interestEnd: ends(i) })),
  });
  return { a, b, match, conv };
}

test('a yes from both after the last session ends the chat; the verdict comes from the ledger with no model call', async () => {
  const { a, b, match, conv } = await setup();
  const mine = await sessionDecision(conv._id, a);
  assert.equal(mine.decision, 'yes', mine.reason);
  assert.deepEqual([mine.bar.sessions, mine.bar.messages, mine.bar.chemistry.ok], [4, 120, true]);
  await runSessionEnd({ conversationId: conv._id, n: 4 });
  const c = await Conversation.findById(conv._id).lean();
  assert.deepEqual([c.status, c.endedBy, c.sessions[3].decisions[a].decision], ['ended', 'judge_yes', 'yes']);
  assert.equal((await Match.findById(match._id).lean()).status, 'evaluating');

  const records = startSpy();
  for (const u of [a, b]) await judgeSide({ conversationId: conv._id, userId: u });
  stopSpy();
  assert.deepEqual(readsOfOther(records, 'judge'), [], 'the judge never reads the other user');
  const d = await MatchDecision.findOne({ conversationId: conv._id, userId: a }).lean();
  assert.deepEqual([d.decision, d.positives.length, d.judgeModel], ['yes', 8, null]);
  assert.match(d.validation.reason, /8 positives/);
  assert.equal(await settle(match._id, conv._id), 'compatible');
});

test('one side without enough evidence → Maybe after the last session, with what is still unknown', async () => {
  const { a, b, conv } = await setup({ positivesFor: 'a' });
  await runSessionEnd({ conversationId: conv._id, n: 4 });
  const c = await Conversation.findById(conv._id).lean();
  assert.deepEqual([c.endedBy, c.sessions[3].decisions[b].decision], ['sessions_done', 'unsure']);
  await judgeSide({ conversationId: conv._id, userId: b });
  const d = await MatchDecision.findOne({ conversationId: conv._id, userId: b }).lean();
  assert.equal(d.decision, 'unsure');
  assert.match(d.summaryForUser, /Still to find out: .*more real things in common/);
  assert.equal(d.positives.length, 0);
  assert.ok(a);
});

test('two sessions ending with low interest are a no, at once', async () => {
  const { a, conv } = await setup({ interest: 0.2 });
  const d = await sessionDecision(conv._id, a);
  assert.equal(d.decision, 'no');
  await runSessionEnd({ conversationId: conv._id, n: 4 });
  assert.equal((await Conversation.findById(conv._id).lean()).endedBy, 'judge_no');
});
