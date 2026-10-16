import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { Job } from '../models/Job.js';
import { usageToday } from '../services/llm/budget.js';

const digest = (s) => createHash('sha256').update(s).digest();

function requireAdmin(req, res, next) {
  const token = req.get('x-admin-token') ?? '';
  if (!env.ADMIN_TOKEN || !timingSafeEqual(digest(token), digest(env.ADMIN_TOKEN))) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin token required' } });
  }
  next();
}

export const adminRouter = Router();
adminRouter.use(requireAdmin);
adminRouter.get('/usage', async (req, res) => res.json(await usageToday()));

// Job queue health (plan 17): counts by type/status + the last 20 failures.
adminRouter.get('/jobs', async (req, res) => {
  const [counts, failures] = await Promise.all([
    Job.aggregate([{ $group: { _id: { type: '$type', status: '$status' }, n: { $sum: 1 } } }, { $sort: { '_id.type': 1 } }]),
    Job.find({ status: 'failed' }, { type: 1, payload: 1, lastError: 1, attempts: 1, finishedAt: 1 }).sort({ finishedAt: -1 }).limit(20).lean(),
  ]);
  res.json({ counts: counts.map((c) => ({ ...c._id, n: c.n })), failures });
});
