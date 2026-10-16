// Stop rule, checked after every belief update (max turns is also checked on every message, wantsToEnd after
// every agent turn, staleness by the periodic sweep in index.js).
import { env } from '../../config/env.js';
import { Match } from '../../models/Match.js';
import { Message } from '../../models/Message.js';
import { Profile } from '../../models/Profile.js';
import { findClash, selfFacts } from '../brief/buildBrief.js';

// Agenda-complete never stops a chat this short: 12–24 messages reads as a natural first conversation.
export const MIN_MESSAGES_FOR_AGENDA_STOP = 12;
const AGENDA_PRIORITY = 0.5;
const KNOWN = 0.75;
const CLASH_CONFIDENCE = 0.7;

// A dealbreaker answered by their profile tags (confidence 0.6, same topic) is settled: plan 07 already checked it.
const DEALBREAKER_KNOWN = 0.6;

/** Answered in the chat, or known well enough already. */
export const settled = (a) => a.status === 'answered' || (a.confidence ?? 0) >= (a.dealbreaker ? DEALBREAKER_KNOWN : KNOWN);

/** An agenda is done when every dealbreaker topic and every item with priority ≥ 0.5 is settled. */
export const agendaDone = (agenda = []) => agenda
  .filter((a) => a.priority >= AGENDA_PRIORITY || a.dealbreaker)
  .every(settled);

/**
 * → { reason, detail? } or null.
 * `touched` = facts just learned/raised by viewer's agent (with embeddings), checked against viewer's dealbreakers.
 */
export async function shouldStop(matchId, { viewerId, touched = [] } = {}) {
  const [match, count] = await Promise.all([Match.findById(matchId).lean(), Message.countDocuments({ matchId })]);
  if (!match || match.status !== 'agent_chatting') return null;
  if (count >= env.AGENT_MAX_TURNS) return { reason: 'max_turns' };

  const strong = touched.filter((f) => f.confidence >= CLASH_CONFIDENCE);
  if (viewerId && strong.length) {
    const self = await selfFacts(viewerId, await Profile.findOne({ userId: viewerId }, { dealbreakers: 1 }).lean());
    const clash = await findClash({ self, observed: strong, viewerId, matchId, minConfidence: CLASH_CONFIDENCE, top: 2 });
    if (clash) return { reason: 'dealbreaker', detail: { viewerId: String(viewerId), ...clash } };
  }

  // Every side whose agent is still active has what it needs (a human side doesn't need the agenda).
  const active = match.perUser.filter((p) => p.agentActive).map((p) => String(p.userId));
  if (count >= MIN_MESSAGES_FOR_AGENDA_STOP && active.length && active.every((u) => agendaDone(match.brief?.[u]?.agenda))) {
    return { reason: 'agenda_complete' };
  }
  return null;
}
