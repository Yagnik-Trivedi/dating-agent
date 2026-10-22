// "Ask my human" inbox items (owner's step 2): one open item per user per topic, repeats merged ("asked again by …"),
// at most KG.MAX_INBOX_PER_CONVERSATION new items per match. Plan 32 KP3 (A6.6): only questions worth my human's time
// reach the inbox; a small detail is answered honestly in the chat and held until it comes up in INBOX_REPEAT_CHATS chats.
import { InboxItem } from '../../models/InboxItem.js';
import { emitToUser } from '../../sockets/io.js';
import { normalise } from '../kg/canonicalize.js';
import { KG } from '../kg/config.js';
import { debug } from '../../utils/log.js';

// A small detail: which one, a name, a time, a count ("which temple?", "what was the café called?", "which episode?").
const DETAIL = /\b(which|what('?s| is| was) (the|its|their) name|name of|(what|which) (time|day|date|episode|season|branch|one)|where exactly|how many|how long ago|called)\b/i;
// Big parts of a life: work, family, where to live, values, interests as a whole.
const LIFE_AREA = /\b(work|job|career|stud(y|ies|ying)|family|parents|siblings?|friends|kids|children|marriage|religio\w*|faith|values?|believe|future|dreams?|goals?|live|living|move|settle|abroad|hometown|travel\w*|food|cook\w*|music|movies?|films?|books?|reading|sports?|fitness|gym|hobb(y|ies)|weekends?|pets?|dogs?|cats?|money|health)\b/i;

/**
 * Plan 32 KP3: is this unknown worth an inbox item? A section-B topic (values and life goals) always is; a small detail
 * never is on its own; a broad question on a dictionary concept is (a like or dislike worth knowing); an unresolved one
 * only if it's about a big part of a life. → 'file' | 'hold'
 */
export function inboxWorth({ question = '', topicKey = null }) {
  if (String(topicKey ?? '').startsWith('attr:')) return 'file';
  if (DETAIL.test(question)) return 'hold';
  if (topicKey) return 'file';
  return LIFE_AREA.test(question) ? 'file' : 'hold';
}
const heldKeyOf = (item) => item.topicKey ?? `q:${normalise(item.question).replace(/[^\p{L}\p{N} ]/gu, '').trim()}`;

/** A small question: held until it has come up in INBOX_REPEAT_CHATS different chats, then it becomes a normal item. */
async function holdQuestion(userId, matchId, item, { askedBy, emit }) {
  const heldKey = heldKeyOf(item);
  const held = await InboxItem.findOne({ userId, heldKey, status: 'held' }).lean();
  if (!held) {
    await InboxItem.create({ userId, matchId, question: item.question, topicKey: item.topicKey ?? null, topicLabel: item.topicLabel ?? null, status: 'held', heldKey });
    debug(`inbox ${userId}/${matchId}: small question held, not filed: "${item.question}"`);
    return { action: 'held' };
  }
  const chats = new Set([held.matchId, ...(held.askedAgain ?? []).map((a) => a.matchId)].filter(Boolean).map(String));
  if (chats.has(String(matchId))) return { action: 'held' };
  const capped = await InboxItem.countDocuments({ userId, matchId, status: { $ne: 'held' } }) >= KG.MAX_INBOX_PER_CONVERSATION;
  const promote = chats.size + 1 >= KG.INBOX_REPEAT_CHATS && !capped;
  const updated = await InboxItem.findOneAndUpdate(
    { _id: held._id, status: 'held' },
    { $push: { askedAgain: { matchId, by: askedBy, question: item.question, at: new Date() } }, ...(promote && { $set: { status: 'open' } }) },
    { new: true },
  ).lean();
  if (!promote || !updated) return { action: 'held' };
  emit(userId, 'inbox:new', { item: updated });
  return { action: 'created', item: updated };
}

/** item: { question, topicKey, topicLabel } → { action: 'created' | 'merged' | 'duplicate' | 'capped' | 'held', item? } */
export async function fileQuestion(userId, matchId, item, { askedBy = null, emit = emitToUser } = {}) {
  if (item.topicKey) {
    const open = await InboxItem.findOneAndUpdate(
      { userId, topicKey: item.topicKey, status: 'open' },
      { $push: { askedAgain: { matchId, by: askedBy, question: item.question, at: new Date() } } },
      { new: true },
    ).lean();
    if (open) return { action: 'merged', item: open };
  } else if (await InboxItem.exists({ userId, matchId, status: 'open', question: item.question })) {
    return { action: 'duplicate' };
  }
  if (inboxWorth(item) === 'hold') return holdQuestion(userId, matchId, item, { askedBy, emit });
  if (await InboxItem.countDocuments({ userId, matchId, status: { $ne: 'held' } }) >= KG.MAX_INBOX_PER_CONVERSATION) {
    debug(`inbox ${userId}/${matchId}: cap reached, not filing "${item.question}"`);
    return { action: 'capped' };
  }
  const created = await InboxItem.create({ userId, matchId, question: item.question, topicKey: item.topicKey ?? null, topicLabel: item.topicLabel ?? null });
  emit(userId, 'inbox:new', { item: created });
  return { action: 'created', item: created };
}
