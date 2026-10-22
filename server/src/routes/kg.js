// Review screen API (plan 05 §6): the hub graph, fact edits (userEdited), deletes (tombstones), contradictions and
// "How I text" corrections. Every write bumps graphVersion so plan 08's per-conversation cache refreshes.
import { Router } from 'express';
import { z } from 'zod';
import { KgEdge } from '../models/KgEdge.js';
import { KgFact } from '../models/KgFact.js';
import { KgTombstone } from '../models/KgTombstone.js';
import { User } from '../models/User.js';
import { VoiceProfile } from '../models/VoiceProfile.js';
import { withTransaction } from '../services/db.js';
import { resolveConcept } from '../services/kg/canonicalize.js';
import { factEmbeddingFields } from '../services/kg/factEmbedding.js';
import { factKey } from '../services/kg/factKey.js';
import { userGraph, voiceNodes } from '../services/kg/graph.js';
import { addRule, correctionRule } from '../services/kg/ownVoice.js';
import { buildGate } from '../services/match/gate.js';
import { httpError, objectId, parse } from '../utils/http.js';

export const kgRouter = Router();
const bump = (userId, session) => User.updateOne({ _id: userId }, { $inc: { graphVersion: 1 } }, { session });

kgRouter.get('/kg/me', async (req, res) => res.json(await userGraph(req.user)));

async function ownFact(req) {
  const { id } = parse(z.object({ id: objectId }), req.params);
  const fact = await KgFact.findOne({ _id: id, subjectId: req.user._id, observerId: null });
  if (!fact) throw httpError(404, 'NOT_FOUND', 'Fact not found');
  if (fact.predicate === 'trait') throw httpError(422, 'TRAIT_READ_ONLY', 'Personality traits are computed from your answers and can’t be edited');
  return fact;
}

const patchBody = z.object({
  object: z.string().trim().min(1).max(120),
  value: z.string().trim().max(60),
  polarity: z.union([z.literal(1), z.literal(-1)]),
  strength: z.number().min(0).max(1),
  disclosure: z.enum(['public', 'if_asked', 'private']),
}).partial().strict().refine((b) => Object.keys(b).length, { message: 'Nothing to change' });

kgRouter.patch('/kg/facts/:id', async (req, res) => {
  const body = parse(patchBody, req.body);
  const fact = await ownFact(req);
  Object.assign(fact, body, { userEdited: true, lastConfirmed: new Date() });
  if (body.strength !== undefined && fact.importance === undefined) fact.weight = body.strength;
  // New wording → re-canonicalise (story-like labels without a concept get a fresh vector instead).
  if (body.object && fact.predicate !== 'story' && !fact.attribute) {
    fact.conceptId = (await resolveConcept({ text: body.object, type: null, userId: req.user._id })).conceptId;
  }
  if (body.object && !fact.conceptId) Object.assign(fact, await factEmbeddingFields(fact, req.user._id));
  if (body.object && fact.conceptId) fact.embedding = undefined;
  await fact.save();
  await bump(req.user._id);
  if (fact.attribute && body.value) await buildGate(req.user._id);
  res.json({ fact: { ...fact.toObject(), embedding: undefined } });
});

// Delete = tombstone + remove: the fact never comes back on a re-submit (F27).
kgRouter.delete('/kg/facts/:id', async (req, res) => {
  const fact = await ownFact(req);
  await withTransaction(async (session) => {
    await KgTombstone.updateOne({ subjectId: req.user._id, key: factKey(fact) }, { $setOnInsert: { subjectId: req.user._id, key: factKey(fact) } }, { upsert: true, session });
    await KgEdge.deleteMany({ subjectId: req.user._id, $or: [{ 'from.id': fact._id }, { 'to.id': fact._id }] }, { session });
    await fact.deleteOne({ session });
    await bump(req.user._id, session);
  });
  if (fact.attribute) await buildGate(req.user._id);
  res.status(204).end();
});

kgRouter.get('/kg/contradictions', async (req, res) => {
  const edges = await KgEdge.find({ subjectId: req.user._id, observerId: null, type: 'CONTRADICTS', resolved: { $ne: true } }).lean();
  const facts = new Map((await KgFact.find({ _id: { $in: edges.flatMap((e) => [e.from.id, e.to.id]) } }, { object: 1, predicate: 1, evidence: 1 }).lean()).map((f) => [String(f._id), f]));
  const pick = (id) => { const f = facts.get(String(id)); return f && { id: String(f._id), object: f.object, predicate: f.predicate, quote: f.evidence?.find((e) => e.quote)?.quote ?? null }; };
  res.json({ contradictions: edges.map((e) => ({ id: String(e._id), a: pick(e.from.id), b: pick(e.to.id) })).filter((c) => c.a && c.b) });
});

// "Which is right?": keep one, tombstone the other.
kgRouter.post('/kg/contradictions/:id/resolve', async (req, res) => {
  const { id } = parse(z.object({ id: objectId }), req.params);
  const { keepFactId } = parse(z.object({ keepFactId: objectId }), req.body);
  const edge = await KgEdge.findOne({ _id: id, subjectId: req.user._id, type: 'CONTRADICTS' });
  if (!edge) throw httpError(404, 'NOT_FOUND', 'Contradiction not found');
  const ids = [String(edge.from.id), String(edge.to.id)];
  if (!ids.includes(String(keepFactId))) throw httpError(422, 'NOT_IN_CONTRADICTION', 'keepFactId must be one of the two facts');
  const loser = await KgFact.findOne({ _id: ids.find((x) => x !== String(keepFactId)), subjectId: req.user._id });
  await withTransaction(async (session) => {
    if (loser) {
      await KgTombstone.updateOne({ subjectId: req.user._id, key: factKey(loser) }, { $setOnInsert: { subjectId: req.user._id, key: factKey(loser) } }, { upsert: true, session });
      await loser.deleteOne({ session });
      await KgEdge.deleteMany({ _id: { $ne: edge._id }, $or: [{ 'from.id': loser._id }, { 'to.id': loser._id }] }, { session });
    }
    await KgFact.updateOne({ _id: keepFactId }, { $set: { userEdited: true, lastConfirmed: new Date() } }, { session });
    await KgEdge.updateOne({ _id: edge._id }, { $set: { resolved: true } }, { session });
    await bump(req.user._id, session);
  });
  res.json({ ok: true });
});

// "That's not me" on a How-I-text node. Known cases change the profile directly; anything else becomes a rule.
kgRouter.post('/kg/voice/corrections', async (req, res) => {
  const { nodeId, text } = parse(z.object({ nodeId: z.string().regex(/^voice:[a-z]+$/), text: z.string().trim().max(300).optional() }), req.body);
  const profile = await VoiceProfile.findOne({ userId: req.user._id });
  if (!profile) throw httpError(404, 'NOT_FOUND', 'No voice profile yet');
  const node = voiceNodes(profile.toObject()).find((n) => n.id === nodeId);
  if (!node) throw httpError(404, 'NOT_FOUND', 'Unknown style node');
  const at = new Date();
  if (node.field === 'emoji' && (!text || /never|don.?t|no emoji|hardly/i.test(text))) {
    Object.assign(profile, { emojiPerMessage: 0, topEmojis: [], sadEmojis: [] });
    profile.corrections.push({ rule: 'never use emoji', kind: 'never_say', from: 'graph_edit', at });
    if (!profile.neverSay.includes('emoji')) profile.neverSay.push('emoji');
  } else {
    addRule(profile, await correctionRule({ userId: req.user._id, correction: text ?? "That's not me", about: node.label }), 'graph_edit');
  }
  await profile.save();
  await bump(req.user._id);
  res.json({ voice: voiceNodes(profile.toObject()), corrections: profile.corrections });
});
