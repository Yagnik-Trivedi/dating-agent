import { Router } from 'express';
import { z } from 'zod';
import { Profile } from '../models/Profile.js';
import { cityGeo } from '../services/cities.js';
import { editBasics, isBasicAnswer, myBasics } from '../services/kg/basicsEdit.js';
import { BASICS, buildGate } from '../services/match/gate.js';
import { queueProfileCheck } from '../services/trust/checkProfile.js';
import { parse } from '../utils/http.js';

const text = (max) => z.string().trim().max(max);

const profileBody = z.object({
  name: text(60).min(1),
  age: z.number().int().min(18).max(100),
  city: text(80),
  gender: text(30),
  interestedIn: z.array(text(30)).max(5),
  // Real photos go through /photos (moderation); only generated DiceBear avatars may be set directly.
  photos: z.array(z.url().max(500).refine((u) => u.startsWith('https://api.dicebear.com/'), 'Upload photos through the photo step')).max(6),
  job: text(120), workplace: text(120), education: text(120), height: text(20), languages: z.array(text(40)).max(12),
  bio: text(500),
  prompts: z.array(z.object({ q: text(150).min(1), a: text(150).min(1) })).max(3), // plan 30 S3.2
  tags: z.object({
    interests: z.array(text(40)).max(20),
    lifestyle: z.object({ smoking: text(30), drinking: text(30), workout: text(30), diet: text(30) }).partial(),
    wantsKids: text(30),
    relationshipGoal: text(60),
    religionImportance: text(30),
  }).partial(),
  tagsHidden: z.array(z.enum(Object.keys(BASICS))).max(Object.keys(BASICS).length), // plan 31 A2: basics kept off my profile
  dealbreakers: z.array(text(100)).max(10),
  ageMin: z.number().int().min(18).max(100),
  ageMax: z.number().int().min(18).max(100),
  radiusKm: z.number().min(0).max(500), // 0 = my city only
}).partial().strict().refine((p) => !(p.ageMin && p.ageMax) || p.ageMin <= p.ageMax, { message: 'ageMin must be ≤ ageMax' });

export const profileRouter = Router();

profileRouter.get('/profile', async (req, res) => {
  res.json({ profile: await Profile.findOne({ userId: req.user._id }).lean() });
});

// tags { interests, lifestyle: { smoking } } → { 'tags.interests', 'tags.lifestyle.smoking' }: a partial update (the
// onboarding sends only interests) no longer wipes the basics.
const flatTags = (tags = {}, prefix = 'tags') => Object.fromEntries(Object.entries(tags).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(flatTags(v, `${prefix}.${k}`)) : [[`${prefix}.${k}`, v]])));

/** Save my profile fields, then rebuild the gate and my public basics. → the saved profile */
export async function saveProfile(userId, body) {
  const { tags, ...fields } = parse(profileBody, body);
  const geo = 'city' in fields ? cityGeo(fields.city) : undefined; // a listed city gets coordinates; "Other" matches by name
  const tagSet = flatTags(tags);
  // Plan 32 KP2: a basic set to one of its answers is an answer edit (answer → fact → gate → tag). Free text that isn't
  // an answer stays a display-only tag set by hand, never overwritten from my B answers (plan 31 A2).
  const answerEdits = {};
  for (const [attr, path] of Object.entries(BASICS)) {
    const v = tagSet[`tags.${path}`];
    if (isBasicAnswer(attr, v)) { answerEdits[attr] = v; delete tagSet[`tags.${path}`]; }
  }
  const edited = Object.entries(BASICS).filter(([, path]) => `tags.${path}` in tagSet).map(([attr]) => attr);
  await Profile.updateOne(
    { userId },
    { $set: { ...fields, ...tagSet, ...(geo && { geo }) }, ...(edited.length && { $addToSet: { tagsEdited: { $each: edited } } }), ...('city' in fields && !geo && { $unset: { geo: 1 } }) },
    { upsert: true, runValidators: true },
  );
  // Also fills my public basics and removes hidden ones (editBasics rebuilds the gate itself).
  if (!(await editBasics(userId, answerEdits)).length) await buildGate(userId);
  return Profile.findOne({ userId }).lean();
}

// Plan 32 KP2: my basics with their answers (the profile editor). PUT changes answers and/or what shows on my profile.
profileRouter.get('/profile/basics', async (req, res) => res.json({ basics: await myBasics(req.user._id) }));

const basicsBody = z.object({
  answers: z.partialRecord(z.enum(Object.keys(BASICS)), z.string().trim().max(40)).refine((a) => Object.entries(a).every(([k, v]) => isBasicAnswer(k, v)), { message: 'Pick one of the listed answers' }),
  hidden: z.array(z.enum(Object.keys(BASICS))).max(Object.keys(BASICS).length),
}).partial().strict();

profileRouter.put('/profile/basics', async (req, res) => {
  const { answers = {}, hidden } = parse(basicsBody, req.body);
  // "Show on my profile" only changes visibility; the answer, the fact and the gate stay as they are.
  if (hidden) await Profile.updateOne({ userId: req.user._id }, { $set: { tagsHidden: hidden } });
  if (!(await editBasics(req.user._id, answers)).length && hidden) await buildGate(req.user._id);
  queueProfileCheck(req.user._id);
  res.json({ basics: await myBasics(req.user._id), profile: await Profile.findOne({ userId: req.user._id }).lean() });
});

profileRouter.put('/profile', async (req, res) => {
  const profile = await saveProfile(req.user._id, req.body);
  queueProfileCheck(req.user._id); // public content changed → the trust check's cached part follows (plan 30 S1)
  res.json({ profile });
});
