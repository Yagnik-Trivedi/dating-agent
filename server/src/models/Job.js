import mongoose from 'mongoose';
import { KG } from '../services/kg/config.js';

const jobSchema = new mongoose.Schema({
  type: { type: String, required: true },
  payload: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
  runAt: { type: Date, default: Date.now },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: KG.JOB_MAX_ATTEMPTS },
  lockedUntil: Date,
  lockedBy: String,
  dedupeKey: String, // one live (queued/running) job per key; moved to doneKey when the job finishes
  doneKey: String,
  rerun: mongoose.Schema.Types.Mixed, // { runAt, payload }: enqueued again while running; replayed on finish
  lastError: String,
  result: mongoose.Schema.Types.Mixed,
  finishedAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

jobSchema.index({ status: 1, runAt: 1 });
jobSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
jobSchema.index({ finishedAt: 1 }, { expireAfterSeconds: KG.JOB_DONE_TTL_DAYS * 86_400 });

export const Job = mongoose.model('Job', jobSchema);
