import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { signToken } from '../middleware/auth.js';
import { Profile } from '../models/Profile.js';
import { User } from '../models/User.js';
import { httpError, parse } from '../utils/http.js';

export const CONSENT_TEXT = 'Early conversations with your matches may be handled by AI agents, including yours.';
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10); // so unknown emails take as long as wrong passwords

const signupBody = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(60),
  consentAgent: z.literal(true),
});
const loginBody = z.object({ email: z.string().trim().max(254), password: z.string().max(128) });

export const authRouter = Router();

authRouter.use(rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again in a few minutes' } }),
}));

authRouter.post('/signup', async (req, res) => {
  if (req.body?.consentAgent !== true) throw httpError(400, 'CONSENT_REQUIRED', `You must agree: "${CONSENT_TEXT}"`);
  const { email, password, name } = parse(signupBody, req.body);
  if (await User.exists({ email: email.toLowerCase() })) throw httpError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

  const user = await User.create({
    email,
    name,
    passwordHash: await bcrypt.hash(password, 10),
    consentAgent: true,
    consentAt: new Date(),
  });
  await Profile.create({ userId: user._id, name });
  res.status(201).json({ token: signToken(user), user });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = parse(loginBody, req.body);
  const user = await User.findOne({ email: email.toLowerCase() });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw httpError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
  res.json({ token: signToken(user), user });
});
