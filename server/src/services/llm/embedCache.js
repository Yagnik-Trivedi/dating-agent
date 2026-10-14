import { createHash } from 'node:crypto';
import { EmbCache } from '../../models/EmbCache.js';

export const hashText = (model, text) => createHash('sha256').update(`${model}\n${text}`).digest('hex');

/** → Map<hash, vector>. Cache failures degrade to "all misses". */
export async function getCached(hashes) {
  try {
    const docs = await EmbCache.find({ hash: { $in: hashes } }, { hash: 1, vector: 1 }).lean();
    return new Map(docs.map((d) => [d.hash, d.vector]));
  } catch (err) {
    console.error(`embed cache read failed: ${err.message}`);
    return new Map();
  }
}

export async function putCached(entries /* [{ hash, model, vector }] */) {
  if (!entries.length) return;
  try {
    await EmbCache.insertMany(entries, { ordered: false });
  } catch (err) {
    if (err.code !== 11000 && !err.writeErrors?.every((e) => e.code === 11000)) {
      console.error(`embed cache write failed: ${err.message}`);
    }
  }
}
