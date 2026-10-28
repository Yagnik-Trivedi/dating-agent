import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

export const MATCH_STATUSES = [
  'matched', 'trust_check', 'flagged_fake', 'briefing', 'scheduled', 'agent_chatting', 'evaluating',
  'compatible', 'maybe', 'incompatible', 'handed_off', 'closed',
];

const matchSchema = new mongoose.Schema({
  users: { type: [{ type: ObjectId, ref: 'User' }], index: true }, // sorted
  pairKey: { type: String, required: true, unique: true }, // `${users[0]}_${users[1]}`, prevents duplicate matches
  admin: { type: Boolean, default: undefined }, // made by the owner for testing (scripts/admin-matches.js): no gate re-check, no daily chat cap
  status: { type: String, enum: MATCH_STATUSES, default: 'matched' },
  perUser: [{
    userId: { type: ObjectId, ref: 'User' },
    name: String, // first name from the public profile, stored at creation: agents/judges never read the other Profile for it
    agentActive: Boolean,
    tookOverAt: Date,
    pausedAt: Date, // Pause (owner, plan 10): agent off for now, Resume turns it back on; Take over is for good
    decision: { type: String, enum: ['continue', 'pass', null], default: null },
    lastReadAt: Date,
    // Plan 30 S3.6: 'agents' = let the agents break the ice, 'self' = chat myself now. Default from agent mode (off → self).
    // Either side picking 'self' makes it a normal human chat.
    choice: { type: String, enum: ['agents', 'self'] },
    _id: false,
  }],
  trust: Mixed, // { [userId]: { score, level, flags[] } } (plan 06)
  brief: Mixed, // { [userId]: { summary, agenda[], openers[], watchouts[] } } (plan 07): nothing about the other user is stored as facts
  // 'gate': failed the match-time dealbreaker re-check (no detail); 'unmatched' / 'blocked' (plan 30 S3.8): hidden from both
  closedReason: { type: String, enum: ['gate', 'unmatched', 'blocked', null], default: null },
  agentState: Mixed, // { turnCount, lastAgentAt, stopReason, runningLock } (plan 08); startsAt when 'scheduled' (plan 12 credit guard); frozen: judge demo match paused until opened
  lastMessageAt: Date,
  // Owner's chained test run: this match's chat depth (overrides CHAT_DEPTH) and the people still to go after it.
  chatDepth: { type: String, enum: ['full', 'demo', 'short', 'chain', null], default: undefined },
  chain: Mixed, // { owner, next: [userId], depth }
  instant: { type: Boolean, default: undefined }, // owner's test match: agents reply with no debounce and no typing delay
  language: Mixed, // owner's test match: { mix, codeSwitchRate } replaces both agents' own language mix in this chat
}, { timestamps: true, versionKey: false });

export const Match = mongoose.model('Match', matchSchema);
