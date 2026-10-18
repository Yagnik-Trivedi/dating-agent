// Re-embed with the current MODEL_EMBED (run after switching provider/model, plan 14). Vectors from different models
// can't be compared, so every stored vector from another model is replaced:
//   - concepts (shared vocabulary; matching runs on these) → their normalised label, as seed-concepts.js embeds them
//   - concept-less facts (only they carry a vector, plan 15 §6.3)
//   - voice samples: the vector is dropped; loadPersona re-embeds `incoming` through the cache on first use
// Restart the server afterwards: its in-memory concept cache still holds the old vectors.
//   node scripts/reembed.js               only what was embedded with another model (or never)
//   node scripts/reembed.js --all         every concept and concept-less fact
//   node scripts/reembed.js --prune-cache also delete cached vectors from other models (frees M0 storage)
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Concept } from '../src/models/Concept.js';
import { EmbCache } from '../src/models/EmbCache.js';
import { KgFact } from '../src/models/KgFact.js';
import { VoiceSample } from '../src/models/VoiceSample.js';
import { normalise } from '../src/services/kg/canonicalize.js';
import { embedFacts } from '../src/services/kg/factEmbedding.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { embed, embeddingModel } from '../src/services/llm/client.js';

const BATCH = 64;
const all = process.argv.includes('--all');
const model = embeddingModel();
const stale = all ? {} : { embeddingModel: { $ne: model } };
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

/** Page by _id (updated docs drop out of the filter, so offsets would skip some) and re-embed each page. */
async function reembedAll(Model, filter, fields, vectorsFor, label) {
  const total = await Model.countDocuments(filter);
  console.log(`Re-embedding ${total} ${label} with ${model}${all ? ' (--all)' : ''}`);
  let done = 0, lastId = null;
  for (;;) {
    const page = await Model.find({ ...filter, ...(lastId && { _id: { $gt: lastId } }) }, fields).sort({ _id: 1 }).limit(BATCH).lean();
    if (!page.length) break;
    lastId = page.at(-1)._id;
    const updates = await vectorsFor(page);
    await Model.bulkWrite(page.map((d, i) => ({ updateOne: { filter: { _id: d._id }, update: { $set: updates[i] } } })));
    done += page.length;
    console.log(`  ${done}/${total}`);
  }
}

try {
  await reembedAll(Concept, { ...stale, mergedInto: null }, { label: 1 }, async (page) => {
    const vectors = await embed(page.map((c) => normalise(c.label)), { purpose: 'reembed', inputType: 'query' });
    return vectors.map((embedding) => ({ embedding, embeddingModel: model }));
  }, 'concept(s)');
  await reembedAll(KgFact, { ...stale, conceptId: null }, { predicate: 1, object: 1 }, (page) => embedFacts(page, { purpose: 'reembed' }), 'concept-less fact(s)');
  const { modifiedCount } = await VoiceSample.updateMany({ embedding: { $exists: true }, embeddingModel: { $ne: model } }, { $unset: { embedding: 1, embeddingModel: 1 } });
  console.log(`Dropped ${modifiedCount} voice-sample vector(s) from other models (re-embedded on first use)`);
  if (process.argv.includes('--prune-cache')) {
    const { deletedCount } = await EmbCache.deleteMany({ model: { $ne: model } });
    console.log(`Pruned ${deletedCount} cached vector(s) from other models`);
  }
  console.log('✓ done. Restart the server so its concept cache reloads.');
} finally {
  await flushUsage();
  await mongoose.disconnect();
}
