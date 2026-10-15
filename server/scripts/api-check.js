// End-to-end check of the plan-04 API contract against a RUNNING server (creates throwaway users, deletes them).
//   node scripts/api-check.js [baseUrl=http://localhost:5000]
// Uses MONGODB_URI from server/.env to verify DELETE /me really removed the data.
import 'dotenv/config';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { io as connect } from 'socket.io-client';

const BASE = process.argv[2] ?? 'http://localhost:5000';
const run = Date.now().toString(36);

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

function socketFor(token) {
  const s = connect(BASE, { auth: { token }, transports: ['websocket'] });
  s.seen = [];
  s.onAny((event, payload) => s.seen.push({ event, payload }));
  return new Promise((resolve, reject) => { s.on('connect', () => resolve(s)); s.on('connect_error', reject); });
}

/** Resolve with the first event matching `pred` (already received or upcoming). */
function waitFor(s, event, pred = () => true, ms = 3000) {
  const hit = s.seen.find((e) => e.event === event && pred(e.payload));
  if (hit) return Promise.resolve(hit.payload);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    s.on(event, (p) => { if (pred(p)) { clearTimeout(t); resolve(p); } });
  });
}

const emit = (s, event, payload) => new Promise((resolve) => s.emit(event, payload, resolve));
const ok = (msg) => console.log(`✓ ${msg}`);

// --- signup + consent
const signup = (name, consentAgent = true) => call('POST', '/auth/signup', {
  body: { email: `${name}-${run}@check.test`, password: 'password123', name, consentAgent },
});
let r = await signup('noconsent', false);
assert.equal(r.status, 400); assert.equal(r.body.error.code, 'CONSENT_REQUIRED');
ok('signup without consent → 400 CONSENT_REQUIRED');

const [A, B, C] = await Promise.all([signup('alice'), signup('bob'), signup('carol')]).then((rs) => rs.map((x) => {
  assert.equal(x.status, 201); assert.ok(x.body.token); assert.equal(x.body.user.passwordHash, undefined);
  assert.equal(x.body.user.consentAgent, true); assert.ok(x.body.user.consentAt);
  return { token: x.body.token, id: x.body.user._id };
}));
ok('signup with consent → token (no passwordHash leaked)');

r = await call('POST', '/auth/login', { body: { email: `alice-${run}@check.test`, password: 'nope-nope' } });
assert.equal(r.status, 401);
r = await call('GET', '/me');
assert.equal(r.status, 401);
ok('wrong password → 401, no token → 401');

// --- profiles + discover
r = await call('PUT', '/profile', { token: A.token, body: { age: 27, city: 'Pune', gender: 'woman', interestedIn: ['man'], dealbreakers: ['smoking'] } });
assert.equal(r.status, 200);
await call('PUT', '/profile', { token: B.token, body: { age: 29, city: 'Pune', gender: 'man', interestedIn: ['woman'] } });
r = await call('PUT', '/profile', { token: B.token, body: { age: 16 } });
assert.equal(r.status, 400);
ok('profile update; age < 18 rejected');

r = await call('GET', '/discover', { token: A.token });
const bobCard = r.body.profiles.find((p) => p.userId === B.id);
assert.ok(bobCard); assert.ok(!r.body.profiles.some((p) => p.userId === A.id));
r = await call('GET', '/discover', { token: B.token });
assert.equal(r.body.profiles.find((p) => p.userId === A.id)?.dealbreakers, undefined);
ok('discover shows others, not self; dealbreakers hidden');

// --- like → match → match:new on both sockets
const [sA, sB, sC] = await Promise.all([socketFor(A.token), socketFor(B.token), socketFor(C.token)]);
await assert.rejects(socketFor('bad-token'));
ok('sockets authenticate; bad token refused');

r = await call('POST', '/likes', { token: A.token, body: { toUserId: B.id, liked: true } });
assert.deepEqual(r.body, { matched: false });
r = await call('POST', '/likes', { token: B.token, body: { toUserId: A.id, liked: true } });
assert.equal(r.body.matched, true);
const matchId = r.body.matchId;
const [newA, newB] = await Promise.all([waitFor(sA, 'match:new'), waitFor(sB, 'match:new')]);
assert.equal(newA.match._id, matchId); assert.equal(newA.match.other.name, 'bob'); assert.equal(newB.match.other.name, 'alice');
ok('mutual like → match created, match:new reached both sockets');

r = await call('GET', '/discover', { token: A.token });
assert.ok(!r.body.profiles.some((p) => p.userId === B.id));
ok('liked profile no longer in discover');

// --- live chat
assert.equal((await emit(sA, 'match:join', { matchId })).ok, true);
assert.equal((await emit(sB, 'match:join', { matchId })).ok, true);
assert.equal((await emit(sC, 'match:join', { matchId })).ok, false);
ok('match:join verifies membership');

let ack = await emit(sA, 'message:send', { matchId, text: '  Hi Bob! Trek this weekend?  ' });
assert.equal(ack.ok, true); assert.equal(ack.message.text, 'Hi Bob! Trek this weekend?');
const [gotA, gotB] = await Promise.all([
  waitFor(sA, 'message:new', (p) => p.message._id === ack.message._id),
  waitFor(sB, 'message:new', (p) => p.message._id === ack.message._id),
]);
assert.equal(gotA.message.authoredBy, 'human');
assert.equal(gotB.message.authoredBy, undefined);
ok('message:send → message:new on both; authoredBy hidden from other side');

sB.emit('typing', { matchId });
assert.equal((await waitFor(sA, 'typing')).userId, B.id);
ok('typing relayed');

assert.equal((await emit(sA, 'message:send', { matchId, text: '   ' })).error.code, 'VALIDATION');
r = await call('POST', `/matches/${matchId}/messages`, { token: A.token, body: { text: 'x'.repeat(1001) } });
assert.equal(r.status, 400);
ok('empty and >1000-char messages rejected');

r = await call('POST', `/matches/${matchId}/messages`, { token: B.token, body: { text: 'Yes! Sinhagad?' } });
assert.equal(r.status, 201);
await waitFor(sA, 'message:new', (p) => p.message.text === 'Yes! Sinhagad?');
ok('REST send → message:new');

r = await call('GET', '/matches', { token: A.token });
const row = r.body.matches.find((m) => m._id === matchId);
assert.equal(row.lastMessage.text, 'Yes! Sinhagad?'); assert.equal(row.unread, 1); // only the other side's messages count
r = await call('GET', `/matches/${matchId}/messages`, { token: A.token });
assert.deepEqual(r.body.messages.map((m) => m.text), ['Hi Bob! Trek this weekend?', 'Yes! Sinhagad?']);
assert.equal(r.body.messages[1].authoredBy, undefined);
r = await call('GET', '/matches', { token: A.token });
assert.equal(r.body.matches.find((m) => m._id === matchId).unread, 0);
ok('match list (last message, unread), history oldest-first');

r = await call('GET', `/matches/${matchId}`, { token: C.token });
assert.equal(r.status, 404);
r = await call('GET', `/matches/${matchId}`, { token: A.token });
assert.equal(r.body.match.agentActive, true); assert.equal(r.body.match.other.name, 'bob');
ok('match detail; non-member → 404');

// --- takeover, decisions, reveal
r = await call('POST', `/matches/${matchId}/takeover`, { token: A.token });
assert.equal(r.body.match.agentActive, false);
assert.equal((await waitFor(sA, 'match:status', (p) => p.agentActive === false)).matchId, matchId);
ok('takeover → agentActive=false + match:status');

await call('POST', `/matches/${matchId}/decision`, { token: A.token, body: { decision: 'continue' } });
r = await call('POST', `/matches/${matchId}/decision`, { token: B.token, body: { decision: 'continue' } });
assert.equal(r.body.match.status, 'handed_off');
await waitFor(sA, 'match:status', (p) => p.status === 'handed_off');
r = await call('GET', `/matches/${matchId}/messages`, { token: A.token });
assert.equal(r.body.messages[1].authoredBy, 'human');
assert.ok('reveal' in r.body, 'messages response carries the reveal (null when no agent spoke)');
ok('both continue → handed_off; authoredBy revealed');

// --- settings, onboarding, kg, inbox
r = await call('PUT', '/me/settings', { token: A.token, body: { agentMode: 'auto' } });
assert.equal(r.body.user.agentMode, 'auto');
r = await call('POST', '/onboarding/submit', { token: A.token, body: { answers: { q1: 'hi' } } });
assert.equal(r.body.status, 'processing');
r = await call('GET', '/kg/me', { token: A.token });
assert.equal(r.body.nodes[0].id, 'me');
r = await call('GET', '/inbox', { token: A.token });
assert.deepEqual(r.body.items, []);
r = await call('GET', `/matches/${matchId}/date-ideas`, { token: A.token });
assert.ok(r.status === 200 ? r.body.ideas.length > 0 : r.body.error.code === 'DATE_IDEAS_UNAVAILABLE', `date-ideas: ${r.status}`);
ok(`settings, onboarding stub, kg/me, inbox, date-ideas (${r.status === 200 ? 'ideas' : '503 without TAVILY_API_KEY'})`);

// --- DELETE /me
r = await call('DELETE', '/me', { token: B.token });
assert.equal(r.status, 204);
await waitFor(sA, 'match:status', (p) => p.status === 'closed');
r = await call('GET', '/me', { token: B.token });
assert.equal(r.status, 401);

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const bId = new mongoose.Types.ObjectId(B.id);
const left = {
  users: await db.collection('users').countDocuments({ _id: bId }),
  profiles: await db.collection('profiles').countDocuments({ userId: bId }),
  likes: await db.collection('likes').countDocuments({ $or: [{ fromUserId: bId }, { toUserId: bId }] }),
  messages: await db.collection('messages').countDocuments({ senderId: bId }),
};
assert.deepEqual(left, { users: 0, profiles: 0, likes: 0, messages: 0 });
const match = await db.collection('matches').findOne({ _id: new mongoose.Types.ObjectId(matchId) });
assert.equal(match.status, 'closed');
r = await call('GET', '/matches', { token: A.token });
assert.equal(r.body.matches.find((m) => m._id === matchId).other.name, 'Deleted user');
ok('DELETE /me removed user data; match closed and anonymized for the other side');

// --- cleanup
await call('DELETE', '/me', { token: A.token });
await call('DELETE', '/me', { token: C.token });
await db.collection('matches').deleteOne({ _id: match._id });
await mongoose.disconnect();
for (const s of [sA, sB, sC]) s.close();
console.log('\nAll API checks passed.');
