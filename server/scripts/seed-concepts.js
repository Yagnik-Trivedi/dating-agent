// Plan 05 §3: seed the shared concept dictionary (interest suggestions with aliases + every section B option).
// Idempotent: re-running only adds missing aliases/embeddings.   node scripts/seed-concepts.js
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Concept } from '../src/models/Concept.js';
import { createConcept, normalise, resetConceptCache } from '../src/services/kg/canonicalize.js';
import { QUESTIONS } from '../src/services/kg/questions.js';
import { embed, embeddingModel } from '../src/services/llm/client.js';
import { flushUsage } from '../src/services/llm/budget.js';

const INTEREST_ALIASES = {
  music: ['songs', 'live music', 'gigs'], trekking: ['hiking', 'treks', 'trek', 'mountain trips', 'trekking trips'],
  cricket: ['ipl', 'test cricket'], cooking: ['home cooking', 'trying recipes'], gaming: ['video games', 'games', 'pc gaming'],
  reading: ['books', 'novels'], startups: ['startup', 'entrepreneurship'], films: ['movies', 'cinema', 'film'],
  travel: ['travelling', 'traveling', 'trips'], fitness: ['gym', 'working out', 'workouts'], art: ['painting', 'drawing', 'sketching'],
  dance: ['dancing'], photography: ['taking photos', 'photos'], football: ['soccer'], 'board games': ['boardgames', 'tabletop games'],
  coffee: ['filter coffee', 'cafes', 'specialty coffee'], 'stand-up comedy': ['standup', 'stand up', 'comedy shows', 'stand-up'],
  podcasts: ['podcast'], yoga: [], cycling: ['biking', 'bike rides'], theatre: ['theater', 'plays'], anime: ['manga'],
  gardening: ['plants'], baking: ['bakes'],
};

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const entries = [
  ...Object.entries(INTEREST_ALIASES).map(([label, aliases]) => ({ label, type: 'activity', aliases })),
  ...QUESTIONS.sections.find((s) => s.id === 'B').items.flatMap((item) => item.options.map((o) => ({
    label: `${item.id.replace(/_/g, ' ')}: ${o.label.toLowerCase()}`, type: item.predicate === 'lifestyle' ? 'lifestyle' : 'value', aliases: [],
  }))),
];
const vectors = await embed(entries.map((e) => normalise(e.label)), { purpose: 'seed-concepts', inputType: 'query' });
resetConceptCache();
for (const [i, e] of entries.entries()) {
  await createConcept({ name: normalise(e.label), label: e.label, type: e.type, aliases: e.aliases.map(normalise), vector: vectors[i], createdBy: 'seed', verified: true });
}
// Concepts seeded before an embedding-model change get fresh vectors.
const stale = await Concept.countDocuments({ createdBy: 'seed', embeddingModel: { $ne: embeddingModel() } });
console.log(`Seeded ${entries.length} concepts (${await Concept.countDocuments()} in the dictionary; ${stale} with an old embedding model).`);
await flushUsage();
await mongoose.disconnect();
