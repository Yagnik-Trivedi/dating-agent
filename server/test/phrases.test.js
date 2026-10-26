import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionnaireFacts } from '../src/services/kg/questionnaireFacts.js';
import { worldPhrase } from '../src/services/kg/phrases.js';
import { FACT_PREDICATES } from '../src/models/KgFact.js';

test('UX P0-4: answers become natural phrases, sensitive basics if_asked, prompts claimable', () => {
  const facts = questionnaireFacts({ I: { job: 'Architect' }, B: { smoking: { answer: 'never' }, alone_time: { answer: 'some' }, career: { answer: 'balanced' } } },
    { prompts: [{ q: 'My Sundays look like', a: 'chai and a long walk' }] });
  const by = (attr) => facts.find((f) => f.attribute === attr);
  assert.equal(by('smoking').object, 'doesn’t smoke');
  assert.equal(by('smoking').disclosure, 'if_asked');
  assert.equal(by('alone_time').object, 'needs some alone time after a busy week');
  assert.equal(by('career').disclosure, 'public');
  assert.equal(by('job').object, 'works as an architect');
  assert.ok(facts.every((f) => f.predicate === 'trait' || !/^[a-z ]+: /.test(f.object)), 'no "key: value" objects');
  const p = facts.find((f) => f.sourceAnswerId === 'prompt_1');
  assert.equal(p.predicate, 'lifestyle');
  assert.ok(facts.every((f) => FACT_PREDICATES.includes(f.predicate)), 'valid predicates');
  assert.equal(p.evidence[0].quote, 'chai and a long walk');
  assert.equal(worldPhrase('W1', { text: 'A big release.' }), 'is busy with a big release');
  assert.equal(worldPhrase('W1_1', { option: 'bit_of_both' }), 'is a mix of good busy and stressful busy');
});
