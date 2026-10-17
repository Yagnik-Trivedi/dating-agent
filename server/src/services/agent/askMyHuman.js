// "Ask my human" inbox items (owner's step 2): one open item per user per topic, repeats merged ("asked again by …"),
// at most KG.MAX_INBOX_PER_CONVERSATION new items per match.
import { InboxItem } from '../../models/InboxItem.js';
import { emitToUser } from '../../sockets/io.js';
import { KG } from '../kg/config.js';

/** item: { question, topicKey, topicLabel } → { action: 'created' | 'merged' | 'duplicate' | 'capped', item? } */
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
  if (await InboxItem.countDocuments({ userId, matchId }) >= KG.MAX_INBOX_PER_CONVERSATION) {
    console.warn(`inbox ${userId}/${matchId}: cap reached, not filing "${item.question}"`);
    return { action: 'capped' };
  }
  const created = await InboxItem.create({ userId, matchId, question: item.question, topicKey: item.topicKey ?? null, topicLabel: item.topicLabel ?? null });
  emit(userId, 'inbox:new', { item: created });
  return { action: 'created', item: created };
}
