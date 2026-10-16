// Step 4: verdicts for both users, then handoff or a kind wind-down. Decisions (continue / pass / override) live here too.
import { z } from 'zod';
import { Match } from '../../models/Match.js';
import { Message } from '../../models/Message.js';
import { Profile } from '../../models/Profile.js';
import { User } from '../../models/User.js';
import { emitToUser } from '../../sockets/io.js';
import { httpError } from '../../utils/http.js';
import { VoiceProfile } from '../../models/VoiceProfile.js';
import { cleanText } from '../persona/text.js';
import { cancelReplies } from '../agent/scheduler.js';
import { sendMessage } from '../chat.js';
import { chatJSON } from '../llm/client.js';
import { otherUserId, side, nameOf } from '../matches.js';
import { setStatus } from '../pipeline/index.js';
import * as windDownPrompt from '../prompts/windDown.js';
import { scanMessage } from '../trust/rules.js';
import { lowerVerdict } from './config.js';
import { evaluateFor } from './evaluate.js';

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'them';

/** One kind closing message from userId's side, in their style. A fixed line if the model fails or says anything risky. */
export async function windDown(match, userId) {
  const [user, mine, count, voice] = await Promise.all([
    User.findById(userId, { name: 1 }).lean(),
    Profile.findOne({ userId }, { name: 1 }).lean(),
    Message.countDocuments({ matchId: match._id }),
    VoiceProfile.findOne({ userId }, { description: 1, doList: 1, dontList: 1, closingStyle: 1 }).lean(),
  ]);
  const name = firstName(mine?.name ?? user?.name);
  const card = [voice?.description, voice?.doList?.length && `Do: ${voice.doList.join('; ')}`, voice?.dontList?.length && `Don't: ${voice.dontList.join('; ')}`, voice?.closingStyle && `Ends chats like: "${voice.closingStyle}"`].filter(Boolean).join('\n') || 'Casual, warm, short messages.';
  let text = "hey, thanks for chatting! I don't think we're quite on the same page, but wishing you the best 🙂";
  try {
    const out = await chatJSON({
      tier: 'fast', purpose: 'wind-down', userId, matchId: match._id, schema: z.object({ reply: z.string().trim().min(1).max(300) }),
      messages: windDownPrompt.build({ firstName: name, matchName: nameOf(match, otherUserId(match, userId)), styleCard: card, hadConversation: count > 0 }),
    });
    const draft = cleanText(out.reply, name);
    if (draft && !draft.includes('?') && scanMessage(draft).severity === 0) text = draft;
  } catch (err) {
    console.error(`wind-down for ${match._id}: using the fixed line (${err.message})`);
  }
  return sendMessage({ match, senderId: userId, authoredBy: 'agent', text });
}

/**
 * Both verdicts, saved; status = the lower verdict. Incompatible → one wind-down message from an incompatible side whose
 * agent is still active, then closed (if that side's human took over, nothing is sent and the status stays incompatible).
 */
export async function startEvaluation(match, { reason } = {}) {
  const fresh = await Match.findById(match._id);
  if (fresh?.status !== 'evaluating') return;
  const [a, b] = fresh.users.map(String);
  const [ra, rb] = await Promise.all([evaluateFor(fresh, a), evaluateFor(fresh, b)]);
  const report = { [a]: ra, [b]: rb };
  const saved = await Match.findOneAndUpdate({ _id: fresh._id, status: 'evaluating' }, { $set: { report } }, { new: true });
  if (!saved) return; // closed meanwhile (account deleted)
  const overall = lowerVerdict(ra.verdict, rb.verdict);
  console.log(`evaluation ${fresh._id} (${reason ?? 'stopped'}): ${ra.verdict} / ${rb.verdict} → ${overall}`);

  if (overall === 'incompatible') {
    const closer = [a, b].find((u) => report[u].verdict === 'incompatible' && side(saved, u)?.agentActive);
    if (closer) {
      await windDown(saved, closer);
      await setStatus(saved, 'closed');
    } else {
      await setStatus(saved, 'incompatible');
    }
  } else {
    await setStatus(saved, overall);
  }
  for (const u of [a, b]) emitToUser(u, 'report:ready', { matchId: String(saved._id) });
}

/**
 * continue: the user takes over from here (agent off); both continue → handed_off. On an incompatible verdict of their own
 * this is the "Talk anyway" override: the match reopens as "maybe" so the other side can decide too.
 * pass: the user's agent sends a kind wind-down (unless already handed off) and the match closes.
 */
export async function decide(matchId, userId, decision) {
  const me = String(userId);
  let match = await Match.findById(matchId);
  if (match.status === 'flagged_fake') throw httpError(409, 'MATCH_CLOSED', 'This conversation is closed');
  const ownVerdict = match.report?.[me]?.verdict;
  const override = decision === 'continue' && ownVerdict === 'incompatible' && ['closed', 'incompatible'].includes(match.status);
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
    await setStatus(match, 'maybe');
  } else if (match.status !== 'handed_off' && match.perUser.every((p) => p.decision === 'continue')) {
    await setStatus(match, 'handed_off');
  }
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
