import { Router } from 'express';
import { z } from 'zod';
import { Profile } from '../models/Profile.js';
import { deleteAccount } from '../services/account.js';
import { pauseReason } from '../services/llm/budget.js';
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
  const { agentMode, learnFromChats } = parse(z.object({ agentMode: z.enum(['off', 'shadow', 'auto']), learnFromChats: z.boolean() })
    .partial().refine((b) => Object.keys(b).length, { message: 'Nothing to change' }), req.body);
  if (agentMode) req.user.agentMode = agentMode;
  if (learnFromChats !== undefined) req.user.settings.learnFromChats = learnFromChats;
  await req.user.save();
  res.json({ user: req.user });
});

// Delete everything about the user (services/account.js).
meRouter.delete('/me', async (req, res) => {
  await deleteAccount(req.user._id);
  res.status(204).end();
});
