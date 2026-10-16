import { KgFact } from '../../models/KgFact.js';
import { Match } from '../../models/Match.js';
import { emitToUser } from '../../sockets/io.js';
import { startConversation } from '../agent/index.js';
import { buildBriefs } from '../brief/index.js';
import { enqueue } from '../jobs/queue.js';
import { checkProfile } from '../trust/checkProfile.js';

/**
 * The status a viewer sees. A flagged_fake match reads as "closed" for the side that was flagged,
 * so a scammer isn't told they were caught.
 */
export function statusFor(match, viewerId) {
  if (match.status !== 'flagged_fake') return match.status;
  return match.trust?.[String(viewerId)]?.level === 'likely_fake' ? 'flagged_fake' : 'closed';
}

/** Each user gets their own view of status + agentActive. */
export function emitStatus(match) {
  for (const p of match.perUser) {
    emitToUser(p.userId, 'match:status', { matchId: String(match._id), status: statusFor(match, p.userId), agentActive: p.agentActive });
  }
}

/** The one way to change match.status: save, then notify both users. */
export async function setStatus(match, status) {
  await Match.updateOne({ _id: match._id }, { $set: { status } });
  match.status = status;
  emitStatus(match);
  return match;
}

/** Step 1 (plan 06): both agents check the other profile in parallel. → true if the pipeline may continue. */
export async function runTrustCheck(match) {
  const [a, b] = match.users.map(String);
  // Idempotent (the matchCreated job may re-run after a crash): a saved result is reused, no LLM call.
  const saved = (await Match.findById(match._id, { trust: 1 }).lean())?.trust ?? {};
  await setStatus(match, 'trust_check');
  const [ta, tb] = await Promise.all([saved[a] ?? checkProfile(a, b, match._id), saved[b] ?? checkProfile(b, a, match._id)]);

  // The match may have been closed (account deleted) while we were checking.
  const current = await Match.findById(match._id, { status: 1 }).lean();
  if (current?.status !== 'trust_check') return false;

  match.trust = { [a]: ta, [b]: tb };
  await Match.updateOne({ _id: match._id }, { $set: { trust: match.trust } });

  const flaggers = [a, b].filter((u) => match.trust[u].level === 'likely_fake');
  if (!flaggers.length) return true;
  await flagMatch(match, flaggers);
  return false;
}

/**
 * Likely fake (trust check, or a scam script in chat): every agent stops for good, the match becomes flagged_fake,
 * and only the flagging viewer(s) are told why. The flagged side just sees the match as closed.
 */
export async function flagMatch(match, flaggerIds, newFlags = []) {
  const trust = { ...(match.trust ?? {}) };
  for (const u of flaggerIds.map(String)) {
    const prev = trust[u] ?? {};
    trust[u] = { ...prev, level: 'likely_fake', flags: [...new Set([...(prev.flags ?? []), ...newFlags])] };
  }
  match.trust = trust;
  await Match.updateOne({ _id: match._id }, { $set: { trust, 'perUser.$[].agentActive': false } });
  match.perUser.forEach((p) => { p.agentActive = false; });
  await setStatus(match, 'flagged_fake');
  for (const u of flaggerIds) emitToUser(u, 'trust:flagged', { matchId: String(match._id), flags: trust[String(u)].flags });
}

/** Step 2 (plan 07): briefs, then an early-dealbreaker verdict (09) or the agent conversation (08). */
export async function runBrief(match) {
  await setStatus(match, 'briefing');
  const briefs = await buildBriefs(match);
  const current = await Match.findById(match._id, { status: 1 }).lean();
  if (current?.status !== 'briefing') return;

  match.brief = briefs;
  await Match.updateOne({ _id: match._id }, { $set: { brief: briefs } });
  // The brief's observed facts are the first nodes of each viewer's live graph.
  for (const u of Object.keys(briefs)) {
    const facts = await KgFact.find({ matchId: match._id, observerId: u }).lean();
    emitToUser(u, 'kg:update', { matchId: String(match._id), facts, agenda: briefs[u].agenda });
  }
  if (Object.values(briefs).some((b) => b.earlyDealbreaker)) {
    await setStatus(match, 'evaluating');
    return queueEvaluation(match, { reason: 'early_dealbreaker' });
  }
  await setStatus(match, 'agent_chatting');
  return startConversation(match);
}

/** Called after a mutual like: trust (06) → brief (07) → agent chat (08). */
export async function onMatchCreated(match) {
  if (!(await runTrustCheck(match))) return;
  await runBrief(match);
}

/** `matchCreated` job: picks up wherever the match is (a restart mid-pipeline re-runs the unfinished step). */
export async function runMatchCreated({ matchId }) {
  const match = await Match.findById(matchId);
  if (['matched', 'trust_check'].includes(match?.status)) await onMatchCreated(match);
  else if (match?.status === 'briefing') await runBrief(match);
}

/** Queue the verdict (plan 09) for a stopped conversation. */
export const queueEvaluation = (match, { reason } = {}) =>
  enqueue('evaluate', { matchId: String(match._id), reason: reason ?? null }, { dedupeKey: `eval:${match._id}` });
