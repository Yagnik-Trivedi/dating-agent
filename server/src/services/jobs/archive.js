// `archiveNotes` (daily, plan 17 §6): raw notes and agent messages of matches closed more than NOTES_RETENTION_DAYS
// ago get archiveAt = now; TTL indexes then remove them. Handed-off matches keep everything. Plan 09 runs the notes
// compaction (summary into MatchDecision) before a match can reach this.
import { KgFact } from '../../models/KgFact.js';
import { Match } from '../../models/Match.js';
import { Message } from '../../models/Message.js';
import { KG } from '../kg/config.js';

export async function archiveNotes() {
  const before = new Date(Date.now() - KG.NOTES_RETENTION_DAYS * 86_400_000);
  const ids = await Match.distinct('_id', { status: { $in: ['closed', 'incompatible', 'flagged_fake'] }, updatedAt: { $lt: before } });
  if (!ids.length) return { matches: 0 };
  const now = new Date();
  const [notes, messages] = await Promise.all([
    KgFact.updateMany({ matchId: { $in: ids }, observerId: { $ne: null }, archiveAt: null }, { $set: { archiveAt: now } }),
    Message.updateMany({ matchId: { $in: ids }, authoredBy: 'agent', archiveAt: null }, { $set: { archiveAt: now } }),
  ]);
  return { matches: ids.length, notes: notes.modifiedCount, messages: messages.modifiedCount };
}
