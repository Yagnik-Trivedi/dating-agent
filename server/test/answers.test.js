// Plan 05 §4: answer validation (importance required, dealbreaker needs a non-accepted option, ≥ 4 stories, 15 samples).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answersSchema } from '../src/services/kg/answers.js';
import { QUESTIONS } from '../src/services/kg/questions.js';

const sec = (id) => QUESTIONS.sections.find((s) => s.id === id);
const valid = () => ({
  I: { job: 'designer', languages: ['english', 'hindi'] },
  A: Object.fromEntries(sec('A').items.map((i) => [i.id, 3])),
  B: Object.fromEntries(sec('B').items.map((i) => [i.id, { answer: i.options[0].value, importance: 'medium' }])),
  C: { sunday: 'a', hill: 'b', argue: 'c', place: 'd' },
  D: { interests: [{ name: 'trekking', intensity: 'obsessed' }] },
  E: Object.fromEntries(sec('E').items.map((i) => [i.id, 'haha ok'])),
});

test('a complete answer set parses; accepts defaults to every option', () => {
  const out = answersSchema.parse(valid());
  assert.equal(out.B.smoking.accepts.length, sec('B').items.find((i) => i.id === 'smoking').options.length);
  assert.equal(out.B.smoking.dealbreaker, false);
});

test('importance has no default', () => {
  const a = valid();
  delete a.B.kids.importance;
  assert.equal(answersSchema.safeParse(a).success, false);
});

test('a dealbreaker that accepts everything is rejected; with one option excluded it passes', () => {
  const a = valid();
  a.B.smoking = { answer: 'never', importance: 'high', dealbreaker: true };
  assert.equal(answersSchema.safeParse(a).success, false);
  a.B.smoking.accepts = ['never', 'socially'];
  assert.equal(answersSchema.safeParse(a).success, true);
});

test('fewer than 4 stories or a missing voice sample is rejected', () => {
  const few = valid();
  few.C = { sunday: 'a', hill: 'b', argue: '   ' };
  assert.equal(answersSchema.safeParse(few).success, false);
  const noSample = valid();
  delete noSample.E.e15;
  assert.equal(answersSchema.safeParse(noSample).success, false);
});
