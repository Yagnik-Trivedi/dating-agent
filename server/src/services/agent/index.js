// Step 3: the agent conversation. Triggers: startConversation (after the brief) and onIncomingMessage (every message).
// The other side may be a human or their agent; nothing here depends on which.
import { env } from '../../config/env.js';
import { Conversation } from '../../models/Conversation.js';
import { Match } from '../../models/Match.js';
import { rng } from '../../utils/rng.js';
import { KG } from '../kg/config.js';
import { Message } from '../../models/Message.js';
import { User } from '../../models/User.js';
import { side } from '../matches.js';
import { flagMatch } from '../pipeline/index.js';
import { scanMessage } from '../trust/rules.js';
import { cancelReplies, scheduleReply, stopConversation } from './scheduler.js';

export { cancelReplies, stopConversation } from './scheduler.js';

const STARTABLE_MODES = ['shadow', 'auto']; // shadow and auto behave the same server-side; only the UI differs

async function activeAgents(match) {
  const users = await User.find({ _id: { $in: match.users } }, { agentMode: 1 }).lean();
  const mode = (id) => users.find((u) => String(u._id) === String(id))?.agentMode;
  return match.perUser.filter((p) => p.agentActive && STARTABLE_MODES.includes(mode(p.userId))).map((p) => String(p.userId));
}

/** After the brief: one active agent opens (picked with the conversation's seeded rng). No agents → the humans chat. */
export async function startConversation(match) {
  const active = (await activeAgents(match)).sort();
  if (!active.length) return;
  const conv = await Conversation.findOne({ matchId: match._id, status: 'active' }, { seed: 1 }).lean();
  const r = rng(conv?.seed ?? 0);
  scheduleReply(match._id, active[Math.floor(r() * active.length)], 0);
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
  const conv = await Conversation.findOne({ matchId: match._id, status: 'active' }, { endAfter: 1 }).lean();
  if (await Message.countDocuments({ matchId: match._id }) >= (conv?.endAfter ?? KG.MAX_TURNS)) {
    await stopConversation(match._id, 'max_turns');
    return;
  }
  // Perceiving their message happens inside my next turn (one LLM call: perceive + observe, plan 08 §2.1).
  for (const viewer of others) {
    if (side(match, viewer)?.agentActive) scheduleReply(match._id, viewer); // a side that took over neither replies nor learns
  }
}

/**
 * A judge demo match frozen mid-conversation (seed.js --judges) resumes when its user opens it: the agent that didn't
 * send the last message replies, so a few live turns follow within seconds (DEMO_PACING=fast).
 */
export async function thaw(match) {
  if (!match.agentState?.frozen) return;
  const m = await Match.findOneAndUpdate({ _id: match._id, status: 'agent_chatting', 'agentState.frozen': true }, { $unset: { 'agentState.frozen': 1 } }, { new: true });
  if (!m) return;
  const last = await Message.findOne({ matchId: m._id }).sort({ createdAt: -1 }).lean();
  await Promise.all(m.perUser.filter((p) => p.agentActive && String(p.userId) !== String(last?.senderId)).map((p) => scheduleReply(m._id, p.userId)));
}

/**
 * Boot + every 30 min: stop chats where the other side went quiet for AGENT_STALE_HOURS, open chats that never
 * started, and answer messages left unanswered by a restart (older than 30 s).
 */
export async function resumeConversations() {
  const staleBefore = Date.now() - env.AGENT_STALE_HOURS * 3_600_000;
  for (const m of await Match.find({ status: 'agent_chatting', 'agentState.frozen': { $ne: true } })) {
    const last = await Message.findOne({ matchId: m._id }).sort({ createdAt: -1 }).lean();
    if ((last?.createdAt ?? m.updatedAt) < staleBefore) await stopConversation(m._id, 'stale');
    else if (!last) await startConversation(m);
    else if (Date.now() - last.createdAt > 30_000) {
      for (const p of m.perUser) if (p.agentActive && String(p.userId) !== String(last.senderId)) scheduleReply(m._id, p.userId);
    }
  }
}
