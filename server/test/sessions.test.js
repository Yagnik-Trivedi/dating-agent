// Plan 33 C1 (A5): long chats in sessions. Depth choice, session length, limits for planAct and the room's indicator.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { env } from '../src/config/env.js';
import { KG } from '../src/services/kg/config.js';
import { chatDepth, gapMs, hardCap, newSession, sessionInfo, sessionLimits, sessionsMax, unlockedTier } from '../src/services/conversation/sessions.js';

const withEnv = (patch, fn) => { const old = { ...env }; Object.assign(env, patch); try { return fn(); } finally { Object.assign(env, old); } };

test('depth: CHAT_DEPTH wins; unset → demo with a seed or judge account, full otherwise; RULES=off → short', () => {
  withEnv({ CHAT_DEPTH: undefined, RULES: 'on' }, () => {
    assert.equal(chatDepth([{}, {}]), 'full');
    assert.equal(chatDepth([{ isSeed: true }, {}]), 'demo');
    assert.equal(chatDepth([{}, { isJudge: true }]), 'demo');
  });
  withEnv({ CHAT_DEPTH: 'short', RULES: 'on' }, () => assert.equal(chatDepth([{ isSeed: true }]), 'short'));
  withEnv({ CHAT_DEPTH: 'full', RULES: 'off' }, () => assert.equal(chatDepth([{}]), 'short'));
});

test('a session is 50–60 messages in full and demo, seeded; the gap is in range', () => {
  const lengths = Array.from({ length: 100 }, (_, i) => newSession({ seed: i, depth: 'full', n: 1, startCount: 10 }).target - 10);
  assert.ok(lengths.every((l) => l >= 50 && l <= 60));
  assert.ok(new Set(lengths).size > 3, 'lengths vary');
  assert.equal(newSession({ seed: 7, depth: 'full', n: 2, startCount: 0 }).target, newSession({ seed: 7, depth: 'full', n: 2, startCount: 0 }).target, 'replayable');
  const demo = newSession({ seed: 7, depth: 'demo', n: 1, startCount: 0 }).target;
  assert.ok(demo >= 50 && demo <= 60);
  const [lo, hi] = KG.CHAT_DEPTHS.full.gapMs;
  for (let s = 0; s < 50; s++) { const g = gapMs({ seed: s, depth: 'full', n: 2 }); assert.ok(g >= lo && g <= hi); }
  assert.ok(gapMs({ seed: 1, depth: 'demo', n: 2 }) <= 75_000);
});

test('limits: the close leaves room for their goodbye; a natural close never before the minimum', () => {
  const conv = { depth: 'full', sessions: [{ n: 1, startCount: 0, target: 55 }] };
  assert.deepEqual(sessionLimits(conv), { maxMessages: 54, naturalEndFrom: 50 });
  assert.deepEqual(sessionLimits(conv, { otherAgent: false }), { maxMessages: 55, naturalEndFrom: 51 });
  const early = { depth: 'demo', sessions: [{ n: 2, startCount: 55, target: 107 }] };
  assert.deepEqual(sessionLimits(early), { maxMessages: 106, naturalEndFrom: 103 }, 'a natural close never before the 50-message minimum');
  assert.equal(hardCap({ depth: 'full' }), 5 * 60 + 4);
  assert.equal(sessionsMax({ depth: 'demo', extraSessions: 1 }), 5);
});

test('unlocked tier per session, and the room indicator', () => {
  assert.deepEqual([1, 2, 3, 5].map(unlockedTier), ['surface', 'personal', 'deep', 'deep']);
  assert.equal(sessionInfo({ depth: 'short' }), null);
  const at = new Date();
  assert.deepEqual(sessionInfo({ depth: 'full', sessionIndex: 2, phase: 'gap', nextSessionAt: at, sessions: [{ n: 1, startCount: 0 }, { n: 2, startCount: 18 }] }), { depth: 'full', n: 2, of: 5, phase: 'gap', nextSessionAt: at, starts: [18] });
});

test('session plan: their "talk tomorrow?" → my goodbye; any end but a dealbreaker closes the session; a later session opens with a callback', async () => {
  const { sessionPlan } = await import('../src/services/conversation/sessions.js');
  const them = 'u2';
  const conv = { depth: 'demo', sessions: [{ n: 1, endedAt: new Date(1000), threads: [{ about: them, text: 'her exam on Friday' }, { about: 'u1', text: 'my trip' }] }, { n: 2, startCount: 16, target: 32 }] };
  assert.deepEqual(sessionPlan({ move: 'react', askBack: true }, { conv, otherId: them, goodbye: true }), { session: 2, end: 'session_ack', move: 'close', topic: null, askBack: false });
  for (const end of ['max_turns', 'natural', 'interest']) assert.equal(sessionPlan({ end }, { conv, otherId: them }).end, 'session');
  assert.equal(sessionPlan({ end: 'dealbreaker_hint' }, { conv, otherId: them }).end, 'dealbreaker_hint', 'a dealbreaker still ends the whole chat');
  const cb = sessionPlan({ move: 'react' }, { conv, otherId: them, sessionStart: true, theirMsgs: [{ createdAt: new Date(500) }] });
  assert.deepEqual([cb.move, cb.callback, cb.callbackReply, cb.askBack], ['callback', 'her exam on Friday', false, true]);
  assert.equal(sessionPlan({ move: 'react' }, { conv, otherId: them, sessionStart: true, theirMsgs: [{ createdAt: new Date(2000) }] }).callbackReply, true, 'they wrote during the gap');
});
