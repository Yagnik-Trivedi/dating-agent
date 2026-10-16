// Concept resolution (plan 05 §3, ref Phase 3): text → a shared dictionary entry. It only maps text to the dictionary:
// it never reads or returns any user's facts.
import { appendFile, mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { Concept, CONCEPT_TYPES } from '../../models/Concept.js';
import { chatJSON, embed, embeddingModel } from '../llm/client.js';
import * as sameConcept from '../prompts/sameConcept.js';
import { KG } from './config.js';
import { cosine } from './similarity.js';

const LOG = new URL('../../../eval/logs/concept-decisions.jsonl', import.meta.url);
// Naive singularisation, minus words that only look plural.
const KEEP = new Set(['news', 'chess', 'glasses', 'series', 'species', 'politics', 'physics', 'maths', 'athletics', 'gymnastics', 'aerobics',
  'sports', 'jeans', 'pants', 'shorts', 'biscuits', 'yes', 'bus', 'gas', 'class', 'grass', 'boss', 'dress', 'fitness', 'business',
  'wellness', 'happiness', 'kindness', 'thermos', 'christmas', 'diwali', 'holi', 'ladies', 'is', 'this', 'has', 'was', 'his', 'its']);

// -ies words whose singular ends in -ie ("movies" → "movie", not "movy").
const IE = new Set(['movie', 'cookie', 'selfie', 'zombie', 'brownie', 'hippie', 'rookie', 'calorie', 'smoothie', 'goodie', 'roadie', 'indie', 'auntie', 'foodie', 'techie']);

function singular(w) {
  if (w.length < 4 || KEEP.has(w)) return w;
  if (/ies$/.test(w)) return IE.has(w.slice(0, -1)) ? w.slice(0, -1) : `${w.slice(0, -3)}y`;
  if (/(ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (/[^s]s$/.test(w)) return w.slice(0, -1);
  return w;
}

/** lowercase, trim, collapse whitespace, strip punctuation, singularise each word. */
export const normalise = (text) => String(text ?? '').toLowerCase().normalize('NFKC')
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  .split(' ').map(singular).join(' ');

// In-memory concept cache per embedding model: { id, name, label, type, aliases, vector }.
let cache = null;
let cacheModel = null;

async function loadCache() {
  const model = embeddingModel();
  if (cache && cacheModel === model) return cache;
  const docs = await Concept.find({ mergedInto: null }).select('+embedding').limit(KG.CONCEPT_CACHE_MAX).lean();
  cache = docs.map((d) => ({ id: String(d._id), name: d.name, label: d.label, type: d.type, aliases: d.aliases, vector: d.embeddingModel === model ? d.embedding : null }));
  cacheModel = model;
  return cache;
}
export const resetConceptCache = () => { cache = null; };

async function log(entry) {
  try {
    await mkdir(new URL('.', LOG), { recursive: true });
    await appendFile(LOG, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch { /* logging must never break resolution */ }
}

async function addAlias(entry, alias) {
  if (entry.name === alias || entry.aliases.includes(alias)) return;
  entry.aliases.push(alias);
  await Concept.updateOne({ _id: entry.id }, { $addToSet: { aliases: alias } });
}

/** Create a concept (idempotent on type + name) and add it to the cache. */
export async function createConcept({ name, label, type, aliases = [], vector, createdBy = 'auto', verified = false }) {
  const doc = await Concept.findOneAndUpdate(
    { type, name },
    { $setOnInsert: { label, createdBy, verified, embedding: vector, embeddingModel: vector ? embeddingModel() : undefined }, $addToSet: { aliases: { $each: aliases } } },
    { upsert: true, new: true },
  ).lean();
  const entry = { id: String(doc._id), name, label: doc.label, type, aliases: doc.aliases, vector: vector ?? null };
  const list = await loadCache();
  const i = list.findIndex((c) => c.id === entry.id);
  if (i >= 0) list[i] = { ...list[i], ...entry, vector: entry.vector ?? list[i].vector }; else list.push(entry);
  return entry;
}

/**
 * → { conceptId, decision: 'exact' | 'embedding' | 'llm' | 'created', score? }
 * deps lets tests stub the embedder and the tie-break LLM.
 */
export async function resolveConcept({ text, type, userId }, deps = {}) {
  const embedOne = deps.embed ?? (async (t) => (await embed([t], { purpose: 'concept', userId, inputType: 'query' }))[0]);
  const tieBreak = deps.tieBreak ?? ((args) => chatJSON({
    tier: 'mid', reasoning: false, temperature: 0, purpose: 'concept-tiebreak', userId,
    schema: z.object({ same: z.boolean(), conceptId: z.string().nullable().catch(null) }),
    messages: sameConcept.build(args),
  }));
  const name = normalise(text);
  if (!name) return { conceptId: null, decision: 'empty' };
  const kind = CONCEPT_TYPES.includes(type) ? type : null;
  const list = await loadCache();
  const pool = kind ? list.filter((c) => c.type === kind) : list;

  const exact = pool.find((c) => c.name === name || c.aliases.includes(name));
  if (exact) {
    await log({ text, type, decision: 'exact', conceptId: exact.id });
    return { conceptId: exact.id, decision: 'exact' };
  }

  const vector = await embedOne(name);
  const scored = pool.filter((c) => c.vector).map((c) => ({ c, score: cosine(vector, c.vector) })).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best && best.score >= KG.T_HIGH) {
    await addAlias(best.c, name);
    await log({ text, type, decision: 'embedding', conceptId: best.c.id, score: best.score });
    return { conceptId: best.c.id, decision: 'embedding', score: best.score };
  }
  const borderline = scored.filter((s) => s.score >= KG.T_LOW).slice(0, 3);
  if (borderline.length) {
    const out = await tieBreak({ text, type: kind, candidates: borderline.map((s) => ({ id: s.c.id, label: s.c.label, aliases: s.c.aliases })) }).catch(() => ({ same: false }));
    const hit = out.same && borderline.find((s) => s.c.id === out.conceptId);
    if (hit) {
      await addAlias(hit.c, name);
      await log({ text, type, decision: 'llm', conceptId: hit.c.id, score: hit.score });
      return { conceptId: hit.c.id, decision: 'llm', score: hit.score };
    }
  }
  const created = await createConcept({ name, label: String(text).trim().toLowerCase(), type: kind ?? 'other', vector });
  await log({ text, type, decision: 'created', conceptId: created.id, best: best?.score ?? null });
  return { conceptId: created.id, decision: 'created', score: best?.score };
}
