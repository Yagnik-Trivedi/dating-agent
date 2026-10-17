import mongoose from 'mongoose';

const inboxItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
  question: { type: String, required: true },
  // "attr:smoking" | "concept:<id>" when the question's topic resolved; one open item per user per topic.
  topicKey: { type: String, default: null },
  topicLabel: { type: String, default: null },
  // The same topic asked again (any match) is merged here instead of a new item.
  askedAgain: [{ _id: false, matchId: mongoose.Schema.Types.ObjectId, by: String, question: String, at: Date }],
  status: { type: String, enum: ['open', 'answered', 'dismissed'], default: 'open' },
  answer: String,
  answeredAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
inboxItemSchema.index({ userId: 1, topicKey: 1, status: 1 });

export const InboxItem = mongoose.model('InboxItem', inboxItemSchema);
