import { Match } from '../../models/Match.js';
import { emitToUser } from '../../sockets/io.js';

/** Called after a mutual like. Plans 06 (trust) → 07 (brief) → 08 (agent chat) chain from here. */
export async function onMatchCreated(match) {} // eslint-disable-line no-unused-vars

/** Each user gets their own agentActive. */
export function emitStatus(match) {
  for (const p of match.perUser) {
    emitToUser(p.userId, 'match:status', { matchId: String(match._id), status: match.status, agentActive: p.agentActive });
  }
}

/** The one way to change match.status: save, then notify both users. */
export async function setStatus(match, status) {
  await Match.updateOne({ _id: match._id }, { $set: { status } });
  match.status = status;
  emitStatus(match);
  return match;
}
