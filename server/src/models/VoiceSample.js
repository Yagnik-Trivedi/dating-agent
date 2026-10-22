import mongoose from 'mongoose';
import { toBinary } from '../utils/vector.js';

// The user's own real messages (plan 15 §3): few-shot exemplars for their agent, and the data VoiceProfile is built from.
const voiceSampleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  incoming: { type: String, default: null }, // the message being replied to
  text: { type: String, required: true },
  source: { type: String, enum: ['onboarding', 'inbox', 'approved_draft', 'edited_draft', 'own_chat', 'import'], required: true },
  mood: String, // greeting | curious | opinion | excited | disagree | plan | apologetic | tease | closing | long_reply | casual …
  lang: {
    languages: [String], // e.g. ['en', 'hi_latn']
    script: { type: String, enum: ['latin', 'devanagari', 'gujarati', 'other', 'mixed'] },
    codeSwitch: Boolean,
    _id: false,
  },
  // Plan 32 KP1: where it was typed (touch screen + width, from the browser). Desktop samples count less for emoji,
  // length and bursts. Unknown (own chats, older samples) counts fully.
  device: { type: String, enum: ['mobile', 'desktop'] },
  burst: Boolean, // own_chat: this message continued my previous one (no reply from them in between)
  embedding: { type: Buffer, select: false, set: (v) => toBinary(v) }, // of `incoming`
  embeddingModel: String,
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

voiceSampleSchema.index({ userId: 1, createdAt: 1 });

export const VoiceSample = mongoose.model('VoiceSample', voiceSampleSchema);
