// Continuous learning jobs (plan 05 §7, plan 15 stages 7–8): voice rebuild, reflections, re-confirm, concept cleanup.
// Each touches one user's data (or the shared dictionary), never a scan that compares users.
import { z } from 'zod';
import { Concept } from '../../models/Concept.js';
import { InboxItem } from '../../models/InboxItem.js';
import { KgEdge } from '../../models/KgEdge.js';
import { KgFact } from '../../models/KgFact.js';
import { User } from '../../models/User.js';
import { VoiceProfile } from '../../models/VoiceProfile.js';
import { VoiceSample } from '../../models/VoiceSample.js';
import { enqueue } from '../jobs/queue.js';
import { chatJSON } from '../llm/client.js';
import * as reflectPrompt from '../prompts/reflect.js';
import { resetConceptCache } from './canonicalize.js';
import { KG } from './config.js';
import { cosine } from './similarity.js';
import { applyCorrections, computeVoiceProfile } from './voiceProfile.js';

const DISCLOSURE_RANK = { public: 0, if_asked: 1, private: 2 };

/** Call after saving a voice sample: every STYLE_REBUILD_EVERY new samples → rebuildVoice. */
export async function noteVoiceSample(userId) {
  const profile = await VoiceProfile.findOne({ userId }, { builtAt: 1 }).lean();
  const fresh = await VoiceSample.countDocuments({ userId, createdAt: { $gt: profile?.builtAt ?? new Date(0) } });
  if (fresh >= KG.STYLE_REBUILD_EVERY) await enqueue('rebuildVoice', { userId: String(userId) }, { dedupeKey: `voice:${userId}` });
}

/** Call after adding self facts: every REFLECT_EVERY new ones → reflect. */
export async function noteSelfFacts(userId) {
  const last = await KgFact.findOne({ subjectId: userId, observerId: null, source: 'reflection' }, { firstSeen: 1 }).sort({ firstSeen: -1 }).lean();
  const fresh = await KgFact.countDocuments({ subjectId: userId, observerId: null, source: { $ne: 'reflection' }, firstSeen: { $gt: last?.firstSeen ?? new Date(0) } });
  if (fresh >= KG.REFLECT_EVERY) await enqueue('reflect', { userId: String(userId) }, { dedupeKey: `reflect:${userId}` });
}

/** Keep MAX_VOICE_SAMPLES: the newest half, then a round-robin over (mood, languages) buckets for diversity. */
function keepSet(samples) {
  if (samples.length <= KG.MAX_VOICE_SAMPLES) return samples;
  const sorted = [...samples].sort((a, b) => b.createdAt - a.createdAt);
  const keep = sorted.slice(0, Math.floor(KG.MAX_VOICE_SAMPLES / 2));
  const buckets = new Map();
  for (const s of sorted.slice(keep.length)) {
    const k = `${s.mood}|${(s.lang?.languages ?? []).join('+')}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s);
  }
  const lists = [...buckets.values()];
  for (let i = 0; keep.length < KG.MAX_VOICE_SAMPLES && lists.some((l) => l.length); i++) {
    const l = lists[i % lists.length];
    if (l.length) keep.push(l.shift());
  }
  return keep;
}

export async function rebuildVoice({ userId }) {
  const [samples, user] = await Promise.all([VoiceSample.find({ userId }).lean(), User.findById(userId, { textingStyle: 1 }).lean()]);
  if (!samples.length) return { samples: 0, dropped: 0 }; // nothing to build from yet (the self-report waits for onboarding)
  const keep = keepSet(samples);
  const drop = samples.filter((s) => !keep.includes(s)).map((s) => s._id);
  if (drop.length) await VoiceSample.deleteMany({ _id: { $in: drop } });
  const now = Date.now();
  const voice = computeVoiceProfile(keep.map((s) => ({ ...s, weight: 0.5 ** ((now - s.createdAt) / (90 * 86_400_000)) })), { selfReport: user?.textingStyle });
  const kept = await VoiceProfile.findOne({ userId }, { description: 1, doList: 1, dontList: 1, corrections: 1, neverSay: 1 }).lean();
  await VoiceProfile.updateOne({ userId }, { $set: applyCorrections({ ...voice, ...kept, _id: undefined, userId }) }, { upsert: true });
  await User.updateOne({ _id: userId }, { $inc: { graphVersion: 1 } });
  return { samples: keep.length, dropped: drop.length };
}

export async function reflect({ userId }) {
  const facts = await KgFact.find({ subjectId: userId, observerId: null, predicate: { $nin: ['trait', 'style', 'reflection'] } }).sort({ confidence: -1 }).limit(60).lean();
  if (facts.length < 4) return { insights: 0 };
  const ids = new Map(facts.map((f, i) => [`F${i + 1}`, f]));
  const out = await chatJSON({ tier: 'mid', reasoning: false, purpose: 'reflect', userId,
    schema: z.object({ insights: z.array(z.object({ text: z.string().trim().min(3).max(120), supportingFactIds: z.array(z.string()).min(2) })).max(5).catch([]) }),
    messages: reflectPrompt.build({ facts: facts.map((f, i) => ({ id: `F${i + 1}`, predicate: f.predicate, object: f.object })) }) });
  let saved = 0;
  for (const ins of out.insights) {
    const support = ins.supportingFactIds.map((id) => ids.get(id)).filter(Boolean);
    if (support.length < 2) continue;
    // Strictest disclosure among the supporting facts: a reflection never reveals more than its sources.
    const disclosure = support.map((f) => f.disclosure).sort((a, b) => DISCLOSURE_RANK[b] - DISCLOSURE_RANK[a])[0];
    const fact = await KgFact.create({ subjectId: userId, predicate: 'reflection', object: ins.text, source: 'reflection', confidence: 0.6, strength: 0.5, weight: 0.5, disclosure });
    await KgEdge.insertMany(support.map((f) => ({ subjectId: userId, from: { kind: 'fact', id: fact._id }, to: { kind: 'fact', id: f._id }, type: 'DERIVED_FROM', confidence: 0.6 })));
    saved++;
  }
  if (saved) await User.updateOne({ _id: userId }, { $inc: { graphVersion: 1 } });
  return { insights: saved };
}

/** Daily: "Still learning guitar?" for current-state facts not confirmed in CURRENT_FACT_TTL_DAYS (≤ 200 per run). */
export async function reconfirm() {
  const before = new Date(Date.now() - KG.CURRENT_FACT_TTL_DAYS * 86_400_000);
  const facts = await KgFact.find({ observerId: null, isCurrent: true, lastConfirmed: { $lt: before } }, { subjectId: 1, object: 1 }).limit(200).lean();
  let asked = 0;
  for (const f of facts) {
    const question = `Is this still true about you: "${f.object}"?`;
    if (await InboxItem.exists({ userId: f.subjectId, question, status: 'open' })) continue;
    await InboxItem.create({ userId: f.subjectId, question });
    asked++;
  }
  return { asked };
}

/** Nightly: merge unverified auto-created concepts into an equivalent one (same name, or cosine ≥ T_HIGH). */
export async function conceptCleanup() {
  const auto = await Concept.find({ verified: false, mergedInto: null }).select('+embedding').limit(500).lean();
  const all = await Concept.find({ mergedInto: null }).select('+embedding').lean();
  let merged = 0;
  for (const c of auto) {
    const target = all.find((o) => String(o._id) !== String(c._id) && (o.verified || o.createdAt < c.createdAt)
      && (o.name === c.name || o.aliases.includes(c.name) || (o.type === c.type && cosine(o.embedding, c.embedding) >= KG.T_HIGH)));
    if (!target) continue;
    await KgFact.updateMany({ conceptId: c._id }, { $set: { conceptId: target._id } });
    await Concept.updateOne({ _id: target._id }, { $addToSet: { aliases: { $each: [c.name, ...c.aliases] } } });
    await Concept.updateOne({ _id: c._id }, { $set: { mergedInto: target._id } });
    merged++;
  }
  if (merged) resetConceptCache();
  return { merged };
}

export const _test = { keepSet };
