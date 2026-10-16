import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;
const end = { kind: { type: String, enum: ['fact', 'concept'], required: true }, id: { type: ObjectId, required: true }, _id: false };

// Links inside ONE user's graph (or inside one observer's notes); never across users.
const kgEdgeSchema = new mongoose.Schema({
  subjectId: { type: ObjectId, ref: 'User', required: true },
  observerId: { type: ObjectId, ref: 'User', default: null },
  from: end,
  to: end,
  type: { type: String, enum: ['SUPPORTS', 'CONTRADICTS', 'DERIVED_FROM'], required: true },
  confidence: { type: Number, min: 0, max: 1, default: 0.6 },
  resolved: { type: Boolean, default: false }, // CONTRADICTS: the user picked which one is right
  buildId: String,
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

kgEdgeSchema.index({ subjectId: 1, observerId: 1, type: 1 });
kgEdgeSchema.index({ 'from.id': 1 });
kgEdgeSchema.index({ 'to.id': 1 });

export const KgEdge = mongoose.model('KgEdge', kgEdgeSchema);
