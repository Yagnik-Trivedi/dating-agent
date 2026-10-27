import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

// One agent conversation inside a match (plan 07 §6): the seed makes its randomness reproducible (plan 08 replays).
const conversationSchema = new mongoose.Schema({
  matchId: { type: ObjectId, ref: 'Match', required: true },
  round: { type: Number, default: 1 }, // 2 = an optional short follow-up (plan 09)
  seed: { type: Number, required: true },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  endedBy: { type: String, enum: ['interest', 'max_turns', 'natural', 'dealbreaker_hint', 'take_over', 'stale', 'chat_myself', 'judge_yes', 'judge_no', 'sessions_done', null], default: null },
  // Plan 33 C1: full | demo = sessions; short (and docs from before plan 33, which have no depth) = one chat as before.
  depth: { type: String, enum: ['full', 'demo', 'short'], default: 'short' },
  sessionIndex: { type: Number, default: 1 }, // the current session (1-based)
  // chatting → closing (one side said "talk tomorrow?", the other's goodbye is due) → gap (until nextSessionAt)
  phase: { type: String, enum: ['chatting', 'closing', 'gap'], default: 'chatting' },
  nextSessionAt: Date,
  extraSessions: { type: Number, default: 0 }, // "Let them talk a bit longer" on a Maybe: one more session
  sessions: [{
    n: Number,
    startedAt: Date,
    startCount: Number, // messages in the match before this session
    target: Number, // the match's message count at which this session closes
    closedBy: String, // userId whose agent said "talk later"
    endedAt: Date,
    summary: String, // one cheap call when the session ends (prompts/sessionSummary.js), transcript only
    threads: [{ about: String, text: String, _id: false }], // open threads: about = userId, for the next session's callback
    topicsCovered: [String],
    interestEnd: Mixed, // { [userId]: my agent's interest when the session ended }
    decisions: Mixed, // { [userId]: { decision, confidence, reason } } from the session's evidence pass
    tokens: Number, // every model call of the match during this session (+ its summary and evidence passes)
    _id: false,
  }],
  // Evidence per side, added to after each session's pass: { [userId]: { positives, frictions, dealbreakerRisk,
  // inconsistencies, summaryForUser, passes: [session n] } }. Fact ids are KgFact _ids (with tier + branch).
  ledger: Mixed,
  // { [userId]: { interest, lowInterestTurns, turn, toldStoryIds, topicsTouched, temperature, model } }
  agentState: Mixed,
  // Plan 34 (FLOW=natural), shared by both sides and derived from the transcript: { lead, leadSince, stintTarget,
  // thread: { topic, startedBy, startedAt, target } }.
  flow: Mixed,
  // Round 2+ ("Let them talk a bit longer"): the match's message count at which it ends, and from which a natural end is
  // allowed. Unset on round 1 → KG.MAX_TURNS / MIN_MESSAGES_FOR_NATURAL_END.
  endAfter: Number,
  naturalEndFrom: Number,
  startedAt: { type: Date, default: Date.now },
  endedAt: Date,
  archiveAt: Date, // TTL (plan 17 archiveNotes / plan 09 compaction)
}, { versionKey: false });

conversationSchema.index({ matchId: 1, round: 1 }, { unique: true });
conversationSchema.index({ archiveAt: 1 }, { expireAfterSeconds: 0 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
