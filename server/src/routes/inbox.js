import { Router } from 'express';
import { z } from 'zod';
import { InboxItem } from '../models/InboxItem.js';
import { KgFact } from '../models/KgFact.js';
import { User } from '../models/User.js';
import { VoiceSample } from '../models/VoiceSample.js';
import { resolveConcept } from '../services/kg/canonicalize.js';
import { extractFacts } from '../services/kg/extractFacts.js';
import { embedFacts } from '../services/kg/factEmbedding.js';
import { tagLanguageHeuristic } from '../services/kg/language.js';
import { noteSelfFacts, noteVoiceSample } from '../services/kg/learning.js';
import { embed, embeddingModel } from '../services/llm/client.js';
import { httpError, objectId, parse } from '../utils/http.js';

export const inboxRouter = Router();

inboxRouter.get('/inbox', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['open', 'answered', 'dismissed', 'all']).default('open') }), req.query);
  const filter = { userId: req.user._id, ...(status !== 'all' && { status }) };
  res.json({ items: await InboxItem.find(filter).sort({ createdAt: -1 }).limit(100).lean() });
});

/** "Ask my human" answer → self facts (user_answer, support-checked) + a voice sample in the user's own words (plan 05 §7). */
export async function learnFromAnswer(item) {
  const sourceRef = { kind: 'inbox', id: String(item._id) };
  const [{ facts }, [vector]] = await Promise.all([
    extractFacts({ question: item.question, answer: item.answer, userId: item.userId, source: 'user_answer', sourceRef, purpose: 'inbox-answer-facts' }),
    embed([item.question], { purpose: 'voice-incoming', userId: item.userId, inputType: 'query' }),
  ]);
  for (const f of facts.filter((x) => x.conceptText)) f.conceptId = (await resolveConcept({ text: f.conceptText, type: f.conceptType, userId: item.userId })).conceptId;
  const loose = facts.filter((f) => !f.conceptId);
  const embeddings = await embedFacts(loose, { purpose: 'inbox-answer-embed', userId: item.userId });
  loose.forEach((f, i) => Object.assign(f, embeddings[i]));
  // User answers are 0.9 even when the support check was unclear: the user said it directly, to this question.
  const docs = facts.map(({ conceptText, conceptType, ...f }) => ({ ...f, confidence: Math.max(f.confidence, 0.9), weight: f.strength ?? 0.5, subjectId: item.userId, observerId: null, matchId: null }));
  const saved = docs.length ? await KgFact.insertMany(docs) : [];
  await VoiceSample.create({ userId: item.userId, incoming: item.question, text: item.answer, source: 'inbox', mood: 'casual', lang: tagLanguageHeuristic(item.answer), embedding: vector, embeddingModel: embeddingModel() });
  await User.updateOne({ _id: item.userId }, { $inc: { graphVersion: 1 } });
  await Promise.all([noteVoiceSample(item.userId), noteSelfFacts(item.userId)]);
  return saved;
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
