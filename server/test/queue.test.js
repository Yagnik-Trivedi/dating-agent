// Plan 17: job queue behaviour on an ephemeral replica set.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { Job } from '../src/models/Job.js';
import { tick } from '../src/services/jobs/periodic.js';
import { cancel, claim, enqueue, registerJob, startWorker, stopWorker } from '../src/services/jobs/queue.js';
import { start, stop } from '../scripts/lib/testDb.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 10_000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await fn()) return; await sleep(50); }
  throw new Error('timed out');
};

before(async () => { await start(); await Job.syncIndexes(); });
after(async () => { await stopWorker(); await stop(); });
beforeEach(async () => { await stopWorker(); await Job.deleteMany({}); });

test('dedupeKey: re-enqueue moves runAt instead of duplicating; cancel removes it', async () => {
  const later = new Date(Date.now() + 60_000);
  await enqueue('noop', { n: 1 }, { dedupeKey: 'k1' });
  await enqueue('noop', { n: 2 }, { dedupeKey: 'k1', runAt: later });
  const jobs = await Job.find({ dedupeKey: 'k1' }).lean();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].payload.n, 2);
  assert.equal(+jobs[0].runAt, +later);
  await cancel('k1');
  assert.equal(await Job.countDocuments({}), 0);
});

test('two concurrent claims never get the same job', async () => {
  await enqueue('solo', {});
  const [a, b] = await Promise.all([claim(['solo']), claim(['solo'])]);
  assert.equal([a, b].filter(Boolean).length, 1);
});

test('every job runs once, within the per-type concurrency limit', async () => {
  const seen = [];
  let live = 0, peak = 0;
  registerJob('judge', async ({ i }) => { live++; peak = Math.max(peak, live); await sleep(80); seen.push(i); live--; });
  for (let i = 0; i < 8; i++) await enqueue('judge', { i });
  startWorker();
  await waitFor(async () => (await Job.countDocuments({ type: 'judge', status: 'done' })) === 8);
  assert.deepEqual([...seen].sort((x, y) => x - y), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(peak <= 2, `peak ${peak} exceeds JOB_CONCURRENCY.judge`);
});

test('failures back off, then end as failed after maxAttempts', async () => {
  let calls = 0;
  registerJob('flaky', async () => { calls++; throw new Error('boom'); });
  const job = await enqueue('flaky', {}, { maxAttempts: 2 });
  startWorker();
  await waitFor(async () => (await Job.findById(job._id))?.attempts === 1 && (await Job.findById(job._id)).status === 'queued');
  const retry = await Job.findById(job._id).lean();
  assert.ok(retry.runAt > new Date(), 'retry is scheduled in the future (backoff)');
  await Job.updateOne({ _id: job._id }, { $set: { runAt: new Date() } }); // skip the wait
  await waitFor(async () => (await Job.findById(job._id))?.status === 'failed');
  assert.equal(calls, 2);
  assert.match((await Job.findById(job._id)).lastError, /boom/);
});

test('a job whose worker died (lock expired) is picked up again', async () => {
  let ran = false;
  registerJob('orphan', async () => { ran = true; });
  await Job.create({ type: 'orphan', status: 'running', lockedBy: 'dead:1', lockedUntil: new Date(Date.now() - 1000), attempts: 1 });
  startWorker();
  await waitFor(() => ran);
});

test('enqueue while running → it runs once more with the new payload', async () => {
  const got = [];
  registerJob('turn', async ({ n }) => { got.push(n); await sleep(200); });
  await enqueue('turn', { n: 1 }, { dedupeKey: 'turn:x' });
  startWorker();
  await waitFor(() => got.length === 1);
  await enqueue('turn', { n: 2 }, { dedupeKey: 'turn:x' });
  await waitFor(() => got.length === 2);
  assert.deepEqual(got, [1, 2]);
  await waitFor(async () => (await Job.countDocuments({ dedupeKey: 'turn:x' })) === 0);
});

test('periodic ticks never duplicate a bucket, even after the job finished', async () => {
  registerJob('archiveNotes', async () => {});
  const now = Date.UTC(2026, 9, 17, 3, 0);
  await tick(now);
  await tick(now + 60_000);
  assert.equal(await Job.countDocuments({ type: 'archiveNotes' }), 1);
  startWorker();
  await waitFor(async () => (await Job.countDocuments({ type: 'archiveNotes', status: 'done' })) === 1);
  await stopWorker();
  await tick(now + 120_000);
  assert.equal(await Job.countDocuments({ type: 'archiveNotes' }), 1);
  await tick(now + 86_400_000); // next day → new bucket
  assert.equal(await Job.countDocuments({ type: 'archiveNotes' }), 2);
});
