// Plan 31 A8: the judge with plan-31 agendas. Gate- and profile-settled items are never "undiscussed"; a profile basic
// that clashes with something very important (not a dealbreaker) is a friction from their profile; askOnce items that
// never came up are "worth asking yourself" and never lower the verdict. SN agendas keep today's behaviour.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromAgenda } from '../src/services/conversation/judge.js';
import { judgeDecision } from '../src/services/conversation/judgeDecision.js';

const dealbreakers = { smoking: ['never'] };
const human = [
  { id: 'a1', topic: 'living in 3-5 years', attribute: 'location', priority: 0.9, status: 'open', askOnce: true },
  { id: 'a2', topic: 'wants children', attribute: 'kids', priority: 0.9, status: 'answered', settledBy: 'profile', profileValue: 'no', value: 'yes', differs: true },
  { id: 'a3', topic: 'smoking', attribute: 'smoking', dealbreaker: true, priority: 1, status: 'answered', settledBy: 'gate' },
  { id: 'a4', topic: 'trekking', priority: 0.45, status: 'open', kind: 'interest' },
];
const facts = new Map([['F1', { predicate: 'likes', object: 'trekking', strength: 0.9 }], ['F2', { predicate: 'values', object: 'career ambition: balanced', importance: 0.9 }]]);
const positives = [{ theirs: true, messageId: 'm1', factId: 'F1' }, { theirs: true, messageId: 'm2', factId: 'F2' }];

test('gate- and profile-settled items are never undiscussed; a profile clash on a very important item is a friction', () => {
  const r = fromAgenda(human, dealbreakers);
  assert.deepEqual(r.undiscussed, []);
  assert.equal(r.profileFrictions.length, 1);
  assert.match(r.profileFrictions[0].why, /From their profile: wants children is "no", and yours is "yes"/);
  assert.equal(r.profileFrictions[0].source, 'their profile');
  assert.deepEqual(r.worthAsking, ['where they see themselves living in a few years']);
});

test('a never-discussed askOnce item does not lower the verdict', () => {
  const settledOnly = human.filter((a) => a.id !== 'a2');
  const withAsk = fromAgenda(settledOnly, dealbreakers);
  const without = fromAgenda(settledOnly.filter((a) => !a.askOnce), dealbreakers);
  const decide = (r) => judgeDecision({ positives, frictions: r.profileFrictions, facts, dealbreakers, undiscussed: r.undiscussed });
  assert.deepEqual(decide(withAsk), decide(without));
  assert.equal(decide(withAsk).decision, 'yes');
});

test('a dealbreaker reopened by a hint and still open is undiscussed again; SN agendas behave as before', () => {
  const reopened = human.map((a) => (a.id === 'a3' ? { ...a, status: 'open', reopened: true, askOnce: true, settledBy: undefined } : a));
  assert.deepEqual(fromAgenda(reopened, dealbreakers).undiscussed, ['smoking']);
  const sn = [{ id: 'a1', topic: 'smoking', attribute: 'smoking', dealbreaker: true, priority: 1, status: 'open' }];
  assert.deepEqual(fromAgenda(sn, dealbreakers), { undiscussed: ['smoking'], profileFrictions: [], worthAsking: [] });
});
