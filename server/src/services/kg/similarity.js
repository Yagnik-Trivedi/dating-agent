// In-memory cosine is enough: comparisons are always person-vs-person (~50 × 50 facts).
// ponytail: O(q·c) scan; move to Atlas Vector Search only if we ever search across all users.
import { fromBinary } from '../../utils/vector.js';

/** Accepts number arrays, Float32Arrays or stored binary vectors (plan 17). */
export function cosine(a, b) {
  a = fromBinary(a);
  b = fromBinary(b);
  if (!a || !b) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** For each query vector → its top-k candidates as [{ index, score }], best first. */
export function topMatches(queryVecs, candidateVecs, k = 5) {
  return queryVecs.map((q) =>
    candidateVecs
      .map((c, index) => ({ index, score: cosine(q, c) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k),
  );
}
