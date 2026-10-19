// Plan 05 §4 + plan 30 S2: answer validation (importance required, dealbreaker needs a non-accepted option, the core).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answersSchema, moreSchema } from '../src/services/kg/answers.js';
import { KG } from '../src/services/kg/config.js';
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

test('plan 30 S2 core: stories, personality and extra replies are optional; the 5 core replies are required', () => {
  const core = valid()
  delete core.A; delete core.C
  for (const id of Object.keys(core.E)) if (!KG.CORE_REPLY_IDS.includes(id)) delete core.E[id]
  delete core.B.religion // any value question can be skipped
  assert.equal(answersSchema.safeParse(core).success, true, JSON.stringify(answersSchema.safeParse(core).error?.issues))
  const noCore = valid()
  delete noCore.E.e1
  assert.equal(answersSchema.safeParse(noCore).success, false)
  assert.equal(moreSchema.safeParse({ C: { sunday: 'a slow breakfast' } }).success, true)
  assert.equal(moreSchema.safeParse({ C: { sunday: '  ' } }).success, false)
});
