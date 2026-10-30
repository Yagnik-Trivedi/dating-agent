// Owner, 2026-10-30: how much the agent flirts comes from the knowledge graph only (the flirtiness trait from the
// onboarding bar, A.a21); the flirting itself is the model's own words. Never set → friendly, never flirts first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flirtLevel } from '../src/services/persona/contextBuilder.js';
import { questionnaireFacts, traitScores } from '../src/services/kg/questionnaireFacts.js';
import * as agentReply from '../src/services/prompts/agentReply.js';

const plan = { targetWords: 10, burst: 1, askBack: true, emoji: null, laugh: null, reactions: [], mustDisagree: false, topic: null, language: { primary: 'en' } };
const prompt = (flirt) => agentReply.build({ firstName: 'Meera', matchName: 'Ishaan', style: '', exemplars: [], myFacts: [], guidance: [], tone: [], aboutThem: [], transcript: ['Ishaan: hey'], plan, flirt })[0].content;
const levelOf = (bar) => traitScores({ a21: bar }).flirtiness;

test('the onboarding bar becomes a private flirtiness trait fact (0..1) in the graph', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(levelOf), [0, 0.25, 0.5, 0.75, 1]);
  const fact = questionnaireFacts({ A: { a21: 4 } }).find((f) => f.predicate === 'trait' && f.object === 'flirtiness');
  assert.equal(fact.value, 0.75);
  assert.equal(fact.disclosure, 'private');
  assert.equal(traitScores({ a1: 3 }).flirtiness, undefined, 'not answered → no trait');
});

test('flirtLevel reads the trait, or null when it was never set', () => {
  assert.equal(flirtLevel({ traits: { flirtiness: 0.75 } }), 0.75);
  assert.equal(flirtLevel({ traits: { extraversion: 0.5 } }), null);
});

test('each bar point sets how much; the prompt never hard-codes flirt lines', () => {
  const how = (bar) => prompt(levelOf(bar)).match(/How much Meera wants their agent to flirt: (\w+(?: \w+)?)\./)[1];
  assert.deepEqual([1, 2, 3, 4, 5].map(how), ['none', 'a little', 'a little', 'some', 'a lot']);
  for (const p of [prompt(1), prompt(0), prompt(null)]) {
    assert.match(p, /Write any flirting in Meera's own style and words/);
    assert.doesNotMatch(p, /Flirt, tease, compliment|someone they find attractive|kinda cute/);
    assert.match(p, /never more flirty than "FLIRTING" allows/);
  }
});

test('never set (seeds, older users, older callers) → friendly, never flirts first', () => {
  for (const p of [prompt(null), prompt(undefined)]) assert.match(p, /flirt: not set\. Be warm and friendly but don't flirt first/);
});
