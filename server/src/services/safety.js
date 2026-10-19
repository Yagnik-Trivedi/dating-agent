// Plan 30 S3.8 safety: unmatch, block, report. A block hides both people from each other everywhere and stops any agent
// chat at once; an unmatch closes the match for both. The other person is never told who blocked or reported them.
import { Block } from '../models/Block.js';
import { Conversation } from '../models/Conversation.js';
import { Like } from '../models/Like.js';
import { Match } from '../models/Match.js';
import { Report } from '../models/Report.js';
import { cancelReplies } from './agent/index.js';
import { emitStatus } from './pipeline/index.js';

/** Everyone I blocked or who blocked me. */
export async function blockedIds(userId) {
  const rows = await Block.find({ $or: [{ fromUserId: userId }, { toUserId: userId }] }, { fromUserId: 1, toUserId: 1 }).lean();
  return rows.map((b) => (String(b.fromUserId) === String(userId) ? b.toUserId : b.fromUserId));
}

/** Close our match (if any) for both sides: agents stop, nothing more can be sent. */
export async function closeMatchBetween(a, b, reason) {
  const pairKey = [String(a), String(b)].sort().join('_');
  const match = await Match.findOneAndUpdate({ pairKey, closedReason: { $nin: ['unmatched', 'blocked'] } },
    { $set: { status: 'closed', closedReason: reason, 'perUser.$[].agentActive': false } }, { new: true });
  if (!match) return null;
  cancelReplies(match._id);
  await Conversation.updateOne({ matchId: match._id, status: 'active' }, { $set: { status: 'ended', endedBy: reason, endedAt: new Date() } });
  emitStatus(match);
  return match;
}

export async function block(me, other) {
  await Block.updateOne({ fromUserId: me, toUserId: other }, { $setOnInsert: { fromUserId: me, toUserId: other } }, { upsert: true });
  await Like.deleteMany({ fromUserId: other, toUserId: me }); // their like never shows up in my Likes you
  await closeMatchBetween(me, other, 'blocked');
}

export const unmatch = (me, other) => closeMatchBetween(me, other, 'unmatched');

export async function report(me, other, { reason, note, matchId, alsoBlock }) {
  await Report.create({ fromUserId: me, toUserId: other, reason, note, matchId });
  if (alsoBlock) await block(me, other);
}
