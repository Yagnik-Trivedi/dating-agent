// Re-embed knowledge-graph facts with the current MODEL_EMBED (run after switching provider/model).
//   node scripts/reembed.js               facts whose embeddingModel differs from MODEL_EMBED (or is missing)
//   node scripts/reembed.js --all         every fact
//   node scripts/reembed.js --prune-cache also delete cached vectors from other models (frees M0 storage)
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { EmbCache } from '../src/models/EmbCache.js';
import { KgFact } from '../src/models/KgFact.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { embeddingModel } from '../src/services/llm/client.js';
import { embedFacts } from '../src/services/kg/factEmbedding.js';

const BATCH = 64;
const all = process.argv.includes('--all');
const model = embeddingModel();
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

const filter = all ? {} : { embeddingModel: { $ne: model } };
const total = await KgFact.countDocuments(filter);
console.log(`Re-embedding ${total} fact(s) with ${model}${all ? ' (--all)' : ''}`);

let done = 0;
let lastId = null;
try {
  for (;;) {
    // Page by _id: updated facts drop out of the filter, so offsets would skip some.
    const page = await KgFact.find({ ...filter, ...(lastId && { _id: { $gt: lastId } }) }, { predicate: 1, object: 1 })
      .sort({ _id: 1 }).limit(BATCH).lean();
    if (!page.length) break;
    lastId = page.at(-1)._id;
    const updates = await embedFacts(page, { purpose: 'reembed' });
    await KgFact.bulkWrite(page.map((f, i) => ({ updateOne: { filter: { _id: f._id }, update: { $set: updates[i] } } })));
    done += page.length;
    console.log(`  ${done}/${total}`);
  }
  if (process.argv.includes('--prune-cache')) {
    const { deletedCount } = await EmbCache.deleteMany({ model: { $ne: model } });
    console.log(`Pruned ${deletedCount} cached vector(s) from other models`);
  }
  console.log('✓ done');
} finally {
  await flushUsage();
  await mongoose.disconnect();
}
