// Step 1: each user's agent checks the OTHER profile for fakes and inconsistencies before any conversation.
// "Inconsistent" is not "fake": mild contradictions become gentle "clarify" topics for the brief (plan 07).
import { z } from 'zod';
import { items } from '../../utils/zodItems.js';
import { Profile, PUBLIC_PROFILE } from '../../models/Profile.js';
import { User } from '../../models/User.js';
import { asActor } from '../actor.js';
import { isVerbatim } from '../kg/extractFacts.js';
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
export const publicProfile = (p) => ({
  name: p.name, age: p.age, city: p.city, gender: p.gender, bio: p.bio ?? '',
  prompts: (p.prompts ?? []).map(({ q, a }) => ({ q, a })),
  tags: p.tags ?? {},
  photos: (p.photos ?? []).length,
});

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
  let llm = { contradictions: [], scamSignals: [], genericBio: false, summary: '' };

  try {
    llm = await chatJSON({ tier: 'mid', messages: profileConsistency.build({ profile: publicProfile(profile) }), schema, purpose: 'trust-check', userId, matchId });
  } catch (err) {
    console.error(`trust-check: consistency check unavailable (${err.code ?? err.name}): ${err.message}`);
    llm.summary = 'Automatic consistency check unavailable; rule checks only.';
  }

  // Every contradiction and scam signal must quote the profile's own words; drop the ones that don't.
  const contradictions = llm.contradictions.filter((c) => isVerbatim(c.b, text));
  const scamSignals = llm.scamSignals.filter((s) => isVerbatim(s.quote, text));
  for (const c of contradictions) points += SEVERITY_POINTS[c.severity];
  for (const s of scamSignals) { points += 25; flags.push(`Scam pattern: ${s.signal}`); }
  if (llm.genericBio) { points += 8; flags.push('Bio reads like a template'); }

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
