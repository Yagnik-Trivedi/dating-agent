// Step 3: the agent conversation. Triggers: startConversation (after the brief) and onIncomingMessage (every message).
// The other side may be a human or their agent; nothing here depends on which.
import { env } from '../../config/env.js';
import { Match } from '../../models/Match.js';
import { Message } from '../../models/Message.js';
import { User } from '../../models/User.js';
import { side } from '../matches.js';
import { flagMatch } from '../pipeline/index.js';
import { scanMessage } from '../trust/rules.js';
import { learnFromMessage } from './beliefUpdate.js';
import { cancelReplies, scheduleReply, stopConversation } from './scheduler.js';
import { shouldStop } from './shouldStop.js';

export { cancelReplies, stopConversation } from './scheduler.js';

const STARTABLE_MODES = ['shadow', 'auto']; // shadow and auto behave the same server-side; only the UI differs

async function activeAgents(match) {
  const users = await User.find({ _id: { $in: match.users } }, { agentMode: 1 }).lean();
  const mode = (id) => users.find((u) => String(u._id) === String(id))?.agentMode;
  return match.perUser.filter((p) => p.agentActive && STARTABLE_MODES.includes(mode(p.userId))).map((p) => String(p.userId));
}

/** After the brief: one active agent (random if both) opens with its brief's opener. No agents → the humans chat. */
export async function startConversation(match) {
  const active = await activeAgents(match);
  if (active.length) scheduleReply(match._id, active[Math.floor(Math.random() * active.length)], 0);
}

// Belief updates for one (match, viewer) run one at a time so agenda writes never race.
const chains = new Map();
function serial(key, fn) {
  const next = (chains.get(key) ?? Promise.resolve()).then(fn);
  chains.set(key, next);
  next.finally(() => { if (chains.get(key) === next) chains.delete(key); });
}

/** Resolves when every queued belief update has finished (scripts wait on this before reading results). */
export const beliefUpdatesSettled = () => Promise.allSettled([...chains.values()]);

async function learnAndCheck(match, viewerId, message) {
  try {
    const { touched } = await learnFromMessage(match, viewerId, message);
    const stop = await shouldStop(match._id, { viewerId, touched });
    if (stop) await stopConversation(match._id, stop.reason, stop.detail);
  } catch (err) {
    if (err.name === 'BudgetExceededError') console.warn(`belief update paused: ${err.message}`);
    else console.error(`belief update ${match._id} for ${viewerId} failed: ${err.message}`);
  }
}

/** Called after EVERY saved message (human or agent). */
export async function onIncomingMessage(message) {
  const match = await Match.findById(message.matchId);
  if (match?.status !== 'agent_chatting') return;
  const sender = String(message.senderId);
  const others = match.users.map(String).filter((u) => u !== sender);

  // Scam scripts in chat: flag + stop every agent right away (plan 06 logic, no LLM needed).
  const scan = scanMessage(message.text);
  if (scan.severity >= 3) {
    cancelReplies(match._id);
    await flagMatch(match, others, scan.flags.map((f) => `In chat: ${f}`));
    return;
  }
  if (await Message.countDocuments({ matchId: match._id }) >= env.AGENT_MAX_TURNS) {
    await stopConversation(match._id, 'max_turns');
    return;
  }
  for (const viewer of others) {
    if (!side(match, viewer)?.agentActive) continue; // a side that took over neither replies nor learns
    scheduleReply(match._id, viewer);
    serial(`${match._id}:${viewer}`, () => learnAndCheck(match, viewer, message));
  }
}

/**
 * Boot + every 30 min: stop chats where the other side went quiet for AGENT_STALE_HOURS, open chats that never
 * started, and answer messages left unanswered by a restart (older than 30 s).
 */
export async function resumeConversations() {
  const staleBefore = Date.now() - env.AGENT_STALE_HOURS * 3_600_000;
  for (const m of await Match.find({ status: 'agent_chatting' })) {
    const last = await Message.findOne({ matchId: m._id }).sort({ createdAt: -1 }).lean();
    if ((last?.createdAt ?? m.updatedAt) < staleBefore) await stopConversation(m._id, 'stale');
    else if (!last) await startConversation(m);
    else if (Date.now() - last.createdAt > 30_000) {
      for (const p of m.perUser) if (p.agentActive && String(p.userId) !== String(last.senderId)) scheduleReply(m._id, p.userId);
    }
  }
}
