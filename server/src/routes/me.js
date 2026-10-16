import { Router } from 'express';
import { z } from 'zod';
import { ChatEvent } from '../models/ChatEvent.js';
import { InboxItem } from '../models/InboxItem.js';
import { KgFact } from '../models/KgFact.js';
import { KgEdge } from '../models/KgEdge.js';
import { KgTombstone } from '../models/KgTombstone.js';
import { VoiceProfile } from '../models/VoiceProfile.js';
import { VoiceSample } from '../models/VoiceSample.js';
import { Like } from '../models/Like.js';
import { Match } from '../models/Match.js';
import { MatchDecision } from '../models/MatchDecision.js';
import { Message } from '../models/Message.js';
import { Profile } from '../models/Profile.js';
import { User } from '../models/User.js';
import { pauseReason } from '../services/llm/budget.js';
import { emitStatus, setStatus } from '../services/pipeline/index.js';
import { io } from '../sockets/io.js';
import { parse } from '../utils/http.js';

export const meRouter = Router();

meRouter.get('/me', async (req, res) => {
  res.json({
    user: req.user,
    profile: await Profile.findOne({ userId: req.user._id }).lean(),
    system: { agentPaused: pauseReason()?.message ?? null }, // UI shows an "Agent paused" banner
  });
});

meRouter.put('/me/settings', async (req, res) => {
  const { agentMode } = parse(z.object({ agentMode: z.enum(['off', 'shadow', 'auto']) }), req.body);
  req.user.agentMode = agentMode;
  await req.user.save();
  res.json({ user: req.user });
});

// Delete everything about the user; their side of each match is anonymised ("Deleted user") and the match closed.
// Their messages stay only in handed-off matches, where they are the other person's real chat history (plan 09 §5).
meRouter.delete('/me', async (req, res) => {
  const me = req.user._id;
  const key = String(me);
  const matches = await Match.find({ users: me });
  const keepHistory = matches.filter((m) => m.status === 'handed_off').map((m) => m._id);

  await Promise.all([
    Profile.deleteOne({ userId: me }),
    KgFact.deleteMany({ $or: [{ subjectId: me }, { observerId: me }] }), // my graph, my notes, and notes about me
    KgEdge.deleteMany({ $or: [{ subjectId: me }, { observerId: me }] }),
    KgTombstone.deleteMany({ subjectId: me }),
    VoiceSample.deleteMany({ userId: me }),
    VoiceProfile.deleteOne({ userId: me }),
    Like.deleteMany({ $or: [{ fromUserId: me }, { toUserId: me }] }),
    Message.deleteMany({ senderId: me, matchId: { $nin: keepHistory } }),
    ChatEvent.deleteMany({ observerId: me }),
    MatchDecision.deleteMany({ userId: me }),
    InboxItem.deleteMany({ userId: me }),
    Match.updateMany(
      { users: me },
      {
        $set: { 'perUser.$[mine].agentActive': false, 'perUser.$[mine].name': 'Deleted user' },
        $unset: { [`trust.${key}`]: 1, [`brief.${key}`]: 1 },
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
