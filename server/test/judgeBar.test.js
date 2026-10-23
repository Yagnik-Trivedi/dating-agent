// Plan 33 C1 (A7): the high bar for a match (full / demo). Coffee alone can never make a match; a yes needs evidence
// across a life, at depth, after enough chatting, with chemistry. CHAT_DEPTH=short keeps today's decision exactly.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KG } from '../src/services/kg/config.js';
import { decideFor, judgeDecision } from '../src/services/conversation/judgeDecision.js';

// My facts: surface likes (coffee, films, food, music), personal (stories), deep (kids, location, conflict) + a dealbreaker.
const facts = new Map([
  ['coffee', { predicate: 'likes', object: 'filter coffee', strength: 0.9 }],
  ['films', { predicate: 'likes', object: 'thrillers', strength: 0.8 }],
  ['biryani', { predicate: 'likes', object: 'biryani', strength: 0.8 }],
  ['indie', { predicate: 'likes', object: 'indie music', strength: 0.7 }],
  ['trek', { predicate: 'story', object: 'stuck at Hampta Pass camp in the rain', evidence: [{ sourceRef: { kind: 'answer', id: 'C.place' } }] }],
  ['friends', { predicate: 'story', object: 'my friends rely on me for advice', evidence: [{ sourceRef: { kind: 'answer', id: 'C.friends_rely' } }] }],
  ['sunday', { predicate: 'story', object: 'slow Sunday breakfasts with my sister', evidence: [{ sourceRef: { kind: 'answer', id: 'C.sunday' } }] }],
  ['smoking', { predicate: 'lifestyle', attribute: 'smoking', object: 'smoking: never', importance: 1, isDealbreaker: true }],
  ['kids', { predicate: 'goal', attribute: 'kids', object: 'wants children: yes', importance: 0.9 }],
  ['location', { predicate: 'goal', attribute: 'location', object: 'living in 3-5 years: same city', importance: 0.6 }],
  ['conflict', { predicate: 'values', attribute: 'conflict', object: 'conflict: talk it out', importance: 0.6 }],
]);
const pos = (factId, i) => ({ quote: 'q', why: 'w', factId, messageId: `m${i}`, theirs: true });
const ready = { sessions: 3, messages: 52, minSessions: 3, minMessages: 50, chemistry: { ok: true, missing: [] }, inconsistencies: 0, lowInterestRun: 0 };
const strong = ['coffee', 'films', 'trek', 'friends', 'sunday', 'kids', 'location', 'conflict'].map(pos);
const deep = (o = {}) => decideFor('full', { facts, dealbreakers: { smoking: ['never'] }, positives: strong, ...o, bar: { ...ready, ...o.bar } });

test('a yes: 8 positives in their words across 5+ parts of life, 3 personal, 2 deep, after 3 sessions and 50 messages, with chemistry', () => {
  const d = deep();
  assert.equal(d.decision, 'yes');
  assert.ok(d.confidence >= KG.SESSION_BAR.YES_MIN);
  assert.deepEqual([d.counts.surface, d.counts.personal, d.counts.deep, d.counts.total], [2, 3, 3, 8]);
  assert.ok(d.counts.branches.length >= 5);
});

test('two shared likes (coffee + films) are never a yes; nor are many surface likes (capped at 3)', () => {
  assert.equal(deep({ positives: [pos('coffee', 1), pos('films', 2)] }).decision, 'unsure');
  const surface = deep({ positives: ['coffee', 'films', 'biryani', 'indie'].flatMap((f, i) => [pos(f, i), pos(f, i + 10)]) });
  assert.equal(surface.decision, 'unsure');
  assert.equal(surface.counts.surface, KG.SESSION_BAR.SURFACE_MAX);
  assert.equal(surface.counts.total, 3);
});

test('8 positives on only 2 branches, or without 2 deep ones, are not a yes', () => {
  const twoBranches = deep({ positives: [...Array.from({ length: 4 }, (_, i) => pos('kids', i)), ...Array.from({ length: 4 }, (_, i) => pos('location', i))] });
  assert.equal(twoBranches.counts.total, 8);
  assert.equal(twoBranches.decision, 'unsure');
  assert.match(twoBranches.reason, /parts of life/);
  const shallow = deep({ positives: ['coffee', 'films', 'biryani', 'trek', 'friends', 'sunday'].map(pos).concat([pos('trek', 20), pos('kids', 21)]) });
  assert.equal(shallow.decision, 'unsure');
  assert.match(shallow.reason, /values, the future/);
});

test('a yes is impossible before 3 sessions and 50 messages, or without chemistry, or with something that does not add up', () => {
  assert.equal(deep({ bar: { sessions: 2 } }).decision, 'unsure');
  assert.equal(deep({ bar: { messages: 40 } }).decision, 'unsure');
  const flat = deep({ bar: { chemistry: { ok: false, missing: ['you laughed together'] } } });
  assert.equal(flat.decision, 'unsure');
  assert.match(flat.reason, /chemistry: you laughed together/);
  assert.equal(deep({ bar: { inconsistencies: 1 } }).decision, 'unsure');
});

test('frictions: a serious one blocks yes; more than 2 notable ones, or one never talked about, too', () => {
  const fr = (sev, quote = 'q') => ({ quote, why: 'w', factId: 'films', messageId: 'x', severity: sev });
  assert.equal(deep({ frictions: [fr(3)] }).decision, 'unsure');
  assert.equal(deep({ frictions: [fr(2), fr(2), fr(2)] }).decision, 'unsure');
  assert.equal(deep({ frictions: [fr(2, '')] }).decision, 'unsure', 'a notable friction nobody talked about');
  assert.equal(deep({ frictions: [fr(2)] }).decision, 'unsure', 'one notable friction pulls 8 bare positives under 0.8');
  const more = [...strong, pos('biryani', 30), pos('indie', 31), pos('kids', 32), pos('conflict', 33)];
  assert.equal(deep({ positives: more, frictions: [fr(2)] }).decision, 'yes', '…more evidence outweighs it');
});

test('no stays quick: a dealbreaker conflict, a serious friction on something core, two low-interest sessions', () => {
  assert.equal(deep({ dealbreakerRisk: [{ attribute: 'smoking', value: 'socially' }], bar: { sessions: 1, messages: 10 } }).decision, 'no');
  assert.equal(deep({ frictions: [{ quote: 'q', why: 'w', factId: 'kids', messageId: 'x', severity: 3 }], bar: { sessions: 1 } }).decision, 'no');
  const bored = deep({ bar: { lowInterestRun: KG.SESSION_BAR.LOW_INTEREST_SESSIONS } });
  assert.deepEqual([bored.decision, bored.confidence], ['no', KG.SESSION_CONF.NO_LOW_INTEREST]);
});

test("CHAT_DEPTH=short reproduces today's judgeDecision exactly (the existing judge fixtures)", () => {
  const old = new Map([
    ['F1', { predicate: 'lifestyle', attribute: 'smoking', object: 'smoking: never', importance: 1, isDealbreaker: true }],
    ['F2', { predicate: 'goal', attribute: 'kids', object: 'wants children: yes', importance: 0.9 }],
    ['F3', { predicate: 'likes', object: 'trekking', strength: 0.9 }],
    ['F4', { predicate: 'likes', object: 'board games', strength: 0.3 }],
    ['F5', { predicate: 'values', attribute: 'career', object: 'career: balanced', importance: 0.3 }],
  ]);
  const p = (factId, messageId, theirs = true) => ({ quote: 'q', why: 'w', factId, messageId, theirs });
  const f = (factId, severity) => ({ quote: 'q', why: 'w', factId, messageId: 'x', severity });
  const cases = [
    { positives: [p('F3', 'a'), p('F2', 'b')], dealbreakerRisk: [{ attribute: 'smoking', value: 'socially' }] },
    { positives: [p('F3', 'a'), p('F2', 'b')], dealbreakerRisk: [{ attribute: 'smoking', value: 'never' }] },
    { frictions: [f('F2', 3)] }, { positives: [p('F3', 'a'), p('F2', 'b')], frictions: [f('F5', 3)] },
    { positives: [p('F3', 'a'), p('F2', 'b')] }, { positives: [p('F3', 'a'), p('F2', 'b', false)] }, { positives: [p('F3', 'a'), p('F4', 'b')] },
    { positives: [p('F3', 'a'), p('F2', 'b')], undiscussed: ['smoking'] },
    { positives: [p('F3', 'a'), p('F2', 'b')], dealbreakerRisk: [{ attribute: 'smoking', value: null }], undiscussed: ['smoking'] },
    { positives: [p('F3', 'a'), p('F2', 'b'), p('F1', 'c')] }, { positives: [p('F3', 'a'), p('F2', 'b')], frictions: [f('F5', 2), f('F5', 2), f('F4', 2)] }, {},
  ];
  for (const c of cases) {
    const args = { facts: old, dealbreakers: { smoking: ['never'] }, ...c };
    assert.deepEqual(decideFor('short', { ...args, bar: ready }), judgeDecision(args));
  }
  assert.equal(decideFor('short', { facts: old, dealbreakers: {}, positives: [p('F3', 'a'), p('F2', 'b')] }).decision, 'yes', 'two positives are still a yes in short');
});

test('the per-session evidence pass prompt: this sitting only, earlier ones summarized, depth over likes, inconsistencies', async () => {
  const judgePrompt = await import('../src/services/prompts/judge.js');
  const base = { userName: 'Meera', matchName: 'Ishaan', facts: [], dealbreakers: [], traits: '', notes: [], events: [], agenda: [], transcript: ['[m17] Ishaan: hey'], endedBy: null };
  const [sys, user] = judgePrompt.build({ ...base, session: { n: 2, earlier: ['Sitting 1: they swapped weekend plans.'], theirEarlier: ['i love trekking'] } });
  assert.match(sys.content, /THIS IS SITTING 2[\s\S]*A shared like \(coffee, a film, a food\) is minor[\s\S]*"inconsistencies"/);
  assert.match(user.content, /Earlier sittings, in short:\nSitting 1[\s\S]*Ishaan's own words in earlier sittings[\s\S]*i love trekking/);
  assert.doesNotMatch(user.content, /The conversation ended because/);
  const [shortSys] = judgePrompt.build(base);
  assert.doesNotMatch(shortSys.content, /SITTING|inconsistencies/, 'a short chat\'s judge prompt is unchanged');
});
