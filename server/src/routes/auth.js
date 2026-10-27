import bcrypt from 'bcryptjs';
import { Router } from 'express';
import mongoose from 'mongoose';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { signToken } from '../middleware/auth.js';
import { Profile } from '../models/Profile.js';
import { User } from '../models/User.js';
import { CITY_NAMES, cityGeo } from '../services/cities.js';
import { buildGate } from '../services/match/gate.js';
import { initialStatus } from '../services/profileStatus.js';
import { httpError, parse } from '../utils/http.js';

export const CONSENT_TEXT = 'Early conversations with your matches may be handled by AI agents, including yours.';
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10); // so unknown emails take as long as wrong passwords

const GENDER = z.enum(['woman', 'man', 'nonbinary']);
const signupBody = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(60),
  consentAgent: z.literal(true),
  dob: z.iso.date(),
  gender: GENDER,
  interestedIn: z.array(GENDER).min(1).max(3),
  city: z.string().trim().min(1).max(80),
});

/** Whole years between a YYYY-MM-DD birth date and today (UTC). */
export function ageFrom(dob, now = new Date()) {
  const [y, m, d] = dob.split('-').map(Number);
  const md = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  return now.getUTCFullYear() - y - (md < m * 100 + d ? 1 : 0);
}
const loginBody = z.object({ email: z.string().trim().max(254), password: z.string().max(128) });

export const authRouter = Router();

authRouter.use(rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.clientIp ?? req.ip), // UI polish B8: per visitor, also through the Vercel rewrite
  handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again in a few minutes' } }),
}));

authRouter.post('/signup', async (req, res) => {
  if (req.body?.consentAgent !== true) throw httpError(400, 'CONSENT_REQUIRED', `You must agree: "${CONSENT_TEXT}"`);
  const { email, password, name, dob, gender, interestedIn, city } = parse(signupBody, req.body);
  const age = ageFrom(dob);
  if (age < 18) throw httpError(400, 'UNDERAGE', 'You need to be 18 or older to use Twine.');
  if (age > 100) throw httpError(400, 'VALIDATION', 'Please check your date of birth.');
  if (await User.exists({ email: email.toLowerCase() })) throw httpError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

  // One transaction: an account never exists without its basics (it used to be two calls; plan 30 S0).
  const passwordHash = await bcrypt.hash(password, 10);
  const geo = cityGeo(city);
  let user;
  await mongoose.connection.transaction(async (session) => {
    [user] = await User.create([{ email, name, dob, passwordHash, consentAgent: true, consentAt: new Date() }], { session });
    await Profile.create([{ userId: user._id, status: initialStatus(), name, age, gender, interestedIn,city: geo ? CITY_NAMES.find((c) => c.toLowerCase() === city.toLowerCase()) : city, ...(geo && { geo }) }], { session });
  });
  await buildGate(user._id);
  res.status(201).json({ token: signToken(user), user });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = parse(loginBody, req.body);
  const user = await User.findOne({ email: email.toLowerCase() });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw httpError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
  res.json({ token: signToken(user), user });
});
