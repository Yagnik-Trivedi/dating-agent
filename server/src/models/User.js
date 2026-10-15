import mongoose from 'mongoose';

const { Mixed } = mongoose.Schema.Types;

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  consentAgent: { type: Boolean, required: true, validate: { validator: (v) => v === true, message: 'Agent consent is required' } },
  consentAt: { type: Date, required: true },
  agentMode: { type: String, enum: ['off', 'shadow', 'auto'], default: 'shadow' },
  onboarding: {
    status: { type: String, enum: ['not_started', 'in_progress', 'processing', 'done', 'failed'], default: 'not_started' },
    answers: Mixed,
    completedAt: Date,
  },
  styleProfile: { metrics: Mixed, description: String, doList: [String], dontList: [String] },
  isSeed: { type: Boolean, default: false },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
  toJSON: { transform: (doc, ret) => { delete ret.passwordHash; return ret; } },
});

export const User = mongoose.model('User', userSchema);
