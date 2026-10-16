import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const messageSchema = new mongoose.Schema({
  matchId: { type: ObjectId, ref: 'Match', required: true },
  senderId: { type: ObjectId, ref: 'User', required: true }, // for agent messages: the user the agent speaks for
  authoredBy: { type: String, enum: ['human', 'agent'], required: true },
  text: { type: String, required: true, maxlength: 1000 },
  archiveAt: Date, // agent messages of closed matches: removed by the TTL index (plan 17 archiveNotes)
  meta: {
    usedFactIds: [{ type: ObjectId, ref: 'KgFact' }],
    targets: String,
    flagged: Boolean,
  },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

messageSchema.index({ matchId: 1, createdAt: -1 });
messageSchema.index({ archiveAt: 1 }, { expireAfterSeconds: 0 });

export const Message = mongoose.model('Message', messageSchema);
