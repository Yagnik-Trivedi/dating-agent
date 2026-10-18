// Plan 11 Part A check against a running server: a new user likes 3 seed personas → 3 matches (seed like-back) whose
// agents start chatting. Cleans up with DELETE /me.
//   node scripts/seed-check.js [baseUrl] [city]
import assert from 'node:assert/strict';

const BASE = process.argv[2] ?? 'http://localhost:5000';
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Kiran onboards like a real user (the gate needs section B answers), with answers most seed personas accept.
const CITY = process.argv[3] ?? 'Mumbai';
const B = Object.fromEntries(Object.entries({
  kids: 'yes', religion: 'somewhat', location: 'this_city', smoking: 'never', drinking: 'socially', family: 'somewhat',
  career: 'balanced', looking_for: 'long_term', diet: 'no_preference', conflict: 'talk_it_out_immediately', alone_time: 'some',
}).map(([k, answer]) => [k, { answer, importance: 'medium' }]));
const replies = ['haha thanks! yours made me smile too', 'mostly treks and trying new recipes tbh', 'no. just no 😂', 'yes! sinhagad last month, which one?',
  'no worries at all', 'a long walk and street food tbh', 'haha i try', 'texting mostly, calls are for emergencies', 'CONGRATS!! party when?',
  'okay that is a hot take but go on', 'this weekend works, saturday morning?', 'hey really sorry, something came up tomorrow, can we move it?',
  'rude. accurate, but rude', 'gn! sleep well', 'okay that week sounds wild, mine was calm, mostly work and one good trek'];
const answers = {
  I: { job: 'backend developer', languages: ['english', 'hindi'] },
  A: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`a${i + 1}`, 3])), B,
  C: {
    sunday: 'A slow breakfast, then a trek up Sinhagad with friends and vada pav at the top.',
    hill: 'Filter coffee beats any fancy latte.',
    place: 'Spiti, for the night sky.',
    friends_rely: 'Planning trips and remembering birthdays.',
  },
  D: { interests: [{ name: 'trekking', intensity: 'into_it' }, { name: 'cooking', intensity: 'casual' }] },
  E: Object.fromEntries(replies.map((r, i) => [`e${i + 1}`, r])),
};

const { body: signup } = await call('POST', '/auth/signup', { body: { name: 'Kiran', email: `kiran-${Date.now().toString(36)}@check.test`, password: 'password123', consentAgent: true, dob: '1997-08-09', gender: 'man', interestedIn: ['woman'], city: CITY } });
const token = signup.token;
assert.ok(token, 'signup');
try {
  await call('PUT', '/profile', { token, body: { name: 'Kiran', age: 28, city: CITY, gender: 'man', interestedIn: ['woman'], bio: 'Weekend trekker, weekday coder.', tags: { interests: ['trekking', 'cooking'] } } });
  assert.equal((await call('POST', '/onboarding/submit', { token, body: { answers } })).status, 200, 'onboarding submit');
  let status = 'processing';
  for (let i = 0; i < 90 && status === 'processing'; i++) { await sleep(2000); status = (await call('GET', '/onboarding/status', { token })).body.status; }
  assert.equal(status, 'done', 'onboarding build job finished');
  console.log('✓ onboarding built by the job worker');
  const { body: discover } = await call('GET', '/discover', { token });
  const seeds = discover.profiles.filter((p) => p.photos?.[0]?.includes('dicebear')).slice(0, 3);
  // The gate (city + dealbreakers both ways) leaves 2–3 seeds per city for a typical user with the v1 seed set.
  assert.ok(seeds.length >= 2, `discover shows gate-eligible seed personas (got ${seeds.length})`);
  const N = seeds.length;
  for (const p of seeds) {
    const { body } = await call('POST', '/likes', { token, body: { toUserId: p.userId, liked: true } });
    assert.equal(body.matched, false, 'not instant: the seed likes back after a pause');
  }
  console.log(`✓ liked ${seeds.map((p) => p.name).join(', ')}`);

  let matches = [];
  for (let i = 0; i < 30 && matches.length < N; i++) { await sleep(1000); matches = (await call('GET', '/matches', { token })).body.matches; }
  assert.equal(matches.length, N, `${N} matches from seed like-backs`);
  console.log(`✓ ${N} matches created by seed like-backs (jobs) within 30 s`);

  const started = new Set();
  for (let i = 0; i < 120 && started.size < N; i++) {
    await sleep(5000);
    for (const m of (await call('GET', '/matches', { token })).body.matches) if (m.lastMessage) started.add(String(m._id));
  }
  assert.equal(started.size, N, `agents start chatting in all ${N} matches`);
  const rows = (await call('GET', '/matches', { token })).body.matches;
  for (const m of rows) console.log(`  ${m.other.name}: ${m.status} · "${m.lastMessage?.text}"`);
  console.log(`✓ agents started chatting in all ${N} matches`);
} finally {
  await call('DELETE', '/me', { token });
}
console.log('\nSeed checks passed.');
