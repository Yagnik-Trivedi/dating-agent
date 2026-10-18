import mongoose from 'mongoose';

const { Mixed } = mongoose.Schema.Types;

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  dob: Date, // private; Profile.age is derived from it at signup (plan 30 S0)
  consentAgent: { type: Boolean, required: true, validate: { validator: (v) => v === true, message: 'Agent consent is required' } },
  consentAt: { type: Date, required: true },
  agentMode: { type: String, enum: ['off', 'shadow', 'auto'], default: 'shadow' },
  onboarding: {
    status: { type: String, enum: ['not_started', 'in_progress', 'processing', 'done', 'failed'], default: 'not_started' },
    answers: Mixed,
    completedAt: Date,
  },
  styleProfile: { metrics: Mixed, description: String, doList: [String], dontList: [String] }, // v1; VoiceProfile replaces it (plan 05)
  graphVersion: { type: Number, default: 0 }, // $inc on every self-graph or voice write: plan 08's cache key
  // Plan 30 S1: 'building' after the quick phase-1 build, 'ready' once stories/concepts/style are in (agent chats wait for it).
  graphStatus: { type: String, enum: ['building', 'ready', 'failed'] },
  graphReadyAt: Date,
  settings: { learnFromChats: { type: Boolean, default: true }, _id: false },
  isSeed: { type: Boolean, default: false },
  // Plan 19 live check: the result only (never images, embeddings or landmarks); last 5 attempts. Never read across users.
  liveCheck: {
    status: { type: String, enum: ['none', 'passed', 'failed'], default: 'none' },
    checkedAt: Date,
    model: String,
    actions: [String],
    attempts: [{ at: Date, result: { type: String, enum: ['passed', 'failed'] }, reason: String, _id: false }],
    _id: false,
  },
  isJudge: { type: Boolean, default: false }, // pre-baked hackathon judge account (seed.js --judges, plan 12 §5)
  seedHash: { type: String, default: null }, // scripts/seed.js: hash of the persona the graph was built from
}, {
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
  toJSON: { transform: (doc, ret) => { delete ret.passwordHash; return ret; } },
});

export const User = mongoose.model('User', userSchema);
