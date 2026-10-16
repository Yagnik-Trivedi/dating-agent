import mongoose from 'mongoose';

// A fact the user deleted: its factKey never comes back on a rebuild (F27).
const kgTombstoneSchema = new mongoose.Schema({
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true }, // factKey()
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

kgTombstoneSchema.index({ subjectId: 1, key: 1 }, { unique: true });

export const KgTombstone = mongoose.model('KgTombstone', kgTombstoneSchema);
