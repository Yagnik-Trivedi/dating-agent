import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
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
