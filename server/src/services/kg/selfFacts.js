// The user's OWN graph with current-model vectors (concept facts borrow their concept's vector via the embed cache),
// plus small label helpers. Never called with another user's id (plan 15 boundary).
import { KgFact } from '../../models/KgFact.js';
import { embeddingModel } from '../llm/client.js';
import { embedFacts } from './factEmbedding.js';

/** → my self facts, each with an `embedding` (missing/stale ones embedded now via the cache, not saved). */
export async function selfFacts(userId) {
  const facts = await KgFact.find({ subjectId: userId, observerId: null }).select('+embedding').lean();
  const model = embeddingModel();
  const stale = facts.filter((f) => !f.embedding || f.embeddingModel !== model);
  const vectors = await embedFacts(stale, { userId });
  stale.forEach((f, i) => Object.assign(f, vectors[i]));
  return facts;
}

// "smoking: never" vs "smoking: regularly" embed close together but are opposite answers, not an overlap.
export const differentAnswer = (a, b) => {
  const [ta, va] = a.split(': ');
  const [tb, vb] = b.split(': ');
  return va !== undefined && vb !== undefined && ta === tb && va !== vb;
};

/** A neutral topic for a fact: "smoking: never" → "smoking"; "no smoking" → "smoking". */
export function topicOf(f) {
  const db = f.object.match(/^partner must be compatible on (.+?) \(mine:/);
  if (db) return db[1];
  return f.object.split(': ')[0].replace(/^(no|not|never)\s+/i, '').slice(0, 60).trim();
}
