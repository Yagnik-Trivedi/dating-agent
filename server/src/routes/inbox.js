import { Router } from 'express';
import { z } from 'zod';
import { InboxItem } from '../models/InboxItem.js';
import { httpError, objectId, parse } from '../utils/http.js';

export const inboxRouter = Router();

inboxRouter.get('/inbox', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['open', 'answered', 'dismissed', 'all']).default('open') }), req.query);
  const filter = { userId: req.user._id, ...(status !== 'all' && { status }) };
  res.json({ items: await InboxItem.find(filter).sort({ createdAt: -1 }).limit(100).lean() });
});

// Plan 08 turns answers into knowledge-graph facts.
inboxRouter.post('/inbox/:id/answer', async (req, res) => {
  const { id } = parse(z.object({ id: objectId }), req.params);
  const { answer } = parse(z.object({ answer: z.string().trim().min(1).max(1000) }), req.body);
  const item = await InboxItem.findOneAndUpdate(
    { _id: id, userId: req.user._id, status: 'open' },
    { $set: { status: 'answered', answer, answeredAt: new Date() } },
    { new: true },
  ).lean();
  if (!item) throw httpError(404, 'NOT_FOUND', 'Open inbox item not found');
  res.json({ item });
});
