// Concurrency + pacing for agent replies: debounce per (match, agent user), a Mongo lock with a stale timeout,
// human-like typing delay, and a re-check before sending so a take-over or a newer message discards the draft.
import { env } from '../../config/env.js';
import { Conversation } from '../../models/Conversation.js';
import { Match } from '../../models/Match.js';
import { Message } from '../../models/Message.js';
import { User } from '../../models/User.js';
import { emitToUser, io } from '../../sockets/io.js';
import { reactToMessage, sendMessage } from '../chat.js';
import { cancel, enqueue } from '../jobs/queue.js';
import { otherUserId, side } from '../matches.js';
import { emitStatus, queueEvaluation } from '../pipeline/index.js';
import { composeTurn } from '../conversation/engine.js';
import { fileQuestion } from './askMyHuman.js';
import { endSession, markClosing } from './sessionFlow.js';

const LOCK_STALE_MS = 2 * 60_000;
const RETRY_MS = 30_000;
const MAX_REPLY_RETRIES = 5;
const failures = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const turnKey = (matchId, userId) => `turn:${matchId}:${userId}`;

/** (Re)schedule the `agentTurn` job: re-enqueueing moves its runAt, so a burst of messages gets one reply. */
export function scheduleReply(matchId, userId, delay = env.AGENT_DEBOUNCE_MS) {
  return enqueue('agentTurn', { matchId: String(matchId), userId: String(userId) }, {
    dedupeKey: turnKey(matchId, userId), runAt: new Date(Date.now() + Math.max(0, delay)),
  }).catch((err) => console.error(`agent turn ${matchId}:${userId} not queued: ${err.message}`));
}

/** Drop queued replies for a match, or one user's agent in it. A running one is caught by the re-check. */
export function cancelReplies(matchId, userId) {
  const key = userId ? turnKey(matchId, userId) : new RegExp(`^${turnKey(matchId, '')}`);
  return cancel(key).catch((err) => console.error(`cancel turns ${matchId} failed: ${err.message}`));
}

/** `agentTurn` job handler. */
export const runAgentTurn = ({ matchId, userId }) => runReply(matchId, userId);

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
  const ok = match?.status === 'agent_chatting' && !match.agentState?.frozen && side(match, userId)?.agentActive && ['shadow', 'auto'].includes(user?.agentMode);
  return ok ? match : null;
}

export const pacing = () => env.AGENT_PACING ?? env.DEMO_PACING ?? 'fast';
/** Typing delay for one message: fast (default) 0.8–3 s; normal = clamp(min + 350 ms/word + 0–2 s, max). */
export function paceMs(text, fast = pacing() === 'fast') {
  if (fast) return 800 + Math.random() * 2200;
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
/** Move to `evaluating` once (atomic), stop all agent replies, hand over to plan 09. */
export async function stopConversation(matchId, reason, detail = null) {
  const match = await Match.findOneAndUpdate(
    { _id: matchId, status: 'agent_chatting' },
    { $set: { status: 'evaluating', 'agentState.stopReason': reason, 'agentState.stopDetail': detail, 'agentState.stoppedAt': new Date() } },
    { new: true },
  );
  if (!match) return false;
  cancelReplies(matchId);
  await Conversation.updateOne({ matchId, status: 'active' }, { $set: { status: 'ended', endedBy: detail?.endedBy ?? reason, endedAt: new Date() } });
  emitStatus(match);
  await queueEvaluation(match, { reason });
  return true;
}

/** One reply by userId's agent, if it is still its turn. → the sent draft, or undefined. */
export async function runReply(matchId, userId) {
  const key = `${matchId}:${userId}`;
  const recent = await Message.find({ matchId, authoredBy: 'agent', createdAt: { $gt: new Date(Date.now() - 60_000) } }, { createdAt: 1 }).sort({ createdAt: 1 }).lean();
  if (recent.length >= env.AGENT_MAX_REPLIES_PER_MINUTE) {
    return scheduleReply(matchId, userId, recent[0].createdAt.getTime() + 60_000 - Date.now() + 250);
  }
  if (!(await mayReply(matchId, userId))) return;
  if (!(await acquireLock(matchId, userId))) return scheduleReply(matchId, userId, Math.max(env.AGENT_DEBOUNCE_MS, 2000));

  try {
    const match = await mayReply(matchId, userId);
    if (!match) return;
    let last = (await Message.findOne({ matchId }).sort({ createdAt: -1 }).lean())?._id ?? null;
    const started = Date.now();
    io.to(`match:${matchId}`).emit('typing', { matchId: String(matchId), userId: String(userId) });
    const turn = await composeTurn(match, userId); // plan 08 engine: perceive → interest → act plan → generate → checks
    if (!turn) return;
    // Plan 34: nothing usable to send (no fixed fallback lines any more): try again shortly with a fresh draft, with backoff.
    if (!turn.messages.length && !turn.end) {
      const n = (failures.get(key) ?? 0) + 1;
      failures.set(key, n);
      if (n <= MAX_REPLY_RETRIES) scheduleReply(matchId, userId, Math.min(RETRY_MS, 8000 * n));
      return turn;
    }

    const conv = turn.actPlan?.session ? await Conversation.findOne({ matchId, status: 'active' }, { sessionIndex: 1 }).lean() : null;
    // Plan 34 (A4.1): a tapback lands first, like a person reacting before typing (never instead of an answer).
    if (turn.tapback) await reactToMessage({ match, messageId: turn.tapback.messageId, userId, emoji: turn.tapback.emoji, agent: true }).catch((err) => console.warn(`tapback ${key}: ${err.message}`));
    for (const [i, text] of turn.messages.entries()) {
      // The delay overlaps the model work: the first message waits only for what's left of its typing time (plan 30 S1).
      const pace = match.instant ? 0 : paceMs(text);
      await typeFor(matchId, userId, i === 0 ? Math.max(0, pace - (Date.now() - started)) : pace);
      // Re-check: took over, status changed, agent switched off, or a newer message arrived → discard the rest.
      const current = await mayReply(matchId, userId);
      if (!current) return;
      const newest = await Message.findOne({ matchId }).sort({ createdAt: -1 }).lean();
      if (String(newest?._id ?? '') !== String(last ?? '')) {
        scheduleReply(matchId, userId);
        return;
      }
      // Plan 33: "talk tomorrow?" is marked before it's sent, so the other agent's turn already knows a goodbye is due.
      if (i === 0 && turn.end === 'session' && !(await markClosing(conv._id, conv.sessionIndex, userId))) return;
      const sent = await sendMessage({
        match: current, senderId: userId, authoredBy: 'agent', text, meta: { usedFactIds: turn.usedFactIds },
        ...(i === 0 && { extra: { actPlan: turn.actPlan, checks: turn.checks } }),
      });
      last = sent._id;
    }
    failures.delete(key);
    if (turn.inbox) await fileQuestion(userId, matchId, turn.inbox, { askedBy: turn.inbox.askedBy });
    if (turn.end === 'session_ack' || (turn.end === 'session' && !side(match, otherUserId(match, userId))?.agentActive)) {
      await endSession(conv._id, conv.sessionIndex); // both said bye (or nobody's agent will): summary, evidence, next
    } else if (turn.end === 'session') {
      // the other agent's goodbye comes through onIncomingMessage
    } else if (turn.end) {
      // dealbreaker_hint keeps the v1 judge's 'dealbreaker' stop semantics until plan 09's judge replaces it.
      if (turn.end === 'dealbreaker_hint') await stopConversation(matchId, 'dealbreaker', { viewerId: String(userId), why: 'Something they said clashes with one of your dealbreakers.', endedBy: 'dealbreaker_hint' });
      else await stopConversation(matchId, turn.end);
    }
    return turn;
  } catch (err) {
    // Budget/kill switch: the agent goes quiet, status stays agent_chatting, the UI shows the paused banner.
    if (err.name === 'BudgetExceededError') return console.warn(`agent ${key} paused: ${err.message}`);
    const n = (failures.get(key) ?? 0) + 1;
    failures.set(key, n);
    console.error(`agent reply ${key} failed (attempt ${n}): ${err.message}`);
    // Back off 30 s, 1, 2, 4, 8 min before leaving it to the 30-min sweep (B4 run: 3 quick NVIDIA timeouts stalled c7).
    if (n <= MAX_REPLY_RETRIES) scheduleReply(matchId, userId, RETRY_MS * 2 ** (n - 1));
  } finally {
    await releaseLock(matchId, userId);
  }
}
