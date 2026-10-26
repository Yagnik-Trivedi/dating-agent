// UX P0-5 "Try a demo match": a new user with no matches can start one with a seed persona (Profile.demo) from their
// own deck (gate both ways), so the agent experience is reachable even when no real person has liked them yet.
// The two scam personas (designNotes "fake: …") exist to test the trust check and are never offered.
import { readFileSync } from 'node:fs';
import { Like } from '../models/Like.js';
import { Match } from '../models/Match.js';
import { Profile } from '../models/Profile.js';
import { buildGate, discoverQuery, passesGate } from './match/gate.js';
import { createMatch } from './matches.js';
import { blockedIds } from './safety.js';

const personas = JSON.parse(readFileSync(new URL('../../seed/personas.json', import.meta.url)));
export const SCAM_SEED_EMAILS = new Set(personas.filter((p) => /^fake\b/i.test(p.designNotes ?? '')).map((p) => p.email));

/** A demo persona I could match with now: in my deck, not a scam persona, not already liked or matched. → userId | null */
export async function pickDemoPersona(me) {
  const mine = await Profile.findOne({ userId: me }, { gate: 1 }).lean();
  const gate = mine?.gate ?? await buildGate(me);
  const matched = (await Match.find({ users: me }, { users: 1 }).lean()).flatMap((m) => m.users);
  const [liked, blocked] = await Promise.all([Like.distinct('toUserId', { fromUserId: me }), blockedIds(me)]);
  const candidates = await Profile.aggregate([
    { $match: { $and: [discoverQuery(gate, [me, ...matched, ...liked, ...blocked]), { demo: true }] } },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'u', pipeline: [{ $project: { email: 1, isSeed: 1 } }] } },
    { $sample: { size: 20 } },
    { $project: { userId: 1, gate: 1, u: 1 } },
  ]);
  const ok = candidates.find((c) => c.u[0]?.isSeed && !SCAM_SEED_EMAILS.has(c.u[0].email) && passesGate(gate, c.gate));
  return ok?.userId ?? null;
}

/** Mutual like + match with a demo persona; the pipeline (trust → brief → agents) starts as for any match. → match | null */
export async function startDemoMatch(me) {
  const seedId = await pickDemoPersona(me);
  if (!seedId) return null;
  await Like.updateOne({ fromUserId: me, toUserId: seedId }, { $set: { liked: true, target: { kind: 'profile' } } }, { upsert: true });
  await Like.updateOne({ fromUserId: seedId, toUserId: me }, { $set: { liked: true, target: { kind: 'profile' } } }, { upsert: true });
  return createMatch(me, seedId);
}
