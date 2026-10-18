// Plan 19 live check, pure functions (unit-tested): the cheap code checks that run before any model call, and the
// decision from the vision model's per-frame description. The model only describes; code decides. Never a pass
// without the model.

export const MOVES = ['turn_left', 'turn_right', 'look_up', 'smile'];
// Live guidance thresholds; the client gets the same object from /start. yaw > 0 = the user turned to THEIR right.
export const THRESHOLDS = { neutralDeg: 8, turnDeg: 20, upDeg: 15, smile: 0.6, holdMs: 300 };
export const MAX_FRAME_BYTES = 120 * 1024;
// In an UNMIRRORED frame (camera's point of view), a user turning to their own left faces image_right.
// Confirm with real samples (npm run live-check:vision) before trusting it: it's easy to get backwards.
export const EXPECTED_FACING = { neutral: 'center', turn_left: 'image_right', turn_right: 'image_left', look_up: 'up' };

export const HINTS = {
  expired: 'That took a little too long. Start again and do each move as it appears.',
  wrong_order: 'The moves came through out of order. Start again and follow the steps as they appear.',
  bad_frame: 'One of the photos didn’t come through properly. Please try again.',
  timeline_mismatch: 'We couldn’t follow the moves. Hold each one for a moment, then try again.',
  wrong_direction: 'Turn your head a little further, toward the side we ask for.',
  no_smile: 'Give us a clear smile on the smile step.',
  faces: 'Make sure only your face is in the frame, in good light.',
  screen_signs: 'It looked like a screen or a printed photo. Please use your camera directly.',
  different_person: 'It looked like more than one person across the moves. Please try again on your own.',
  error: 'Our checking service is busy. Try again in a few minutes. This attempt doesn’t count.',
};

/** 2 distinct random moves in random order, after a neutral frame. `rand` is injectable for tests. */
export function pickActions(rand = Math.random) {
  const pool = [...MOVES]
  const a = pool.splice(Math.floor(rand() * pool.length), 1)[0];
  const b = pool[Math.floor(rand() * pool.length)];
  return ['neutral', a, b];
}

const jpegBytes = (b64) => {
  try { return Buffer.from(String(b64 ?? ''), 'base64'); } catch { return Buffer.alloc(0); }
};

/** Did the live timeline reach this action's threshold around capture time? A weak signal (direction comes from the model). */
function seenInTimeline(action, at, timeline) {
  const near = timeline.filter((p) => Math.abs(p.t - at) <= 600);
  const T = THRESHOLDS;
  const hit = {
    neutral: (p) => Math.abs(p.yaw) < T.neutralDeg && Math.abs(p.pitch) < T.neutralDeg,
    turn_left: (p) => Math.abs(p.yaw) > T.turnDeg,
    turn_right: (p) => Math.abs(p.yaw) > T.turnDeg,
    look_up: (p) => p.pitch > T.upDeg,
    smile: (p) => p.smile > T.smile,
  }[action];
  return near.some(hit);
}

/**
 * Code checks before the model: frames match the challenge's actions in order, capture times increase inside the
 * window with ≥ holdMs gaps, each frame is a real JPEG ≤ 120 KB, and the timeline reached each move.
 * → null when fine, else a reason code.
 */
export function checkFrames({ challenge, frames, timeline = [] }) {
  const start = new Date(challenge.createdAt).getTime();
  const end = new Date(challenge.expiresAt).getTime();
  if (frames.length !== challenge.actions.length || frames.length > 3) return 'wrong_order';
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.action !== challenge.actions[i]) return 'wrong_order';
    if (f.capturedAt < start || f.capturedAt > end) return 'expired';
    if (i > 0 && f.capturedAt - frames[i - 1].capturedAt < THRESHOLDS.holdMs) return 'wrong_order';
    const bytes = jpegBytes(f.jpegBase64);
    if (bytes.length < 4 || bytes.length > MAX_FRAME_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return 'bad_frame';
  }
  if (frames.some((f) => !seenInTimeline(f.action, f.capturedAt, timeline))) return 'timeline_mismatch';
  return null;
}

/** The decision, from the model's description of each frame (F1…F3 in action order). → { result, reason } */
export function decide({ actions, vision }) {
  const frames = vision?.frames ?? [];
  if (frames.length !== actions.length) return { result: 'error', reason: 'error' };
  if (frames.some((f) => f.faceCount !== 1)) return { result: 'failed', reason: 'faces' };
  if (frames.some((f) => f.screenOrPrintSigns)) return { result: 'failed', reason: 'screen_signs' };
  if (vision.samePersonAllFrames === 'no') return { result: 'failed', reason: 'different_person' };
  for (let i = 0; i < actions.length; i++) {
    const want = EXPECTED_FACING[actions[i]];
    if (want && frames[i].facing !== want) return { result: 'failed', reason: 'wrong_direction' };
    if (actions[i] === 'smile' && !frames[i].smiling) return { result: 'failed', reason: 'no_smile' };
  }
  return { result: 'passed', reason: null };
}
