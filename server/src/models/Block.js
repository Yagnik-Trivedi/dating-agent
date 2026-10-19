import mongoose from 'mongoose';

// Plan 30 S3.8: a block hides both people from each other everywhere (discover, likes, matches, profiles).
const blockSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

blockSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });
blockSchema.index({ toUserId: 1 });

export const Block = mongoose.model('Block', blockSchema);
