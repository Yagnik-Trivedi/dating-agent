import { Router } from 'express';
import { z } from 'zod';
import { InboxItem } from '../models/InboxItem.js';
import { KgFact } from '../models/KgFact.js';
import { Like } from '../models/Like.js';
import { Match } from '../models/Match.js';
import { Message } from '../models/Message.js';
import { Profile } from '../models/Profile.js';
import { User } from '../models/User.js';
import { emitStatus, setStatus } from '../services/pipeline/index.js';
import { io } from '../sockets/io.js';
import { parse } from '../utils/http.js';

export const meRouter = Router();

meRouter.get('/me', async (req, res) => {
  res.json({ user: req.user, profile: await Profile.findOne({ userId: req.user._id }).lean() });
});

meRouter.put('/me/settings', async (req, res) => {
  const { agentMode } = parse(z.object({ agentMode: z.enum(['off', 'shadow', 'auto']) }), req.body);
  req.user.agentMode = agentMode;
  await req.user.save();
  res.json({ user: req.user });
});

// Delete everything about the user; their side of each match is stripped and the match closed.
meRouter.delete('/me', async (req, res) => {
  const me = req.user._id;
  const key = String(me);
  const matches = await Match.find({ users: me });

  await Promise.all([
    Profile.deleteOne({ userId: me }),
    KgFact.deleteMany({ $or: [{ subjectId: me }, { observerId: me }] }),
    Like.deleteMany({ $or: [{ fromUserId: me }, { toUserId: me }] }),
    Message.deleteMany({ senderId: me }),
    InboxItem.deleteMany({ userId: me }),
    Match.updateMany(
      { users: me },
      {
        $set: { 'perUser.$[mine].agentActive': false },
        $unset: { [`trust.${key}`]: 1, [`brief.${key}`]: 1, [`report.${key}`]: 1 },
      },
      { arrayFilters: [{ 'mine.userId': me }] },
    ),
  ]);
  await User.deleteOne({ _id: me });

  for (const match of matches) {
    match.perUser = match.perUser.filter((p) => String(p.userId) !== key); // in-memory only: notify just the other side
    if (match.status === 'closed') emitStatus(match);
    else await setStatus(match, 'closed');
  }
  io.in(`user:${key}`).disconnectSockets(true);
  res.status(204).end();
});
