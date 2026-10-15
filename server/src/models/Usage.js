import mongoose from 'mongoose';

const usageSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now, index: true },
  purpose: { type: String, required: true },
  tier: { type: String, required: true },
  provider: String,
  model: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  costUsd: { type: Number, default: 0 },
  latencyMs: Number,
  ok: Boolean,
}, { versionKey: false });

export const Usage = mongoose.model('Usage', usageSchema, 'usage');
