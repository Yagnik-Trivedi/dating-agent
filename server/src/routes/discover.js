import { Router } from 'express';
import { z } from 'zod';
import { Like } from '../models/Like.js';
import { Profile } from '../models/Profile.js';
import { User } from '../models/User.js';
import { enqueue } from '../services/jobs/queue.js';
import { buildGate, discoverQuery } from '../services/match/gate.js';
import { createMatch, PUBLIC_PROJECTION } from '../services/matches.js';
import { httpError, objectId, parse } from '../utils/http.js';

export const discoverRouter = Router();

discoverRouter.get('/discover', async (req, res) => {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }), req.query);
  const me = req.user._id;
  const [seen, mine] = await Promise.all([
    Like.distinct('toUserId', { fromUserId: me }),
    Profile.findOne({ userId: me }, { gate: 1 }).lean(),
  ]);
  const gate = mine?.gate ?? await buildGate(me);
  // One indexed query (gate both ways), random order: nothing is ranked by overlap (plan 15 §1).
  const profiles = await Profile.aggregate([
    { $match: discoverQuery(gate, [me, ...seen]) },
    { $sample: { size: limit } },
    { $project: PUBLIC_PROJECTION },
  ]);
  res.json({ profiles });
});

// Demo: a seed persona likes every real user who likes them, after a short human-looking pause (2–8 s).
const seedLikesBack = (seedId, userId) => enqueue('seedLikeBack', { seedId: String(seedId), userId: String(userId) }, {
  runAt: new Date(Date.now() + 2000 + Math.random() * 6000), dedupeKey: `likeback:${seedId}:${userId}`,
});

discoverRouter.post('/likes', async (req, res) => {
  const { toUserId, liked } = parse(z.object({ toUserId: objectId, liked: z.boolean() }), req.body);
  const me = req.user._id;
  if (toUserId === String(me)) throw httpError(400, 'VALIDATION', 'You cannot like yourself');
  if (!await User.exists({ _id: toUserId })) throw httpError(404, 'NOT_FOUND', 'User not found');

  await Like.updateOne({ fromUserId: me, toUserId }, { $set: { liked } }, { upsert: true });
  const mutual = liked && await Like.exists({ fromUserId: toUserId, toUserId: me, liked: true });
  if (!mutual) {
    if (liked && !req.user.isSeed && await User.exists({ _id: toUserId, isSeed: true })) await seedLikesBack(toUserId, me);
    return res.json({ matched: false });
  }

  const match = await createMatch(me, toUserId);
  res.json({ matched: true, matchId: match._id });
});
