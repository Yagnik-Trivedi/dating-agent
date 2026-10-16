// Mongo job queue + in-process worker (plan 17 §3). Handlers must be idempotent: a job can run again after a crash.
import { hostname } from 'node:os';
import { Job } from '../../models/Job.js';
import { KG } from '../kg/config.js';

const handlers = new Map();
const running = new Map(); // type → count
const workerId = `${hostname()}:${process.pid}`;
let timer = null;
let polling = false;
let stopping = false;

/** handler: async (payload, { job }) → result. */
export const registerJob = (type, handler) => handlers.set(type, handler);
export const hasHandler = (type) => handlers.has(type);

/**
 * Queue a job. With a dedupeKey there is at most one live job per key: re-enqueueing a queued job moves its runAt
 * and payload (debounce); re-enqueueing while it runs asks it to run once more when it finishes.
 */
export async function enqueue(type, payload = {}, { runAt = new Date(), dedupeKey, maxAttempts } = {}) {
  const base = { type, payload, runAt, ...(maxAttempts && { maxAttempts }) };
  if (!dedupeKey) return kick(await Job.create(base));
  for (let i = 0; i < 3; i++) {
    const queued = await Job.findOneAndUpdate({ dedupeKey, status: 'queued' }, { $set: { runAt, payload } }, { new: true });
    if (queued) return kick(queued);
    try {
      return kick(await Job.create({ ...base, dedupeKey }));
    } catch (err) {
      if (err.code !== 11000) throw err;
      const live = await Job.findOneAndUpdate({ dedupeKey, status: 'running' }, { $set: { rerun: { runAt, payload } } }, { new: true });
      if (live) return live;
    }
  }
  throw new Error(`enqueue ${type} (${dedupeKey}) kept racing`);
}

/** Drop a queued job and any pending re-run of a running one (e.g. Take over). */
export async function cancel(dedupeKey) {
  await Job.deleteOne({ dedupeKey, status: 'queued' });
  await Job.updateOne({ dedupeKey, status: 'running' }, { $unset: { rerun: 1 } });
}

function kick(job) {
  if (timer && job.runAt <= new Date()) setImmediate(poll);
  return job;
}

const limit = (type) => KG.JOB_CONCURRENCY[type] ?? 1;

export async function claim(types) {
  const now = new Date();
  return Job.findOneAndUpdate(
    { type: { $in: types }, $or: [{ status: 'queued', runAt: { $lte: now } }, { status: 'running', lockedUntil: { $lt: now } }] },
    { $set: { status: 'running', lockedBy: workerId, lockedUntil: new Date(now.getTime() + KG.JOB_LOCK_MS) }, $inc: { attempts: 1 } },
    { sort: { runAt: 1 }, new: true },
  ).lean();
}

async function poll() {
  if (polling || stopping) return;
  polling = true;
  try {
    for (;;) {
      const free = [...handlers.keys()].filter((t) => (running.get(t) ?? 0) < limit(t));
      if (!free.length) break;
      const job = await claim(free);
      if (!job) break;
      run(job);
    }
  } catch (err) {
    console.error(`job poll failed: ${err.message}`);
  } finally {
    polling = false;
  }
}

const mine = (job) => ({ _id: job._id, lockedBy: workerId });

async function finish(job, result) {
  // A re-run requested while we ran wins: back to queued with its payload, same key.
  for (;;) {
    const again = await Job.updateOne({ ...mine(job), rerun: { $exists: true } }, [
      { $set: { status: 'queued', runAt: '$rerun.runAt', payload: '$rerun.payload', attempts: 0 } },
      { $unset: ['rerun', 'lockedUntil', 'lockedBy'] },
    ]);
    if (again.modifiedCount) return;
    const done = await Job.updateOne({ ...mine(job), rerun: { $exists: false } }, [
      { $set: { status: 'done', finishedAt: '$$NOW', result: { $literal: result ?? null }, doneKey: '$dedupeKey' } },
      { $unset: ['dedupeKey', 'lockedUntil', 'lockedBy'] },
    ]);
    if (done.matchedCount || !(await Job.exists(mine(job)))) return; // done, or our lock was taken over
  }
}

async function fail(job, err) {
  const budget = err.name === 'BudgetExceededError';
  if (!budget && job.attempts >= job.maxAttempts) {
    await Job.updateOne(mine(job), [
      { $set: { status: 'failed', finishedAt: '$$NOW', lastError: { $literal: String(err.message).slice(0, 500) }, doneKey: '$dedupeKey' } },
      { $unset: ['dedupeKey', 'lockedUntil', 'lockedBy', 'rerun'] },
    ]);
    console.error(`job ${job.type} ${job._id} failed for good: ${err.message}`);
    return;
  }
  // Budget pauses don't burn an attempt; other errors back off 2^attempts s (+ jitter).
  const delayMs = budget ? 15 * 60_000 : 2 ** job.attempts * 1000 + Math.random() * 1000;
  await Job.updateOne(mine(job), {
    $set: { status: 'queued', runAt: new Date(Date.now() + delayMs), lastError: String(err.message).slice(0, 500) },
    $unset: { lockedUntil: 1, lockedBy: 1 },
    ...(budget && { $inc: { attempts: -1 } }),
  });
}

async function run(job) {
  running.set(job.type, (running.get(job.type) ?? 0) + 1);
  // Heartbeat while the handler runs; if this process dies the lock expires and another worker takes the job.
  const beat = setInterval(() => {
    Job.updateOne(mine(job), { $set: { lockedUntil: new Date(Date.now() + KG.JOB_LOCK_MS) } }).catch(() => {});
  }, KG.JOB_LOCK_MS / 3);
  try {
    const result = await handlers.get(job.type)(job.payload ?? {}, { job });
    await finish(job, result);
  } catch (err) {
    await fail(job, err).catch((e) => console.error(`job ${job._id} fail bookkeeping: ${e.message}`));
  } finally {
    clearInterval(beat);
    running.set(job.type, running.get(job.type) - 1);
    if (!stopping) setImmediate(poll);
  }
}

export function startWorker() {
  stopping = false;
  timer ??= setInterval(poll, KG.JOB_POLL_MS);
  timer.unref?.();
  setImmediate(poll);
}

/** Stop claiming; wait up to `ms` for running jobs (SIGTERM). */
export async function stopWorker(ms = 10_000) {
  stopping = true;
  clearInterval(timer);
  timer = null;
  const until = Date.now() + ms;
  while ([...running.values()].some((n) => n > 0) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
}
