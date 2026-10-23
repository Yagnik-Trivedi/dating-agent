// Per-conversation persona cache (plan 15 §6.4, plan 08 §1.1): MY facts (with vectors), voice, samples and gate,
// loaded once and keyed by userId:graphVersion, so any self-graph or voice write invalidates it. Tiny Map LRU.
// Only ever loaded for the speaking user's OWN id.
import { Concept } from '../../models/Concept.js';
import { KgEdge } from '../../models/KgEdge.js';
import { KgFact } from '../../models/KgFact.js';
import { Profile } from '../../models/Profile.js';
import { User } from '../../models/User.js';
import { VoiceProfile } from '../../models/VoiceProfile.js';
import { VoiceSample } from '../../models/VoiceSample.js';
import { fromBinary } from '../../utils/vector.js';
import { KG } from '../kg/config.js';
import { factText } from '../kg/factEmbedding.js';
import { embed } from '../llm/client.js';

const MAX = 200;
const lru = new Map();
const BRAIN_EDGES = ['BRANCH_OF', 'WHY', 'ASSOCIATED'];

/**
 * Plan 33 brain map: fact id → [{ id, rel }] where rel is 'child' (a follow-up under it), 'parent', 'why' (the reason
 * it matters), 'because' (what this is the reason for) or 'associated' (the same thing on another branch).
 */
export function brainLinks(edges = []) {
  const out = new Map();
  const add = (a, b, rel) => { const k = String(a); if (!out.has(k)) out.set(k, []); out.get(k).push({ id: String(b), rel }); };
  for (const e of edges) {
    if (e.type === 'BRANCH_OF') { add(e.to.id, e.from.id, 'child'); add(e.from.id, e.to.id, 'parent'); }
    if (e.type === 'WHY') { add(e.from.id, e.to.id, 'why'); add(e.to.id, e.from.id, 'because'); }
    if (e.type === 'ASSOCIATED') { add(e.from.id, e.to.id, 'associated'); add(e.to.id, e.from.id, 'associated'); }
  }
  return out;
}

export const clearPersonaCache = () => lru.clear();

/** → { userId, firstName, facts, traits, privateFacts, voice, samples, gate } for my own user. */
export async function loadPersona(userId) {
  const user = await User.findById(userId, { graphVersion: 1, name: 1 }).lean();
  const key = `${userId}:${user?.graphVersion ?? 0}`;
  if (lru.has(key)) {
    const hit = lru.get(key);
    lru.delete(key);
    lru.set(key, hit);
    return hit;
  }
  const [all, voice, samples, profile, edges] = await Promise.all([
    KgFact.find({ subjectId: userId, observerId: null }).select('+embedding').lean(),
    VoiceProfile.findOne({ userId }).lean(),
    VoiceSample.find({ userId }).select('+embedding').sort({ createdAt: -1 }).limit(KG.MAX_VOICE_SAMPLES).lean(),
    Profile.findOne({ userId }, { name: 1, gate: 1 }).lean(),
    KgEdge.find({ subjectId: userId, observerId: null, type: { $in: BRAIN_EDGES } }, { from: 1, to: 1, type: 1 }).lean(),
  ]);
  const concepts = new Map((await Concept.find({ _id: { $in: all.map((f) => f.conceptId).filter(Boolean) } }).select('+embedding').lean()).map((c) => [String(c._id), c]));
  const facts = all.filter((f) => !['trait', 'style'].includes(f.predicate)).map((f) => {
    const c = f.conceptId && concepts.get(String(f.conceptId));
    return { ...f, embedding: undefined, conceptLabel: c?.label, vector: fromBinary(c?.embedding ?? f.embedding) ?? null };
  });
  // Vectors still missing (old docs, a concept without a vector) come from the shared embedding cache.
  const missing = facts.filter((f) => !f.vector);
  if (missing.length) (await embed(missing.map(factText), { purpose: 'persona-load', userId })).forEach((v, i) => { missing[i].vector = v; });
  // Onboarding samples store no vector (the 15 prompts are shared): embed their incoming text once via the cache.
  const noVec = samples.filter((s) => s.incoming && !s.embedding);
  const incomingVecs = noVec.length ? await embed([...new Set(noVec.map((s) => s.incoming))], { purpose: 'persona-load', userId, inputType: 'query' }) : [];
  const byText = new Map([...new Set(noVec.map((s) => s.incoming))].map((t, i) => [t, incomingVecs[i]]));
  const persona = {
    userId: String(userId),
    firstName: String(profile?.name ?? user?.name ?? 'Me').trim().split(/\s+/)[0],
    facts,
    traits: Object.fromEntries(all.filter((f) => f.predicate === 'trait').map((f) => [f.object, f.value])),
    privateFacts: facts.filter((f) => f.disclosure === 'private'),
    voice: voice ?? {},
    samples: samples.map((s) => ({ ...s, embedding: undefined, vector: s.embedding ? fromBinary(s.embedding) : byText.get(s.incoming) ?? null })),
    gate: profile?.gate ?? null,
    links: brainLinks(edges), // plan 33: fact id → its branch neighbours
  };
  lru.set(key, persona);
  if (lru.size > MAX) lru.delete(lru.keys().next().value);
  return persona;
}
