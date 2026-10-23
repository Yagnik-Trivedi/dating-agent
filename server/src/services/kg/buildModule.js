// Plan 33 Q1: build ONE module's part of the brain map (POST /onboarding/module/:id → quick here, full as the
// `buildModule` job). It reads and replaces only that module's facts, edges and voice samples; the core build and the
// other modules are never touched. Same shape as buildUserGraph: model work first, then one short transaction.
//   quick: the answers in the user's own words, their branches, links and reply samples (no model calls)
//   full:  + finer facts from stories and long answers (one call per module, verbatim-checked), concepts, vectors
import mongoose from 'mongoose';
import { z } from 'zod';
import { KgEdge } from '../../models/KgEdge.js';
import { KgFact } from '../../models/KgFact.js';
import { KgTombstone } from '../../models/KgTombstone.js';
import { User } from '../../models/User.js';
import { VoiceSample } from '../../models/VoiceSample.js';
import { emitToUser } from '../../sockets/io.js';
import { withTransaction } from '../db.js';
import { enqueue } from '../jobs/queue.js';
import { chatJSON, embed, embeddingModel } from '../llm/client.js';
import * as extractModuleFacts from '../prompts/extractModuleFacts.js';
import { lookupConcept, normalise, resolveConcepts } from './canonicalize.js';
import { pruneToCap } from './caps.js';
import { KG } from './config.js';
import { isVerbatim } from './extractFacts.js';
import { factText } from './factEmbedding.js';
import { tagLanguageHeuristic } from './language.js';
import { rebuildVoice } from './learning.js';
import { mergeFacts, planResubmit, polarKey, PROTECTED_SOURCES } from './merge.js';
import { moduleFacts } from './moduleFacts.js';
import { allTraitScores } from './questionnaireFacts.js';
import { moduleOf } from './questions.js';

const MODULE_SOURCE = new Set(['questionnaire_module']);
const MAX_PER_ANSWER = 5;
const schema = z.object({
  facts: z.array(z.object({
    n: z.coerce.number().int(),
    predicate: z.enum(extractModuleFacts.PREDICATES),
    object: z.string().trim().min(1).max(100),
    conceptText: z.string().trim().max(60).catch(''),
    conceptType: z.enum(extractModuleFacts.CONCEPT_TYPES).catch('other'),
    polarity: z.coerce.number().transform((p) => (p < 0 ? -1 : 1)).catch(1),
    strength: z.coerce.number().min(0).max(1).catch(0.5),
    isCurrent: z.boolean().catch(false),
    sensitiveTopic: z.enum(extractModuleFacts.SENSITIVE_TOPICS).catch('none'),
    quote: z.string().trim().min(1).max(400),
  })).catch([]).default([]),
});

/** Stories and long answers → finer facts under the answer's branch, each quoted verbatim from its own answer. */
async function extractAll(items, { userId, moduleId }) {
  if (!items.length) return { facts: [], supports: [], dropped: 0 };
  const out = await chatJSON({ tier: 'mid', reasoning: false, schema, purpose: `module-${moduleId}-facts`, userId, messages: extractModuleFacts.build({ items }) })
    .catch((err) => { if (err.name === 'BudgetExceededError') throw err; console.error(`module ${moduleId} ${userId}: extraction skipped: ${err.message}`); return { facts: [] }; });
  const facts = [], supports = [], perItem = new Map();
  for (const f of out.facts) {
    const it = items[f.n - 1];
    if (!it || !isVerbatim(f.quote, it.answer) || (perItem.get(f.n) ?? 0) >= MAX_PER_ANSWER) continue;
    perItem.set(f.n, (perItem.get(f.n) ?? 0) + 1);
    const sensitive = f.sensitiveTopic !== 'none';
    const slot = `${it.slot}#${normalise(f.object)}`;
    facts.push({
      source: 'questionnaire_module', confidence: 0.85, slot, qid: it.qid, module: moduleId, predicate: f.predicate, object: f.object, polarity: f.polarity, strength: f.strength,
      branch: [...it.branch, f.object.toLowerCase()], depthTier: it.tier,
      disclosure: sensitive ? 'if_asked' : it.disclosure ?? 'public', sensitivity: { topic: f.sensitiveTopic, sensitive },
      ...((f.isCurrent || it.current) && { isCurrent: true, currentUntil: new Date(Date.now() + KG.CURRENT_DAYS * 86_400_000) }),
      ...(f.strength < KG.HEDGE_STRENGTH && /\b(i think|kinda|idk|not sure|maybe|i guess)\b/i.test(f.quote) && { uncertain: true }),
      ...(f.conceptText && { conceptText: f.conceptText.toLowerCase(), conceptType: f.conceptType }),
      evidence: [{ quote: f.quote, sourceRef: { kind: 'answer', id: `M.${it.qid}` }, at: new Date() }],
    });
    supports.push({ type: 'SUPPORTS', from: it.slot, to: slot });
  }
  return { facts, supports, dropped: out.facts.length - facts.length };
}

/**
 * ASSOCIATED (A3): the same concept on two different life areas of my own graph ("coffee" under food and under my
 * morning) → one edge between them. Code only, over my self facts.
 */
export function associatedPairs(facts) {
  const byConcept = new Map();
  for (const f of facts) {
    if (!f.conceptId || !f.branch?.length) continue;
    const k = String(f.conceptId);
    if (!byConcept.has(k)) byConcept.set(k, []);
    byConcept.get(k).push(f);
  }
  const pairs = [];
  for (const group of byConcept.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) if (group[i].branch[0] !== group[j].branch[0]) pairs.push([group[i]._id, group[j]._id]);
    }
  }
  return pairs;
}

/** → { facts, edges, samples, dropped }. Throws on failure (the job logs it; the module's previous facts stay). */
export async function buildModule(userId, moduleId, { quick = false } = {}) {
  const mod = moduleOf(moduleId);
  if (!mod) throw new Error(`unknown module ${moduleId}`);
  const user = await User.findById(userId, { onboarding: 1, textingStyle: 1 }).lean();
  const answers = user?.onboarding?.answers ?? {};
  const built = moduleFacts(moduleId, answers.M?.[moduleId] ?? {});
  const extracted = quick ? { facts: [], supports: [], dropped: 0 } : await extractAll(built.extract, { userId, moduleId });
  const all = [...built.facts, ...extracted.facts];

  // Concepts. Quick: the dictionary only. Full: one batched pass.
  const withConcept = all.filter((f) => f.conceptText);
  const conceptOf = quick
    ? new Map(await Promise.all(withConcept.map(async (f) => [`${f.conceptType}|${f.conceptText}`, (await lookupConcept(f.conceptText))?.id ?? null])))
    : await resolveConcepts(withConcept.map((f) => ({ text: f.conceptText, type: f.conceptType })), { userId });
  for (const f of withConcept) f.conceptId = conceptOf.get(`${f.conceptType}|${f.conceptText}`) ?? null;
  const { facts: merged } = mergeFacts(all.map(({ conceptText, conceptType, ...f }) => f));

  // Only this module's facts are planned against. Quick never removes the model's facts (the full build that follows does).
  const [existingAll, tombstones] = await Promise.all([
    KgFact.find({ subjectId: userId, observerId: null, module: moduleId, source: 'questionnaire_module' }).lean(),
    KgTombstone.distinct('key', { subjectId: userId }),
  ]);
  const existing = quick ? existingAll.filter((e) => !String(e.slot ?? '').includes('#')) : existingAll;
  const plan = planResubmit({ merged, existing, tombstones, rebuilt: MODULE_SOURCE });

  const needVector = quick ? [] : plan.inserts.filter((f) => !f.conceptId);
  const vectors = needVector.length ? await embed(needVector.map(factText), { purpose: `module-${moduleId}-embed`, userId }) : [];
  needVector.forEach((f, i) => { f.embedding = vectors[i]; f.embeddingModel = embeddingModel(); });

  const keyToId = new Map(plan.keyToId);
  const inserts = plan.inserts.map((f) => {
    const _id = new mongoose.Types.ObjectId();
    keyToId.set(f._key, _id);
    const { _key, _members, ...doc } = f;
    return { ...doc, _id, subjectId: userId, observerId: null, weight: f.importance ?? f.strength ?? 0.5 };
  });
  // Slot → fact id (a slot's polarity is always 1 for module facts, except the model's dislikes).
  const idOfSlot = new Map(merged.map((f) => [f.slot, keyToId.get(polarKey(f))]).filter(([, id]) => id));
  const edges = [...built.links, ...extracted.supports].map((l) => ({ ...l, fromId: idOfSlot.get(l.from), toId: idOfSlot.get(l.to) }))
    .filter((l) => l.fromId && l.toId)
    .map((l) => ({ subjectId: userId, observerId: null, from: { kind: 'fact', id: l.fromId }, to: { kind: 'fact', id: l.toId }, type: l.type, confidence: 0.9, module: moduleId }));
  const samples = built.samples.map((s) => ({ userId, incoming: s.incoming, text: s.text, source: 'module', qid: s.qid, mood: s.mood, lang: tagLanguageHeuristic(s.text) }));
  const replyIds = mod.questions.filter((q) => q.type === 'reply').map((q) => q.id);
  const traits = Object.entries(allTraitScores(answers));
  const hasTraits = mod.questions.some((q) => q.trait);

  await withTransaction(async (session) => {
    if (inserts.length) await KgFact.insertMany(inserts, { session });
    for (const u of plan.updates) {
      await KgFact.updateOne({ _id: u.id }, { $set: { ...u.set, weight: u.set.importance ?? u.set.strength ?? 0.5, lastConfirmed: new Date() }, ...(u.pushEvidence.length && { $push: { evidence: { $each: u.pushEvidence } } }) }, { session });
    }
    if (plan.deletes.length) {
      await KgFact.deleteMany({ _id: { $in: plan.deletes } }, { session });
      await KgEdge.deleteMany({ subjectId: userId, $or: [{ 'from.id': { $in: plan.deletes } }, { 'to.id': { $in: plan.deletes } }] }, { session });
    }
    await KgEdge.deleteMany({ subjectId: userId, observerId: null, module: moduleId, type: { $in: quick ? ['BRANCH_OF', 'WHY'] : ['BRANCH_OF', 'WHY', 'SUPPORTS'] } }, { session });
    const keep = quick ? edges.filter((e) => e.type !== 'SUPPORTS') : edges;
    if (keep.length) await KgEdge.insertMany(keep, { session });
    if (replyIds.length) {
      await VoiceSample.deleteMany({ userId, source: 'module', qid: { $in: replyIds } }, { session });
      if (samples.length) await VoiceSample.insertMany(samples, { session });
    }
    // Trait picks (A4): the trait facts are recomputed from the statements + every module's picks.
    if (hasTraits) {
      for (const [trait, value] of traits) {
        await KgFact.updateOne({ subjectId: userId, observerId: null, predicate: 'trait', attribute: trait },
          { $set: { object: trait, value, confidence: 0.8, disclosure: 'private', source: 'questionnaire_choice', polarity: 1, lastConfirmed: new Date() }, $setOnInsert: { evidence: [{ quote: null, sourceRef: { kind: 'answer', id: `M.${moduleId}` }, at: new Date() }] } },
          { upsert: true, session });
      }
    }
    // ASSOCIATED across my whole graph (cheap, code only).
    const mine = await KgFact.find({ subjectId: userId, observerId: null, conceptId: { $ne: null }, branch: { $exists: true } }, { conceptId: 1, branch: 1 }).session(session).lean();
    await KgEdge.deleteMany({ subjectId: userId, observerId: null, type: 'ASSOCIATED' }, { session });
    const pairs = associatedPairs(mine);
    if (pairs.length) await KgEdge.insertMany(pairs.map(([a, b]) => ({ subjectId: userId, observerId: null, from: { kind: 'fact', id: a }, to: { kind: 'fact', id: b }, type: 'ASSOCIATED', confidence: 0.8 })), { session });
    await pruneToCap(KgFact, { subjectId: userId, observerId: null }, KG.MAX_SELF_FACTS, {
      session,
      rank: (d) => (d.confidence ?? 0) * Math.max(d.importance ?? 0, d.strength ?? 0),
      protect: (d) => d.userEdited || PROTECTED_SOURCES.has(d.source) || d.isDealbreaker || d.predicate === 'trait',
    });
    await User.updateOne({ _id: userId }, { $inc: { graphVersion: 1 } }, { session });
  });
  // The voice profile is recomputed from every sample (reply answers in, T8's hedge prior) whenever this module has replies or T8.
  if (replyIds.length || moduleId === 'T') await rebuildVoice({ userId });
  return { facts: inserts.length + plan.updates.length, edges: edges.length, samples: samples.length, dropped: extracted.dropped };
}

/** Queued after a module is saved; the quick build already ran in the request. */
export const startModuleBuild = (userId, moduleId) => enqueue('buildModule', { userId: String(userId), moduleId }, { dedupeKey: `module:${userId}:${moduleId}` });

/** Job handler: a failed full build leaves the quick facts in place (logged, not retried forever). */
export async function runModuleBuild({ userId, moduleId }) {
  try {
    const r = await buildModule(userId, moduleId);
    console.log(`module ${moduleId} ${userId}: ${r.facts} facts, ${r.edges} edges, ${r.samples} replies (${r.dropped} unquoted dropped)`);
    emitToUser(userId, 'module:built', { moduleId });
  } catch (err) {
    if (err.name === 'BudgetExceededError') throw err;
    console.error(`module ${moduleId} ${userId} failed: ${err.message}`);
  }
}
