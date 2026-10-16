// Plan 05 §3: normalise, resolution order (stubbed embed + LLM), factKey.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { Concept } from '../src/models/Concept.js';
import { createConcept, normalise, resetConceptCache, resolveConcept } from '../src/services/kg/canonicalize.js';
import { factKey } from '../src/services/kg/factKey.js';
import { start, stop } from '../scripts/lib/testDb.js';

test('normalise: case, punctuation, whitespace, plurals with exceptions', () => {
  assert.equal(normalise('  Treks!! '), 'trek');
  assert.equal(normalise('Movies'), 'movie');
  assert.equal(normalise('stories'), 'story');
  assert.equal(normalise('Board-Games'), 'board game');
  assert.equal(normalise('news'), 'news');
  assert.equal(normalise('chess'), 'chess');
  assert.equal(normalise('stand-up comedy'), 'stand up comedy');
});

test('factKey: concept, then attribute, then normalised label', () => {
  assert.equal(factKey({ predicate: 'likes', conceptId: 'c1', object: 'Hiking' }), 'likes|c1');
  assert.equal(factKey({ predicate: 'lifestyle', attribute: 'smoking', object: 'smoking: never' }), 'lifestyle|smoking');
  assert.equal(factKey({ predicate: 'opinion', object: 'Pineapple on pizza!' }), 'opinion|pineapple on pizza');
});

// --- resolution order with stubbed embeddings (2-d) and tie-break
const vec = { trekking: [1, 0], 'mountain walk': [0.6, -0.8], cinema: [0, 1], knitting: [-1, 0] };
const deps = (tie) => ({ embed: async (t) => vec[t] ?? [0.7071, -0.7071], tieBreak: tie ?? (async () => ({ same: false })) });

before(start);
after(stop);
beforeEach(async () => {
  await Concept.deleteMany({});
  resetConceptCache();
  await createConcept({ name: 'trekking', label: 'trekking', type: 'activity', aliases: ['hiking', 'trek'], vector: [1, 0], createdBy: 'seed' });
  await createConcept({ name: 'film', label: 'films', type: 'activity', aliases: ['movie'], vector: [0, 1], createdBy: 'seed' });
});

test('exact name/alias match comes first (no embedding call)', async () => {
  let embedded = 0;
  const r = await resolveConcept({ text: 'Treks', type: 'activity' }, { ...deps(), embed: async () => { embedded++; return [1, 0]; } });
  assert.equal(r.decision, 'exact');
  assert.equal(embedded, 0);
  const [a, b] = await Promise.all(['hiking', 'Trekking'].map((text) => resolveConcept({ text, type: 'activity' }, deps())));
  assert.equal(a.conceptId, r.conceptId);
  assert.equal(b.conceptId, r.conceptId);
});

test('≥ T_HIGH → embedding match + alias added; borderline → LLM tie-break; else created', async () => {
  const trek = (await Concept.findOne({ name: 'trekking' }))._id.toString();
  vec['trekking trip'] = [0.99, 0.14];
  const hi = await resolveConcept({ text: 'trekking trip', type: 'activity' }, deps());
  assert.deepEqual([hi.decision, hi.conceptId], ['embedding', trek]);
  assert.ok((await Concept.findById(trek)).aliases.includes('trekking trip'));

  let asked = 0;
  const llm = await resolveConcept({ text: 'mountain walk', type: 'activity' }, deps(async ({ candidates }) => { asked++; return { same: true, conceptId: candidates[0].id }; }));
  assert.deepEqual([llm.decision, llm.conceptId, asked], ['llm', trek, 1]);

  const created = await resolveConcept({ text: 'Knitting', type: 'activity' }, deps());
  assert.equal(created.decision, 'created');
  const doc = await Concept.findById(created.conceptId).lean();
  assert.deepEqual([doc.name, doc.verified, doc.createdBy], ['knitting', false, 'auto']);
});
