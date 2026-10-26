import { Router } from 'express';
import { z } from 'zod';
import { Like } from '../models/Like.js';
import { Match } from '../models/Match.js';
import { NOT_ACTIVE, Profile } from '../models/Profile.js';
import { User } from '../models/User.js';
import { enqueue } from '../services/jobs/queue.js';
import { buildGate, discoverQuery, passesGate } from '../services/match/gate.js';
import { createMatch, PUBLIC_PROJECTION } from '../services/matches.js';
import { pickDemoPersona, startDemoMatch } from '../services/demo.js';
import { blockedIds } from '../services/safety.js';
import { scanMessage } from '../services/trust/rules.js';
import { emitToUser } from '../sockets/io.js';
import { httpError, objectId, parse } from '../utils/http.js';

export const discoverRouter = Router();

// Plan 30 S2: a held profile can't browse or like until it's fixed (the client shows "Your profile needs a fix").
const notHeld = (profile) => {
  if (profile?.status === 'held') throw httpError(403, 'PROFILE_HELD', 'Your profile needs a fix before you can browse.');
};
const isBlocked = async (me, other) => (await blockedIds(me)).some((id) => String(id) === String(other));

discoverRouter.get('/discover', async (req, res) => {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }), req.query);
  const me = req.user._id;
  const [seen, mine, blocked] = await Promise.all([
    Like.distinct('toUserId', { fromUserId: me }),
    Profile.findOne({ userId: me }, { gate: 1, status: 1 }).lean(),
    blockedIds(me),
  ]);
  notHeld(mine);
  const gate = mine?.gate ?? await buildGate(me);
  // One indexed query (gate both ways), random order: nothing is ranked by overlap (plan 15 §1).
  const found = await Profile.aggregate([
    // UX P0-1: nobody sees a profile with no approved photo; demo personas (illustrations) are exempt.
    { $match: { $and: [discoverQuery(gate, [me, ...seen, ...blocked]), { $or: [{ 'photos.0': { $exists: true } }, { demo: true }] }] } },
    { $sample: { size: limit } },
    { $addFields: { _gate: '$gate' } },
    { $project: PUBLIC_PROJECTION },
  ]);
  // The query is exact except for the other side's optional radius, which only code can check.
  const profiles = found.filter((p) => passesGate(gate, p._gate)).map(({ _gate, ...p }) => p);
  res.json({ profiles });
});

// Plan 30 S3.2: one public profile (/u/:id). Hidden when blocked either way or not active, unless we're matched.
discoverRouter.get('/profiles/:userId', async (req, res) => {
  const other = parse(objectId, req.params.userId);
  const me = req.user._id;
  const profile = !await isBlocked(me, other) && await Profile.findOne({ userId: other }, PUBLIC_PROJECTION).lean();
  const visible = profile && (!NOT_ACTIVE.includes((await Profile.findOne({ userId: other }, { status: 1 }).lean())?.status)
    || await Match.exists({ users: { $all: [me, other] } }));
  if (!visible) throw httpError(404, 'NOT_FOUND', 'Profile not found');
  res.json({ profile });
});

// Plan 30 S3.5 Likes you: everyone who liked me and whom I haven't answered, with what they liked. Free, never blurred.
discoverRouter.get('/likes/incoming', async (req, res) => {
  const me = req.user._id;
  const [answered, blocked] = await Promise.all([Like.distinct('toUserId', { fromUserId: me }), blockedIds(me)]);
  const likes = await Like.find({ toUserId: me, liked: true, fromUserId: { $nin: [...answered, ...blocked] } }).sort({ createdAt: -1 }).limit(100).lean();
  const profiles = await Profile.find({ userId: { $in: likes.map((l) => l.fromUserId) }, status: { $nin: NOT_ACTIVE } }, PUBLIC_PROJECTION).lean();
  const byId = new Map(profiles.map((p) => [String(p.userId), p]));
  res.json({ likes: likes.filter((l) => byId.has(String(l.fromUserId))).map((l) => ({ profile: byId.get(String(l.fromUserId)), target: l.target ?? { kind: 'profile' }, comment: l.comment ?? null, at: l.createdAt })) });
});

// Demo: a seed persona likes every real user who likes them, after a short human-looking pause (2–8 s).
const seedLikesBack = (seedId, userId) => enqueue('seedLikeBack', { seedId: String(seedId), userId: String(userId) }, {
  runAt: new Date(Date.now() + 2000 + Math.random() * 6000), dedupeKey: `likeback:${seedId}:${userId}`,
});

const likeBody = z.object({
  toUserId: objectId,
  liked: z.boolean(),
  target: z.object({ kind: z.enum(['photo', 'prompt', 'profile']), ref: z.string().max(500).optional() }).optional(),
  comment: z.string().trim().max(150).optional(),
});

discoverRouter.post('/likes', async (req, res) => {
  const { toUserId, liked, target, comment } = parse(likeBody, req.body);
  const me = req.user._id;
  if (toUserId === String(me)) throw httpError(400, 'VALIDATION', 'You cannot like yourself');
  if (!await User.exists({ _id: toUserId }) || await isBlocked(me, toUserId)) throw httpError(404, 'NOT_FOUND', 'User not found');
  notHeld(await Profile.findOne({ userId: me }, { status: 1 }).lean());
  // A first message can't push someone off the app or talk money (the same rules as the trust check).
  if (comment && scanMessage(comment).severity >= 2) throw httpError(400, 'COMMENT_NOT_ALLOWED', 'Comments can’t include contact details, other apps or money. Say hello here first.');

  await Like.updateOne({ fromUserId: me, toUserId }, { $set: { liked, ...(liked && { target: target ?? { kind: 'profile' }, comment: comment || undefined }) } }, { upsert: true });
  const mutual = liked && await Like.exists({ fromUserId: toUserId, toUserId: me, liked: true });
  if (!mutual) {
    if (liked && !req.user.isSeed && await User.exists({ _id: toUserId, isSeed: true })) await seedLikesBack(toUserId, me);
    // Likes you updates live; a browse_only liker's like waits until they're active (it isn't listed before).
    if (liked && !NOT_ACTIVE.includes((await Profile.findOne({ userId: me }, { status: 1 }).lean())?.status)) emitToUser(toUserId, 'like:new', {});
    return res.json({ matched: false });
  }

  const match = await createMatch(me, toUserId);
  res.json(match ? { matched: true, matchId: match._id } : { matched: false }); // not active yet: delivered later
});

// UX P0-5 "Try a demo match": shown when I have no matches; starts a match with a demo persona from my own deck.
discoverRouter.get('/demo-match', async (req, res) => {
  const hasMatch = await Match.exists({ users: req.user._id });
  res.json({ available: !hasMatch && Boolean(await pickDemoPersona(req.user._id)) });
});
discoverRouter.post('/demo-match', async (req, res) => {
  notHeld(await Profile.findOne({ userId: req.user._id }, { status: 1 }).lean());
  const match = await startDemoMatch(req.user._id);
  if (!match) throw httpError(404, 'NO_DEMO_PERSONA', 'No demo profile fits your preferences right now. Try widening your age range or distance in Discover.');
  res.status(201).json({ matchId: match._id });
});

// UX P0-2: undo my last pass (one level; the client offers it for 5 s). Only a pass can be undone, never a like.
discoverRouter.delete('/likes/:toUserId', async (req, res) => {
  const toUserId = parse(objectId, req.params.toUserId);
  const { deletedCount } = await Like.deleteOne({ fromUserId: req.user._id, toUserId, liked: false });
  if (!deletedCount) throw httpError(404, 'NOT_FOUND', 'Nothing to undo');
  res.status(204).end();
});
