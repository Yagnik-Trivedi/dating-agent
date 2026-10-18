import { Conversation } from '../../models/Conversation.js';
import { Match } from '../../models/Match.js';
import { Profile } from '../../models/Profile.js';
import { User } from '../../models/User.js';
import { env } from '../../config/env.js';
import { rng, newSeed } from '../../utils/rng.js';
import { KG } from '../kg/config.js';
import { passesGate } from '../match/gate.js';
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

/** The one way to change match.status: save, then notify both users. A closed match gets its notes compacted (plan 09 §3). */
export async function setStatus(match, status) {
  await Match.updateOne({ _id: match._id }, { $set: { status } });
  match.status = status;
  emitStatus(match);
  if (status === 'closed' || status === 'flagged_fake') await enqueue('compactNotes', { matchId: String(match._id) }, { dedupeKey: `compact:${match._id}` });
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

/** One agent conversation for the match: a stored seed + per-side sampled temperature (plan 07 §6, replayable). */
export async function startConversationDoc(match) {
  const seed = newSeed();
  const r = rng(seed);
  const [lo, hi] = KG.TEMP_RANGE;
  const agentState = Object.fromEntries(match.users.map((u) => [String(u), { interest: null, lowInterestTurns: 0, turn: 0, toldStoryIds: [], topicsTouched: [], temperature: Math.round((lo + r() * (hi - lo)) * 100) / 100, model: KG.AGENT_MODEL_BY_SIDE?.[String(u)] ?? null }]));
  const existing = await Conversation.findOne({ matchId: match._id, status: 'active' }).lean();
  return existing ?? Conversation.create({ matchId: match._id, round: 1 + await Conversation.countDocuments({ matchId: match._id }), seed, agentState });
}

/** Step 2 (plan 07): briefs (public profile + own graph), the conversation doc, then the agent chat (08). */
export async function runBrief(match) {
  await setStatus(match, 'briefing');
  const briefs = await buildBriefs(match);
  const current = await Match.findById(match._id, { status: 1 }).lean();
  if (current?.status !== 'briefing') return;

  match.brief = briefs;
  await Match.updateOne({ _id: match._id }, { $set: { brief: briefs } });
  for (const u of Object.keys(briefs)) emitToUser(u, 'kg:update', { matchId: String(match._id), facts: [], agenda: briefs[u].agenda });
  if (await overDailyChats(match)) return scheduleChat(match);
  return startChat(match);
}

const utcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Credit guard (plan 12 §7): a non-seed user starts at most JUDGE_LIVE_CHATS_PER_DAY agent conversations per UTC day.
 * Only when an agent would run; humans chatting cost nothing.
 */
export async function overDailyChats(match) {
  if (!match.perUser.some((p) => p.agentActive)) return false;
  const since = utcDay();
  for (const u of await User.find({ _id: { $in: match.users }, isSeed: { $ne: true } }, { _id: 1 }).lean()) {
    // ponytail: lists the user's matches each time; fine for tens of matches a day.
    const ids = (await Match.find({ users: u._id, _id: { $ne: match._id } }, { _id: 1 }).lean()).map((m) => m._id);
    if (await Conversation.countDocuments({ matchId: { $in: ids }, round: 1, startedAt: { $gte: since } }) >= env.JUDGE_LIVE_CHATS_PER_DAY) return true;
  }
  return false;
}

/** Over the cap: the match waits as 'scheduled' ("your agent will start this chat tomorrow") until the next UTC day. */
async function scheduleChat(match) {
  const startsAt = new Date(utcDay().getTime() + 86_400_000 + 60_000);
  await Match.updateOne({ _id: match._id }, { $set: { 'agentState.startsAt': startsAt } });
  await enqueue('startChat', { matchId: String(match._id) }, { runAt: startsAt, dedupeKey: `startChat:${match._id}` });
  await setStatus(match, 'scheduled');
}

async function startChat(match) {
  await startConversationDoc(match);
  await setStatus(match, 'agent_chatting');
  return startConversation(match);
}

/** The startChat job: a scheduled match starts now, or waits another day if the cap is still full. */
export async function runScheduledChat({ matchId }) {
  const match = await Match.findById(matchId);
  if (match?.status !== 'scheduled') return { skipped: true };
  if (await overDailyChats(match)) return scheduleChat(match);
  return startChat(match);
}

/** Gate re-check at match creation (plan 07 §2): answers may have changed since discover. Boolean only, no LLM. */
export async function gateCheck(match) {
  const gates = await Profile.find({ userId: { $in: match.users } }, { userId: 1, gate: 1 }).lean();
  const [a, b] = match.users.map((u) => gates.find((g) => String(g.userId) === String(u))?.gate);
  if (passesGate(a, b)) return true;
  await Match.updateOne({ _id: match._id }, { $set: { closedReason: 'gate', 'perUser.$[].agentActive': false } });
  match.closedReason = 'gate';
  match.perUser.forEach((p) => { p.agentActive = false; });
  await setStatus(match, 'closed');
  return false;
}

/** Called after a mutual like: trust (06) → brief (07) → agent chat (08). */
export async function onMatchCreated(match) {
  if (!(await gateCheck(match))) return;
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
