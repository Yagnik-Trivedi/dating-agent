// Plan 30 S1 speed-after, against a running server with the job worker on (local, same provider + models as production):
// a new user signs up and submits onboarding (submit → usable, phase-2 graph ready), likes ONE gate-eligible seed persona
// (the seed likes back), then the agents chat to a verdict (match → first agent message, whole chat).
//   node scripts/speed-check.js [baseUrl] [city]   → prints the timings + the user/match ids for speed-report.js
// The test user is kept so speed-report.js can read its Usage; it's a throwaway @check.test account on the local DB.
import 'dotenv/config';
import { answers } from './lib/kiran.js';

const BASE = process.argv[2] ?? 'http://localhost:5000';
const CITY = process.argv[3] ?? 'Mumbai';
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const s = (ms) => `${(ms / 1000).toFixed(1)} s`;
const until = async (fn, { every = 1000, max = 15 * 60_000 } = {}) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > max) throw new Error('timed out'); await sleep(every); } };

const { body: signup } = await call('POST', '/auth/signup', { body: { name: 'Kiran', email: `kiran-speed-${Date.now().toString(36)}@check.test`, password: 'password123', consentAgent: true, dob: '1997-08-09', gender: 'man', interestedIn: ['woman'], city: CITY } });
const token = signup.token;
if (!token) throw new Error(`signup failed: ${JSON.stringify(signup)}`);
await call('PUT', '/profile', { token, body: { bio: 'Weekend trekker, weekday coder.', tags: { interests: ['trekking', 'cooking'] } } });

const t0 = Date.now();
const submit = await call('POST', '/onboarding/submit', { token, body: { answers } });
const usable = Date.now() - t0;
console.log(`submit → app usable: ${s(usable)} (status ${submit.body.status})`);
await until(async () => (await call('GET', '/me', { token })).body.user?.graphStatus === 'ready', { every: 2000 });
const graph = Date.now() - t0;
console.log(`submit → full graph ready: ${s(graph)}`);

const { body: discover } = await call('GET', '/discover', { token });
const seed = discover.profiles.find((p) => p.photos?.[0]?.includes('dicebear'));
if (!seed) throw new Error('no gate-eligible seed in discover');
await call('POST', '/likes', { token, body: { toUserId: seed.userId, liked: true } });
const match = await until(async () => (await call('GET', '/matches', { token })).body.matches?.[0]);
const tm = Date.now();
console.log(`liked ${seed.name}; match ${match._id}`);
await until(async () => (await call('GET', `/matches/${match._id}/messages`, { token })).body.messages?.length, { every: 500 });
const first = Date.now() - tm;
console.log(`match → first agent message: ${s(first)}`);
const done = await until(async () => { const m = (await call('GET', '/matches', { token })).body.matches.find((x) => x._id === match._id); return !['matched', 'trust_check', 'briefing', 'agent_chatting'].includes(m.status) && m; }, { every: 3000, max: 30 * 60_000 });
const chat = Date.now() - tm;
const n = (await call('GET', `/matches/${match._id}/messages`, { token })).body.messages.length;
console.log(`match → chat over (${done.status}): ${s(chat)}, ${n} messages`);
console.log(JSON.stringify({ userId: signup.user._id, matchId: match._id, usableMs: usable, graphMs: graph, firstMs: first, chatMs: chat, messages: n }));
