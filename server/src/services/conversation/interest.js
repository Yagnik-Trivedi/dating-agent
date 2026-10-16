// The interest meter (plan 08 §2.2): deterministic, constants in kg/config.js (tuned by plan 11's eval).
import { KG } from '../kg/config.js';

export const baselineOf = (extraversion = 0.5) => 0.4 + 0.2 * extraversion;

/**
 * state: { interest, lowInterestTurns, topicsTouched }; p: perception summary
 * { likes: [strength], dislikes: [strength], aboutMeQuestion, humor, laughsEasily, lowEffort, topics: [conceptId|text] }
 * → new { interest, lowInterestTurns }
 */
export function updateInterest(state, p, { extraversion = 0.5 } = {}) {
  const base = baselineOf(extraversion);
  let i = state.interest ?? base;
  for (const s of p.likes ?? []) i += KG.K_LIKE * s;
  for (const s of p.dislikes ?? []) i -= KG.K_DISLIKE * s;
  if (p.aboutMeQuestion) i += KG.K_QUESTION;
  if (p.humor && p.laughsEasily) i += KG.K_HUMOR;
  if (p.lowEffort) i -= KG.K_LOW_EFFORT;
  if ((p.topics ?? []).some((t) => (state.topicsTouched ?? []).includes(String(t)))) i -= KG.K_REPEAT;
  i = Math.min(1, Math.max(0, i + KG.K_DECAY * (base - i)));
  const interest = Math.round(i * 1000) / 1000;
  return { interest, lowInterestTurns: interest < KG.LOW_INTEREST ? (state.lowInterestTurns ?? 0) + 1 : 0 };
}
