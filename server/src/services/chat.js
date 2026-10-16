import { Match } from '../models/Match.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { emitToUser } from '../sockets/io.js';
import { httpError } from '../utils/http.js';
import { onIncomingMessage } from './agent/index.js';

export const MAX_MESSAGE_LENGTH = 1000;

/**
 * Message as `viewerId` may see it. authoredBy (and meta) of the OTHER side's messages stay hidden
 * until the match is handed off; your own side's are always visible.
 */
export function serializeMessage(msg, viewerId, matchStatus) {
  const m = typeof msg.toObject === 'function' ? msg.toObject() : { ...msg };
  if (String(m.senderId) !== String(viewerId)) {
    delete m.meta;
    if (matchStatus !== 'handed_off') delete m.authoredBy;
  }
  return m;
}

/** Save a message (human or agent), push it to both users, then fire the agent hook. */
export async function sendMessage({ match, senderId, authoredBy, text, meta }) {
  const clean = String(text ?? '').trim();
  if (!clean) throw httpError(400, 'VALIDATION', 'Message is empty');
  if (clean.length > MAX_MESSAGE_LENGTH) throw httpError(400, 'VALIDATION', `Message exceeds ${MAX_MESSAGE_LENGTH} characters`);
  if (['closed', 'flagged_fake'].includes(match.status)) throw httpError(409, 'MATCH_CLOSED', 'This conversation is closed');

  const conversation = await Conversation.findOne({ matchId: match._id, status: 'active' }, { _id: 1 }).lean();
  const message = await Message.create({ matchId: match._id, conversationId: conversation?._id ?? null, senderId, authoredBy, text: clean, meta });
  await Match.updateOne({ _id: match._id }, { $set: { lastMessageAt: message.createdAt } });
  for (const uid of match.users) {
    emitToUser(uid, 'message:new', { message: serializeMessage(message, uid, match.status) });
  }
  onIncomingMessage(message).catch((err) => console.error(`onIncomingMessage failed: ${err.message}`));
  return message;
}
