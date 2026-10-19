import mongoose from 'mongoose';
import { QUESTIONS } from '../services/kg/questions.js';

const GATE_ATTRIBUTE_IDS = QUESTIONS.sections.find((s) => s.id === 'B').items.map((i) => i.id);

const profileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: String,
  age: Number,
  city: String,
  gender: String,
  interestedIn: [String],
  photos: [String], // public, in order: only photos that passed moderation
  // Plan 30 S2: every upload, with its moderation result. Owner-only; an 'ok' upload's url is copied into `photos`.
  // ponytail: two lists instead of photo sub-documents, so every reader of `photos` (seeds, client, trust) stays as is.
  photoUploads: [{
    url: { type: String, required: true }, publicId: String, w: Number, h: Number,
    status: { type: String, enum: ['pending', 'ok', 'rejected'], default: 'pending' }, reasons: [String], person: Boolean, at: Date,
  }],
  // Public basics (plan 30 S2), shown on the profile when filled in.
  job: String, workplace: String, education: String, height: String, languages: [String],
  // Plan 30 S2 gating (private): missing or 'active' = in Discover and can match; 'browse_only' = no live check yet
  // (can browse and like; likes are delivered once active); 'held' = the scam self-check found high risk.
  status: { type: String, enum: ['active', 'browse_only', 'held'] },
  selfCheck: { level: String, reasons: [String], at: Date, releasedVersion: String, _id: false },
  // Plan 19: the ONLY live-check data another user (or their agent / trust check) may see. Never set true in seed data.
  liveChecked: { type: Boolean, default: false },
  liveCheckedAt: Date,
  bio: String,
  prompts: [{ q: String, a: String, _id: false }],
  tags: {
    interests: [String],
    lifestyle: { smoking: String, drinking: String, workout: String, diet: String },
    wantsKids: String,
    relationshipGoal: String,
    religionImportance: String,
  },
  dealbreakers: [String],
  ageMin: { type: Number, default: 18 }, // wanted age range (plan 17)
  ageMax: { type: Number, default: 99 },
  radiusKm: Number, // optional; city match comes first
  geo: mongoose.Schema.Types.Mixed, // optional GeoJSON point; Mixed so no empty coordinates break the 2dsphere index
  // Denormalised for the discover query + match-time re-check (services/match/gate.js). Gate code only: never sent to
  // an LLM or another user (PUBLIC_PROFILE excludes it).
  gate: {
    age: Number, gender: String, interestedIn: [String], ageMin: Number, ageMax: Number, city: String,
    geo: mongoose.Schema.Types.Mixed, radiusKm: Number,
    values: mongoose.Schema.Types.Mixed, // { smoking: 'never', … }
    accepts: mongoose.Schema.Types.Mixed, // { smoking: ['never', 'socially'] } for my dealbreaker attributes
    dealbreakers: [String],
    _id: false,
  },
}, { timestamps: true, versionKey: false });

profileSchema.index({ 'gate.city': 1, 'gate.gender': 1, 'gate.age': 1 });
profileSchema.index({ 'gate.dealbreakers': 1 });
for (const k of GATE_ATTRIBUTE_IDS) profileSchema.index({ [`gate.values.${k}`]: 1 });
profileSchema.index({ geo: '2dsphere' }, { sparse: true });

export const Profile = mongoose.model('Profile', profileSchema);

// What anyone else (a human or their agent) may see of a profile: never the gate, dealbreakers, age range or geo.
export const PUBLIC_PROFILE = '-dealbreakers -gate -geo -ageMin -ageMax -radiusKm -photoUploads -status -selfCheck';
/** Statuses that keep a profile out of Discover and matching (missing = active). */
export const NOT_ACTIVE = ['browse_only', 'held'];
export const PUBLIC_PROJECTION = Object.fromEntries(PUBLIC_PROFILE.split(' ').map((f) => [f.slice(1), 0]));
