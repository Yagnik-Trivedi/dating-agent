import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// One side's judge verdict on one conversation (plan 09 §1). Mine only: the other side never sees my reasons.
const quoted = { quote: String, why: String, messageId: { type: ObjectId, ref: 'Message' }, _id: false };

const matchDecisionSchema = new mongoose.Schema({
  conversationId: { type: ObjectId, ref: 'Conversation', required: true },
  matchId: { type: ObjectId, ref: 'Match', required: true },
  userId: { type: ObjectId, ref: 'User', required: true },
  otherUserId: { type: ObjectId, ref: 'User', required: true },
  decision: { type: String, enum: ['yes', 'no', 'unsure'], required: true },
  confidence: { type: Number, default: 0 },
  positives: [quoted],
  frictions: [{ ...quoted, severity: { type: Number, default: 1 } }],
  dealbreakerRisk: [{ attribute: String, quote: String, _id: false }],
  noFrictionJustification: { type: String, default: null },
  summaryForUser: { type: String, default: '' },
  notesSummary: { type: String, default: null }, // filled by the compactNotes job when the match closes
  icebreakers: [String], // yes/unsure only, from my shared_interest events
  judgeModel: { type: String, default: null }, // which model actually decided (smart, or the mid fallback); null = no LLM
  validation: { reasked: Boolean, dropped: [String], _id: false }, // what the code validators changed (eval/debug)
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

matchDecisionSchema.index({ userId: 1, matchId: 1 });
matchDecisionSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

export const MatchDecision = mongoose.model('MatchDecision', matchDecisionSchema);
