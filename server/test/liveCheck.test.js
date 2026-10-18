// Plan 19 live check: the decision (mocked vision outputs), the code checks, the route rules and privacy (no image bytes
// stored anywhere, nothing in the usage log). No real model: the vision call is injected.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { LiveCheckChallenge } from '../src/models/LiveCheckChallenge.js';
import { Profile } from '../src/models/Profile.js';
import { User } from '../src/models/User.js';
import { checkFrames, decide, pickActions } from '../src/services/liveCheck/decide.js';
import { finishChallenge, startChallenge } from '../src/services/liveCheck/index.js';
import { start, stop } from '../scripts/lib/testDb.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]).toString('base64');
const face = (facing, extra = {}) => ({ faceCount: 1, facing, smiling: false, screenOrPrintSigns: false, ...extra });
const actions = ['neutral', 'turn_left', 'smile'];
const good = { frames: [face('center'), face('image_right'), face('center', { smiling: true })], samePersonAllFrames: 'yes' };

test('decision: pass, and each failure reason', () => {
  assert.deepEqual(decide({ actions, vision: good }), { result: 'passed', reason: null });
  const with_ = (i, f, rest = {}) => ({ ...good, ...rest, frames: good.frames.map((x, j) => (j === i ? { ...x, ...f } : x)) });
  assert.equal(decide({ actions, vision: with_(1, { facing: 'image_left' }) }).reason, 'wrong_direction', 'their left is image_right');
  assert.equal(decide({ actions, vision: with_(0, { faceCount: 2 }) }).reason, 'faces');
  assert.equal(decide({ actions, vision: with_(2, { screenOrPrintSigns: true }) }).reason, 'screen_signs');
  assert.equal(decide({ actions, vision: { ...good, samePersonAllFrames: 'no' } }).reason, 'different_person');
  assert.equal(decide({ actions, vision: with_(2, { smiling: false }) }).reason, 'no_smile');
  assert.equal(decide({ actions, vision: { frames: [] } }).result, 'error', 'no model output is never a pass');
  assert.equal(decide({ actions, vision: { ...good, samePersonAllFrames: 'unclear' } }).result, 'passed');
});

test('2 distinct random moves after neutral', () => {
  for (let i = 0; i < 50; i++) {
    const a = pickActions();
    assert.equal(a[0], 'neutral');
    assert.notEqual(a[1], a[2]);
  }
});

test('code checks: order, timing, JPEG magic and size, timeline', () => {
  const now = Date.now();
  const challenge = { actions, createdAt: new Date(now - 10_000), expiresAt: new Date(now + 60_000) };
  const frames = actions.map((action, i) => ({ action, capturedAt: now - 5000 + i * 1000, jpegBase64: JPEG }));
  const timeline = [{ t: frames[0].capturedAt, yaw: 0, pitch: 0, smile: 0 }, { t: frames[1].capturedAt, yaw: -25, pitch: 0, smile: 0 }, { t: frames[2].capturedAt, yaw: 0, pitch: 0, smile: 0.8 }];
  assert.equal(checkFrames({ challenge, frames, timeline }), null);
  assert.equal(checkFrames({ challenge, frames: [frames[1], frames[0], frames[2]], timeline }), 'wrong_order');
  assert.equal(checkFrames({ challenge, frames: frames.map((f, i) => ({ ...f, capturedAt: now - 5000 + i * 100 })), timeline }), 'wrong_order', 'gaps under 300 ms');
  assert.equal(checkFrames({ challenge, frames: frames.map((f) => ({ ...f, jpegBase64: Buffer.from('PNG...').toString('base64') })), timeline }), 'bad_frame');
  assert.equal(checkFrames({ challenge, frames: frames.map((f) => ({ ...f, jpegBase64: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(130_000)]).toString('base64') })), timeline }), 'bad_frame', 'over 120 KB');
  assert.equal(checkFrames({ challenge, frames, timeline: timeline.slice(0, 2) }), 'timeline_mismatch');
});

// --- service + routes on a test DB
before(start);
after(stop);
let me; let other;
beforeEach(async () => {
  await Promise.all([User, Profile, LiveCheckChallenge].map((M) => M.deleteMany({})));
  [me, other] = await User.create(['lc1', 'lc2'].map((n) => ({ email: `${n}@t.local`, passwordHash: 'x', name: n, consentAgent: true, consentAt: new Date() })));
  await Profile.create({ userId: me._id, name: 'lc1' });
});
const submit = (c, over = {}) => {
  const t0 = Date.now();
  const frames = c.actions.map((action, i) => ({ action, capturedAt: t0 + i * 500, jpegBase64: JPEG }));
  const pose = { neutral: { yaw: 0, pitch: 0, smile: 0 }, turn_left: { yaw: -25, pitch: 0, smile: 0 }, turn_right: { yaw: 25, pitch: 0, smile: 0 }, look_up: { yaw: 0, pitch: 20, smile: 0 }, smile: { yaw: 0, pitch: 0, smile: 0.9 } };
  const timeline = frames.map((f) => ({ t: f.capturedAt, ...pose[f.action] }));
  return { challengeId: c.challengeId, nonce: c.nonce, frames, timeline, ...over };
};
const expected = { neutral: 'center', turn_left: 'image_right', turn_right: 'image_left', look_up: 'up', smile: 'center' };
const passVision = (c) => async () => ({ frames: c.actions.map((a) => face(expected[a], { smiling: a === 'smile' })), samePersonAllFrames: 'yes' });

test('pass → User.liveCheck + public Profile.liveChecked; the nonce is single-use (409); no image bytes stored', async () => {
  const c = await startChallenge(me._id);
  // Pause so capturedAt (now) is after createdAt.
  await new Promise((r) => setTimeout(r, 5));
  const out = await finishChallenge(me._id, submit(c), { analyze: passVision(c) });
  assert.equal(out.result, 'passed');
  const u = await User.findById(me._id).lean();
  assert.deepEqual([u.liveCheck.status, u.liveCheck.attempts.length], ['passed', 1]);
  assert.equal((await Profile.findOne({ userId: me._id }).lean()).liveChecked, true);
  await assert.rejects(finishChallenge(me._id, submit(c), { analyze: passVision(c) }), (e) => e.status === 409);
  // Privacy: no collection holds the image bytes.
  const needle = JPEG.slice(0, 40);
  for (const { name } of await mongoose.connection.db.listCollections().toArray()) {
    const docs = await mongoose.connection.db.collection(name).find().toArray();
    assert.ok(!JSON.stringify(docs).includes(needle), `image bytes found in ${name}`);
  }
});

test('another user\'s challenge, expired, wrong order, oversized frame → 400; model error is not an attempt', async () => {
  const c1 = await startChallenge(me._id);
  await assert.rejects(finishChallenge(other._id, submit(c1), { analyze: passVision(c1) }), (e) => e.status === 400);
  const c2 = await startChallenge(me._id);
  const s2 = submit(c2);
  await assert.rejects(finishChallenge(me._id, { ...s2, frames: [s2.frames[1], s2.frames[0], s2.frames[2]] }, { analyze: passVision(c2) }), (e) => e.status === 400 && e.code === 'WRONG_ORDER');
  const c3 = await startChallenge(me._id);
  const s3 = submit(c3);
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(130_000)]).toString('base64');
  await assert.rejects(finishChallenge(me._id, { ...s3, frames: s3.frames.map((f) => ({ ...f, jpegBase64: big })) }, { analyze: passVision(c3) }), (e) => e.status === 400);
  const c4 = await startChallenge(me._id);
  await LiveCheckChallenge.updateOne({ _id: c4.challengeId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(finishChallenge(me._id, submit(c4), { analyze: passVision(c4) }), (e) => e.status === 400 && e.code === 'EXPIRED');
  const before = (await User.findById(me._id).lean()).liveCheck.attempts.length;
  const c5 = await startChallenge(me._id);
  const out = await finishChallenge(me._id, submit(c5), { analyze: async () => { throw Object.assign(new Error('503'), { status: 503 }); } });
  assert.equal(out.result, 'error');
  assert.equal((await User.findById(me._id).lean()).liveCheck.attempts.length, before, 'error is not counted');
  assert.equal((await Profile.findOne({ userId: me._id }).lean()).liveChecked, false, 'never a pass without the model');
});

test('the 6th start in a day → 429; LIVE_CHECK_ENABLED=false → 404', async () => {
  for (let i = 0; i < env.LIVE_CHECK_MAX_PER_DAY; i++) await startChallenge(me._id);
  await assert.rejects(startChallenge(me._id), (e) => e.status === 429);
  const saved = env.LIVE_CHECK_ENABLED;
  env.LIVE_CHECK_ENABLED = false;
  try { await assert.rejects(startChallenge(other._id), (e) => e.status === 404); } finally { env.LIVE_CHECK_ENABLED = saved; }
});
