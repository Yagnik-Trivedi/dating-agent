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
  photos: [String],
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
