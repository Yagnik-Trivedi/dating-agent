import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { httpError } from '../utils/http.js';

export const signToken = (user) => jwt.sign({ sub: String(user._id) }, env.JWT_SECRET, { expiresIn: '7d' });

/** → userId, or throws. */
export const verifyToken = (token) => jwt.verify(token ?? '', env.JWT_SECRET, { algorithms: ['HS256'] }).sub;

export async function requireAuth(req, res, next) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  let userId;
  try {
    if (scheme !== 'Bearer') throw new Error();
    userId = verifyToken(token);
  } catch {
    throw httpError(401, 'UNAUTHORIZED', 'Missing or invalid token');
  }
  req.user = await User.findById(userId);
  if (!req.user) throw httpError(401, 'UNAUTHORIZED', 'Account no longer exists');
  next();
}
