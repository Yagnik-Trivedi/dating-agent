// Plan 08: selectFacts privacy (private never, if_asked only for a matching question), seeded reproducibility,
// private guidance never contains the private text, exemplars come from my own samples.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { privateGuidance, selectExemplars, selectFacts } from '../src/services/persona/contextBuilder.js';
import { rng } from '../src/utils/rng.js';

const f = (id, predicate, object, disclosure, vector, extra = {}) => ({ _id: id, predicate, object, disclosure, vector, strength: 0.7, ...extra });
const persona = {
  facts: [
    f('1', 'likes', 'trekking', 'public', [1, 0, 0]),
    f('2', 'likes', 'cooking', 'public', [0, 1, 0]),
    f('3', 'values', 'religion in own life: central', 'if_asked', [0, 0, 1]),
    f('4', 'background', 'recovering from a hard breakup', 'private', [0.5, 0.5, 0.5], { sensitivity: { topic: 'past_relationships', sensitive: true } }),
    f('5', 'goal', 'secretly moving abroad', 'private', [0.3, 0.3, 0.3]),
    ...Array.from({ length: 12 }, (_, i) => f(`x${i}`, 'likes', `thing ${i}`, 'public', [0.1, 0.1, 0.1])),
  ],
  samples: [
    { incoming: 'ever done a trek?', text: 'omg yes twice a month', mood: 'casual', vector: [1, 0, 0] },
    { incoming: 'gn!', text: 'gn 👋', mood: 'closing', vector: [0, 1, 0] },
  ],
};
persona.privateFacts = persona.facts.filter((x) => x.disclosure === 'private');

test('private facts are never selected; if_asked only for a matching question', () => {
  for (let s = 0; s < 50; s++) {
    const picked = selectFacts(persona, { incomingVec: [0, 0, 1], incomingText: 'nice weather', rng: rng(s), k: 20 });
    assert.ok(!picked.some((x) => x.disclosure === 'private'));
    assert.ok(!picked.some((x) => x._id === '3'), 'if_asked fact not offered without a question about it');
  }
  const asked = selectFacts(persona, { incomingVec: [0, 0, 1], incomingText: 'is religion important to you?', rng: rng(1), k: 20 });
  assert.ok(asked.some((x) => x._id === '3'));
  assert.ok(!selectFacts(persona, { incomingVec: [1, 0, 0], incomingText: 'do you like hiking?', rng: rng(1), k: 20 }).some((x) => x._id === '3'), 'a question about another topic does not unlock it');
});

test('a seeded rng gives a reproducible selection', () => {
  const ids = (seed) => selectFacts(persona, { incomingVec: [1, 0, 0], rng: rng(seed), k: 5 }).map((x) => x._id);
  assert.deepEqual(ids(9), ids(9));
  assert.notDeepEqual(ids(9), ids(10));
});

test('private guidance is behaviour, never the private text', () => {
  const g = privateGuidance(persona).join(' ');
  assert.match(g, /past relationships/);
  assert.ok(!/breakup|abroad|recovering|secretly/i.test(g));
});

test('exemplars are my own samples, most relevant first', () => {
  const ex = selectExemplars(persona, { incomingVec: [1, 0, 0], rng: rng(1), k: 2 });
  assert.equal(ex[0].text, 'omg yes twice a month');
});

test('the facts most relevant to their message are always offered', () => {
  for (let s = 0; s < 30; s++) {
    const picked = selectFacts(persona, { incomingVec: [0, 1, 0], incomingText: 'you cook?', rng: rng(s), k: 4 });
    assert.ok(picked.some((x) => x._id === '2'), 'cooking is always in when they ask about cooking');
  }
});
