import mongoose from 'mongoose';
import { toBinary } from '../utils/vector.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

export const FACT_PREDICATES = ['likes', 'dislikes', 'values', 'goal', 'lifestyle', 'trait', 'story', 'background', 'opinion', 'humor', 'reflection', 'style'];
// questionnaire_module (plan 33): a module answer; rebuilt only by that module's build, never by the core build.
export const FACT_SOURCES = ['questionnaire_choice', 'questionnaire_story', 'questionnaire_module', 'user_answer', 'agent_observed', 'reflection', 'style_derived', 'own_chat'];
export const DEPTH_TIERS = ['surface', 'personal', 'deep'];
// v1 sources still written by the v1 brief (profile → removed in plan 07) and belief updates (conversation → plan 08).
const LEGACY_SOURCES = ['profile', 'conversation'];

// KgFact v2 (plan 15 §3): self facts (observerId null) and notes about a match (observerId = me).
const kgFactSchema = new mongoose.Schema({
  subjectId: { type: ObjectId, ref: 'User', required: true }, // who the fact is about
  observerId: { type: ObjectId, ref: 'User', default: null }, // null = the user's own graph; else whose agent wrote this note
  matchId: { type: ObjectId, ref: 'Match', default: null },
  conversationId: { type: ObjectId, ref: 'Conversation', default: null },
  predicate: { type: String, required: true, enum: FACT_PREDICATES },
  object: { type: String, required: true }, // display label
  conceptId: { type: ObjectId, ref: 'Concept', default: null },
  attribute: String, // structured (section B): smoking / never
  value: Mixed, // B option value; a trait's 0..1 score
  accepts: { type: [String], default: undefined }, // section B: partner values the user accepts
  polarity: { type: Number, enum: [1, -1], default: 1 },
  strength: { type: Number, min: 0, max: 1 }, // how much they like it / how firmly they hold an opinion
  importance: { type: Number, min: 0, max: 1 }, // how much it matters in a partner
  isDealbreaker: { type: Boolean, default: false },
  weight: { type: Number, min: 0, max: 1 }, // v1 readers sort/read it (= importance ?? strength); removed in plans 07–09
  confidence: { type: Number, min: 0, max: 1, default: 0.6 },
  source: { type: String, enum: [...FACT_SOURCES, ...LEGACY_SOURCES], required: true },
  disclosure: { type: String, enum: ['public', 'if_asked', 'private'], default: 'public' },
  sensitivity: { topic: String, sensitive: Boolean, _id: false },
  userEdited: { type: Boolean, default: false },
  evidence: [{ quote: String, sourceRef: { kind: { type: String, enum: ['answer', 'message', 'inbox', 'sample', 'profile'] }, id: String }, at: Date, messageId: ObjectId, _id: false }],
  firstSeen: { type: Date, default: Date.now },
  lastConfirmed: { type: Date, default: Date.now },
  validUntil: Date,
  isCurrent: Boolean,
  // Plan 33 brain map (A3): where the answer sits (life area → topic → specific), which question it came from, real
  // uncertainty ("can't decide", "idk"), how deep it goes (A7) and, for a current fact, when to ask again.
  branch: { type: [String], default: undefined },
  qid: String,
  module: String,
  sourceAnswerId: String, // UX P0-4: the profile prompt it came from ("prompt_2")
  slot: String, // the answer slot it came from ("M.F5", "M.E3.thriller", "M.O2#best trip"): its identity (factKey)
  uncertain: Boolean,
  depthTier: { type: String, enum: DEPTH_TIERS },
  currentUntil: Date,
  buildId: String,
  archiveAt: Date, // notes of closed matches: removed by the TTL index (plan 17 archiveNotes)
  embedding: { type: Buffer, select: false, set: (v) => toBinary(v) }, // only facts with no conceptId (plan 15 §6.3)
  embeddingModel: String,
}, { timestamps: { createdAt: false, updatedAt: true }, versionKey: false });

kgFactSchema.index({ subjectId: 1, observerId: 1, predicate: 1, conceptId: 1 });
kgFactSchema.index({ subjectId: 1, observerId: 1, attribute: 1 });
kgFactSchema.index({ observerId: 1, conversationId: 1 });
kgFactSchema.index({ matchId: 1 });
kgFactSchema.index({ isCurrent: 1, lastConfirmed: 1 }, { partialFilterExpression: { isCurrent: true } }); // reconfirm job
kgFactSchema.index({ archiveAt: 1 }, { expireAfterSeconds: 0 });
kgFactSchema.index({ subjectId: 1, observerId: 1, module: 1 }, { partialFilterExpression: { module: { $exists: true } } }); // per-module build
kgFactSchema.index({ currentUntil: 1 }, { partialFilterExpression: { currentUntil: { $exists: true } } }); // re-ask current facts

export const KgFact = mongoose.model('KgFact', kgFactSchema);
