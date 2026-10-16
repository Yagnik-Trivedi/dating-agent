// Build pipeline v2 (plan 05 §5, plan 15 §4 stage 2): onboarding answers → the user's own graph (KgFact + KgEdge),
// voice (VoiceSample + VoiceProfile) and gate. Runs as the `buildUserGraph` job.
// Every LLM/embedding call happens first; then ONE short transaction swaps the graph in, so an interrupted build
// leaves the previous graph intact (a transaction can't stay open across minutes of LLM calls).
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { KgEdge } from '../../models/KgEdge.js';
import { KgFact } from '../../models/KgFact.js';
import { KgTombstone } from '../../models/KgTombstone.js';
import { User } from '../../models/User.js';
import { VoiceProfile } from '../../models/VoiceProfile.js';
import { VoiceSample } from '../../models/VoiceSample.js';
import { emitToUser } from '../../sockets/io.js';
import { mapLimit } from '../../utils/mapLimit.js';
import { withTransaction } from '../db.js';
import { enqueue } from '../jobs/queue.js';
import { chatJSON, embed, embeddingModel } from '../llm/client.js';
import { buildGate } from '../match/gate.js';
import * as describeStyle from '../prompts/describeStyle.js';
import * as findContradictions from '../prompts/findContradictions.js';
import * as tagLanguage from '../prompts/tagLanguage.js';
import { resolveConcept } from './canonicalize.js';
import { pruneToCap } from './caps.js';
import { KG } from './config.js';
import { extractFacts } from './extractFacts.js';
import { factText } from './factEmbedding.js';
import { tagLanguageHeuristic } from './language.js';
import { mergeFacts, planResubmit, PROTECTED_SOURCES } from './merge.js';
import { QUESTIONS } from './questions.js';
import { questionnaireFacts } from './questionnaireFacts.js';
import { applyCorrections, computeVoiceProfile } from './voiceProfile.js';

const LLM_CONCURRENCY = 2; // gentle on the provider's rate limit
const section = (id) => QUESTIONS.sections.find((s) => s.id === id);
const LIFESTYLE_CHECKED = ['smoking', 'drinking', 'diet'];
const withWeight = (f) => ({ ...f, weight: f.importance ?? f.strength ?? 0.5 }); // v1 readers (removed in plans 07–09)

const tagSchema = z.object({ tags: z.array(z.object({ i: z.coerce.number(), languages: z.array(z.string()).min(1), script: z.enum(['latin', 'devanagari', 'gujarati', 'other', 'mixed']).catch('latin'), codeSwitch: z.boolean().catch(false) })).catch([]) });
const contraSchema = z.object({ contradictions: z.array(z.object({ attribute: z.string(), fact: z.coerce.number(), why: z.string().catch('') })).catch([]) });
const styleSchema = z.object({ description: z.string().catch(''), doList: z.array(z.string()).catch([]), dontList: z.array(z.string()).catch([]) });

/** Section E answers → voice samples tagged with language (LLM, code fallback). */
async function onboardingSamples(answers, userId) {
  const items = section('E').items.filter((q) => String(answers.E?.[q.id] ?? '').trim());
  const texts = items.map((q) => String(answers.E[q.id]).trim());
  if (!texts.length) return [];
  const tags = (await chatJSON({ tier: 'mid', reasoning: false, temperature: 0, schema: tagSchema, purpose: 'voice-language-tags', userId,
    messages: tagLanguage.build({ texts }) }).catch((err) => { if (err.name === 'BudgetExceededError') throw err; return { tags: [] }; })).tags;
  const incoming = await embed(items.map((q) => q.text), { purpose: 'voice-incoming', userId, inputType: 'query' });
  return items.map((q, i) => {
    const t = tags.find((x) => x.i === i + 1);
    return {
      userId, incoming: q.prompt ? null : q.text, text: texts[i], source: 'onboarding', mood: q.mood,
      lang: t ? { languages: t.languages, script: t.script, codeSwitch: t.codeSwitch } : tagLanguageHeuristic(texts[i]),
      embedding: incoming[i], embeddingModel: embeddingModel(),
    };
  });
}

/** v1 `user.styleProfile` view of a VoiceProfile, for the v1 agent until plan 08 reads VoiceProfile directly. */
function styleProfileV1(v) {
  const counts = [...(v.wordCounts ?? [])].sort((a, b) => a - b);
  return {
    metrics: {
      medianWords: counts.length ? counts[Math.floor(counts.length / 2)] : 10, lowercaseStartRatio: v.lowercaseStartRatio,
      laughRate: v.laughRate, emojiPerMessage: v.emojiPerMessage, exclamationRate: v.endings?.['!'] ?? 0,
      hinglishRatio: v.language?.mix?.hi_latn ?? 0,
    },
    description: v.description, doList: v.doList, dontList: v.dontList,
  };
}

/** → { facts, dropped } for the user; throws on failure (the job marks onboarding failed; the old graph is untouched). */
export async function buildUserGraph(userId) {
  const user = await User.findById(userId);
  const answers = user?.onboarding?.answers ?? {};
  const buildId = randomUUID();
  const stories = section('C').items.filter((q) => String(answers.C?.[q.id] ?? '').trim());

  // 1–3. Deterministic facts + story extraction (verbatim + support checks, sensitivity) + voice samples.
  const [extracted, samples] = await Promise.all([
    mapLimit(stories, LLM_CONCURRENCY, (q) => extractFacts({
      question: q.text, answer: answers.C[q.id], userId, source: 'questionnaire_story', sourceRef: { kind: 'answer', id: `C.${q.id}` }, purpose: 'onboarding-story-facts',
    })),
    onboardingSamples(answers, userId),
  ]);
  const dropped = extracted.reduce((s, e) => s + e.dropped, 0);
  const storyFacts = extracted.flatMap((e) => e.facts);
  const all = [...questionnaireFacts(answers), ...storyFacts, ...extracted.map((e) => e.story).filter(Boolean)];

  // 4. Concepts (dictionary only), sequential per text so aliases added by one resolution help the next.
  const conceptOf = new Map();
  for (const f of all.filter((x) => x.conceptText)) {
    const key = `${f.conceptType}|${f.conceptText}`;
    if (!conceptOf.has(key)) conceptOf.set(key, (await resolveConcept({ text: f.conceptText, type: f.conceptType, userId })).conceptId);
    f.conceptId = conceptOf.get(key);
  }

  // 5. Merge by factKey (dedupe across sections); opposite polarity → CONTRADICTS.
  const { facts: merged, contradictions } = mergeFacts(all.map(({ conceptText, conceptType, ...f }) => f));

  // 6. Contradictions between B lifestyle answers and stories (one batched LLM call).
  const bFacts = merged.filter((f) => LIFESTYLE_CHECKED.includes(f.attribute));
  const storyMerged = merged.filter((f) => f.source === 'questionnaire_story' && f.predicate !== 'story');
  if (bFacts.length && storyMerged.length) {
    const out = await chatJSON({ tier: 'mid', reasoning: false, temperature: 0, schema: contraSchema, purpose: 'onboarding-contradictions', userId,
      messages: findContradictions.build({ answers: bFacts.map((f) => ({ attribute: f.attribute, label: f.object })), facts: storyMerged.map((f) => ({ ...f, quote: f.evidence?.[0]?.quote ?? '' })) }),
    }).catch((err) => { if (err.name === 'BudgetExceededError') throw err; return { contradictions: [] }; });
    for (const c of out.contradictions) {
      const a = bFacts.find((f) => f.attribute === c.attribute);
      const b = storyMerged[c.fact - 1];
      if (a && b) contradictions.push([a._key, b._key]);
    }
  }

  // 7. Re-submit plan against the current graph (tombstones, user edits, protected sources).
  const [existing, tombstones] = await Promise.all([
    KgFact.find({ subjectId: userId, observerId: null }).lean(),
    KgTombstone.distinct('key', { subjectId: userId }),
  ]);
  const plan = planResubmit({ merged, existing, tombstones });

  // 8. Embed only facts with no concept (stories, odd free text).
  const needVector = plan.inserts.filter((f) => !f.conceptId);
  const vectors = needVector.length ? await embed(needVector.map(factText), { purpose: 'onboarding-embed', userId }) : [];
  needVector.forEach((f, i) => { f.embedding = vectors[i]; f.embeddingModel = embeddingModel(); });

  // 9. Voice profile from all of the user's samples (the new onboarding ones replace the old ones).
  const others = await VoiceSample.find({ userId, source: { $ne: 'onboarding' } }).lean();
  const now = Date.now();
  const recency = (s) => 0.5 ** ((now - new Date(s.createdAt ?? now)) / (90 * 86_400_000)); // 90-day half-life
  const voice = computeVoiceProfile([...samples, ...others].map((s) => ({ ...s, weight: recency(s) })));
  const style = await chatJSON({ tier: 'mid', reasoning: false, schema: styleSchema, purpose: 'onboarding-style', userId,
    messages: describeStyle.build({ samples: samples.map((s) => ({ incoming: s.incoming ?? '(they start a new message)', reply: s.text })), metrics: { wordCounts: voice.wordCounts, emojiPerMessage: voice.emojiPerMessage, laughForms: voice.laughForms, language: voice.language } }),
  }).catch((err) => { if (err.name === 'BudgetExceededError') throw err; return { description: '', doList: [], dontList: [] }; });

  // The swap: one transaction.
  const keyToId = new Map(plan.keyToId);
  const inserts = plan.inserts.map((f) => {
    const _id = new mongoose.Types.ObjectId();
    keyToId.set(f._key, _id);
    const { _key, _members, ...doc } = f;
    return withWeight({ ...doc, _id, subjectId: userId, observerId: null, buildId });
  });
  const edges = [];
  // SUPPORTS: each story → the facts extracted from that answer.
  for (const story of merged.filter((f) => f.predicate === 'story')) {
    const ref = story.evidence?.[0]?.sourceRef?.id;
    for (const f of merged.filter((x) => x.predicate !== 'story' && x._members.some((m) => m.evidence?.some((e) => e.sourceRef?.id === ref)))) {
      if (keyToId.has(story._key) && keyToId.has(f._key)) edges.push({ subjectId: userId, from: { kind: 'fact', id: keyToId.get(story._key) }, to: { kind: 'fact', id: keyToId.get(f._key) }, type: 'SUPPORTS', confidence: f.confidence, buildId });
    }
  }
  for (const [a, b] of contradictions) {
    if (keyToId.has(a) && keyToId.has(b)) edges.push({ subjectId: userId, from: { kind: 'fact', id: keyToId.get(a) }, to: { kind: 'fact', id: keyToId.get(b) }, type: 'CONTRADICTS', confidence: 0.6, buildId });
  }

  await withTransaction(async (session) => {
    if (inserts.length) await KgFact.insertMany(inserts, { session });
    for (const u of plan.updates) {
      await KgFact.updateOne({ _id: u.id }, { $set: withWeight({ ...u.set, buildId, lastConfirmed: new Date() }), ...(u.pushEvidence.length && { $push: { evidence: { $each: u.pushEvidence } } }) }, { session });
    }
    for (const k of plan.keepEdited) if (k.pushEvidence.length) await KgFact.updateOne({ _id: k.id }, { $push: { evidence: { $each: k.pushEvidence } } }, { session });
    if (plan.deletes.length) await KgFact.deleteMany({ _id: { $in: plan.deletes } }, { session });
    // Build-made edges are rebuilt; resolved contradictions and reflection links stay.
    await KgEdge.deleteMany({ subjectId: userId, observerId: null, type: { $in: ['SUPPORTS', 'CONTRADICTS'] }, resolved: { $ne: true } }, { session });
    if (edges.length) await KgEdge.insertMany(edges, { session });
    await VoiceSample.deleteMany({ userId, source: 'onboarding' }, { session });
    if (samples.length) await VoiceSample.insertMany(samples, { session });
    const kept = await VoiceProfile.findOne({ userId }, { corrections: 1, neverSay: 1 }).session(session).lean();
    const profile = applyCorrections({ ...voice, ...style, corrections: kept?.corrections ?? [], neverSay: kept?.neverSay ?? [] });
    await VoiceProfile.updateOne({ userId }, { $set: profile }, { upsert: true, session });
    await pruneToCap(KgFact, { subjectId: userId, observerId: null }, KG.MAX_SELF_FACTS, {
      session,
      rank: (d) => (d.confidence ?? 0) * Math.max(d.importance ?? 0, d.strength ?? 0),
      protect: (d) => d.userEdited || PROTECTED_SOURCES.has(d.source) || d.isDealbreaker || d.predicate === 'trait',
    });
    await User.updateOne({ _id: userId }, {
      $set: { styleProfile: styleProfileV1(profile), 'onboarding.status': 'done', 'onboarding.completedAt': new Date() },
      $inc: { graphVersion: 1 },
    }, { session });
  });
  await buildGate(userId);
  return { facts: inserts.length + plan.updates.length + plan.keepEdited.length, dropped, edges: edges.length, samples: samples.length };
}

/** Queued by the submit route; a build interrupted by a restart is picked up again by the job worker. */
export const startUserGraphBuild = (userId) => enqueue('buildUserGraph', { userId: String(userId) }, { dedupeKey: `build:${userId}` });

/** Job handler: a failed build marks onboarding failed (the UI offers re-submit) instead of retrying. */
export async function runUserGraphBuild({ userId }) {
  try {
    const { facts, dropped, edges, samples } = await buildUserGraph(userId);
    console.log(`onboarding ${userId}: ${facts} facts, ${edges} edges, ${samples} voice samples (${dropped} unsupported/unquoted dropped)`);
    emitToUser(userId, 'onboarding:done', { status: 'done' });
  } catch (err) {
    if (err.name === 'BudgetExceededError') throw err; // re-queued by the worker, onboarding stays "processing"
    console.error(`onboarding ${userId} failed: ${err.message}`);
    await User.updateOne({ _id: userId }, { $set: { 'onboarding.status': 'failed' } });
    emitToUser(userId, 'onboarding:done', { status: 'failed' });
  }
}
