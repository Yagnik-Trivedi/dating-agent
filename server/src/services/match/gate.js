// The pre-chat gate (plan 15 §1, plan 17 §5): basics + dealbreakers in both directions, code only, boolean only.
// Profile.gate is denormalised from Profile basics and section B answers; it is never shown to an LLM or another user.
import { NOT_ACTIVE, Profile } from '../../models/Profile.js';
import { User } from '../../models/User.js';
import { distanceKm } from '../cities.js';
import { QUESTIONS } from '../kg/questions.js';

export const GATE_ATTRIBUTES = QUESTIONS.sections.find((s) => s.id === 'B').items.map((i) => i.id);
const NONE = '__none__'; // "I have no answer": never in anyone's accepts, so their dealbreaker excludes me
const norm = (s) => (s ? String(s).trim().toLowerCase() : undefined);

/** Profile basics + B answers → gate. v1 answers ({ answer, importance: 'dealbreaker' }) accept only the same answer. */
export function gateFrom(profile = {}, answersB = {}) {
  const values = {}, accepts = {}, dealbreakers = [];
  for (const k of GATE_ATTRIBUTES) {
    const a = answersB[k];
    if (!a?.answer) continue;
    values[k] = a.answer;
    if (a.dealbreaker || a.importance === 'dealbreaker') {
      dealbreakers.push(k);
      accepts[k] = a.accepts?.length ? a.accepts : [a.answer];
    }
  }
  return {
    age: profile.age, gender: norm(profile.gender), interestedIn: (profile.interestedIn ?? []).map(norm),
    ageMin: profile.ageMin ?? 18, ageMax: profile.ageMax ?? 99, city: norm(profile.city),
    ...(profile.geo && { geo: profile.geo }), ...(profile.radiusKm && { radiusKm: profile.radiusKm }),
    values, accepts, dealbreakers,
  };
}

/**
 * Plan 31 A2: the public profile "basics", filled from my OWN section-B answers (Hinge-style). B option value → the
 * Profile.tags path; values are kept as is (the client labels them). Owner's defaults (2026-10-21): religion hidden.
 */
export const BASICS = { looking_for: 'relationshipGoal', kids: 'wantsKids', smoking: 'lifestyle.smoking', drinking: 'lifestyle.drinking', diet: 'lifestyle.diet', religion: 'religionImportance' };
export const BASICS_HIDDEN_DEFAULT = ['religion'];
export const hiddenBasics = (profile) => profile?.tagsHidden ?? BASICS_HIDDEN_DEFAULT;

/**
 * The tags update for my basics. A hidden basic is removed from tags, so it never reaches any public read, prompt or
 * the other user (the gate still has it). A basic I set by hand (tagsEdited) is kept. No B answer → left as it is.
 * → { $set, $unset } (dotted paths)
 */
export function basicsUpdate(profile = {}, answersB = {}) {
  const hidden = hiddenBasics(profile);
  const edited = profile.tagsEdited ?? [];
  const $set = {}, $unset = {};
  for (const [attr, path] of Object.entries(BASICS)) {
    if (hidden.includes(attr)) $unset[`tags.${path}`] = 1;
    else if (!edited.includes(attr) && answersB[attr]?.answer) $set[`tags.${path}`] = answersB[attr].answer;
  }
  return { $set, $unset };
}

/** Rebuild one user's Profile.gate and public basics (after onboarding, a profile edit or a B change). session: optional. */
export async function buildGate(userId, { session = null } = {}) {
  const [profile, user] = await Promise.all([
    Profile.findOne({ userId }).session(session).lean(),
    User.findById(userId, { 'onboarding.answers.B': 1 }).session(session).lean(),
  ]);
  if (!profile) return null;
  const answersB = user?.onboarding?.answers?.B ?? {};
  const gate = gateFrom(profile, answersB);
  const basics = basicsUpdate(profile, answersB);
  await Profile.updateOne({ userId }, { $set: { gate, ...basics.$set }, ...(Object.keys(basics.$unset).length && { $unset: basics.$unset }) }, { session });
  return gate;
}

/** One indexed filter for my discover deck: everyone who passes my gate and whose gate I pass. */
export function discoverQuery(me, excludeUserIds = []) {
  const g = me ?? {};
  const and = [{ userId: { $nin: excludeUserIds } }, { status: { $nin: NOT_ACTIVE } }]; // plan 30 S2: missing = active
  // Location, my side: within my radius when I set one (and we both have coordinates), else the same city.
  // No city → only others without one (mirrors passesGate). Their side: same city, unless they set a radius;
  // those are checked exactly by passesGate after the query (the discover route filters with it).
  const R = 6371;
  and.push(g.radiusKm && g.geo ? { 'gate.geo': { $geoWithin: { $centerSphere: [g.geo.coordinates, g.radiusKm / R] } } } : { 'gate.city': g.city ?? null });
  and.push({ $or: [{ 'gate.city': g.city ?? null }, { 'gate.radiusKm': { $gt: 0 }, 'gate.geo': { $exists: true } }] });
  if (g.interestedIn?.length) and.push({ 'gate.gender': { $in: g.interestedIn } });
  // An empty "interested in" means open to everyone (v1 behaviour).
  and.push({ $or: [{ 'gate.interestedIn': g.gender ?? NONE }, { 'gate.interestedIn': { $size: 0 } }] });
  and.push({ 'gate.age': { $gte: g.ageMin ?? 18, $lte: g.ageMax ?? 99 } });
  and.push({ 'gate.ageMin': { $lte: g.age ?? -1 }, 'gate.ageMax': { $gte: g.age ?? 999 } });
  // My dealbreakers vs their values (no answer = mismatch).
  for (const k of g.dealbreakers ?? []) and.push({ [`gate.values.${k}`]: { $in: g.accepts?.[k] ?? [] } });
  // Their dealbreakers vs my values: my values are constants here ($ne on an array = "doesn't contain").
  and.push({ $nor: GATE_ATTRIBUTES.map((k) => ({ 'gate.dealbreakers': k, [`gate.accepts.${k}`]: { $ne: g.values?.[k] ?? NONE } })) });
  return { $and: and };
}

const passesOneWay = (a, b) => {
  const near = a.radiusKm && a.geo && b.geo ? distanceKm(a.geo, b.geo) <= a.radiusKm : (a.city ?? null) === (b.city ?? null);
  if (!near) return false;
  if (a.interestedIn?.length && !a.interestedIn.includes(b.gender)) return false;
  if (b.age == null || b.age < (a.ageMin ?? 18) || b.age > (a.ageMax ?? 99)) return false;
  return (a.dealbreakers ?? []).every((k) => (a.accepts?.[k] ?? []).includes(b.values?.[k]));
};
/** Boolean only: no score, no reasons (neither agent may learn why a pair was excluded). */
export const passesGate = (a, b) => Boolean(a && b && passesOneWay(a, b) && passesOneWay(b, a));
