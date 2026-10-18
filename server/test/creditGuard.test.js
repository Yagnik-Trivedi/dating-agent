// Plan 12 §7, no LLM. Credit guard: a daily live-chat cap per non-seed user (over it → 'scheduled', started the next
// day by a job), seeds exempt from the per-user LLM cap, fast pacing only when asked for. Judge demo: a frozen match
// gets no agent turn until its user opens it (thaw).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { env } from '../src/config/env.js';
import { Conversation } from '../src/models/Conversation.js';
import { Job } from '../src/models/Job.js';
import { Match } from '../src/models/Match.js';
import { User } from '../src/models/User.js';
import { Message } from '../src/models/Message.js';
import { resumeConversations, thaw } from '../src/services/agent/index.js';
import { paceMs } from '../src/services/agent/scheduler.js';
import { checkBudget, flushUsage, recordUsage, refresh } from '../src/services/llm/budget.js';
import { overDailyChats, runScheduledChat } from '../src/services/pipeline/index.js';
import { start, stop } from '../scripts/lib/testDb.js';

before(start);
after(stop);

const user = (email, extra = {}) => User.create({ email, passwordHash: 'x', name: email, consentAgent: true, consentAt: new Date(), agentMode: 'off', ...extra });
const matchOf = (a, b) => Match.create({ users: [a._id, b._id], pairKey: `${a._id}_${b._id}`, status: 'briefing', perUser: [a, b].map((u) => ({ userId: u._id, name: u.name, agentActive: true })) });

test('a real user over JUDGE_LIVE_CHATS_PER_DAY waits for the next day; seeds never count', async () => {
  const [judge, seed1, seed2, seed3] = await Promise.all([user('j@t.local'), user('s1@t.local', { isSeed: true }), user('s2@t.local', { isSeed: true }), user('s3@t.local', { isSeed: true })]);
  for (const s of [seed1, seed2]) await Conversation.create({ matchId: (await matchOf(judge, s))._id, seed: 1 }); // 2 chats today
  const third = await matchOf(judge, seed3);
  assert.equal(env.JUDGE_LIVE_CHATS_PER_DAY, 2);
  assert.equal(await overDailyChats(third), true);
  assert.equal(await overDailyChats(await matchOf(seed1, seed3)), false, 'seed ↔ seed: no cap');

  // The startChat job: still over the cap → another day; a day later (yesterday's chats) → it starts.
  await Match.updateOne({ _id: third._id }, { $set: { status: 'scheduled' } });
  await runScheduledChat({ matchId: third._id });
  assert.ok(await Job.exists({ type: 'startChat', dedupeKey: `startChat:${third._id}` }));
  assert.equal((await Match.findById(third._id).lean()).status, 'scheduled');
  await Conversation.updateMany({}, { $set: { startedAt: new Date(Date.now() - 86_400_000) } });
  await runScheduledChat({ matchId: third._id });
  assert.equal((await Match.findById(third._id).lean()).status, 'agent_chatting');
  assert.equal(await Conversation.countDocuments({ matchId: third._id }), 1);
});

test('seed accounts skip the per-user LLM cap; real users hit it', async () => {
  const saved = { LLM_ENABLED: env.LLM_ENABLED, LLM_DAILY_CALLS_PER_USER: env.LLM_DAILY_CALLS_PER_USER };
  Object.assign(env, { LLM_ENABLED: true, LLM_DAILY_CALLS_PER_USER: 1 });
  try {
    const [real, seed] = await Promise.all([user('r@t.local'), user('s9@t.local', { isSeed: true })]);
    for (const u of [real, seed]) recordUsage({ purpose: 'test', tier: 'fast', model: 'm', userId: u._id, promptTokens: 1, completionTokens: 1, latencyMs: 1, ok: true });
    await flushUsage();
    await refresh({ force: true });
    await assert.rejects(checkBudget({ tier: 'fast', userId: real._id }), (e) => e.code === 'BUDGET_EXCEEDED');
    await checkBudget({ tier: 'fast', userId: seed._id });
  } finally {
    Object.assign(env, saved);
  }
});

test('typing delays: fast only when asked for', () => {
  const long = 'word '.repeat(40);
  assert.ok(paceMs(long, true) >= 800 && paceMs(long, true) <= 3000, 'fast: 0.8–3 s');
  assert.ok(paceMs(long, false) >= Math.min(env.AGENT_MIN_DELAY_MS + 40 * 350, env.AGENT_MAX_DELAY_MS), 'normal: human-like');
});

test('a frozen judge demo match: no sweep resumes it; opening it queues a reply from the side that did not speak last', async () => {
  const [judge, seed] = await Promise.all([user('j2@t.local', { isJudge: true }), user('s8@t.local', { isSeed: true })]);
  const m = await matchOf(judge, seed);
  await Match.updateOne({ _id: m._id }, { $set: { status: 'agent_chatting', 'agentState.frozen': true } });
  await Message.create({ matchId: m._id, senderId: seed._id, authoredBy: 'agent', text: 'so what do you do on weekends?', createdAt: new Date(Date.now() - 3_600_000) });
  await Job.deleteMany({ type: 'agentTurn' });
  await resumeConversations();
  assert.equal(await Job.countDocuments({ type: 'agentTurn' }), 0, 'the sweep leaves it frozen');
  await thaw(await Match.findById(m._id));
  assert.equal((await Match.findById(m._id).lean()).agentState.frozen, undefined);
  assert.deepEqual((await Job.find({ type: 'agentTurn' }).lean()).map((j) => j.payload.userId), [String(judge._id)]);
});
