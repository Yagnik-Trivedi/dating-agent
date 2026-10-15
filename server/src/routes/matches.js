import { Router } from 'express';
import { z } from 'zod';
import { KgFact } from '../models/KgFact.js';
import { Match } from '../models/Match.js';
import { Message } from '../models/Message.js';
import { cancelReplies } from '../services/agent/index.js';
import { sendMessage, serializeMessage } from '../services/chat.js';
import { getMatchFor, matchDetail, matchListItem, otherUserId } from '../services/matches.js';
import { emitStatus, setStatus } from '../services/pipeline/index.js';
import { httpError, parse } from '../utils/http.js';

export const matchesRouter = Router();

matchesRouter.get('/matches', async (req, res) => {
  const matches = await Match.find({ users: req.user._id }).sort({ lastMessageAt: -1, createdAt: -1 });
  // ponytail: 3 queries per match; fine for tens of matches, aggregate if lists get long.
  res.json({ matches: await Promise.all(matches.map((m) => matchListItem(m, req.user._id))) });
});

matchesRouter.get('/matches/:id', async (req, res) => {
  const match = await getMatchFor(req.params.id, req.user._id);
  res.json({ match: await matchDetail(match, req.user._id) });
});

matchesRouter.get('/matches/:id/messages', async (req, res) => {
  const { before, limit } = parse(z.object({
    before: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }), req.query);
  const me = req.user._id;
  const match = await getMatchFor(req.params.id, me);

  const filter = { matchId: match._id, ...(before && { createdAt: { $lt: before } }) };
  const page = await Message.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  if (!before) await Match.updateOne({ _id: match._id, 'perUser.userId': me }, { $set: { 'perUser.$.lastReadAt': new Date() } });
  res.json({ messages: page.reverse().map((m) => serializeMessage(m, me, match.status)) });
});

matchesRouter.post('/matches/:id/messages', async (req, res) => {
  const { text } = parse(z.object({ text: z.string() }), req.body);
  const match = await getMatchFor(req.params.id, req.user._id);
  const message = await sendMessage({ match, senderId: req.user._id, authoredBy: 'human', text });
  res.status(201).json({ message: serializeMessage(message, req.user._id, match.status) });
});

// One tap: the requester's agent stops for this match immediately.
matchesRouter.post('/matches/:id/takeover', async (req, res) => {
  const me = req.user._id;
  const { _id } = await getMatchFor(req.params.id, me);
  const match = await Match.findOneAndUpdate(
    { _id, 'perUser.userId': me },
    { $set: { 'perUser.$.agentActive': false, 'perUser.$.tookOverAt': new Date() } },
    { new: true },
  );
  cancelReplies(_id, me); // a reply already being written is discarded by the agent's pre-send re-check
  emitStatus(match);
  res.json({ match: await matchDetail(match, me) });
});

matchesRouter.post('/matches/:id/decision', async (req, res) => {
  const { decision } = parse(z.object({ decision: z.enum(['continue', 'pass']) }), req.body);
  const me = req.user._id;
  const { _id } = await getMatchFor(req.params.id, me);
  const match = await Match.findOneAndUpdate(
    { _id, 'perUser.userId': me },
    { $set: { 'perUser.$.decision': decision } },
    { new: true },
  );
  if (match.status !== 'handed_off' && match.perUser.every((p) => p.decision === 'continue')) {
    await setStatus(match, 'handed_off');
  }
  res.json({ match: await matchDetail(match, me) });
});

// What the requester's agent has learned about the other person.
matchesRouter.get('/matches/:id/kg', async (req, res) => {
  const me = req.user._id;
  const match = await getMatchFor(req.params.id, me);
  const facts = await KgFact.find({ matchId: match._id, observerId: me, subjectId: otherUserId(match, me) }).lean();
  res.json({ facts });
});

matchesRouter.get('/matches/:id/date-ideas', async (req, res) => {
  await getMatchFor(req.params.id, req.user._id);
  throw httpError(501, 'NOT_IMPLEMENTED', 'Date ideas arrive in plan 09');
});
