// Step 2, one direction: before the first message, viewer's agent reads subject's profile, compares it with the
// viewer's own graph, and plans what the conversation must find out.
import { z } from 'zod';
import { KgFact } from '../../models/KgFact.js';
import { Profile } from '../../models/Profile.js';
import { User } from '../../models/User.js';
import { isVerbatim } from '../kg/extractFacts.js';
import { embedFacts } from '../kg/factEmbedding.js';
import { TOPICS } from '../kg/questionnaireFacts.js';
import { cosine } from '../kg/similarity.js';
import { chatJSON, embeddingModel } from '../llm/client.js';
import * as dealbreakerClash from '../prompts/dealbreakerClash.js';
import * as matchBrief from '../prompts/matchBrief.js';
import * as profileToFacts from '../prompts/profileToFacts.js';
import { publicProfile } from '../trust/checkProfile.js';
import { profileText } from '../trust/rules.js';

// ponytail: calibrated for nvidia/nemotron-3-embed-1b; the plan's 0.80/0.75 only catch near-identical text with it
// ("trekking" vs "hiking in the sahyadris" = 0.72, "trekking" vs "board games" = 0.58, a smoking dealbreaker vs
// "smoking: regularly" = 0.46). Dealbreaker candidates are cheap to over-include: the clash prompt decides.
// Re-measure after switching embedding models (plan 14).
export const THRESHOLDS = { overlap: 0.70, related: 0.65, dealbreakerCandidate: 0.40 };
const TAG_CONFIDENCE = 0.6;
const TEXT_CONFIDENCE = 0.4;
const AGENDA_SIZE = 8;
const CLARIFY_PRIORITY = 0.6;

const factsSchema = z.object({
  facts: z.array(z.object({
    predicate: z.enum(profileToFacts.PREDICATES),
    object: z.string().trim().min(1).max(80),
    weight: z.coerce.number().min(0).max(1).catch(0.5),
    quote: z.string().trim().min(1).max(400),
  })).default([]),
});
const clashSchema = z.object({
  clash: z.preprocess((v) => v === true || v === 'true', z.boolean()),
  why: z.string().trim().max(300).default(''),
});
const briefSchema = z.object({
  summary: z.string().trim().max(800).default(''),
  openers: z.array(z.object({ text: z.string().trim().min(1).max(300), hook: z.string().trim().max(120).default('') })).max(6).default([]),
  watchouts: z.array(z.string().trim().min(1).max(200)).max(6).default([]),
});

/** Structured profile tags → facts phrased like the questionnaire's ("smoking: regularly"), confidence 0.6. */
export function tagFacts(profile) {
  const t = profile.tags ?? {};
  const facts = [];
  const add = (predicate, object, quote) => facts.push({ predicate, object: object.toLowerCase(), weight: 0.7, confidence: TAG_CONFIDENCE, quote });
  for (const i of new Set((t.interests ?? []).map((x) => x.trim()).filter(Boolean))) add('likes', i, `tags.interests: ${i}`);
  for (const k of ['smoking', 'drinking', 'diet', 'workout']) {
    const v = t.lifestyle?.[k];
    if (v) add('lifestyle', `${TOPICS[k] ?? k}: ${v}`, `tags.lifestyle.${k}: ${v}`);
  }
  if (t.wantsKids) add('goal', `${TOPICS.kids}: ${t.wantsKids}`, `tags.wantsKids: ${t.wantsKids}`);
  if (t.relationshipGoal) add('goal', `${TOPICS.looking_for}: ${t.relationshipGoal}`, `tags.relationshipGoal: ${t.relationshipGoal}`);
  if (t.religionImportance) add('values', `${TOPICS.religion}: ${t.religionImportance}`, `tags.religionImportance: ${t.religionImportance}`);
  return facts;
}

/** 1. Profile → observed facts about subject, saved (observerId = viewer) and embedded. → plain facts with embeddings. */
async function observeProfile({ profile, viewerId, subjectId, matchId }) {
  const text = profileText(profile);
  let fromText = [];
  if (text.trim()) {
    try {
      const out = await chatJSON({
        // Reasoning off: literal extraction (quotes are verified in code); with reasoning it timed out at 120 s on NVIDIA.
        tier: 'mid', reasoning: false, schema: factsSchema, purpose: 'brief-profile-facts', userId: viewerId, matchId,
        messages: profileToFacts.build({ profile: { bio: profile.bio ?? '', prompts: (profile.prompts ?? []).map(({ q, a }) => ({ q, a })) } }),
      });
      fromText = out.facts.filter((f) => isVerbatim(f.quote, text)).slice(0, 10).map((f) => ({ ...f, confidence: TEXT_CONFIDENCE }));
    } catch (err) {
      console.error(`brief: profile facts unavailable (${err.code ?? err.name}): ${err.message}`);
    }
  }
  const facts = [...tagFacts(profile), ...fromText].map(({ quote, ...f }) => ({
    ...f, subjectId, observerId: viewerId, matchId, source: 'profile', disclosure: 'public', evidence: [{ quote }],
  }));
  const vectors = await embedFacts(facts, { userId: viewerId });
  facts.forEach((f, i) => Object.assign(f, vectors[i]));
  await KgFact.deleteMany({ matchId, observerId: viewerId, source: 'profile' });
  if (facts.length) await KgFact.insertMany(facts);
  return facts;
}

/** The viewer's own facts with current-model embeddings (missing or stale ones are embedded now, not saved). */
export async function selfFacts(viewerId, viewerProfile) {
  const facts = await KgFact.find({ subjectId: viewerId, observerId: null }).select('+embedding').lean();
  // Free-text dealbreakers from the profile page count too.
  for (const d of viewerProfile?.dealbreakers ?? []) facts.push({ predicate: 'dealbreaker', object: d, weight: 1, confidence: 1, disclosure: 'if_asked' });
  const model = embeddingModel();
  const stale = facts.filter((f) => !f.embedding?.length || f.embeddingModel !== model);
  const vectors = await embedFacts(stale, { userId: viewerId });
  stale.forEach((f, i) => Object.assign(f, vectors[i]));
  return facts;
}

// "smoking: never" vs "smoking: regularly" embed close together but are opposite answers, not an overlap.
export const differentAnswer = (a, b) => {
  const [ta, va] = a.split(': ');
  const [tb, vb] = b.split(': ');
  return va !== undefined && vb !== undefined && ta === tb && va !== vb;
};

/** 2a. Shared likes/values (cosine ≥ overlap), one pairing per fact, top 5. */
export function findOverlaps(self, observed) {
  const OVERLAP = ['likes', 'values'];
  const pairs = [];
  for (const m of self.filter((f) => OVERLAP.includes(f.predicate) && f.disclosure === 'public')) {
    for (const o of observed.filter((f) => OVERLAP.includes(f.predicate))) {
      const score = cosine(m.embedding, o.embedding);
      if (score >= THRESHOLDS.overlap && !differentAnswer(m.object, o.object)) pairs.push({ m, o, score });
    }
  }
  const usedM = new Set(), usedO = new Set(), out = [];
  for (const p of pairs.sort((a, b) => b.score - a.score)) {
    if (usedM.has(p.m) || usedO.has(p.o)) continue;
    usedM.add(p.m); usedO.add(p.o);
    out.push({ topic: p.m.object, theirs: p.o.object, quote: p.o.evidence[0]?.quote ?? '', score: Math.round(p.score * 100) / 100 });
    if (out.length === 5) break;
  }
  return out;
}

/**
 * Dealbreaker clash: viewer dealbreakers vs observed facts with confidence ≥ minConfidence. The top `top` candidates by
 * cosine go to the clash prompt (fast). → { topic, why, theirs, quote } for the first confirmed clash, or null.
 * Used before the conversation (plan 07, structured tags) and during it (plan 08 stop rule).
 */
export async function findClash({ self, observed, viewerId, matchId, minConfidence, top = 3 }) {
  const candidates = [];
  for (const d of self.filter((f) => f.predicate === 'dealbreaker')) {
    for (const o of observed.filter((f) => f.confidence >= minConfidence)) {
      const score = cosine(d.embedding, o.embedding);
      if (score >= THRESHOLDS.dealbreakerCandidate) candidates.push({ d, o, score });
    }
  }
  const best = candidates.sort((a, b) => b.score - a.score).slice(0, top);
  const verdicts = await Promise.all(best.map(({ d, o }) => chatJSON({
    tier: 'fast', schema: clashSchema, purpose: 'dealbreaker-clash', userId: viewerId, matchId,
    messages: dealbreakerClash.build({ dealbreaker: d.object, observed: `${o.predicate} ${o.object}` }),
  }).catch((err) => {
    if (err.name === 'BudgetExceededError') throw err;
    console.error(`dealbreaker check unavailable (${err.code ?? err.name}): ${err.message}`);
    return { clash: false, why: '' };
  })));
  const hit = verdicts.findIndex((v) => v.clash);
  if (hit < 0) return null;
  const { d, o } = best[hit];
  return { topic: topicOf(d), why: verdicts[hit].why || `Conflicts with your dealbreaker on ${topicOf(d)}.`, theirs: o.object, quote: o.evidence?.at(-1)?.quote ?? '' };
}

/** A neutral topic for a fact: "smoking: never" → "smoking"; "partner must be compatible on smoking (mine: never)" → "smoking". */
export function topicOf(f) {
  const db = f.object.match(/^partner must be compatible on (.+?) \(mine:/);
  if (db) return db[1];
  return f.object.split(': ')[0].replace(/^(no|not|never)\s+/i, '').slice(0, 60).trim();
}

const WHY = { dealbreaker: 'A dealbreaker for you', values: 'Matters to you', goal: 'Your long-term plans', lifestyle: 'Your day-to-day', likes: 'Something you love' };

/**
 * 3. Agenda: what this conversation must find out. Dimensions come from the viewer's graph; priority =
 * importance × (1 − what the profile already tells us). Private facts never become topics (dealbreakers only
 * contribute their neutral topic, never their content).
 */
export function buildAgenda({ self, observed, clarify = [] }) {
  const usable = (f) => f.predicate === 'dealbreaker' || f.disclosure === 'public';
  // Dimensions come from structured answers (onboarding B + D, profile dealbreakers), which carry no quote.
  // Facts extracted from stories ("visit Hampi") are things to talk about, not things to find out.
  const structured = (f) => !f.evidence?.length;
  const dims = [
    ...self.filter((f) => ['dealbreaker', 'values', 'goal', 'lifestyle'].includes(f.predicate) && usable(f) && structured(f)),
    ...self.filter((f) => f.predicate === 'likes' && usable(f) && structured(f)).sort((a, b) => b.weight - a.weight).slice(0, 5),
  ];
  const byTopic = new Map();
  for (const f of dims) {
    const topic = topicOf(f);
    const key = topic.toLowerCase();
    const known = Math.max(0, ...observed.filter((o) => cosine(f.embedding, o.embedding) >= THRESHOLDS.related).map((o) => o.confidence));
    // A dealbreaker is only known from an answer on the same topic ("wants children: no"): a merely related fact
    // ("looking for: long-term" scores 0.65+ against kids) once made the agent skip the kids question entirely.
    const exact = Math.max(0, ...observed.filter((o) => topicOf(o).toLowerCase() === key).map((o) => o.confidence));
    const cur = byTopic.get(key);
    // Merged topics ("smoking" as a dealbreaker and as a lifestyle fact): highest importance, best knowledge.
    if (!cur) byTopic.set(key, { topic, why: WHY[f.predicate], importance: f.weight, known, exact, dealbreaker: f.predicate === 'dealbreaker' });
    else {
      if (f.weight > cur.importance || f.predicate === 'dealbreaker') Object.assign(cur, { importance: Math.max(cur.importance, f.weight), why: WHY[f.predicate] });
      Object.assign(cur, { known: Math.max(cur.known, known), exact: Math.max(cur.exact, exact), dealbreaker: cur.dealbreaker || f.predicate === 'dealbreaker' });
    }
  }
  const items = [...byTopic.values()].map((d) => {
    const known = d.dealbreaker ? d.exact : d.known;
    return { topic: d.topic, why: d.why, priority: d.importance * (1 - known), confidence: known, ...(d.dealbreaker && { dealbreaker: true }) };
  });
  for (const topic of clarify) {
    const cur = items.find((i) => i.topic.toLowerCase() === topic.toLowerCase());
    if (cur) cur.priority = Math.max(cur.priority, CLARIFY_PRIORITY);
    else items.push({ topic, why: 'Gentle clarification from the trust check', priority: CLARIFY_PRIORITY, confidence: 0 });
  }
  const r2 = (x) => Math.round(x * 100) / 100;
  return items
    .sort((a, b) => b.priority - a.priority)
    .slice(0, AGENDA_SIZE)
    .map((a, i) => ({ id: `a${i + 1}`, topic: a.topic, why: a.why, priority: r2(a.priority), confidence: r2(a.confidence), status: 'open', ...(a.dealbreaker && { dealbreaker: true }) }));
}

const sentences = (s) => s.split(/[.!?]+(?:\s|$)/).filter((x) => x.trim()).length;

/** 4. Summary, 3 openers in the viewer's voice, watchouts. On failure the brief is still usable (plan 08 writes its own opener). */
async function writeBrief({ viewerId, matchId, viewerName, profile, overlaps, agenda, styleProfile }) {
  const style = [
    styleProfile?.description,
    styleProfile?.doList?.length && `Do: ${styleProfile.doList.join('; ')}`,
    styleProfile?.dontList?.length && `Don't: ${styleProfile.dontList.join('; ')}`,
  ].filter(Boolean).join('\n');
  try {
    const out = await chatJSON({
      tier: 'mid', schema: briefSchema, purpose: 'brief', userId: viewerId, matchId,
      messages: matchBrief.build({ userName: viewerName, profile: publicProfile(profile), overlaps: overlaps.map((o) => o.topic), agendaTopics: agenda.slice(0, 5).map((a) => a.topic), style }),
    });
    return { summary: out.summary, openers: out.openers.filter((o) => sentences(o.text) <= 2).slice(0, 3), watchouts: out.watchouts.slice(0, 3) };
  } catch (err) {
    console.error(`brief: summary unavailable (${err.code ?? err.name}): ${err.message}`);
    return { summary: '', openers: [], watchouts: [] };
  }
}

/** viewer's brief on subject. → { summary, overlaps, agenda, openers, watchouts, earlyDealbreaker, builtAt } */
export async function buildBrief({ viewerId, subjectId, matchId, trust }) {
  const [profile, viewerProfile, viewer] = await Promise.all([
    Profile.findOne({ userId: subjectId }).lean(),
    Profile.findOne({ userId: viewerId }).lean(),
    User.findById(viewerId, { name: 1, styleProfile: 1 }).lean(),
  ]);
  if (!profile) throw new Error('subject profile missing');
  const [observed, self] = await Promise.all([
    observeProfile({ profile, viewerId, subjectId, matchId }),
    selfFacts(viewerId, viewerProfile),
  ]);
  const overlaps = findOverlaps(self, observed);
  const clarify = (trust?.contradictions ?? []).filter((c) => c.severity <= 2).map((c) => c.topic);
  const agenda = buildAgenda({ self, observed, clarify });
  // A dealbreaker clash ends things before any conversation, so don't spend tokens on openers.
  const earlyDealbreaker = await findClash({ self, observed, viewerId, matchId, minConfidence: TAG_CONFIDENCE });
  const written = earlyDealbreaker
    ? { summary: '', openers: [], watchouts: [] }
    : await writeBrief({ viewerId, matchId, viewerName: viewerProfile?.name ?? viewer?.name ?? 'the user', profile, overlaps, agenda, styleProfile: viewer?.styleProfile });
  return { ...written, overlaps, agenda, earlyDealbreaker, builtAt: new Date() };
}
