// UI polish B8: the browser now reaches the API through the Vercel site (/api rewrite) so ad blockers that block the
// "dating-agent-api" host stop breaking the app. Behind Vercel → Render's proxy → Express, req.ip would be a Vercel
// edge IP and every visitor would share one rate-limit bucket. Vercel sends the visitor's IP (x-vercel-forwarded-for /
// x-real-ip / x-forwarded-for) and, from vercel.json, a secret header; only a request carrying that secret may tell us
// its visitor IP. Direct hits (the socket host, keep-alive pingers) keep req.ip as before.
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

const same = (a, b) => {
  const x = Buffer.from(String(a ?? '').trim()), y = Buffer.from(String(b ?? '').trim()); // a pasted value often ends in a newline
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Sets req.clientIp: the real visitor IP for requests proven to come through Vercel, else req.ip. */
export function clientIp(req, res, next) {
  const viaVercel = Boolean(env.ORIGIN_SECRET) && same(req.get('x-origin-secret'), env.ORIGIN_SECRET);
  const fromVercel = viaVercel && (req.get('x-vercel-forwarded-for') ?? req.get('x-real-ip') ?? req.get('x-forwarded-for'))?.split(',')[0]?.trim();
  req.clientIp = fromVercel || req.ip;
  req.viaVercel = viaVercel;
  req.hasOriginHeader = Boolean(req.get('x-origin-secret'));
  next();
}
