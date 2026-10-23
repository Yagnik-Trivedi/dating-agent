// Plan 33 A9 (the rows C1 can measure): sessions, the high bar's yes decisions, repeated questions across sessions,
// fillers vs the user's own rate and hedges on loose facts. No LLM, no DB.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionMetrics } from '../scripts/eval/lib/sessionMetrics.js';

const A = 'a', B = 'b';
const msg = (senderId, text, o = {}) => ({ senderId, text, authoredBy: 'agent', actPlan: { move: o.move ?? 'react' }, checks: { texture: { used: o.used ?? [], stripped: o.stripped ?? [], hedge: o.hedge ?? { loose: 0, hedged: 0 } } } });
const messages = [
  msg(A, 'what kind of music do you listen to?', { move: 'ask_theirs' }), msg(B, 'hmm mostly indie, you?', { used: ['hmm'] }),
  msg(A, 'same haha', { used: ['haha'] }), msg(B, 'i think astrology is kinda fun', { hedge: { loose: 1, hedged: 1 }, used: ['i think', 'kinda'] }),
  msg(A, 'hey! how did the exam go?', { move: 'callback' }), msg(B, 'so good! hmm what about you', { used: ['hmm'] }),
  msg(A, 'so what music are you into?'), msg(B, 'astrology is fun', { hedge: { loose: 1, hedged: 0 }, stripped: ['lol'] }),
];
const conv = {
  sessions: [{ n: 1, startCount: 0, tokens: 1000 }, { n: 2, startCount: 4, tokens: 1500 }],
  ledger: { [A]: { positives: [{ theirs: true, tier: 'deep' }, { theirs: true, tier: 'deep' }, { theirs: true, tier: 'personal' }] }, [B]: { positives: [{ theirs: true, tier: 'surface' }, { theirs: true, tier: 'surface' }] } },
};
const decisions = [{ userId: A, decision: 'yes' }, { userId: B, decision: 'yes' }];

test('sessions, question rate and tokens per session; yes decisions checked against their tiers', () => {
  const m = sessionMetrics({ messages, conv, decisions, voices: { [A]: { fillers: {} }, [B]: { fillers: { hmm: 0.3, 'i think': 0.2 } } } });
  assert.deepEqual([m.messages, m.sessions, m.tokens], [8, 2, 2500]);
  assert.deepEqual(m.perSession.map((s) => [s.n, s.messages, s.questionRate]), [[1, 4, 0.5], [2, 4, 0.5]]);
  assert.deepEqual([m.yes, m.yesSurfaceOnly, m.yesDeep2], [2, 1, 1], "B's yes rests on surface likes only");
  assert.equal(m.repeats, 1, '"what music are you into?" in session 2 repeats session 1');
  assert.deepEqual(m.hedge, { loose: 2, hedged: 1, rate: 0.5 });
  assert.deepEqual(m.fillers[B], { perMessage: 1, ownRate: 0.5, ratio: 2, foreignStripped: 1 });
  assert.equal(m.fillers[A].perMessage, 0, 'laughs are not fillers');
  assert.equal(m.moves.callback, 1);
});
