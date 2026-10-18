import mongoose from 'mongoose';

// Plan 19: one live-check attempt. The nonce is single-use (usedAt set atomically); Mongo's TTL index drops it
// at expiresAt + 1 day. Holds no image or face data.
const liveCheckChallengeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  nonce: { type: String, required: true },
  actions: { type: [String], required: true }, // ['neutral', a, b]
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

liveCheckChallengeSchema.index({ userId: 1, createdAt: -1 });
// Kept a day past expiry so the per-day start limit can count them; whether one is still valid is checked in code.
liveCheckChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 });

export const LiveCheckChallenge = mongoose.model('LiveCheckChallenge', liveCheckChallengeSchema);
