// Plan 19 live check: start a challenge (2 random moves), finish it (code checks → ONE vision call → decision in code)
// and record only the result. Frames exist only in this request's memory: never stored, logged or put in the usage log.
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { LiveCheckChallenge } from '../../models/LiveCheckChallenge.js';
import { Profile } from '../../models/Profile.js';
import { User } from '../../models/User.js';
import { httpError } from '../../utils/http.js';
import { chatJSON, modelId } from '../llm/client.js';
import * as prompt from '../prompts/liveCheck.js';
import { HINTS, THRESHOLDS, checkFrames, decide, pickActions } from './decide.js';

const frameOut = z.object({
  id: z.string().optional().catch(undefined),
  faceCount: z.coerce.number().int().min(0).catch(0),
  facing: z.enum(['center', 'image_left', 'image_right', 'up', 'down']).catch('center'),
  smiling: z.coerce.boolean().catch(false),
  screenOrPrintSigns: z.coerce.boolean().catch(false),
  signs: z.string().max(200).optional().catch(undefined),
});
const visionSchema = z.object({ frames: z.array(frameOut), samePersonAllFrames: z.enum(['yes', 'no', 'unclear']).catch('unclear') });

const enabled = () => { if (!env.LIVE_CHECK_ENABLED) throw httpError(404, 'NOT_FOUND', 'Not found'); };

/** → { challengeId, nonce, actions, expiresAt, thresholds }; 429 after LIVE_CHECK_MAX_PER_DAY starts in 24 h. */
export async function startChallenge(userId, { rand } = {}) {
  enabled();
  const since = new Date(Date.now() - 86_400_000);
  if (await LiveCheckChallenge.countDocuments({ userId, createdAt: { $gte: since } }) >= env.LIVE_CHECK_MAX_PER_DAY) {
    throw httpError(429, 'TOO_MANY_LIVE_CHECKS', 'You’ve tried a few times today. Please try again tomorrow.');
  }
  const c = await LiveCheckChallenge.create({ userId, nonce: crypto.randomBytes(16).toString('hex'), actions: pickActions(rand), expiresAt: new Date(Date.now() + env.LIVE_CHECK_TTL_S * 1000) });
  return { challengeId: String(c._id), nonce: c.nonce, actions: c.actions, expiresAt: c.expiresAt, thresholds: THRESHOLDS };
}

/** ONE vision call for all frames; if the model refuses several images, one call per frame (no same-person check). */
export async function analyzeFrames(frames, userId) {
  const ask = (fs) => chatJSON({ tier: 'vision', temperature: 0, reasoning: false, purpose: 'live-check', userId, schema: visionSchema, messages: prompt.build({ frames: fs }), retries: 1 });
  try {
    return await ask(frames);
  } catch (err) {
    if (err.status !== 400) throw err;
    const outs = [];
    for (const f of frames) outs.push((await ask([f])).frames[0]);
    return { frames: outs, samePersonAllFrames: 'unclear' };
  }
}

export const finishBody = z.object({
  challengeId: z.string().regex(/^[0-9a-f]{24}$/),
  nonce: z.string().min(16).max(64),
  frames: z.array(z.object({ action: z.string(), capturedAt: z.number(), jpegBase64: z.string().max(170_000) })).max(3),
  timeline: z.array(z.object({ t: z.number(), yaw: z.number(), pitch: z.number(), smile: z.number() })).max(300).default([]),
});

async function record(userId, result, reason, actions) {
  const at = new Date();
  const user = await User.findById(userId, { liveCheck: 1 });
  const attempts = [...(user.liveCheck?.attempts ?? []), { at, result, reason }].slice(-5);
  const passed = result === 'passed';
  const status = passed ? 'passed' : user.liveCheck?.status === 'passed' ? 'passed' : 'failed'; // a later failure never un-checks
  await User.updateOne({ _id: userId }, { $set: { liveCheck: { status, checkedAt: passed ? at : user.liveCheck?.checkedAt, model: modelId('vision'), actions, attempts } } });
  if (passed) await Profile.updateOne({ userId }, { $set: { liveChecked: true, liveCheckedAt: at } });
}

/**
 * → { result: 'passed' | 'failed' | 'error', reason, hint }. 409 for a reused challenge, 400 for anything malformed,
 * expired or out of order (counted as a failed attempt once the challenge is consumed). 'error' (model down) never counts.
 */
export async function finishChallenge(userId, body, { analyze = analyzeFrames } = {}) {
  enabled();
  const challenge = await LiveCheckChallenge.findOneAndUpdate(
    { _id: body.challengeId, userId, nonce: body.nonce, usedAt: null },
    { $set: { usedAt: new Date() } },
    { new: true },
  ).lean();
  if (!challenge) {
    if (await LiveCheckChallenge.exists({ _id: body.challengeId, userId, nonce: body.nonce })) throw httpError(409, 'CHALLENGE_USED', 'This check was already used. Start a new one.');
    throw httpError(400, 'BAD_CHALLENGE', 'This check isn’t valid. Start a new one.');
  }
  const fail = async (reason) => {
    await record(userId, 'failed', reason, challenge.actions);
    throw httpError(400, reason.toUpperCase(), HINTS[reason]);
  };
  if (Date.now() > new Date(challenge.expiresAt).getTime()) await fail('expired');
  const bad = checkFrames({ challenge, frames: body.frames, timeline: body.timeline });
  if (bad) await fail(bad);

  let vision;
  try {
    vision = await analyze(body.frames, userId);
  } catch (err) {
    console.error(`live-check ${userId}: vision unavailable (${err.status ?? err.name})`); // never the frames
    return { result: 'error', reason: 'error', hint: HINTS.error };
  }
  const { result, reason } = decide({ actions: challenge.actions, vision });
  if (result === 'error') return { result, reason, hint: HINTS.error };
  await record(userId, result, reason, challenge.actions);
  return { result, reason, hint: reason ? HINTS[reason] : null };
}
