// Step 1: each user's agent checks the OTHER profile for fakes and inconsistencies before any conversation.
// "Inconsistent" is not "fake": mild contradictions become gentle "clarify" topics for the brief (plan 07).
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { items } from '../../utils/zodItems.js';
import { Profile, PUBLIC_PROFILE } from '../../models/Profile.js';
import { ProfileCheck } from '../../models/ProfileCheck.js';
import { User } from '../../models/User.js';
import { asActor } from '../actor.js';
import { isVerbatim } from '../kg/extractFacts.js';
import { enqueue } from '../jobs/queue.js';
import { chatJSON } from '../llm/client.js';
import * as profileConsistency from '../prompts/profileConsistency.js';
import { profileText, ruleChecks } from './rules.js';

const SEVERITY_POINTS = { 1: 2, 2: 8, 3: 20 };

const schema = z.object({
  // items(): a malformed entry (e.g. a scam signal without "signal") is dropped instead of failing the whole check.
  contradictions: items(z.object({
    a: z.string().trim().min(1).max(300),
    b: z.string().trim().min(1).max(300),
    topic: z.string().trim().min(1).max(60),
    severity: z.coerce.number().int().min(1).max(3).catch(1),
  })).transform((xs) => xs.slice(0, 10)),
  scamSignals: items(z.object({ signal: z.string().trim().min(1).max(160), quote: z.string().trim().min(1).max(300) })).transform((xs) => xs.slice(0, 10)),
  genericBio: z.preprocess((v) => v === true || v === 'true', z.boolean()), // coerce.boolean would turn "false" into true
  summary: z.string().max(400).default(''),
});

// What the LLM sees: public profile content only. Dealbreakers are private to their owner, and the result is
// shown to the viewer, so they're left out.
const LIVE_CHECK_BONUS = 5; // points off the risk score for a passed live check (plan 19)

export const publicProfile = (p) => ({
  name: p.name, age: p.age, city: p.city, gender: p.gender, bio: p.bio ?? '',
  prompts: (p.prompts ?? []).map(({ q, a }) => ({ q, a })),
  tags: p.tags ?? {},
  photos: (p.photos ?? []).length,
});

/** Hash of exactly what the consistency check reads: same public content → same result, for every viewer. */
export const profileVersion = (profile) => createHash('sha256').update(JSON.stringify(publicProfile(profile))).digest('hex').slice(0, 24);

/**
 * The model part of the check, once per profile version (plan 30 S1): a cached result is reused by every viewer; a
 * failed call is never cached (the next check retries). → { contradictions, scamSignals, genericBio, summary }
 */
export async function consistency(profile, { userId, matchId } = {}) {
  const version = profileVersion(profile);
  if (profile.userId) {
    const hit = await ProfileCheck.findOne({ userId: profile.userId, version }, { llm: 1 }).lean();
    if (hit) return hit.llm;
  }
  try {
    const llm = await chatJSON({ tier: 'mid', messages: profileConsistency.build({ profile: publicProfile(profile) }), schema, purpose: 'trust-check', userId, matchId });
    if (profile.userId) await ProfileCheck.updateOne({ userId: profile.userId, version }, { $setOnInsert: { llm } }, { upsert: true }).catch(() => {});
    return llm;
  } catch (err) {
    console.error(`trust-check: consistency check unavailable (${err.code ?? err.name}): ${err.message}`);
    return { contradictions: [], scamSignals: [], genericBio: false, summary: 'Automatic consistency check unavailable; rule checks only.' };
  }
}

/** `profileCheck` job: precompute my own profile's check after onboarding or an edit, so a match never waits for it. */
export async function precheckProfile({ userId }) {
  const profile = await Profile.findOne({ userId }).select(PUBLIC_PROFILE).lean();
  if (profile) await consistency(profile, { userId });
}

const levelFor = (score, autoFake) => (autoFake || score < 40 ? 'likely_fake' : score < 70 ? 'caution' : 'ok');

/**
 * Check a profile object. → { score, level, flags, contradictions, clarify, summary, checkedAt }
 * If the LLM part fails (budget, bad JSON, provider down) the rule result still stands.
 */
export async function checkProfileData({ profile, accountAgeMinutes, userId, matchId }) {
  const rules = ruleChecks(profile, { accountAgeMinutes });
  const text = profileText(profile);
  let points = rules.points;
  const flags = [...rules.flags];
  const llm = await consistency(profile, { userId, matchId });

  // Every contradiction and scam signal must quote the profile's own words; drop the ones that don't.
  const contradictions = llm.contradictions.filter((c) => isVerbatim(c.b, text));
  const scamSignals = llm.scamSignals.filter((s) => isVerbatim(s.quote, text));
  for (const c of contradictions) points += SEVERITY_POINTS[c.severity];
  for (const s of scamSignals) { points += 25; flags.push(`Scam pattern: ${s.signal}`); }
  if (llm.genericBio) { points += 8; flags.push('Bio reads like a template'); }

  // Plan 19: a passed live check on their PUBLIC profile is one small positive. It never cancels a scam or off-app
  // signal, and "not checked" is never a flag.
  const clean = !scamSignals.length && !rules.money && !rules.contact;
  if (profile.liveChecked && clean) points = Math.max(0, points - LIVE_CHECK_BONUS);
  const score = 100 - Math.min(100, points);
  // Strong combination: a scam pattern (or money talk) AND pushing off-app is fake regardless of score.
  const autoFake = (scamSignals.length > 0 || rules.money) && rules.contact;
  return {
    score,
    level: levelFor(score, autoFake),
    flags,
    contradictions,
    scamSignals,
    clarify: contradictions.filter((c) => c.severity <= 2).map((c) => `${c.topic}: profile says two different things`),
    summary: llm.summary,
    liveChecked: Boolean(profile.liveChecked),
    checkedAt: new Date(),
  };
}

/**
 * viewer's agent checks subject's PUBLIC profile (plan 06 boundary): the public projection + account age, nothing
 * else of theirs (no gate, dealbreakers, graph or voice). Runs as the 'trust' actor so the DB spy can verify it.
 */
export const checkProfile = (viewerId, subjectId, matchId) => asActor({ role: 'trust', userId: viewerId, otherId: subjectId }, async () => {
  const [profile, subject] = await Promise.all([
    Profile.findOne({ userId: subjectId }).select(PUBLIC_PROFILE).lean(),
    User.findById(subjectId, { createdAt: 1 }).lean(),
  ]);
  if (!profile) return { score: 0, level: 'caution', flags: ['Profile missing'], contradictions: [], scamSignals: [], clarify: [], summary: '', checkedAt: new Date() };
  const accountAgeMinutes = subject?.createdAt ? (Date.now() - new Date(subject.createdAt)) / 60_000 : Infinity;
  return checkProfileData({ profile, accountAgeMinutes, userId: viewerId, matchId });
});

/** Queue my profile's check (debounced: a burst of edits runs it once). */
export const queueProfileCheck = (userId) => enqueue('profileCheck', { userId: String(userId) }, { dedupeKey: `profileCheck:${userId}`, runAt: new Date(Date.now() + 5000) })
  .catch((err) => console.error(`profileCheck ${userId} not queued: ${err.message}`));
