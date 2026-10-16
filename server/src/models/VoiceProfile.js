import mongoose from 'mongoose';

const { Mixed } = mongoose.Schema.Types;

// How the user texts (plan 15 §3): distributions, not just means, so the engine can sample from them. Replaces
// User.styleProfile. Read only by the user's own agent.
const voiceProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  sampleCount: Number,
  builtAt: Date,
  wordCounts: [Number],
  burstiness: Number,
  questionBackRate: Number,
  emojiPerMessage: Number,
  topEmojis: [String],
  emojiPlacement: { end: Number, inline: Number, _id: false },
  laughForms: Mixed, // { haha, hahaha, lol, lmao, hehe, other } shares
  laughRate: Number,
  abbrevRate: Number,
  abbrevs: [String],
  lowercaseStartRatio: Number,
  lowercaseIRate: Number,
  doublePunctRate: Number,
  elongationRate: Number,
  endings: Mixed, // { none, '.', '!', '?', '..', emoji } shares
  petPhrases: [String],
  closingStyle: String,
  language: {
    mix: Mixed, // { en: 0.6, hi_latn: 0.35, gu_latn: 0.05 }
    codeSwitchRate: Number,
    switchTriggers: [String], // moods in which this user switches language
    mirrorsLanguage: Number, // 0..1 tendency to answer in the other person's language
    _id: false,
  },
  description: String,
  doList: [String],
  dontList: [String],
  corrections: [{ rule: String, kind: { type: String, enum: ['style', 'never_say'] }, from: { type: String, enum: ['edited_draft', 'wouldnt_say', 'graph_edit'] }, at: Date, _id: false }],
  neverSay: [String],
}, { versionKey: false });

export const VoiceProfile = mongoose.model('VoiceProfile', voiceProfileSchema);
