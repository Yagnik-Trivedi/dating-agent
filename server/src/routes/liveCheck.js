// Plan 19 live check. 404 when LIVE_CHECK_ENABLED=false. The body limit (1 MB) is the app's global JSON limit.
import { Router } from 'express';
import { finishBody, finishChallenge, startChallenge } from '../services/liveCheck/index.js';
import { env } from '../config/env.js';
import { httpError, parse } from '../utils/http.js';

export const liveCheckRouter = Router();

liveCheckRouter.post('/live-check/start', async (req, res) => res.status(201).json(await startChallenge(req.user._id)));
liveCheckRouter.post('/live-check/finish', async (req, res) => res.json(await finishChallenge(req.user._id, parse(finishBody, req.body))));
liveCheckRouter.get('/live-check', async (req, res) => {
  if (!env.LIVE_CHECK_ENABLED) throw httpError(404, 'NOT_FOUND', 'Not found');
  const { status = 'none', checkedAt = null } = req.user.liveCheck ?? {};
  res.json({ status, checkedAt });
});
