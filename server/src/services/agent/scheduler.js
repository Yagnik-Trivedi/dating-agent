// Concurrency + pacing for agent replies: debounce per (match, agent user), a Mongo lock with a stale timeout,
// human-like typing delay, and a re-check before sending so a take-over or a newer message discards the draft.
import { env } from '../../config/env.js';
import { InboxItem } from '../../models/InboxItem.js';
import { Match } from '../../models/Match.js';
import { Message } from '../../models/Message.js';
import { User } from '../../models/User.js';
import { emitToUser, io } from '../../sockets/io.js';
import { sendMessage } from '../chat.js';
import { startEvaluation } from '../compat/index.js';
import { side } from '../matches.js';
import { emitStatus } from '../pipeline/index.js';
import { buildContext } from './context.js';
import { generateReply } from './generateReply.js';

const LOCK_STALE_MS = 2 * 60_000;
const MAX_AGENT_REPLIES_PER_MINUTE = 2; // per match, both agents together: the agent↔agent loop guard
const RETRY_MS = 30_000;
const timers = new Map(); // `${matchId}:${userId}` → timeout
const failures = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** (Re)start the debounce timer: a burst of messages gets one reply. */
export function scheduleReply(matchId, userId, delay = env.AGENT_DEBOUNCE_MS) {
  const key = `${matchId}:${userId}`;
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    runReply(matchId, userId).catch((err) => console.error(`agent reply ${key} crashed: ${err.message}`));
  }, Math.max(0, delay)));
}

/** Drop scheduled (not yet running) replies for a match, or one user's agent in it. Running ones are caught by the re-check. */
export function cancelReplies(matchId, userId) {
  for (const [key, t] of timers) {
    if (key.startsWith(`${matchId}:`) && (!userId || key === `${matchId}:${userId}`)) {
      clearTimeout(t);
      timers.delete(key);
    }
  }
}

const lockPath = (userId) => `agentState.locks.${userId}`;
async function acquireLock(matchId, userId) {
  const now = Date.now();
  const path = lockPath(userId);
  const res = await Match.updateOne(
    { _id: matchId, $or: [{ [path]: { $exists: false } }, { [path]: null }, { [path]: { $lt: now - LOCK_STALE_MS } }] },
    { $set: { [path]: now } },
  );
  return res.modifiedCount === 1;
}
const releaseLock = (matchId, userId) => Match.updateOne({ _id: matchId }, { $unset: { [lockPath(userId)]: '' } });

/** The match if userId's agent may speak in it right now, else null. */
async function mayReply(matchId, userId) {
  const [match, user] = await Promise.all([Match.findById(matchId), User.findById(userId, { agentMode: 1 }).lean()]);
  const ok = match?.status === 'agent_chatting' && side(match, userId)?.agentActive && ['shadow', 'auto'].includes(user?.agentMode);
  return ok ? match : null;
}

/** clamp(min + 350 ms/word + 0–2 s, max); DEMO_FAST = 0.3–2 s. */
export function paceMs(text) {
  if (env.DEMO_FAST) return 300 + Math.random() * 1700;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(env.AGENT_MIN_DELAY_MS + words * 350 + Math.random() * 2000, env.AGENT_MAX_DELAY_MS);
}

async function typeFor(matchId, userId, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    io.to(`match:${matchId}`).emit('typing', { matchId: String(matchId), userId: String(userId) });
    await sleep(Math.max(0, Math.min(2500, end - Date.now())));
  }
}

/** The agent hit something only its human can answer: queue it in their inbox (answer → facts, plan 05 §4). */
async function askMyHuman(userId, matchId, question) {
  if (await InboxItem.exists({ userId, matchId, status: 'open', question })) return;
  const item = await InboxItem.create({ userId, matchId, question });
  emitToUser(userId, 'inbox:new', { item });
}

/** Move to `evaluating` once (atomic), stop all agent replies, hand over to plan 09. */
export async function stopConversation(matchId, reason, detail = null) {
  const match = await Match.findOneAndUpdate(
    { _id: matchId, status: 'agent_chatting' },
    { $set: { status: 'evaluating', 'agentState.stopReason': reason, 'agentState.stopDetail': detail, 'agentState.stoppedAt': new Date() } },
    { new: true },
  );
  if (!match) return false;
  cancelReplies(matchId);
  emitStatus(match);
  startEvaluation(match, { reason }).catch((err) => console.error(`evaluation ${matchId} failed: ${err.message}`));
  return true;
}

/** One reply by userId's agent, if it is still its turn. → the sent draft, or undefined. */
export async function runReply(matchId, userId) {
  const key = `${matchId}:${userId}`;
  const recent = await Message.find({ matchId, authoredBy: 'agent', createdAt: { $gt: new Date(Date.now() - 60_000) } }, { createdAt: 1 }).sort({ createdAt: 1 }).lean();
  if (recent.length >= MAX_AGENT_REPLIES_PER_MINUTE) {
    return scheduleReply(matchId, userId, recent[0].createdAt.getTime() + 60_000 - Date.now() + 250);
  }
  if (!(await mayReply(matchId, userId))) return;
  if (!(await acquireLock(matchId, userId))) return scheduleReply(matchId, userId, Math.max(env.AGENT_DEBOUNCE_MS, 2000));

  try {
    const match = await mayReply(matchId, userId);
    if (!match) return;
    const ctx = await buildContext(match, userId);
    if (ctx.lastMessage && String(ctx.lastMessage.senderId) === String(userId)) return; // nothing new to answer

    const draft = await generateReply({ ctx, userId, matchId });
    await typeFor(matchId, userId, paceMs(draft.reply));

    // Re-check: took over, status changed, agent switched off, or a newer message arrived → discard this draft.
    const current = await mayReply(matchId, userId);
    if (!current) return;
    const newest = await Message.findOne({ matchId }).sort({ createdAt: -1 }).lean();
    if (String(newest?._id ?? '') !== String(ctx.lastMessage?._id ?? '')) {
      scheduleReply(matchId, userId);
      return;
    }
    await sendMessage({ match: current, senderId: userId, authoredBy: 'agent', text: draft.reply, meta: { usedFactIds: draft.usedFactIds, targets: draft.targets } });
    failures.delete(key);

    if (draft.unknownAboutMe) await askMyHuman(userId, matchId, draft.unknownAboutMe);
    const path = `agentState.wantsToEnd.${userId}`;
    const after = await Match.findOneAndUpdate({ _id: matchId }, draft.wantsToEnd ? { $inc: { [path]: 1 } } : { $set: { [path]: 0 } }, { new: true }).lean();
    if (after?.agentState?.wantsToEnd?.[String(userId)] >= 2) await stopConversation(matchId, 'wants_to_end');
    return draft;
  } catch (err) {
    // Budget/kill switch: the agent goes quiet, status stays agent_chatting, the UI shows the paused banner.
    if (err.name === 'BudgetExceededError') return console.warn(`agent ${key} paused: ${err.message}`);
    const n = (failures.get(key) ?? 0) + 1;
    failures.set(key, n);
    console.error(`agent reply ${key} failed (attempt ${n}): ${err.message}`);
    if (n <= 2) scheduleReply(matchId, userId, RETRY_MS);
  } finally {
    await releaseLock(matchId, userId);
  }
}
