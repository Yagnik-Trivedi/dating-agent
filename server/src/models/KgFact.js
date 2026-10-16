import mongoose from 'mongoose';
import { toBinary } from '../utils/vector.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const kgFactSchema = new mongoose.Schema({
  subjectId: { type: ObjectId, ref: 'User', required: true }, // who the fact is about
  observerId: { type: ObjectId, ref: 'User', default: null }, // null = self-reported; else whose agent learned it
  matchId: { type: ObjectId, ref: 'Match', default: null },
  predicate: {
    type: String,
    required: true,
    enum: ['likes', 'dislikes', 'values', 'dealbreaker', 'trait', 'goal', 'story', 'style', 'lifestyle', 'background'],
  },
  object: { type: String, required: true },
  value: Mixed,
  weight: { type: Number, min: 0, max: 1, default: 0.5 },
  confidence: { type: Number, min: 0, max: 1, default: 0.5 },
  source: { type: String, enum: ['questionnaire', 'profile', 'conversation', 'user_answer', 'inferred'], required: true },
  evidence: [{ messageId: { type: ObjectId, ref: 'Message' }, quote: String, _id: false }],
  disclosure: { type: String, enum: ['public', 'if_asked', 'private'], default: 'public' },
  embedding: { type: Buffer, select: false, set: (v) => toBinary(v) }, // compact float32 (plan 17)
  embeddingModel: String, // model that produced `embedding`; scripts/reembed.js refreshes mismatches
  archiveAt: Date, // notes of closed matches: removed by the TTL index (plan 17 archiveNotes)
}, { timestamps: { createdAt: false, updatedAt: true }, versionKey: false });

kgFactSchema.index({ subjectId: 1, observerId: 1 });
kgFactSchema.index({ matchId: 1 });
kgFactSchema.index({ archiveAt: 1 }, { expireAfterSeconds: 0 });

export const KgFact = mongoose.model('KgFact', kgFactSchema);
