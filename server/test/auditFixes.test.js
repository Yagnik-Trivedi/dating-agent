// Plan 31 H1 step 0: the confirmed bugs from BUG_BY_GEMINI.md section 2, one test each (fix 1 is in creditGuard.test.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heardIn, quickRead, sentRecord } from '../src/services/conversation/engine.js';
import { planAct } from '../src/services/conversation/planAct.js';
import { orphaned, substantive } from '../src/services/persona/checks.js';
import { sentencesOf } from '../src/services/persona/text.js';
import { rng } from '../src/utils/rng.js';

const voice = { wordCounts: [8, 10], questionBackRate: 0.5, language: { mix: { en: 1 } } };

test('2b: merged mode sees a question anywhere in their turn, not only a trailing "?"', () => {
  assert.equal(quickRead(['wait are you from pune? 😄', 'haha']).isQuestion, true, 'first bubble of a burst, emoji after the ?');
  assert.equal(quickRead(['so what do you do on weekends']).isQuestion, true, 'no "?" at all');
  assert.equal(quickRead(['haha nice', 'same tbh']).isQuestion, false);
});

test('2c: only questions left after the drops counts as nothing left', () => {
  assert.equal(orphaned(['do you smoke?'], ['I love trekking in the Sahyadris.']), true);
  assert.equal(orphaned(sentencesOf('do you smoke? 😄 lol'), ['x']), true, 'an emoji + "lol" is not a sentence that says something');
  assert.equal(orphaned(['ugh same, just got home.', 'what about you?'], ['x']), false);
  assert.equal(orphaned(['do you smoke?'], []), false, 'nothing was dropped: a plain question is fine');
  assert.equal(substantive('haha nice'), false);
});

test('3: what they state in the message being answered is never planned as a topic (a hint reopen still is)', () => {
  const heard = heardIn([], ["nah i don't smoke, my flatmate smokes on the balcony though"]);
  assert.deepEqual(heard, ['smoking']);
  const agenda = [{ id: 'a1', topic: 'smoking', attribute: 'smoking', priority: 0.9, status: 'open' }];
  const args = { voice, rng: rng(1), thread: { theirs: "nah i don't smoke, my flatmate smokes on the balcony though" } };
  assert.equal(planAct({ ...args, state: { interest: 0.6, turn: 4, heardAttrs: [] }, agenda }).topic?.id, 'a1', 'without the fix: the bridge picks it');
  assert.equal(planAct({ ...args, state: { interest: 0.6, turn: 4, heardAttrs: heard }, agenda }).topic, null);
  assert.equal(planAct({ ...args, state: { interest: 0.6, turn: 4, heardAttrs: heard }, agenda: [{ ...agenda[0], reopened: true }] }).topic?.id, 'a1');
});

test('4: used facts, told stories and topic tries count only what was sent', () => {
  const facts = new Map([['F1', { _id: 'f1', predicate: 'likes', object: 'dosa' }], ['S1', { _id: 's1', predicate: 'story', object: 'lost on the Rajmachi trek' }]]);
  const claims = [{ text: 'I got lost on the Rajmachi trek once', factIds: ['S1'] }, { text: 'i love dosa', factIds: ['F1'] }];
  const storyPlan = { topic: { kind: 'story', id: 's1' } };
  assert.deepEqual(sentRecord({ messages: ['haha i love dosa'], claims, facts, plan: storyPlan }), { used: ['f1'], told: [], raised: false });
  assert.deepEqual(sentRecord({ messages: ['I got lost on the Rajmachi trek once lol'], claims, facts, plan: storyPlan }).told, ['s1']);
  const topicPlan = { topic: { kind: 'agenda', id: 'a1', text: 'smoking' } };
  assert.equal(sentRecord({ messages: ['haha that sounds fun'], claims: [], facts, plan: topicPlan }).raised, false, 'the topic sentence was dropped');
  assert.equal(sentRecord({ messages: ['wait do you smoke too?'], claims: [], facts, plan: topicPlan }).raised, true);
  assert.equal(sentRecord({ messages: ['have you been trekking lately?'], claims: [], facts, plan: { topic: { kind: 'agenda', id: 'a4', text: 'trekking' } } }).raised, true);
});
