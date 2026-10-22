import mongoose from 'mongoose';
import { Like } from '../models/Like.js';
import { Match } from '../models/Match.js';
import { Message } from '../models/Message.js';
import { NOT_ACTIVE, Profile, PUBLIC_PROFILE } from '../models/Profile.js';
import { User } from '../models/User.js';
import { emitToUser } from '../sockets/io.js';
import { httpError } from '../utils/http.js';
import { serializeMessage } from './chat.js';
import { reportFor } from './compat/report.js';
import { enqueue } from './jobs/queue.js';
import { statusFor } from './pipeline/index.js';

// Dealbreakers stay private to their owner (the agent uses them; the other person doesn't see the list).
export { PUBLIC_PROFILE, PUBLIC_PROJECTION } from '../models/Profile.js';

export const side = (match, userId) => match.perUser.find((p) => String(p.userId) === String(userId));
export const otherUserId = (match, userId) => match.users.find((u) => String(u) !== String(userId));
/** A user's display name as stored on the match at creation (agents never read the other Profile for it). */
export const nameOf = (match, userId) => match.perUser?.find((p) => String(p.userId) === String(userId))?.name ?? 'They';

/** Unmatched or blocked matches disappear for both people (plan 30 S3.8). */
export const HIDDEN = ['unmatched', 'blocked'];

/** The match if `userId` is in it, else 404 (also for bad ids, so membership isn't leaked). */
export async function getMatchFor(matchId, userId) {
  const match = mongoose.isValidObjectId(matchId) && await Match.findOne({ _id: matchId, users: userId, closedReason: { $nin: HIDDEN } });
  if (!match) throw httpError(404, 'NOT_FOUND', 'Match not found');
  return match;
}

const summary = (profile, userId) => (profile
  ? { userId: profile.userId, name: profile.name, age: profile.age, city: profile.city, photo: profile.photos?.[0] ?? null }
  : { userId, name: 'Deleted user', age: null, city: null, photo: null });

/** Row for GET /matches and the match:new event. */
export async function matchListItem(match, viewerId) {
  const other = otherUserId(match, viewerId);
  const mine = side(match, viewerId);
  const [profile, last, unread] = await Promise.all([
    Profile.findOne({ userId: other }).select(PUBLIC_PROFILE).lean(),
    Message.findOne({ matchId: match._id }).sort({ createdAt: -1 }).lean(),
    Message.countDocuments({ matchId: match._id, senderId: { $ne: viewerId }, createdAt: { $gt: mine?.lastReadAt ?? new Date(0) } }),
  ]);
  return {
    _id: match._id,
    status: statusFor(match, viewerId),
    closedReason: match.closedReason ?? null,
    startsAt: match.status === 'scheduled' ? match.agentState?.startsAt ?? null : null, // "your agent will start this chat tomorrow"
    createdAt: match.createdAt,
    lastMessageAt: match.lastMessageAt ?? null,
    agentActive: mine?.agentActive ?? false,
    other: summary(profile, other),
    lastMessage: last ? serializeMessage(last, viewerId) : null,
    unread,
  };
}

/** Full match for GET /matches/:id: only the requester's side of trust/brief/report. */
export async function matchDetail(match, viewerId) {
  const other = otherUserId(match, viewerId);
  const mine = side(match, viewerId);
  const [profile, report] = await Promise.all([
    Profile.findOne({ userId: other }).select(PUBLIC_PROFILE).lean(),
    reportFor(match._id, viewerId),
  ]);
  const key = String(viewerId);
  return {
    _id: match._id,
    status: statusFor(match, viewerId),
    closedReason: match.closedReason ?? null,
    createdAt: match.createdAt,
    agentActive: mine?.agentActive ?? false,
    tookOverAt: mine?.tookOverAt ?? null,
    otherAgentActive: side(match, other)?.agentActive ?? false, // both people see who is writing (plan 30 S3.9)
    paused: Boolean(mine?.pausedAt && !mine?.tookOverAt),
    decision: mine?.decision ?? null,
    choice: mine?.choice ?? null, // plan 30 S3.6: agents | self
    otherReadAt: side(match, other)?.lastReadAt ?? null, // "Seen" on my messages up to this time (S3.7)
    other: summary(profile, other),
    otherProfile: profile,
    trust: match.trust?.[key] ?? null,
    brief: match.brief?.[key] ?? null,
    report, // my own judge's MatchDecision (plan 09), never the other side's
  };
}

/** Create the match for a mutual like (idempotent), notify both users, kick off the pipeline. admin: an owner's test match. */
export async function createMatch(userA, userB, { admin = false } = {}) {
  const users = [String(userA), String(userB)].sort();
  const pairKey = users.join('_');
  const existing = await Match.findOne({ pairKey });
  if (existing) return existing;
  // Plan 30 S2: no match while either side is browse_only or held; the likes are kept and delivered on activation.
  if (await Profile.exists({ userId: { $in: users }, status: { $in: NOT_ACTIVE } })) return null;

  const [people, profiles] = await Promise.all([
    User.find({ _id: { $in: users } }, { agentMode: 1, name: 1 }).lean(),
    Profile.find({ userId: { $in: users } }, { userId: 1, name: 1 }).lean(),
  ]);
  const modeOf = (id) => people.find((u) => String(u._id) === id)?.agentMode ?? 'off';
  const firstName = (id) => String(profiles.find((p) => String(p.userId) === id)?.name ?? people.find((u) => String(u._id) === id)?.name ?? '').trim().split(/\s+/)[0] || 'They';
  let match;
  try {
    match = await Match.create({
      users,
      pairKey,
      perUser: users.map((userId) => ({ userId, name: firstName(userId), agentActive: modeOf(userId) !== 'off', decision: null, choice: modeOf(userId) === 'off' ? 'self' : 'agents' })),
      ...(admin && { admin: true }),
    });
  } catch (err) {
    if (err.code === 11000) return Match.findOne({ pairKey }); // both liked at the same moment
    throw err;
  }
  // Plan 30 S3.4: a like's comment is the chat's first message (in the liker's words); the other agent opens by replying.
  const comments = await Like.find({ fromUserId: { $in: users }, toUserId: { $in: users }, comment: { $nin: [null, ''] } }).sort({ createdAt: 1 }).lean();
  for (const l of comments) {
    const msg = await Message.create({ matchId: match._id, senderId: l.fromUserId, authoredBy: 'human', text: l.comment, like: l.target });
    match.lastMessageAt = msg.createdAt;
  }
  if (comments.length) await Match.updateOne({ _id: match._id }, { $set: { lastMessageAt: match.lastMessageAt } });

  for (const uid of users) emitToUser(uid, 'match:new', { match: await matchListItem(match, uid) });
  await enqueue('matchCreated', { matchId: String(match._id) }, { dedupeKey: `match:${match._id}` });
  return match;
}
