// The pre-chat gate (plan 15 §1, plan 17 §5): basics + dealbreakers in both directions, code only, boolean only.
// Profile.gate is denormalised from Profile basics and section B answers; it is never shown to an LLM or another user.
import { Profile } from '../../models/Profile.js';
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

/** Rebuild one user's Profile.gate (after onboarding, a profile edit or a B change). */
export async function buildGate(userId) {
  const [profile, user] = await Promise.all([Profile.findOne({ userId }).lean(), User.findById(userId, { 'onboarding.answers.B': 1 }).lean()]);
  if (!profile) return null;
  const gate = gateFrom(profile, user?.onboarding?.answers?.B);
  await Profile.updateOne({ userId }, { $set: { gate } });
  return gate;
}

/** One indexed filter for my discover deck: everyone who passes my gate and whose gate I pass. */
export function discoverQuery(me, excludeUserIds = []) {
  const g = me ?? {};
  const and = [{ userId: { $nin: excludeUserIds } }];
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
