import mongoose from 'mongoose';
import { toBinary } from '../utils/vector.js';

const embCacheSchema = new mongoose.Schema({
  hash: { type: String, required: true, unique: true },
  model: { type: String, required: true },
  vector: { type: Buffer, required: true, set: (v) => toBinary(v) }, // compact float32 (plan 17)
}, { versionKey: false });

export const EmbCache = mongoose.model('EmbCache', embCacheSchema);
