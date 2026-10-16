// Plan 05 §5: merge by factKey, opposite polarity → contradiction, re-submit keeps edits and skips tombstones.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { factKey } from '../src/services/kg/factKey.js';
import { mergeFacts, planResubmit } from '../src/services/kg/merge.js';

const f = (o) => ({ predicate: 'likes', polarity: 1, confidence: 0.6, source: 'questionnaire_story', evidence: [], ...o });

test('same concept merges: strength max, evidence union, best confidence wins', () => {
  const { facts, contradictions } = mergeFacts([
    f({ conceptId: 'c1', object: 'hiking', strength: 0.4, evidence: [{ quote: 'love hiking', sourceRef: { id: 'C.sunday' } }] }),
    f({ conceptId: 'c1', object: 'trekking', strength: 0.9, confidence: 1, source: 'questionnaire_choice', evidence: [{ quote: null, sourceRef: { id: 'D' } }] }),
  ]);
  assert.equal(facts.length, 1);
  assert.deepEqual([facts[0].strength, facts[0].confidence, facts[0].source, facts[0].object], [0.9, 1, 'questionnaire_choice', 'trekking']);
  assert.equal(facts[0].evidence.length, 2);
  assert.deepEqual(contradictions, []);
});

test('opposite polarity on one key keeps both and reports a contradiction', () => {
  const { facts, contradictions } = mergeFacts([f({ conceptId: 'c2', object: 'crowds' }), f({ conceptId: 'c2', object: 'crowds', polarity: -1, predicate: 'likes' })]);
  assert.equal(facts.length, 2);
  assert.equal(contradictions.length, 1);
});

test('re-submit: tombstones skipped, user edits kept (evidence appended), stale questionnaire facts removed, protected untouched', () => {
  const edited = { _id: 'e1', ...f({ conceptId: 'c1', object: 'trekking (mostly Sahyadris)', userEdited: true, evidence: [{ quote: 'old', sourceRef: { id: 'C.sunday' } }] }) };
  const plain = { _id: 'e2', ...f({ conceptId: 'c3', object: 'cooking', disclosure: 'if_asked' }) };
  const stale = { _id: 'e3', ...f({ conceptId: 'c4', object: 'gaming' }) };
  const answer = { _id: 'e4', ...f({ conceptId: 'c5', object: 'pottery', source: 'user_answer' }) };
  const { facts: merged } = mergeFacts([
    f({ conceptId: 'c1', object: 'trekking', evidence: [{ quote: 'new quote', sourceRef: { id: 'C.place' } }] }),
    f({ conceptId: 'c3', object: 'cooking', strength: 0.8 }),
    f({ conceptId: 'c9', object: 'karaoke' }),
  ]);
  const plan = planResubmit({ merged, existing: [edited, plain, stale, answer], tombstones: [factKey({ predicate: 'likes', conceptId: 'c9' })] });
  assert.deepEqual(plan.inserts, [], 'tombstoned karaoke never returns');
  assert.deepEqual(plan.keepEdited.map((k) => [k.id, k.pushEvidence.length]), [['e1', 1]]);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].set.disclosure, 'if_asked', 'a changed disclosure survives');
  assert.equal(plan.updates[0].set.strength, 0.8);
  assert.deepEqual(plan.deletes, ['e3']);
});
