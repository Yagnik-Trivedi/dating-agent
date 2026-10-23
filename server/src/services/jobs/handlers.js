// Every job type the worker runs (plan 17 §3). Importing this file registers them.
import { Like } from '../../models/Like.js';
import { Match } from '../../models/Match.js';
import { resumeConversations } from '../agent/index.js';
import { runAgentTurn } from '../agent/scheduler.js';
import { runSessionEnd, startNextSession } from '../agent/sessionFlow.js';
import { compactNotes } from '../compat/compactNotes.js';
import { startEvaluation } from '../compat/index.js';
import { runJudge } from '../conversation/judge.js';
import { runModuleBuild } from '../kg/buildModule.js';
import { runUserGraphBuild } from '../kg/buildUserGraph.js';
import { conceptCleanup, rebuildVoice, reconfirm, reflect } from '../kg/learning.js';
import { createMatch } from '../matches.js';
import { moderatePhoto } from '../photos.js';
import { profileCheckJob } from '../profileStatus.js';
import { runAwaitGraph, runMatchCreated, runScheduledChat } from '../pipeline/index.js';
import { archiveNotes } from './archive.js';
import { registerJob } from './queue.js';

registerJob('buildUserGraph', runUserGraphBuild);
registerJob('buildModule', runModuleBuild); // plan 33: one module's finer facts, after the quick build in the request
registerJob('matchCreated', runMatchCreated);
registerJob('startChat', runScheduledChat); // credit guard: a match over the daily live-chat cap starts the next day
registerJob('awaitGraph', runAwaitGraph); // plan 30 S1: a match waits for both phase-2 graphs (max 10 min)
registerJob('agentTurn', runAgentTurn);
registerJob('moderatePhoto', moderatePhoto); // plan 30 S3.1: one vision call per photo, retried while the model is down
registerJob('profileCheck', profileCheckJob); // plan 30 S1/S2: the trust check's model part + my own self-check and status
registerJob('evaluate', async ({ matchId, reason }) => {
  const match = await Match.findById(matchId);
  if (match) await startEvaluation(match, { reason });
});
registerJob('judge', runJudge); // one per side per conversation; the second one settles the match
registerJob('compactNotes', compactNotes);
registerJob('sessionEnd', runSessionEnd); // plan 33: summary + evidence passes + continue / end, after each session
registerJob('nextSession', startNextSession); // plan 33: the next session after the gap
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
