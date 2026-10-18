import mongoose from 'mongoose';
import { Match } from '../models/Match.js';
import { Message } from '../models/Message.js';
import { Profile, PUBLIC_PROFILE } from '../models/Profile.js';
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

/** The match if `userId` is in it, else 404 (also for bad ids, so membership isn't leaked). */
export async function getMatchFor(matchId, userId) {
  const match = mongoose.isValidObjectId(matchId) && await Match.findOne({ _id: matchId, users: userId });
  if (!match) throw httpError(404, 'NOT_FOUND', 'Match not found');
  return match;
}

const summary = (profile, userId) => (profile
  ? { userId: profile.userId, name: profile.name, age: profile.age, city: profile.city, photo: profile.photos?.[0] ?? null, liveChecked: Boolean(profile.liveChecked) }
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
    lastMessage: last ? serializeMessage(last, viewerId, match.status) : null,
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
    paused: Boolean(mine?.pausedAt && !mine?.tookOverAt),
    decision: mine?.decision ?? null,
    other: summary(profile, other),
    otherProfile: profile,
    trust: match.trust?.[key] ?? null,
    brief: match.brief?.[key] ?? null,
    report, // my own judge's MatchDecision (plan 09), never the other side's
  };
}

/** Create the match for a mutual like (idempotent), notify both users, kick off the pipeline. */
export async function createMatch(userA, userB) {
  const users = [String(userA), String(userB)].sort();
  const pairKey = users.join('_');
  const existing = await Match.findOne({ pairKey });
  if (existing) return existing;

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
      perUser: users.map((userId) => ({ userId, name: firstName(userId), agentActive: modeOf(userId) !== 'off', decision: null })),
    });
  } catch (err) {
    if (err.code === 11000) return Match.findOne({ pairKey }); // both liked at the same moment
    throw err;
  }

  for (const uid of users) emitToUser(uid, 'match:new', { match: await matchListItem(match, uid) });
  await enqueue('matchCreated', { matchId: String(match._id) }, { dedupeKey: `match:${match._id}` });
  return match;
}
