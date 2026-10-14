import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

export const MATCH_STATUSES = [
  'matched', 'trust_check', 'flagged_fake', 'briefing', 'agent_chatting', 'evaluating',
  'compatible', 'maybe', 'incompatible', 'handed_off', 'closed',
];

const matchSchema = new mongoose.Schema({
  users: { type: [{ type: ObjectId, ref: 'User' }], index: true }, // sorted
  pairKey: { type: String, required: true, unique: true }, // `${users[0]}_${users[1]}`, prevents duplicate matches
  status: { type: String, enum: MATCH_STATUSES, default: 'matched' },
  perUser: [{
    userId: { type: ObjectId, ref: 'User' },
    agentActive: Boolean,
    tookOverAt: Date,
    decision: { type: String, enum: ['continue', 'pass', null], default: null },
    lastReadAt: Date,
    _id: false,
  }],
  trust: Mixed, // { [userId]: { score, level, flags[] } } (plan 06)
  brief: Mixed, // { [userId]: { summary, agenda[], openers[], earlyDealbreaker } } (plan 07)
  agentState: Mixed, // { turnCount, lastAgentAt, stopReason, runningLock } (plan 08)
  report: Mixed, // { [userId]: { verdict, score, reasons[], concerns[], dimensions{}, askYourself[] } } (plan 09)
  lastMessageAt: Date,
}, { timestamps: true, versionKey: false });

export const Match = mongoose.model('Match', matchSchema);
