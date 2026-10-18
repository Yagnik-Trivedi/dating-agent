import mongoose from 'mongoose';

// The model part of the trust check on ONE user's public profile, keyed by a hash of that public content (plan 30 S1).
// Computed once per profile version (at onboarding / a profile edit) and reused by every viewer's trust check at match
// time; per-viewer rules (account age, live check) are still applied fresh. Plan 30 S2's self-check reads it too.
const profileCheckSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  version: { type: String, required: true },
  llm: mongoose.Schema.Types.Mixed, // { contradictions, scamSignals, genericBio, summary }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

profileCheckSchema.index({ userId: 1, version: 1 }, { unique: true });

export const ProfileCheck = mongoose.model('ProfileCheck', profileCheckSchema);
