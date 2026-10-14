import mongoose from 'mongoose';

const inboxItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
  question: { type: String, required: true },
  status: { type: String, enum: ['open', 'answered', 'dismissed'], default: 'open' },
  answer: String,
  answeredAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

export const InboxItem = mongoose.model('InboxItem', inboxItemSchema);
