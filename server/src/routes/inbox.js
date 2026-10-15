import { Router } from 'express';
import { z } from 'zod';
import { InboxItem } from '../models/InboxItem.js';
import { KgFact } from '../models/KgFact.js';
import { extractFacts } from '../services/kg/extractFacts.js';
import { embedFacts } from '../services/kg/factEmbedding.js';
import { httpError, objectId, parse } from '../utils/http.js';

export const inboxRouter = Router();

inboxRouter.get('/inbox', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['open', 'answered', 'dismissed', 'all']).default('open') }), req.query);
  const filter = { userId: req.user._id, ...(status !== 'all' && { status }) };
  res.json({ items: await InboxItem.find(filter).sort({ createdAt: -1 }).limit(100).lean() });
});

/** "Ask my human" answer → self facts the agent can use from its next turn (plan 05 §4). */
export async function learnFromAnswer(item) {
  const { facts } = await extractFacts({
    question: item.question, answer: item.answer, userId: item.userId, source: 'user_answer', confidence: 0.9, purpose: 'inbox-answer-facts',
  });
  if (!facts.length) return [];
  const embeddings = await embedFacts(facts, { purpose: 'inbox-answer-embed', userId: item.userId });
  return KgFact.insertMany(facts.map((f, i) => ({ ...f, ...embeddings[i], subjectId: item.userId, observerId: null, matchId: null })));
}

inboxRouter.post('/inbox/:id/answer', async (req, res) => {
  const { id } = parse(z.object({ id: objectId }), req.params);
  const { answer } = parse(z.object({ answer: z.string().trim().min(1).max(1000) }), req.body);
  const item = await InboxItem.findOneAndUpdate(
    { _id: id, userId: req.user._id, status: 'open' },
    { $set: { status: 'answered', answer, answeredAt: new Date() } },
    { new: true },
  ).lean();
  if (!item) throw httpError(404, 'NOT_FOUND', 'Open inbox item not found');
  // The answer is saved either way; fact extraction runs in the background and only logs on failure.
  learnFromAnswer(item).catch((err) => console.error(`inbox ${item._id}: fact extraction failed: ${err.message}`));
  res.json({ item });
});
