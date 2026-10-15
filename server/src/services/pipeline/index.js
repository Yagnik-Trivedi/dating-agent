import { Match } from '../../models/Match.js';
import { emitToUser } from '../../sockets/io.js';
import { startConversation } from '../agent/index.js';
import { buildBriefs } from '../brief/index.js';
import { startEvaluation } from '../compat/index.js';
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
  await setStatus(match, 'trust_check');
  const [a, b] = match.users.map(String);
  const [ta, tb] = await Promise.all([checkProfile(a, b, match._id), checkProfile(b, a, match._id)]);

  // The match may have been closed (account deleted) while we were checking.
  const current = await Match.findById(match._id, { status: 1 }).lean();
  if (current?.status !== 'trust_check') return false;

  match.trust = { [a]: ta, [b]: tb };
  await Match.updateOne({ _id: match._id }, { $set: { trust: match.trust } });

  const flaggers = [a, b].filter((u) => match.trust[u].level === 'likely_fake');
  if (!flaggers.length) return true;
  // Likely fake: no agent ever starts on this match; tell the viewer(s) who flagged it, with reasons.
  await Match.updateOne({ _id: match._id }, { $set: { 'perUser.$[].agentActive': false } });
  match.perUser.forEach((p) => { p.agentActive = false; });
  await setStatus(match, 'flagged_fake');
  for (const u of flaggers) emitToUser(u, 'trust:flagged', { matchId: String(match._id), flags: match.trust[u].flags });
  return false;
}

/** Step 2 (plan 07): briefs, then an early-dealbreaker verdict (09) or the agent conversation (08). */
export async function runBrief(match) {
  await setStatus(match, 'briefing');
  const briefs = await buildBriefs(match);
  const current = await Match.findById(match._id, { status: 1 }).lean();
  if (current?.status !== 'briefing') return;

  match.brief = briefs;
  await Match.updateOne({ _id: match._id }, { $set: { brief: briefs } });
  if (Object.values(briefs).some((b) => b.earlyDealbreaker)) {
    await setStatus(match, 'evaluating');
    return startEvaluation(match, { reason: 'early_dealbreaker' });
  }
  await setStatus(match, 'agent_chatting');
  return startConversation(match);
}

/** Called after a mutual like: trust (06) → brief (07) → agent chat (08). */
export async function onMatchCreated(match) {
  if (!(await runTrustCheck(match))) return;
  await runBrief(match);
}

/** After a restart, re-run matches that never finished the pre-conversation steps. */
export async function resumePipelines() {
  const stuck = await Match.find({ status: { $in: ['matched', 'trust_check', 'briefing'] } });
  for (const m of stuck) {
    (m.status === 'briefing' ? runBrief(m) : onMatchCreated(m)).catch((err) => console.error(`resume pipeline ${m._id} failed: ${err.message}`));
  }
  if (stuck.length) console.log(`resumed ${stuck.length} match pipeline(s)`);
}
