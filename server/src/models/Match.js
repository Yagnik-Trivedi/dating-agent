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
    name: String, // first name from the public profile, stored at creation: agents/judges never read the other Profile for it
    agentActive: Boolean,
    tookOverAt: Date,
    decision: { type: String, enum: ['continue', 'pass', null], default: null },
    lastReadAt: Date,
    _id: false,
  }],
  trust: Mixed, // { [userId]: { score, level, flags[] } } (plan 06)
  brief: Mixed, // { [userId]: { summary, agenda[], openers[], watchouts[] } } (plan 07): nothing about the other user is stored as facts
  closedReason: { type: String, enum: ['gate', null], default: null }, // 'gate': failed the match-time dealbreaker re-check (no detail)
  agentState: Mixed, // { turnCount, lastAgentAt, stopReason, runningLock } (plan 08)
  lastMessageAt: Date,
}, { timestamps: true, versionKey: false });

export const Match = mongoose.model('Match', matchSchema);
