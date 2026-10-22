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
import { lookupConcept, resolveConcepts } from './canonicalize.js';
import { pruneToCap } from './caps.js';
import { KG } from './config.js';
import { extractFacts } from './extractFacts.js';
import { factText } from './factEmbedding.js';
import { tagLanguageHeuristic } from './language.js';
import { mergeFacts, planResubmit, PROTECTED_SOURCES } from './merge.js';
import { QUESTIONS } from './questions.js';
import { questionnaireFacts } from './questionnaireFacts.js';
import { applyCorrections, computeVoiceProfile } from './voiceProfile.js';

const LLM_CONCURRENCY = 4; // stories in parallel (plan 30 S1); the global RPM limiter still applies
const section = (id) => QUESTIONS.sections.find((s) => s.id === id);
const LIFESTYLE_CHECKED = ['smoking', 'drinking', 'diet'];
const EVIDENCE = {
  drinking: /\b(beers?|wine|whisk(e)?y|vodka|rum|gin|cocktails?|alcohol|drunk|shots?|pubs?|bars?|daaru|tequila|sangria)\b/i,
  smoking: /\b(smok\w*|cigarettes?|cigs?|vap(e|ing)|hookah|sutta|beedi)\b/i,
  diet: /\b(chicken|mutton|meat|fish|prawns?|beef|pork|bacon|eggs?|omelettes?|seafood|kebabs?|non-?veg|butter chicken|steak|tandoori chicken|ham|sushi|lamb)\b/i,
};
const withWeight = (f) => ({ ...f, weight: f.importance ?? f.strength ?? 0.5 }); // v1 readers (removed in plans 07–09)

const tagSchema = z.object({ tags: z.array(z.object({ i: z.coerce.number(), languages: z.array(z.string()).min(1), script: z.enum(['latin', 'devanagari', 'gujarati', 'other', 'mixed']).catch('latin'), codeSwitch: z.boolean().catch(false) })).catch([]) });
const contraSchema = z.object({ contradictions: z.array(z.object({ attribute: z.string(), fact: z.coerce.number(), why: z.string().catch('') })).catch([]) });
const styleSchema = z.object({ description: z.string().catch(''), doList: z.array(z.string()).catch([]), dontList: z.array(z.string()).catch([]) });

/** Section E answers → voice samples tagged with language (LLM, code fallback; code only with llm=false). */
async function onboardingSamples(answers, userId, { llm = true } = {}) {
  const items = section('E').items.filter((q) => String(answers.E?.[q.id] ?? '').trim());
  const texts = items.map((q) => String(answers.E[q.id]).trim());
  if (!texts.length) return [];
  const tags = !llm ? [] : (await chatJSON({ tier: 'mid', reasoning: false, temperature: 0, schema: tagSchema, purpose: 'voice-language-tags', userId,
    messages: tagLanguage.build({ texts }) }).catch((err) => { if (err.name === 'BudgetExceededError') throw err; return { tags: [] }; })).tags;
  return items.map((q, i) => {
    const t = tags.find((x) => x.i === i + 1);
    return {
      userId, incoming: q.prompt ? null : q.text, text: texts[i], source: 'onboarding', mood: q.mood,
      ...(answers.Edevice?.[q.id] && { device: answers.Edevice[q.id] }), // plan 32 KP1: typed on a phone or a computer
      lang: t ? { languages: t.languages, script: t.script, codeSwitch: t.codeSwitch } : tagLanguageHeuristic(texts[i]),
      // No per-user vector: the 15 onboarding prompts are the same for everyone, so the agent embeds them once
      // (EmbCache) instead of storing 15 identical 8 KB vectors per user. Inbox/own-chat samples store theirs.
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

const NO_STYLE = { description: '', doList: [], dontList: [] };

/**
 * → { facts, dropped } for the user; throws on failure (the job marks onboarding failed; the old graph is untouched).
 * Plan 30 S1, two phases: `quick` (inside the submit request, no model calls) commits the questionnaire facts, voice
 * metrics and the gate, so the app is usable at once (graphStatus 'building'); the full build (a job) adds the stories,
 * concepts, checks and style, then sets graphStatus 'ready'. Both end in the same single swap transaction.
 */
export async function buildUserGraph(userId, { quick = false, failBeforeCommit = false } = {}) { // failBeforeCommit: checks only
  const user = await User.findById(userId);
  const answers = user?.onboarding?.answers ?? {};
  const buildId = randomUUID();
  const stories = quick ? [] : section('C').items.filter((q) => String(answers.C?.[q.id] ?? '').trim());
  const progress = (step, done, total) => { if (!quick) emitToUser(userId, 'onboarding:progress', { step, done, total }); };

  // 1–3. Deterministic facts + story extraction (verbatim + support checks, sensitivity) + voice samples. The voice
  // style description runs alongside the stories (it needs only the samples).
  const othersP = VoiceSample.find({ userId, source: { $ne: 'onboarding' } }).lean();
  const voiceP = onboardingSamples(answers, userId, { llm: !quick }).then(async (samples) => {
    const now = Date.now();
    const recency = (s) => 0.5 ** ((now - new Date(s.createdAt ?? now)) / (90 * 86_400_000)); // 90-day half-life
    const voice = computeVoiceProfile([...samples, ...await othersP].map((s) => ({ ...s, weight: recency(s) })), { selfReport: user?.textingStyle });
    const style = quick ? NO_STYLE : await chatJSON({ tier: 'mid', reasoning: false, schema: styleSchema, purpose: 'onboarding-style', userId,
      messages: describeStyle.build({ samples: samples.map((s) => ({ incoming: s.incoming ?? '(they start a new message)', reply: s.text })), metrics: { wordCounts: voice.wordCounts, emojiPerMessage: voice.emojiPerMessage, laughForms: voice.laughForms, language: voice.language } }),
    }).catch((err) => { if (err.name === 'BudgetExceededError') throw err; return NO_STYLE; });
    return { samples, voice, style };
  });
  let storiesDone = 0;
  progress('stories', 0, stories.length);
  const extracted = await mapLimit(stories, LLM_CONCURRENCY, async (q) => {
    // A story that fails is skipped (logged), not the whole build: "teach your agent more" can add it later.
    const r = await extractFacts({
      question: q.text, answer: answers.C[q.id], userId, source: 'questionnaire_story', sourceRef: { kind: 'answer', id: `C.${q.id}` }, purpose: 'onboarding-story-facts',
    }).catch((err) => { if (err.name === 'BudgetExceededError') throw err; console.error(`onboarding ${userId}: story C.${q.id} skipped: ${err.message}`); return { facts: [], dropped: 0, story: null }; });
    progress('stories', ++storiesDone, stories.length);
    return r;
  });
  const dropped = extracted.reduce((s, e) => s + e.dropped, 0);
  const storyFacts = extracted.flatMap((e) => e.facts);
  const all = [...questionnaireFacts(answers), ...storyFacts, ...extracted.map((e) => e.story).filter(Boolean)];

  // 4. Concepts (dictionary only). Quick: exact/alias lookups only. Full: one batched pass (one embedding call, one
  // tie-break call for the ambiguous band).
  progress('concepts', 0, 1);
  const withConcept = all.filter((x) => x.conceptText);
  const conceptOf = quick
    ? new Map(await Promise.all(withConcept.map(async (f) => [`${f.conceptType}|${f.conceptText}`, (await lookupConcept(f.conceptText))?.id ?? null])))
    : await resolveConcepts(withConcept.map((f) => ({ text: f.conceptText, type: f.conceptType })), { userId });
  for (const f of withConcept) f.conceptId = conceptOf.get(`${f.conceptType}|${f.conceptText}`) ?? null;
  progress('concepts', 1, 1);

  // 5. Merge by factKey (dedupe across sections); opposite polarity → CONTRADICTS.
  const { facts: merged, contradictions } = mergeFacts(all.map(({ conceptText, conceptType, ...f }) => f));

  // 6. Contradictions between B lifestyle answers and stories (one batched LLM call).
  const bFacts = merged.filter((f) => LIFESTYLE_CHECKED.includes(f.attribute));
  const storyMerged = merged.filter((f) => f.source === 'questionnaire_story' && f.predicate !== 'story');
  if (!quick && bFacts.length && storyMerged.length) {
    const out = await chatJSON({ tier: 'mid', reasoning: false, temperature: 0, schema: contraSchema, purpose: 'onboarding-contradictions', userId,
      messages: findContradictions.build({ answers: bFacts.map((f) => ({ attribute: f.attribute, label: f.object })), facts: storyMerged.map((f) => ({ ...f, quote: f.evidence?.[0]?.quote ?? '' })) }),
    }).catch((err) => { if (err.name === 'BudgetExceededError') throw err; return { contradictions: [] }; });
    for (const c of out.contradictions) {
      const a = bFacts.find((f) => f.attribute === c.attribute);
      const b = storyMerged[c.fact - 1];
      // Precision guard: the model flagged "veg" vs "dal chawal" and "drinking" vs filter coffee. Keep a pair only
      // when the story actually mentions the thing (alcohol / smoking / non-veg food).
      const text = `${b?.object} ${b?.evidence?.map((e) => e.quote).join(' ')}`;
      if (a && b && EVIDENCE[a.attribute]?.test(text)) contradictions.push([a._key, b._key]);
    }
  }

  // 7. Re-submit plan against the current graph (tombstones, user edits, protected sources).
  const [existing, tombstones] = await Promise.all([
    KgFact.find({ subjectId: userId, observerId: null }).lean(),
    KgTombstone.distinct('key', { subjectId: userId }),
  ]);
  const plan = planResubmit({ merged, existing, tombstones });

  // 8. Embed only facts with no concept (stories, odd free text). Quick: none (phase 2 embeds them).
  const needVector = quick ? [] : plan.inserts.filter((f) => !f.conceptId);
  const vectors = needVector.length ? await embed(needVector.map(factText), { purpose: 'onboarding-embed', userId }) : [];
  needVector.forEach((f, i) => { f.embedding = vectors[i]; f.embeddingModel = embeddingModel(); });

  // 9. Voice profile from all of the user's samples (the new onboarding ones replace the old ones) + its description.
  const { samples, voice, style } = await voiceP;
  progress('saving', 0, 1);

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
      $set: { styleProfile: styleProfileV1(profile), 'onboarding.status': 'done', 'onboarding.completedAt': new Date(), graphStatus: quick ? 'building' : 'ready', ...(!quick && { graphReadyAt: new Date() }) },
      $inc: { graphVersion: 1 },
    }, { session });
    if (failBeforeCommit) throw new Error('injected failure before commit');
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
    emitToUser(userId, 'onboarding:done', { status: 'done', graphStatus: 'ready' });
  } catch (err) {
    if (err.name === 'BudgetExceededError') throw err; // re-queued by the worker, onboarding stays "processing"
    console.error(`onboarding ${userId} failed: ${err.message}`);
    // After a phase-1 build the app stays usable: only the graph is marked failed (agents use the phase-1 facts).
    const phase1 = await User.exists({ _id: userId, 'onboarding.status': 'done', graphStatus: 'building' });
    await User.updateOne({ _id: userId }, { $set: phase1 ? { graphStatus: 'failed' } : { 'onboarding.status': 'failed' } });
    emitToUser(userId, 'onboarding:done', { status: phase1 ? 'done' : 'failed', graphStatus: 'failed' });
  }
}
