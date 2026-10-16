import mongoose from 'mongoose';
import { toBinary } from '../utils/vector.js';

// Shared vocabulary (plan 15 §3, ref Phase 3): normalises each user's own facts and recognises topics in a chat.
// NOT a cross-user link: nothing ever queries "who else has this concept".
export const CONCEPT_TYPES = ['activity', 'food', 'place', 'value', 'lifestyle', 'topic', 'media', 'other'];

const conceptSchema = new mongoose.Schema({
  name: { type: String, required: true }, // normalised
  label: { type: String, required: true }, // display
  type: { type: String, enum: CONCEPT_TYPES, required: true },
  aliases: { type: [String], default: [] }, // normalised
  embedding: { type: Buffer, select: false, set: (v) => toBinary(v) },
  embeddingModel: String,
  verified: { type: Boolean, default: false },
  createdBy: { type: String, enum: ['seed', 'auto'], default: 'auto' },
  mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null }, // set by conceptCleanup
}, { timestamps: true, versionKey: false });

conceptSchema.index({ type: 1, name: 1 }, { unique: true });
conceptSchema.index({ aliases: 1 });

export const Concept = mongoose.model('Concept', conceptSchema);
