import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const messageSchema = new mongoose.Schema({
  matchId: { type: ObjectId, ref: 'Match', required: true },
  conversationId: { type: ObjectId, ref: 'Conversation', default: null },
  senderId: { type: ObjectId, ref: 'User', required: true }, // for agent messages: the user the agent speaks for
  authoredBy: { type: String, enum: ['human', 'agent'], required: true },
  text: { type: String, default: '', maxlength: 1000 }, // empty only for a photo message
  attachments: [{ kind: { type: String, enum: ['image'] }, url: String, w: Number, h: Number, _id: false }], // plan 30 S3.7
  like: { kind: { type: String, enum: ['photo', 'prompt', 'profile'] }, ref: String, _id: false }, // the like comment that opened the chat (S3.4)
  archiveAt: Date, // agent messages of closed matches: removed by the TTL index (plan 17 archiveNotes)
  actPlan: mongoose.Schema.Types.Mixed, // plan 08: the sampled act plan behind an agent message (replay/eval)
  checks: mongoose.Schema.Types.Mixed, // plan 08: style/grounding/stance/leak results
  meta: {
    usedFactIds: [{ type: ObjectId, ref: 'KgFact' }],
    targets: String,
    flagged: Boolean,
  },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

messageSchema.index({ matchId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ archiveAt: 1 }, { expireAfterSeconds: 0 });

export const Message = mongoose.model('Message', messageSchema);
