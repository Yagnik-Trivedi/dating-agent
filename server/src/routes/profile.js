import { Router } from 'express';
import { z } from 'zod';
import { Profile } from '../models/Profile.js';
import { parse } from '../utils/http.js';

const text = (max) => z.string().trim().max(max);

const profileBody = z.object({
  name: text(60).min(1),
  age: z.number().int().min(18).max(100),
  city: text(80),
  gender: text(30),
  interestedIn: z.array(text(30)).max(5),
  photos: z.array(z.url().max(500)).max(6),
  bio: text(500),
  prompts: z.array(z.object({ q: text(150).min(1), a: text(300).min(1) })).max(5),
  tags: z.object({
    interests: z.array(text(40)).max(20),
    lifestyle: z.object({ smoking: text(30), drinking: text(30), workout: text(30), diet: text(30) }).partial(),
    wantsKids: text(30),
    relationshipGoal: text(60),
    religionImportance: text(30),
  }).partial(),
  dealbreakers: z.array(text(100)).max(10),
}).partial().strict();

export const profileRouter = Router();

profileRouter.get('/profile', async (req, res) => {
  res.json({ profile: await Profile.findOne({ userId: req.user._id }).lean() });
});

profileRouter.put('/profile', async (req, res) => {
  const fields = parse(profileBody, req.body);
  const profile = await Profile.findOneAndUpdate(
    { userId: req.user._id },
    { $set: fields },
    { new: true, upsert: true, runValidators: true },
  ).lean();
  res.json({ profile });
});
