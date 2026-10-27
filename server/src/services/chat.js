import { Match } from '../models/Match.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { emitToUser } from '../sockets/io.js';
import { httpError } from '../utils/http.js';
import { onIncomingMessage } from './agent/index.js';
import { learnOwnMessage } from './kg/ownVoice.js';

export const MAX_MESSAGE_LENGTH = 1000;

/**
 * Message as `viewerId` may see it. Who wrote it (`authoredBy`) is shown to BOTH people from the first message
 * ("Written by Meera's agent": owner decision 4, plan 30 S3.9); the other side's meta, act plan and checks stay theirs.
 */
export function serializeMessage(msg, viewerId) {
  const m = typeof msg.toObject === 'function' ? msg.toObject() : { ...msg };
  if (String(m.senderId) !== String(viewerId)) {
    delete m.meta;
    delete m.actPlan; // my agent's plan and check results are mine only
    delete m.checks;
  }
  return m;
}

/**
 * Plan 34 (A4.1): set (or clear, emoji null) userId's tapback on a message of the OTHER person in this match, and push
 * it to both users. → the message's reactions
 */
export async function reactToMessage({ match, messageId, userId, emoji, agent = false }) {
  const msg = await Message.findOne({ _id: messageId, matchId: match._id }, { senderId: 1, reactions: 1 }).lean();
  if (!msg || String(msg.senderId) === String(userId)) throw httpError(404, 'NOT_FOUND', 'Message not found');
  const reactions = [...(msg.reactions ?? []).filter((r) => String(r.by) !== String(userId)), ...(emoji ? [{ by: userId, emoji, agent, at: new Date() }] : [])];
  await Message.updateOne({ _id: messageId }, { $set: { reactions } });
  for (const uid of match.users) emitToUser(uid, 'message:reaction', { matchId: String(match._id), messageId: String(messageId), reactions });
  return reactions;
}

/** Save a message (human or agent), push it to both users, then fire the agent hook. */
export async function sendMessage({ match, senderId, authoredBy, text, meta, extra = {} }) {
  const clean = String(text ?? '').trim();
  if (!clean && !extra.attachments?.length) throw httpError(400, 'VALIDATION', 'Message is empty');
  if (clean.length > MAX_MESSAGE_LENGTH) throw httpError(400, 'VALIDATION', `Message exceeds ${MAX_MESSAGE_LENGTH} characters`);
  if (['closed', 'flagged_fake'].includes(match.status)) throw httpError(409, 'MATCH_CLOSED', 'This conversation is closed');

  const conversation = await Conversation.findOne({ matchId: match._id, status: 'active' }, { _id: 1 }).lean();
  const message = await Message.create({ matchId: match._id, conversationId: conversation?._id ?? null, senderId, authoredBy, text: clean, meta, ...extra });
  await Match.updateOne({ _id: match._id }, { $set: { lastMessageAt: message.createdAt } });
  for (const uid of match.users) {
    emitToUser(uid, 'message:new', { message: serializeMessage(message, uid) });
  }
  onIncomingMessage(message).catch((err) => console.error(`onIncomingMessage failed: ${err.message}`));
  learnOwnMessage(message, match).catch((err) => console.error(`learnOwnMessage failed: ${err.message}`));
  return message;
}
