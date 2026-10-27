// Step 4 (plan 09): one independent judge per side → MatchDecision; the match is the lower of the two; handoff only on
// mutual yes. Decisions (continue / pass / "Talk anyway"), the wind-down, the reveal and the report view live here.
import { z } from 'zod';
import { env } from '../../config/env.js';
import { Conversation } from '../../models/Conversation.js';
import { Match } from '../../models/Match.js';
import { MatchDecision } from '../../models/MatchDecision.js';
import { Message } from '../../models/Message.js';
import { ChatEvent } from '../../models/ChatEvent.js';
import { KgFact } from '../../models/KgFact.js';
import { VoiceProfile } from '../../models/VoiceProfile.js';
import { VoiceSample } from '../../models/VoiceSample.js';
import { emitToUser } from '../../sockets/io.js';
import { httpError } from '../../utils/http.js';
import { cancelReplies, scheduleReply } from '../agent/scheduler.js';
import { sendMessage } from '../chat.js';
import { enqueue } from '../jobs/queue.js';
import { KG } from '../kg/config.js';
import { chatJSON } from '../llm/client.js';
import { nameOf, otherUserId, side } from '../matches.js';
import { cleanText } from '../persona/text.js';
import { setStatus } from '../pipeline/index.js';
import * as windDownPrompt from '../prompts/windDown.js';
import { scanMessage } from '../trust/rules.js';
import { inSessions, newSession } from '../conversation/sessions.js';
import { LABEL, lowerVerdict, myDecision } from './report.js';

export { LABEL, lowerVerdict, myDecision, reportFor } from './report.js';

/** One kind closing message from userId's side, in their voice. A fixed line if the model fails or says anything risky. */
export async function windDown(match, userId) {
  const [count, voice, samples] = await Promise.all([
    Message.countDocuments({ matchId: match._id }),
    VoiceProfile.findOne({ userId }, { description: 1, doList: 1, dontList: 1, closingStyle: 1 }).lean(),
    VoiceSample.find({ userId }, { text: 1 }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);
  const name = nameOf(match, userId);
  const card = [voice?.description, voice?.doList?.length && `Do: ${voice.doList.join('; ')}`, voice?.dontList?.length && `Don't: ${voice.dontList.join('; ')}`].filter(Boolean).join('\n') || 'Casual, warm, short messages.';
  // A few short real messages as style exemplars (copy the style, never the content).
  const exemplars = samples.map((s) => s.text).filter((t) => t.length <= 140).sort((a, b) => a.length - b.length).slice(0, 4);
  const natural = env.RULES !== 'off' && env.CONVO_MODE === 'human' && env.FLOW === 'natural'; // plan 34: the cool ending
  // Plan 34: no fixed line in natural mode; if the model fails, the user's own closing style, else nothing is sent.
  let text = natural ? voice?.closingStyle ?? null : "hey, thanks for chatting! I don't think we're quite on the same page, but wishing you the best 🙂";
  try {
    const out = await chatJSON({
      tier: 'fast', purpose: 'wind-down', userId, matchId: match._id, schema: z.object({ reply: z.string().trim().min(1).max(300) }),
      messages: windDownPrompt.build({ firstName: name, matchName: nameOf(match, otherUserId(match, userId)), styleCard: card, exemplars, closingStyle: voice?.closingStyle ?? null, hadConversation: count > 0, natural }),
    });
    const draft = cleanText(out.reply, name);
    if (draft && !draft.includes('?') && scanMessage(draft).severity === 0 && !(natural && /same page|talk (later|soon|tomorrow)|compatib/i.test(draft))) text = draft;
  } catch (err) {
    console.error(`wind-down for ${match._id}: model failed, using ${natural ? 'the user\'s own closing style (or nothing)' : 'the fixed line'} (${err.message})`); // also when AI is paused: a Pass must still close kindly
  }
  if (!text) return null;
  return sendMessage({ match, senderId: userId, authoredBy: 'agent', text });
}

/** The conversation ended (match is `evaluating`): queue one independent judge job per side. */
export async function startEvaluation(match, { reason } = {}) {
  const fresh = await Match.findById(match._id).lean();
  if (fresh?.status !== 'evaluating') return;
  const conv = await Conversation.findOne({ matchId: fresh._id }).sort({ round: -1 }).lean();
  if (!conv) return;
  console.log(`evaluation ${fresh._id} (${reason ?? 'stopped'}): judging conversation ${conv._id}`);
  for (const u of fresh.users.map(String)) {
    await enqueue('judge', { conversationId: String(conv._id), userId: u }, { dedupeKey: `judge:${conv._id}:${u}` });
  }
}

/**
 * Both judges done → status = the lower label. Not compatible: the first "no" side whose agent is still active sends ONE
 * wind-down, then closed; if every "no" side took over, nothing is sent and the status stays incompatible.
 * Runs once per conversation (atomic claim), whichever judge finishes second.
 */
export async function settle(matchId, conversationId) {
  const decisions = await MatchDecision.find({ conversationId }).lean();
  if (decisions.length < 2) return null;
  const match = await Match.findOneAndUpdate(
    { _id: matchId, status: 'evaluating', 'agentState.settledConversation': { $ne: String(conversationId) } },
    { $set: { 'agentState.settledConversation': String(conversationId) } },
    { new: true },
  );
  if (!match) return null; // settled already, or the match moved on (closed, flagged, deleted)
  const of = (u) => decisions.find((d) => String(d.userId) === String(u));
  const [a, b] = match.users.map(String);
  const overall = lowerVerdict(LABEL[of(a).decision], LABEL[of(b).decision]);
  console.log(`settle ${match._id}: ${of(a).decision} / ${of(b).decision} → ${overall}`);

  if (overall === 'incompatible') {
    const closer = [a, b].find((u) => of(u).decision === 'no' && side(match, u)?.agentActive);
    if (closer) {
      await windDown(match, closer);
      await setStatus(match, 'closed');
    } else {
      await setStatus(match, 'incompatible');
    }
  } else {
    await setStatus(match, overall);
  }
  for (const u of [a, b]) emitToUser(u, 'report:ready', { matchId: String(match._id) });
  return overall;
}

/** Reopening a closed match ("Talk anyway"): its notes, moments and agent messages are no longer up for archiving. */
async function unarchive(matchId) {
  await Promise.all([
    KgFact.updateMany({ matchId, observerId: { $ne: null }, archiveAt: { $ne: null } }, { $unset: { archiveAt: 1 } }),
    ChatEvent.updateMany({ matchId, archiveAt: { $ne: null } }, { $unset: { archiveAt: 1 } }),
    Message.updateMany({ matchId, archiveAt: { $ne: null } }, { $unset: { archiveAt: 1 } }),
  ]);
}

/**
 * continue: the user takes over from here (agent off); both continue → handed_off. When MY OWN decision is "no" this is
 * the "Talk anyway" override: the match reopens as "maybe" with my agent off, so the other side decides too.
 * pass: my agent sends a kind wind-down (unless already handed off) and the match closes.
 */
export async function decide(matchId, userId, decision) {
  const me = String(userId);
  let match = await Match.findById(matchId);
  if (match.status === 'flagged_fake') throw httpError(409, 'MATCH_CLOSED', 'This conversation is closed');
  const mine = await myDecision(match._id, me);
  const override = decision === 'continue' && mine?.decision === 'no' && ['closed', 'incompatible'].includes(match.status);
  if (decision === 'continue' && ['closed', 'incompatible'].includes(match.status) && !override) {
    throw httpError(409, 'MATCH_CLOSED', 'This match has been closed');
  }

  const set = { 'perUser.$.decision': decision };
  if (decision === 'continue') set['perUser.$.agentActive'] = false;
  match = await Match.findOneAndUpdate({ _id: match._id, 'perUser.userId': me }, { $set: set }, { new: true });
  if (decision === 'continue') cancelReplies(match._id, me);

  if (decision === 'pass') {
    if (!['closed', 'handed_off'].includes(match.status)) await windDown(match, me);
    if (match.status !== 'closed') await setStatus(match, 'closed');
  } else if (override) {
    await unarchive(match._id);
    await setStatus(match, 'maybe');
  } else if (match.status !== 'handed_off' && match.perUser.every((p) => p.decision === 'continue')) {
    await setStatus(match, 'handed_off');
  }
  return match;
}

/**
 * "Let them talk a bit longer" (plan 10 backend addition): once per match, only while the match is Maybe, MY latest
 * decision is unsure and I haven't decided yet. A round-2 conversation of up to EXTEND_TURNS more messages (no natural end
 * before that; near its end every turn steers to my open important agenda items), then both judges re-run on the whole
 * transcript. Earlier decisions are kept; the report shows the newest.
 */
export async function extend(matchId, userId) {
  const me = String(userId);
  const match = await Match.findById(matchId);
  const mine = await myDecision(match._id, me);
  if (match.status !== 'maybe' || mine?.decision !== 'unsure' || side(match, me)?.decision) {
    throw httpError(409, 'CANNOT_EXTEND', "Only a Maybe you haven't decided on yet can be extended");
  }
  if (!match.perUser.some((p) => p.agentActive)) throw httpError(409, 'NO_AGENT', 'Both of you took over; just keep chatting');
  const last = await Conversation.findOne({ matchId: match._id }).sort({ round: -1 }).lean();
  if (!last || last.round > 1) throw httpError(409, 'ALREADY_EXTENDED', 'This chat was already extended once');
  const count = await Message.countDocuments({ matchId: match._id });
  const endAfter = count + KG.EXTEND_TURNS;
  const agentState = Object.fromEntries(Object.entries(last.agentState ?? {}).map(([u, s]) => [u, { ...s, lowInterestTurns: 0 }]));
  // Plan 33: a session-mode chat gets one more session on the same high bar (its ledger and summaries carry over).
  const sessionMode = inSessions(last);
  const seed = (last.seed + 1) >>> 0;
  const n = (last.sessionIndex ?? 1) + 1;
  try {
    await Conversation.create(sessionMode
      ? { matchId: match._id, round: last.round + 1, seed, agentState, depth: last.depth, extraSessions: (last.extraSessions ?? 0) + 1, ledger: last.ledger,
        sessionIndex: n, phase: 'chatting', sessions: [...(last.sessions ?? []), newSession({ seed, depth: last.depth, n, startCount: count })] }
      : { matchId: match._id, round: last.round + 1, seed, agentState, endAfter, naturalEndFrom: endAfter });
  } catch (err) {
    if (err.code === 11000) throw httpError(409, 'ALREADY_EXTENDED', 'This chat was already extended once'); // a parallel request won
    throw err;
  }
  await setStatus(match, 'agent_chatting');
  const lastMsg = await Message.findOne({ matchId: match._id }).sort({ createdAt: -1 }).lean();
  for (const p of match.perUser) if (p.agentActive && String(p.userId) !== String(lastMsg?.senderId)) scheduleReply(match._id, p.userId);
  return match;
}

/** After handoff: how many messages the agents handled ("The first N messages were handled by your agents…"). */
export async function revealFor(match) {
  if (match.status !== 'handed_off') return null;
  const lastAgent = await Message.findOne({ matchId: match._id, authoredBy: 'agent' }).sort({ createdAt: -1 }).lean();
  if (!lastAgent) return null;
  const count = await Message.countDocuments({ matchId: match._id, createdAt: { $lte: lastAgent.createdAt } });
  return { agentHandled: count, text: `The first ${count} messages were handled by your agents. From here on it's just you two.` };
}
