import { normalise } from './canonicalize.js';

/** Identity of a fact within one user's graph (merge + tombstones): `predicate|conceptId or attribute or normalised object`. */
export const factKey = (f) => `${f.predicate}|${f.conceptId ? String(f.conceptId) : f.attribute ?? normalise(f.object)}`;
