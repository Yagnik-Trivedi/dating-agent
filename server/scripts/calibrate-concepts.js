// Plan 05 §3: calibrate KG.T_HIGH / T_LOW for the current embedding model. Every seeded alias is embedded and compared
// with its own concept (true pair) and with the closest other concept (hardest negative). Re-run after an embedding
// model change (plan 14).   node scripts/calibrate-concepts.js
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Concept } from '../src/models/Concept.js';
import { cosine } from '../src/services/kg/similarity.js';
import { embed, embeddingModel } from '../src/services/llm/client.js';
import { flushUsage } from '../src/services/llm/budget.js';

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const concepts = await Concept.find({ createdBy: 'seed', type: 'activity' }).select('+embedding').lean();
const pairs = concepts.flatMap((c) => c.aliases.map((alias) => ({ alias, own: c })));
if (!pairs.length) {
  console.log('No seeded concept aliases in this database: run `node scripts/seed-concepts.js` (or `npm run seed`) first.');
  await mongoose.disconnect();
  process.exit(0);
}
const vectors = await embed(pairs.map((p) => p.alias), { purpose: 'calibrate-concepts', inputType: 'query' });

const truePos = [], hardNeg = [];
for (const [i, p] of pairs.entries()) {
  truePos.push(cosine(vectors[i], p.own.embedding));
  hardNeg.push(Math.max(...concepts.filter((c) => c !== p.own).map((c) => cosine(vectors[i], c.embedding))));
}
const q = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const f = (x) => x.toFixed(3);
console.log(`model ${embeddingModel()}, ${pairs.length} alias pairs`);
console.log(`true pairs:        min ${f(Math.min(...truePos))}  p10 ${f(q(truePos, 0.1))}  median ${f(q(truePos, 0.5))}`);
console.log(`hardest negatives: median ${f(q(hardNeg, 0.5))}  p90 ${f(q(hardNeg, 0.9))}  max ${f(Math.max(...hardNeg))}`);
const ranked = pairs.map((p, i) => ({ alias: p.alias, own: p.own.label, score: truePos[i], neg: hardNeg[i] })).sort((a, b) => a.score - b.score);
console.log('weakest true pairs:', ranked.slice(0, 5).map((r) => `${r.alias}→${r.own} ${f(r.score)} (neg ${f(r.neg)})`).join('; '));
console.log(`\nSuggested: T_HIGH ≈ ${f(Math.max(q(hardNeg, 0.95) + 0.02, q(truePos, 0.5)))} (auto-match above every typical wrong concept), T_LOW ≈ ${f(q(truePos, 0.05) - 0.02)} (LLM tie-break between).`);
await flushUsage();
await mongoose.disconnect();
