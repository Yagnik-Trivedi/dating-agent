import mongoose from 'mongoose';

const likeSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  liked: { type: Boolean, required: true },
  // Plan 30 S3.4: what they liked (a photo URL, a prompt question, or the whole profile) and an optional comment.
  target: { kind: { type: String, enum: ['photo', 'prompt', 'profile'] }, ref: String, _id: false },
  comment: { type: String, maxlength: 150 },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

likeSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });
likeSchema.index({ toUserId: 1, liked: 1, createdAt: -1 }); // Likes you

export const Like = mongoose.model('Like', likeSchema);
