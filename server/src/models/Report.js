import mongoose from 'mongoose';

export const REPORT_REASONS = ['fake_profile', 'scam', 'harassment', 'inappropriate_photos', 'underage', 'other'];

// Plan 30 S3.8: read by a person through GET /api/admin/reports. The reported user is never told who reported them.
const reportSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
  reason: { type: String, enum: REPORT_REASONS, required: true },
  note: { type: String, maxlength: 500 },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
}, { timestamps: true, versionKey: false });

reportSchema.index({ status: 1, createdAt: -1 });

export const Report = mongoose.model('Report', reportSchema);
