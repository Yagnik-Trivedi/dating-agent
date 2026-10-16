import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

// One agent conversation inside a match (plan 07 §6): the seed makes its randomness reproducible (plan 08 replays).
const conversationSchema = new mongoose.Schema({
  matchId: { type: ObjectId, ref: 'Match', required: true },
  round: { type: Number, default: 1 }, // 2 = an optional short follow-up (plan 09)
  seed: { type: Number, required: true },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  endedBy: { type: String, enum: ['interest', 'max_turns', 'natural', 'dealbreaker_hint', 'take_over', 'stale', null], default: null },
  // { [userId]: { interest, lowInterestTurns, turn, toldStoryIds, topicsTouched, temperature, model } }
  agentState: Mixed,
  startedAt: { type: Date, default: Date.now },
  endedAt: Date,
  archiveAt: Date, // TTL (plan 17 archiveNotes / plan 09 compaction)
}, { versionKey: false });

conversationSchema.index({ matchId: 1, round: 1 }, { unique: true });
conversationSchema.index({ archiveAt: 1 }, { expireAfterSeconds: 0 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
