import mongoose from 'mongoose';

const likeSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  liked: { type: Boolean, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

likeSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });

export const Like = mongoose.model('Like', likeSchema);
