import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { z } from 'zod';
import { Job } from '../models/Job.js';
import { Report } from '../models/Report.js';
import { usageToday } from '../services/llm/budget.js';
import { releaseProfile } from '../services/profileStatus.js';
import { httpError, objectId, parse } from '../utils/http.js';

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

// Plan 30 S2: release a profile the scam self-check held (stays released until its public content changes).
adminRouter.post('/profiles/:id/release', async (req, res) => {
  const status = await releaseProfile(parse(objectId, req.params.id));
  if (!status) throw httpError(404, 'NOT_FOUND', 'Profile not found');
  res.json({ status });
});

// Plan 30 S3.8: reports for a person to read (newest open first).
adminRouter.get('/reports', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['open', 'closed']).default('open') }), req.query);
  res.json({ reports: await Report.find({ status }).sort({ createdAt: -1 }).limit(200).lean() });
});
adminRouter.post('/reports/:id/close', async (req, res) => {
  const r = await Report.findByIdAndUpdate(parse(objectId, req.params.id), { $set: { status: 'closed' } }, { new: true }).lean();
  if (!r) throw httpError(404, 'NOT_FOUND', 'Report not found');
  res.json({ report: r });
});

// Job queue health (plan 17): counts by type/status + the last 20 failures.
adminRouter.get('/jobs', async (req, res) => {
  const [counts, failures] = await Promise.all([
    Job.aggregate([{ $group: { _id: { type: '$type', status: '$status' }, n: { $sum: 1 } } }, { $sort: { '_id.type': 1 } }]),
    Job.find({ status: 'failed' }, { type: 1, payload: 1, lastError: 1, attempts: 1, finishedAt: 1 }).sort({ finishedAt: -1 }).limit(20).lean(),
  ]);
  res.json({ counts: counts.map((c) => ({ ...c._id, n: c.n })), failures });
});
