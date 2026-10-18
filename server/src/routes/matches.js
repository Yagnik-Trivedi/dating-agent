import { Router } from 'express';
import { z } from 'zod';
import { KgFact } from '../models/KgFact.js';
import { Match } from '../models/Match.js';
import { Message } from '../models/Message.js';
import { cancelReplies, pauseAgent, resumeAgent, thaw } from '../services/agent/index.js';
import { sendMessage, serializeMessage } from '../services/chat.js';
import { getMatchFor, matchDetail, matchListItem, otherUserId } from '../services/matches.js';
import { decide, extend, reportFor, revealFor } from '../services/compat/index.js';
import { ChatEvent } from '../models/ChatEvent.js';
import { Conversation } from '../models/Conversation.js';
import mongoose from 'mongoose';
import { emitStatus, statusFor } from '../services/pipeline/index.js';
import { dateIdeasFor } from '../services/tavily/dateIdeas.js';
import { wouldntSay } from '../services/kg/ownVoice.js';
import { httpError, parse } from '../utils/http.js';

export const matchesRouter = Router();

matchesRouter.get('/matches', async (req, res) => {
  const matches = await Match.find({ users: req.user._id }).sort({ lastMessageAt: -1, createdAt: -1 });
  // ponytail: 3 queries per match; fine for tens of matches, aggregate if lists get long.
  res.json({ matches: await Promise.all(matches.map((m) => matchListItem(m, req.user._id))) });
});

matchesRouter.get('/matches/:id', async (req, res) => {
  const match = await getMatchFor(req.params.id, req.user._id);
  await thaw(match);
  res.json({ match: await matchDetail(match, req.user._id) });
});

matchesRouter.get('/matches/:id/messages', async (req, res) => {
  const { before, limit } = parse(z.object({
    before: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }), req.query);
  const me = req.user._id;
  const match = await getMatchFor(req.params.id, me);
  await thaw(match);

  const filter = { matchId: match._id, ...(before && { createdAt: { $lt: before } }) };
  const page = await Message.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  if (!before) await Match.updateOne({ _id: match._id, 'perUser.userId': me }, { $set: { 'perUser.$.lastReadAt': new Date() } });
  res.json({ messages: page.reverse().map((m) => serializeMessage(m, me, match.status)), reveal: await revealFor(match) });
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
  const { _id } = await getMatchFor(req.params.id, req.user._id);
  const match = await decide(_id, req.user._id, decision);
  res.json({ match: await matchDetail(match, req.user._id) });
});

// Pause / Resume my agent in this match (Take over stays one-way). 409 when it isn't running / can't come back.
matchesRouter.post('/matches/:id/pause', async (req, res) => {
  const { _id } = await getMatchFor(req.params.id, req.user._id);
  const match = await pauseAgent(_id, req.user._id);
  if (!match) throw httpError(409, 'NOT_RUNNING', 'Your agent is not running in this chat');
  emitStatus(match);
  res.json({ match: await matchDetail(match, req.user._id) });
});
matchesRouter.post('/matches/:id/resume', async (req, res) => {
  const { _id } = await getMatchFor(req.params.id, req.user._id);
  const match = await resumeAgent(_id, req.user._id);
  if (!match) throw httpError(409, 'CANNOT_RESUME', 'Only a paused agent can resume (not after you took over or decided)');
  emitStatus(match);
  res.json({ match: await matchDetail(match, req.user._id) });
});

// "Let them talk a bit longer" on a Maybe: once per match, up to EXTEND_TURNS more messages, then both judges again.
matchesRouter.post('/matches/:id/extend', async (req, res) => {
  const { _id } = await getMatchFor(req.params.id, req.user._id);
  const match = await extend(_id, req.user._id);
  res.json({ match: await matchDetail(match, req.user._id) });
});

// "I wouldn't say that" (plan 08 §3): only on MY OWN agent's messages; optional "how would you say it?".
matchesRouter.post('/messages/:id/wouldnt-say', async (req, res) => {
  const { fix } = parse(z.object({ fix: z.string().trim().min(1).max(1000).optional() }), req.body ?? {});
  const message = mongoose.isValidObjectId(req.params.id) && await Message.findOne({ _id: req.params.id, senderId: req.user._id, authoredBy: 'agent' }).lean();
  if (!message) throw httpError(404, 'NOT_FOUND', 'Agent message not found');
  const { rule, kind } = await wouldntSay({ message, userId: req.user._id, fix });
  res.json({ ok: true, rule, kind });
});

// My judge's decision + the label I see (plan 09 §2). Never the other side's decision or reasons.
matchesRouter.get('/matches/:id/report', async (req, res) => {
  const match = await getMatchFor(req.params.id, req.user._id);
  res.json({ report: await reportFor(match._id, req.user._id), status: statusFor(match, req.user._id) });
});

// Replay (plan 09 §2): messages, MY chat moments, MY decision and the final mutual result; never the other side's.
matchesRouter.get('/conversations/:id/replay', async (req, res) => {
  const me = req.user._id;
  const conv = mongoose.isValidObjectId(req.params.id) && await Conversation.findById(req.params.id).lean();
  if (!conv) throw httpError(404, 'NOT_FOUND', 'Conversation not found');
  const match = await getMatchFor(conv.matchId, me);
  const [messages, events, report] = await Promise.all([
    Message.find({ matchId: match._id, conversationId: conv._id }).sort({ createdAt: 1 }).lean(),
    ChatEvent.find({ conversationId: conv._id, observerId: me }).sort({ createdAt: 1 }).lean(),
    reportFor(match._id, me),
  ]);
  res.json({
    conversation: { _id: conv._id, round: conv.round, status: conv.status, endedBy: conv.endedBy, startedAt: conv.startedAt, endedAt: conv.endedAt },
    messages: messages.map((m) => serializeMessage(m, me, match.status)),
    events,
    report,
    result: statusFor(match, me),
  });
});

// What the requester's agent has learned about the other person.
matchesRouter.get('/matches/:id/kg', async (req, res) => {
  const me = req.user._id;
  const match = await getMatchFor(req.params.id, me);
  const facts = await KgFact.find({ matchId: match._id, observerId: me, subjectId: otherUserId(match, me) }).lean();
  res.json({ facts });
});

// Only once the agents think it's worth meeting (or both people took over).
matchesRouter.get('/matches/:id/date-ideas', async (req, res) => {
  const match = await getMatchFor(req.params.id, req.user._id);
  if (!['compatible', 'maybe', 'handed_off'].includes(match.status)) throw httpError(409, 'NOT_READY', 'Date ideas come after a compatible or maybe verdict');
  res.json(await dateIdeasFor(match, req.user._id));
});
