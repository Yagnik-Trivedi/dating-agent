// Stop rule, checked after every belief update (max turns is also checked on every message, wantsToEnd after
// every agent turn, staleness by the periodic sweep in index.js).
import { env } from '../../config/env.js';
import { Match } from '../../models/Match.js';
import { Message } from '../../models/Message.js';

// Agenda-complete never stops a chat this short: 12–24 messages reads as a natural first conversation.
export const MIN_MESSAGES_FOR_AGENDA_STOP = 12;
const AGENDA_PRIORITY = 0.5;
const KNOWN = 0.75;

/** An agenda is done when every item with priority ≥ 0.5 is answered or known with confidence ≥ 0.75. */
export const agendaDone = (agenda = []) => agenda
  .filter((a) => a.priority >= AGENDA_PRIORITY)
  .every((a) => a.status === 'answered' || (a.confidence ?? 0) >= KNOWN);

/**
 * → { reason, detail? } or null.
 * `touched` = facts just learned/raised by viewer's agent (with embeddings), checked against viewer's dealbreakers.
 */
export async function shouldStop(matchId, { viewerId, touched = [] } = {}) {
  const [match, count] = await Promise.all([Match.findById(matchId).lean(), Message.countDocuments({ matchId })]);
  if (!match || match.status !== 'agent_chatting') return null;
  if (count >= env.AGENT_MAX_TURNS) return { reason: 'max_turns' };

  // v1 compared notes with my dealbreakers by embedding here; removed in plan 07 (the gate + plan 08's dealbreaker_hint).

  // Every side whose agent is still active has what it needs (a human side doesn't need the agenda).
  const active = match.perUser.filter((p) => p.agentActive).map((p) => String(p.userId));
  if (count >= MIN_MESSAGES_FOR_AGENDA_STOP && active.length && active.every((u) => agendaDone(match.brief?.[u]?.agenda))) {
    return { reason: 'agenda_complete' };
  }
  return null;
}
