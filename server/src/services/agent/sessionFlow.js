// Plan 33 C1 (A5): the session lifecycle for full / demo chats. chatting → closing (one agent said "talk tomorrow?") →
// gap → the next session, or the verdict. Short chats never get here.
import { Conversation } from '../../models/Conversation.js';
import { Match } from '../../models/Match.js';
import { Message } from '../../models/Message.js';
import { Usage } from '../../models/Usage.js';
import { emitToUser } from '../../sockets/io.js';
import { enqueue } from '../jobs/queue.js';
import { KG } from '../kg/config.js';
import { flushUsage } from '../llm/budget.js';
import { currentSession, depthOf, gapMs, inSessions, newSession, sessionInfo, sessionsMax } from '../conversation/sessions.js';
import { summarizeSession } from '../conversation/memory.js';
import { cancelReplies, scheduleReply, stopConversation } from './scheduler.js';

/** Filled by the judge step (evidence passes + the per-side decision); until then a session never decides. */
const hooks = { decide: null };
export const setSessionHooks = (h) => Object.assign(hooks, h);

export function emitSession(match, conv) {
  const info = sessionInfo(conv);
  if (!info) return;
  for (const u of match.users) emitToUser(u, 'match:session', { matchId: String(match._id), ...info });
}

/** One agent said "talk tomorrow?": the other agent's goodbye is due. Atomic; false if the session moved on. */
export async function markClosing(conversationId, n, userId) {
  const res = await Conversation.updateOne(
    { _id: conversationId, status: 'active', sessionIndex: n, phase: 'chatting' },
    { $set: { phase: 'closing', [`sessions.${n - 1}.closedBy`]: String(userId) } },
  );
  return res.modifiedCount === 1;
}

/** The session is over (both said bye, or the close went unanswered): no more replies; summary + evidence + decision. */
export async function endSession(conversationId, n) {
  const conv = await Conversation.findById(conversationId, { agentState: 1, matchId: 1 }).lean();
  if (!conv) return false;
  const interestEnd = Object.fromEntries(Object.entries(conv.agentState ?? {}).filter(([k]) => k !== 'locks').map(([u, s]) => [u, s?.interest ?? null]));
  const res = await Conversation.updateOne(
    { _id: conversationId, status: 'active', sessionIndex: n, phase: { $in: ['chatting', 'closing'] } },
    { $set: { phase: 'gap', [`sessions.${n - 1}.endedAt`]: new Date(), [`sessions.${n - 1}.interestEnd`]: interestEnd } },
  );
  if (res.modifiedCount !== 1) return false;
  cancelReplies(conv.matchId);
  await enqueue('sessionEnd', { conversationId: String(conversationId), n }, { dedupeKey: `sessionEnd:${conversationId}:${n}` });
  return true;
}

/** Tokens of every model call for the match since the session started (its summary and evidence passes included). */
async function sessionTokens(matchId, since) {
  await flushUsage();
  const [row] = await Usage.aggregate([
    { $match: { matchId, at: { $gte: since } } },
    { $group: { _id: null, tokens: { $sum: { $add: ['$promptTokens', '$completionTokens'] } } } },
  ]);
  return row?.tokens ?? 0;
}

/**
 * `sessionEnd` job: summary (one call), evidence pass per side (one call each), then the code decides per side.
 * Any no, or a yes from both, or the last session → the verdict; otherwise the next session after the gap.
 * Idempotent: a re-run after a crash reuses the saved summary and passes.
 */
export async function runSessionEnd({ conversationId, n }) {
  let conv = await Conversation.findById(conversationId).lean();
  if (!conv || conv.status !== 'active' || conv.sessionIndex !== n || conv.phase !== 'gap') return { skipped: true };
  const match = await Match.findById(conv.matchId);
  if (match?.status !== 'agent_chatting') return { skipped: true };

  if (currentSession(conv).summary == null) await summarizeSession(conv, match);
  const decisions = hooks.decide ? await hooks.decide(conv, match) : {};
  conv = await Conversation.findById(conversationId).lean();
  const tokens = await sessionTokens(match._id, currentSession(conv).startedAt);
  await Conversation.updateOne({ _id: conv._id }, { $set: { [`sessions.${n - 1}.decisions`]: decisions, [`sessions.${n - 1}.tokens`]: tokens } });
  const said = Object.values(decisions).map((d) => d.decision);
  console.log(`session ${match._id} #${n} ended: ${said.join(' / ') || 'no decisions'}, ${tokens} tokens`);

  if (said.includes('no')) return stopConversation(match._id, 'judge_no', { endedBy: 'judge_no' });
  if (said.length === 2 && said.every((d) => d === 'yes')) return stopConversation(match._id, 'judge_yes', { endedBy: 'judge_yes' });
  if (n >= sessionsMax(conv)) return stopConversation(match._id, 'sessions_done', { endedBy: 'sessions_done' });

  const nextSessionAt = new Date(Date.now() + gapMs({ seed: conv.seed, depth: depthOf(conv), n: n + 1 }));
  await Conversation.updateOne({ _id: conv._id }, { $set: { nextSessionAt } });
  await enqueue('nextSession', { conversationId: String(conv._id), n: n + 1 }, { runAt: nextSessionAt, dedupeKey: `nextSession:${conv._id}` });
  emitSession(match, { ...conv, nextSessionAt });
  return { next: n + 1, at: nextSessionAt };
}

/**
 * `nextSession` job: session n starts. A message a human sent during the gap gets the first reply; otherwise the side
 * that didn't send the last message opens with a callback (its agent, if active; else the other agent).
 */
export async function startNextSession({ conversationId, n }) {
  const conv = await Conversation.findById(conversationId).lean();
  if (!conv || conv.status !== 'active' || conv.phase !== 'gap' || conv.sessionIndex !== n - 1) return { skipped: true };
  const match = await Match.findById(conv.matchId);
  if (match?.status !== 'agent_chatting') return { skipped: true };
  const startCount = await Message.countDocuments({ matchId: match._id });
  const session = newSession({ seed: conv.seed, depth: depthOf(conv), n, startCount });
  const updated = await Conversation.findOneAndUpdate(
    { _id: conv._id, phase: 'gap', sessionIndex: n - 1 },
    { $set: { phase: 'chatting', sessionIndex: n, nextSessionAt: null }, $push: { sessions: session } },
    { new: true },
  ).lean();
  if (!updated) return { skipped: true };
  emitSession(match, updated);
  const last = await Message.findOne({ matchId: match._id }).sort({ createdAt: -1 }).lean();
  const active = match.perUser.filter((p) => p.agentActive).map((p) => String(p.userId));
  const opener = active.find((u) => u !== String(last?.senderId)) ?? active[0];
  if (opener) await scheduleReply(match._id, opener, 0);
  return { started: n };
}

/** Sweep (boot + every 30 min): a gap whose job was lost starts its session; an unanswered close ends its session. */
export async function resumeSession(match, conv, last) {
  if (!inSessions(conv)) return false;
  if (conv.phase === 'gap') {
    if (conv.nextSessionAt && conv.nextSessionAt < Date.now() - 60_000) await startNextSession({ conversationId: conv._id, n: conv.sessionIndex + 1 });
    else if (!conv.nextSessionAt) await enqueue('sessionEnd', { conversationId: String(conv._id), n: conv.sessionIndex }, { dedupeKey: `sessionEnd:${conv._id}:${conv.sessionIndex}` });
    return true;
  }
  if (conv.phase === 'closing' && Date.now() - (last?.createdAt ?? 0) > KG.SESSION_CLOSING_STALE_MS) {
    await endSession(conv._id, conv.sessionIndex);
    return true;
  }
  return false;
}
