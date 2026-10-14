import mongoose from 'mongoose';

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
}, { timestamps: true, versionKey: false });

export const Profile = mongoose.model('Profile', profileSchema);
