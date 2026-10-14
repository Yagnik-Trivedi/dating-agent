import mongoose from 'mongoose';

const embCacheSchema = new mongoose.Schema({
  hash: { type: String, required: true, unique: true },
  model: { type: String, required: true },
  vector: { type: [Number], required: true },
}, { versionKey: false });

export const EmbCache = mongoose.model('EmbCache', embCacheSchema);
