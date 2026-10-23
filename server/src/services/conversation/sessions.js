// Plan 33 C1 (A5): long chats in sessions, like texting over a few days. A session is one sitting (16–24 messages) that
// ends naturally ("ok I need to sleep, talk tomorrow?" + their goodbye). Then one summary call, one evidence pass per
// side, and code decides: the next session after a gap, or the end (a no, a yes from both, or the last session).
// CHAT_DEPTH=short (and conversations from before plan 33) keep today's single chat; nothing here runs for them.
import { env } from '../../config/env.js';
import { KG } from '../kg/config.js';
import { rng as seeded } from '../../utils/rng.js';

/** full | demo | short for a new conversation. users: [{ isSeed, isJudge }]. */
export function chatDepth(users = []) {
  if (env.RULES === 'off') return 'short'; // the plan-11 ablation compares plain agents on today's chat
  if (env.CHAT_DEPTH) return env.CHAT_DEPTH;
  return users.some((u) => u.isSeed || u.isJudge) ? 'demo' : 'full';
}

export const depthOf = (conv) => conv?.depth ?? 'short';
export const inSessions = (conv) => depthOf(conv) !== 'short';
export const depthCfg = (depth) => KG.CHAT_DEPTHS[depth] ?? null;
export const sessionsMax = (conv) => (depthCfg(depthOf(conv))?.sessions ?? 1) + (conv?.extraSessions ?? 0);
export const currentSession = (conv) => conv?.sessions?.at(-1) ?? null;

const TIER_RANK = { surface: 0, personal: 1, deep: 2 };
export const tierRank = (t) => TIER_RANK[t] ?? 0;
/** What session n may draw on for sharing (A5): 1 small talk, 2 + stories and people, 3+ everything. */
export const unlockedTier = (n) => KG.SESSION_TIERS[Math.min(Math.max(1, n), KG.SESSION_TIERS.length) - 1];

/** Session n of a conversation: its length sampled (seeded, replayable) in the depth's range. */
export function newSession({ seed, depth, n, startCount, at = new Date() }) {
  const [lo, hi] = depthCfg(depth).sessionMessages;
  const r = seeded((seed + n * 7919) >>> 0);
  return { n, startedAt: at, startCount, target: startCount + lo + Math.floor(r() * (hi - lo + 1)) };
}

/** The gap before session n (seeded). */
export function gapMs({ seed, depth, n }) {
  const [lo, hi] = depthCfg(depth).gapMs;
  return Math.round(lo + seeded((seed + n * 104729) >>> 0)() * (hi - lo));
}

/**
 * planAct's limits inside the current session (absolute message counts, like msgCount). The close is the session's
 * second-to-last message when the other side's agent will say goodbye, else its last. A natural close is allowed in
 * the last 4 messages before the target, never before the depth's minimum session length.
 */
export function sessionLimits(conv, { otherAgent = true } = {}) {
  const s = currentSession(conv);
  const reserve = otherAgent ? 1 : 0;
  const maxMessages = s.target - reserve;
  const min = depthCfg(depthOf(conv)).sessionMessages[0];
  return { maxMessages, naturalEndFrom: Math.max(s.startCount + min - reserve - 1, maxMessages - 4) };
}

/** No more than this many messages in a session-mode match, whatever happens (the onIncomingMessage loop guard). */
export const hardCap = (conv) => sessionsMax(conv) * depthCfg(depthOf(conv)).sessionMessages[1] + 4;

/** What the match room shows: "Session 2 of up to 5" and, between sessions, when they pick it up. */
export function sessionInfo(conv) {
  if (!inSessions(conv)) return null;
  return { depth: depthOf(conv), n: conv.sessionIndex ?? 1, of: sessionsMax(conv), phase: conv.phase ?? 'chatting', nextSessionAt: conv.phase === 'gap' ? conv.nextSessionAt ?? null : null };
}

/** The thread about them the last session left open ("the exam on Friday"), for the next session's callback. */
export const callbackFor = (conv, otherId) => (conv.sessions?.at(-2)?.threads ?? []).find((t) => String(t.about) === String(otherId))?.text ?? null;

/**
 * The act plan inside a session (mutates plan). Their "talk tomorrow?" gets a short goodbye; any other end but a
 * dealbreaker closes this session, not the chat (code decides at the session's end whether there's a next one); a
 * later session's first message picks the chat back up with a callback.
 */
export function sessionPlan(plan, { conv, otherId, goodbye = false, sessionStart = false, theirMsgs = [] }) {
  plan.session = currentSession(conv).n;
  if (goodbye) return Object.assign(plan, { end: 'session_ack', move: 'close', topic: null, askBack: false });
  if (plan.end && plan.end !== 'dealbreaker_hint') return Object.assign(plan, { endReason: plan.end, end: 'session' });
  if (sessionStart) {
    const gapFrom = conv.sessions.at(-2)?.endedAt ?? 0;
    Object.assign(plan, { move: 'callback', topic: null, askBack: true, callback: callbackFor(conv, otherId), callbackReply: theirMsgs.some((m) => m.createdAt > gapFrom) });
  }
  return plan;
}
