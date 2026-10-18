// Owner's judge fix: the decision is made in code from the judge's verified evidence (judgeDecision.js). No LLM, no DB.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KG } from '../src/services/kg/config.js';
import { judgeDecision } from '../src/services/conversation/judgeDecision.js';

const facts = new Map([
  ['F1', { predicate: 'lifestyle', attribute: 'smoking', object: 'smoking: never', importance: 1, isDealbreaker: true }],
  ['F2', { predicate: 'goal', attribute: 'kids', object: 'wants children: yes', importance: 0.9 }],
  ['F3', { predicate: 'likes', object: 'trekking', strength: 0.9 }],
  ['F4', { predicate: 'likes', object: 'board games', strength: 0.3 }],
  ['F5', { predicate: 'values', attribute: 'career', object: 'career: balanced', importance: 0.3 }],
]);
const dealbreakers = { smoking: ['never'] };
const pos = (factId, messageId, theirs = true) => ({ quote: 'q', why: 'w', factId, messageId, theirs });
const fr = (factId, severity) => ({ quote: 'q', why: 'w', factId, messageId: 'x', severity });
const decide = (o) => judgeDecision({ facts, dealbreakers, ...o });

test('no: they stated a dealbreaker value I do not accept', () => {
  const d = decide({ positives: [pos('F3', 'a'), pos('F2', 'b')], dealbreakerRisk: [{ attribute: 'smoking', value: 'socially' }] });
  assert.deepEqual([d.decision, d.confidence], ['no', KG.JUDGE_CONF.NO_DEALBREAKER]);
});

test('a dealbreaker that came up with an accepted value is no conflict', () => {
  assert.equal(decide({ positives: [pos('F3', 'a'), pos('F2', 'b')], dealbreakerRisk: [{ attribute: 'smoking', value: 'never' }] }).decision, 'yes');
});

test('no: a severity-3 friction on a fact with importance ≥ JUDGE_NO_IMPORTANCE; a severity-3 on a minor fact only blocks yes', () => {
  assert.equal(decide({ frictions: [fr('F2', 3)] }).decision, 'no');
  const minor = decide({ positives: [pos('F3', 'a'), pos('F2', 'b')], frictions: [fr('F5', 3)] });
  assert.equal(minor.decision, 'unsure');
});

test('yes: ≥ 2 verified positives in their words on key facts; mine, minor or repeated ones do not count', () => {
  assert.equal(decide({ positives: [pos('F3', 'a'), pos('F2', 'b')] }).decision, 'yes');
  assert.equal(decide({ positives: [pos('F3', 'a'), pos('F2', 'b', false)] }).decision, 'unsure', 'my own words');
  assert.equal(decide({ positives: [pos('F3', 'a'), pos('F4', 'b')] }).decision, 'unsure', 'a weak interest');
  assert.equal(decide({ positives: [pos('F3', 'a'), pos('F3', 'a')] }).decision, 'unsure', 'the same evidence twice');
  assert.equal(decide({ positives: [pos('F3', 'a'), pos(null, 'b')] }).decision, 'unsure', 'not tied to a fact');
});

test('an undiscussed dealbreaker is a severity-2 friction that does not block yes', () => {
  const d = decide({ positives: [pos('F3', 'a'), pos('F2', 'b')], undiscussed: ['smoking'] });
  assert.equal(d.decision, 'yes');
  assert.deepEqual(d.frictions.map((f) => [f.attribute, f.severity]), [['smoking', 2]]);
  assert.equal(d.confidence, Math.round((KG.JUDGE_CONF.YES_BASE - KG.JUDGE_CONF.YES_PER_NOTABLE_FRICTION) * 100) / 100);
});

test('a dealbreaker that came up without a clear answer blocks yes but is not a no', () => {
  assert.equal(decide({ positives: [pos('F3', 'a'), pos('F2', 'b')], dealbreakerRisk: [{ attribute: 'smoking', value: null }] }).decision, 'unsure');
});

test('confidence grows with evidence; yes drops to unsure when notable frictions pull it under JUDGE_YES_MIN', () => {
  const two = decide({ positives: [pos('F3', 'a'), pos('F2', 'b')] }).confidence;
  const three = decide({ positives: [pos('F3', 'a'), pos('F2', 'b'), pos('F1', 'c')] }).confidence;
  assert.ok(three > two);
  const many = decide({ positives: [pos('F3', 'a'), pos('F2', 'b')], frictions: [fr('F5', 2), fr('F5', 2), fr('F4', 2)] });
  assert.equal(many.decision, 'unsure');
  assert.ok(decide({}).confidence <= KG.JUDGE_CONF.UNSURE_MAX);
});
