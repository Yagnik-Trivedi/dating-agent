import { Router } from 'express';
import { z } from 'zod';
import { Like } from '../models/Like.js';
import { Profile } from '../models/Profile.js';
import { User } from '../models/User.js';
import { createMatch, PUBLIC_PROFILE } from '../services/matches.js';
import { httpError, objectId, parse } from '../utils/http.js';

export const discoverRouter = Router();

discoverRouter.get('/discover', async (req, res) => {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }), req.query);
  const me = req.user._id;
  const [seen, mine] = await Promise.all([
    Like.distinct('toUserId', { fromUserId: me }),
    Profile.findOne({ userId: me }).lean(),
  ]);

  const filter = { userId: { $nin: [me, ...seen] } };
  // Mutual interest, wherever each side has said who they're interested in.
  if (mine?.interestedIn?.length) filter.gender = { $in: mine.interestedIn };
  if (mine?.gender) filter.$or = [{ interestedIn: mine.gender }, { interestedIn: { $size: 0 } }];

  const profiles = await Profile.find(filter).select(PUBLIC_PROFILE).limit(limit).lean();
  res.json({ profiles });
});

// Demo: a seed persona likes every real user who likes them, after a short human-looking pause (2–8 s).
// ponytail: in-process timer, a restart in those seconds drops the like-back; fine for a demo.
function seedLikesBack(seedId, userId) {
  setTimeout(async () => {
    try {
      await Like.updateOne({ fromUserId: seedId, toUserId: userId }, { $set: { liked: true } }, { upsert: true });
      await createMatch(seedId, userId);
    } catch (err) {
      console.error(`seed like-back failed: ${err.message}`);
    }
  }, 2000 + Math.random() * 6000);
}

discoverRouter.post('/likes', async (req, res) => {
  const { toUserId, liked } = parse(z.object({ toUserId: objectId, liked: z.boolean() }), req.body);
  const me = req.user._id;
  if (toUserId === String(me)) throw httpError(400, 'VALIDATION', 'You cannot like yourself');
  if (!await User.exists({ _id: toUserId })) throw httpError(404, 'NOT_FOUND', 'User not found');

  await Like.updateOne({ fromUserId: me, toUserId }, { $set: { liked } }, { upsert: true });
  const mutual = liked && await Like.exists({ fromUserId: toUserId, toUserId: me, liked: true });
  if (!mutual) {
    if (liked && !req.user.isSeed && await User.exists({ _id: toUserId, isSeed: true })) seedLikesBack(toUserId, me);
    return res.json({ matched: false });
  }

  const match = await createMatch(me, toUserId);
  res.json({ matched: true, matchId: match._id });
});
