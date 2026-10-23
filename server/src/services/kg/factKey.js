import { normalise } from './canonicalize.js';

/**
 * Identity of a fact within one user's graph (merge + tombstones): `predicate|slot or conceptId or attribute or
 * normalised object`. A module answer's slot (plan 33: "M.F5", "M.E3.thriller") keeps the same thing on two branches as
 * two facts (ASSOCIATED), not one.
 */
export const factKey = (f) => `${f.predicate}|${f.slot ?? (f.conceptId ? String(f.conceptId) : f.attribute ?? normalise(f.object))}`;
