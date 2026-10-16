// Every job type the worker runs (plan 17 §3). Importing this file registers them.
import { Like } from '../../models/Like.js';
import { Match } from '../../models/Match.js';
import { resumeConversations } from '../agent/index.js';
import { runAgentTurn } from '../agent/scheduler.js';
import { compactNotes } from '../compat/compactNotes.js';
import { startEvaluation } from '../compat/index.js';
import { runJudge } from '../conversation/judge.js';
import { runUserGraphBuild } from '../kg/buildUserGraph.js';
import { conceptCleanup, rebuildVoice, reconfirm, reflect } from '../kg/learning.js';
import { createMatch } from '../matches.js';
import { runMatchCreated } from '../pipeline/index.js';
import { archiveNotes } from './archive.js';
import { registerJob } from './queue.js';

registerJob('buildUserGraph', runUserGraphBuild);
registerJob('matchCreated', runMatchCreated);
registerJob('agentTurn', runAgentTurn);
registerJob('evaluate', async ({ matchId, reason }) => {
  const match = await Match.findById(matchId);
  if (match) await startEvaluation(match, { reason });
});
registerJob('judge', runJudge); // one per side per conversation; the second one settles the match
registerJob('compactNotes', compactNotes);
// Stale chats stop; chats that never started (or lost a reply before it was queued) get a turn.
registerJob('agentSweep', () => resumeConversations());
registerJob('seedLikeBack', async ({ seedId, userId }) => {
  await Like.updateOne({ fromUserId: seedId, toUserId: userId }, { $set: { liked: true } }, { upsert: true });
  await createMatch(seedId, userId);
});
registerJob('archiveNotes', archiveNotes);
registerJob('rebuildVoice', rebuildVoice);
registerJob('reflect', reflect);
registerJob('reconfirm', reconfirm);
registerJob('conceptCleanup', conceptCleanup);
