// Plan 11 Part A check against a running server: a new user likes 3 seed personas → 3 matches (seed like-back) whose
// agents start chatting. Cleans up with DELETE /me.
//   node scripts/seed-check.js [baseUrl]
import assert from 'node:assert/strict';

const BASE = process.argv[2] ?? 'http://localhost:5000';
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { body: signup } = await call('POST', '/auth/signup', { body: { name: 'Kiran', email: `kiran-${Date.now().toString(36)}@check.test`, password: 'password123', consentAgent: true } });
const token = signup.token;
assert.ok(token, 'signup');
try {
  await call('PUT', '/profile', { token, body: { name: 'Kiran', age: 28, city: 'Pune', gender: 'man', interestedIn: ['woman'], bio: 'Weekend trekker, weekday coder.', tags: { interests: ['trekking', 'cooking'] } } });
  const { body: discover } = await call('GET', '/discover', { token });
  const seeds = discover.profiles.filter((p) => p.photos?.[0]?.includes('dicebear')).slice(0, 3);
  assert.equal(seeds.length, 3, 'discover shows seed personas');
  for (const p of seeds) {
    const { body } = await call('POST', '/likes', { token, body: { toUserId: p.userId, liked: true } });
    assert.equal(body.matched, false, 'not instant: the seed likes back after a pause');
  }
  console.log(`✓ liked ${seeds.map((p) => p.name).join(', ')}`);

  let matches = [];
  for (let i = 0; i < 30 && matches.length < 3; i++) { await sleep(1000); matches = (await call('GET', '/matches', { token })).body.matches; }
  assert.equal(matches.length, 3, '3 matches from seed like-backs');
  console.log('✓ 3 matches created by seed like-backs within 30 s');

  const started = new Set();
  for (let i = 0; i < 120 && started.size < 3; i++) {
    await sleep(5000);
    for (const m of (await call('GET', '/matches', { token })).body.matches) if (m.lastMessage) started.add(String(m._id));
  }
  assert.equal(started.size, 3, 'agents start chatting in all 3 matches');
  const rows = (await call('GET', '/matches', { token })).body.matches;
  for (const m of rows) console.log(`  ${m.other.name}: ${m.status} · "${m.lastMessage?.text}"`);
  console.log('✓ agents started chatting in all 3 matches');
} finally {
  await call('DELETE', '/me', { token });
}
console.log('\nSeed checks passed.');
