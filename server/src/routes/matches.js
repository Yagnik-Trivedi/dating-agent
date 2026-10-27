import { Router } from 'express';
import { within } from '../utils/deadline.js';
import { z } from 'zod';
import { KgFact } from '../models/KgFact.js';
import { Match } from '../models/Match.js';
import { Message } from '../models/Message.js';
import { cancelReplies, pauseAgent, resumeAgent, thaw } from '../services/agent/index.js';
import { reactToMessage, sendMessage, serializeMessage } from '../services/chat.js';
import { KG } from '../services/kg/config.js';
import { getMatchFor, HIDDEN, matchDetail, matchListItem, otherUserId } from '../services/matches.js';
import { decide, extend, reportFor, revealFor } from '../services/compat/index.js';
import { ChatEvent } from '../models/ChatEvent.js';
import { Conversation } from '../models/Conversation.js';
import mongoose from 'mongoose';
import { emitStatus, startHumanChat, statusFor } from '../services/pipeline/index.js';
import { dateIdeasFor } from '../services/tavily/dateIdeas.js';
import { wouldntSay } from '../services/kg/ownVoice.js';
import { REPORT_REASONS } from '../models/Report.js';
import { checkedChatImage } from '../services/photos.js';
import { block, report, unmatch } from '../services/safety.js';
import { httpError, objectId, parse } from '../utils/http.js';

export const matchesRouter = Router();

matchesRouter.get('/matches', async (req, res) => {
  const matches = await Match.find({ users: req.user._id, closedReason: { $nin: HIDDEN } }).sort({ lastMessageAt: -1, createdAt: -1 });
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
  res.json({ messages: page.reverse().map((m) => serializeMessage(m, me)), reveal: await revealFor(match) });
});

// Text, or a photo (plan 30 S3.7: stored like a profile photo, checked by the vision model before it is sent).
const imageBody = z.union([
  z.object({ url: z.url().max(500), publicId: z.string().max(200), w: z.number().int().positive(), h: z.number().int().positive() }),
  z.object({ jpegBase64: z.string().max(450_000).regex(/^[A-Za-z0-9+/=]+$/), w: z.number().int().positive(), h: z.number().int().positive() }),
]);
matchesRouter.post('/matches/:id/messages', async (req, res) => {
  const { text, image } = parse(z.object({ text: z.string().default(''), image: imageBody.optional() }), req.body);
  const match = await getMatchFor(req.params.id, req.user._id);
  if (['closed', 'flagged_fake'].includes(match.status)) throw httpError(409, 'MATCH_CLOSED', 'This conversation is closed');
  const attachments = image ? [await checkedChatImage(image, `${req.protocol}://${req.get('host')}`, req.user._id)] : undefined;
  const message = await sendMessage({ match, senderId: req.user._id, authoredBy: 'human', text, extra: attachments ? { attachments } : {} });
  res.status(201).json({ message: serializeMessage(message, req.user._id) });
});

// Plan 34 (A4.1): a tapback on one of their messages. Humans react once their own agent isn't talking for them.
matchesRouter.post('/matches/:id/messages/:messageId/reaction', async (req, res) => {
  const { emoji } = parse(z.object({ emoji: z.enum(KG.NATURAL.TAPBACKS).nullable() }), req.body);
  const match = await getMatchFor(req.params.id, req.user._id);
  if (['closed', 'flagged_fake'].includes(match.status)) throw httpError(409, 'MATCH_CLOSED', 'This conversation is closed');
  if (!mongoose.isValidObjectId(req.params.messageId)) throw httpError(404, 'NOT_FOUND', 'Message not found');
  const mine = match.perUser?.find((p) => String(p.userId) === String(req.user._id));
  if (mine?.agentActive) throw httpError(409, 'AGENT_ACTIVE', 'Take over the chat to react yourself');
  res.json({ reactions: await reactToMessage({ match, messageId: req.params.messageId, userId: req.user._id, emoji }) });
});

// Plan 30 S3.6: "Let our agents break the ice" or "Chat myself now". Either side picking self → a normal human chat.
matchesRouter.post('/matches/:id/choice', async (req, res) => {
  const { choice } = parse(z.object({ choice: z.enum(['agents', 'self']) }), req.body);
  const me = req.user._id;
  const { _id } = await getMatchFor(req.params.id, me);
  let match = await Match.findOneAndUpdate({ _id, 'perUser.userId': me }, { $set: { 'perUser.$.choice': choice } }, { new: true });
  // Before the trust check finishes, the pipeline reads the choice itself (safety first).
  if (choice === 'self' && ['briefing', 'scheduled', 'agent_chatting'].includes(match.status)) match = (await startHumanChat(match)) ?? match;
  res.json({ match: await matchDetail(match, me) });
});

// Plan 30 S3.8: unmatch, block, report. Each hides the match for both people.
matchesRouter.post('/matches/:id/unmatch', async (req, res) => {
  const match = await getMatchFor(req.params.id, req.user._id);
  await unmatch(req.user._id, otherUserId(match, req.user._id));
  res.status(204).end();
});
matchesRouter.post('/users/:id/block', async (req, res) => {
  const other = parse(objectId, req.params.id);
  if (other === String(req.user._id)) throw httpError(400, 'VALIDATION', 'You can’t block yourself');
  await block(req.user._id, other);
  res.status(204).end();
});
matchesRouter.post('/users/:id/report', async (req, res) => {
  const other = parse(objectId, req.params.id);
  if (other === String(req.user._id)) throw httpError(400, 'VALIDATION', 'You can’t report yourself');
  const body = parse(z.object({ reason: z.enum(REPORT_REASONS), note: z.string().trim().max(500).optional(), matchId: objectId.optional(), block: z.boolean().default(false) }), req.body);
  await report(req.user._id, other, { reason: body.reason, note: body.note, matchId: body.matchId, alsoBlock: body.block });
  res.status(201).json({ ok: true });
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
  const r = await within(wouldntSay({ message, userId: req.user._id, fix }).catch((err) => { console.error(`wouldnt-say ${message._id}: ${err.message}`); throw err; }));
  if (!r.done) return res.status(202).json({ ok: true, pending: true }); // saved when the model answers
  res.json({ ok: true, rule: r.value.rule, kind: r.value.kind });
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
    messages: messages.map((m) => serializeMessage(m, me)),
    events,
    report,
    result: statusFor(match, me),
  });
});

// What the requester's agent has learned about the other person.
matchesRouter.get('/matches/:id/kg', async (req, res) => {
  const me = req.user._id;
  const match = await getMatchFor(req.params.id, me);
  // My notes about them, MY chat moments and how interested my agent reads them (never the other side's view).
  const [facts, events, conv, mine] = await Promise.all([
    KgFact.find({ matchId: match._id, observerId: me, subjectId: otherUserId(match, me) }).lean(),
    ChatEvent.find({ matchId: match._id, observerId: me }).sort({ createdAt: 1 }).lean(),
    Conversation.findOne({ matchId: match._id }).sort({ round: -1 }).lean(),
    // My agent's reading of their interest after each of its turns (plan 30 S6: the room's interest line). Mine only.
    Message.find({ matchId: match._id, senderId: me, authoredBy: 'agent', 'actPlan.interest': { $ne: null } }, { 'actPlan.interest': 1 }).sort({ createdAt: 1 }).lean(),
  ]);
  const interestSeries = mine.map((m) => ({ messageId: m._id, interest: m.actPlan.interest }));
  res.json({ facts, events, interest: conv?.agentState?.[String(me)]?.interest ?? null, interestSeries });
});

// Only once the agents think it's worth meeting (or both people took over).
matchesRouter.get('/matches/:id/date-ideas', async (req, res) => {
  const match = await getMatchFor(req.params.id, req.user._id);
  if (!['compatible', 'maybe', 'handed_off'].includes(match.status)) throw httpError(409, 'NOT_READY', 'Date ideas come after a compatible or maybe verdict');
  const r = await within(dateIdeasFor(match, req.user._id).catch((err) => { console.error(`date ideas ${match._id}: ${err.message}`); throw err; }));
  if (!r.done) throw httpError(503, 'DATE_IDEAS_SLOW', 'Still finding date ideas. Try again in a minute.');
  res.json(r.value);
});
