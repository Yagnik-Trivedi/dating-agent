import mongoose from 'mongoose';
import { Match } from '../models/Match.js';
import { Message } from '../models/Message.js';
import { Profile } from '../models/Profile.js';
import { User } from '../models/User.js';
import { emitToUser } from '../sockets/io.js';
import { httpError } from '../utils/http.js';
import { serializeMessage } from './chat.js';
import { enqueue } from './jobs/queue.js';
import { statusFor } from './pipeline/index.js';

// Dealbreakers stay private to their owner (the agent uses them; the other person doesn't see the list).
export const PUBLIC_PROFILE = '-dealbreakers -gate -geo -ageMin -ageMax -radiusKm';
export const PUBLIC_PROJECTION = Object.fromEntries(PUBLIC_PROFILE.split(' ').map((f) => [f.slice(1), 0]));

export const side = (match, userId) => match.perUser.find((p) => String(p.userId) === String(userId));
export const otherUserId = (match, userId) => match.users.find((u) => String(u) !== String(userId));

/** The match if `userId` is in it, else 404 (also for bad ids, so membership isn't leaked). */
export async function getMatchFor(matchId, userId) {
  const match = mongoose.isValidObjectId(matchId) && await Match.findOne({ _id: matchId, users: userId });
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
  const profile = await Profile.findOne({ userId: other }).select(PUBLIC_PROFILE).lean();
  const key = String(viewerId);
  return {
    _id: match._id,
    status: statusFor(match, viewerId),
    createdAt: match.createdAt,
    agentActive: mine?.agentActive ?? false,
    tookOverAt: mine?.tookOverAt ?? null,
    decision: mine?.decision ?? null,
    other: summary(profile, other),
    otherProfile: profile,
    trust: match.trust?.[key] ?? null,
    brief: match.brief?.[key] ?? null,
    report: match.report?.[key] ?? null,
  };
}

/** Create the match for a mutual like (idempotent), notify both users, kick off the pipeline. */
export async function createMatch(userA, userB) {
  const users = [String(userA), String(userB)].sort();
  const pairKey = users.join('_');
  const existing = await Match.findOne({ pairKey });
  if (existing) return existing;

  const people = await User.find({ _id: { $in: users } }, { agentMode: 1 }).lean();
  const modeOf = (id) => people.find((u) => String(u._id) === id)?.agentMode ?? 'off';
  let match;
  try {
    match = await Match.create({
      users,
      pairKey,
      perUser: users.map((userId) => ({ userId, agentActive: modeOf(userId) !== 'off', decision: null })),
    });
  } catch (err) {
    if (err.code === 11000) return Match.findOne({ pairKey }); // both liked at the same moment
    throw err;
  }

  for (const uid of users) emitToUser(uid, 'match:new', { match: await matchListItem(match, uid) });
  await enqueue('matchCreated', { matchId: String(match._id) }, { dedupeKey: `match:${match._id}` });
  return match;
}
