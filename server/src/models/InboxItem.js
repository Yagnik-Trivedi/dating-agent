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
  // 'held' (plan 32 KP3): a small detail ("which temple?") kept out of the inbox until it comes up in more chats.
  status: { type: String, enum: ['open', 'answered', 'dismissed', 'held'], default: 'open' },
  heldKey: { type: String, default: null }, // what counts as "the same small question" across chats
  answer: String,
  answeredAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
inboxItemSchema.index({ userId: 1, topicKey: 1, status: 1 });
inboxItemSchema.index({ userId: 1, heldKey: 1, status: 1 }, { partialFilterExpression: { status: 'held' } });

export const InboxItem = mongoose.model('InboxItem', inboxItemSchema);
