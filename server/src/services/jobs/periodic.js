// Periodic jobs (plan 17 §3): a 1-minute tick enqueues each due job once per time bucket. A job type without a
// registered handler is skipped, so plans add their handlers without touching this file's schedule.
import { Job } from '../../models/Job.js';
import { enqueue, hasHandler } from './queue.js';

const DAY = 86_400_000;
export const SCHEDULE = [
  { type: 'archiveNotes', everyMs: DAY },
  { type: 'conceptCleanup', everyMs: DAY },
  { type: 'reconfirm', everyMs: DAY },
  { type: 'agentSweep', everyMs: 30 * 60_000 },
];

const bucketOf = (everyMs, now) => new Date(Math.floor(now / everyMs) * everyMs).toISOString();

export async function tick(now = Date.now()) {
  for (const { type, everyMs } of SCHEDULE) {
    if (!hasHandler(type)) continue;
    const key = `${type}:${bucketOf(everyMs, now)}`;
    if (await Job.exists({ $or: [{ dedupeKey: key }, { doneKey: key }] })) continue;
    await enqueue(type, { bucket: key }, { dedupeKey: key });
  }
}

let timer = null;
export function startPeriodic() {
  const run = () => tick().catch((err) => console.error(`periodic tick failed: ${err.message}`));
  timer ??= setInterval(run, 60_000);
  timer.unref?.();
  run();
}
export const stopPeriodic = () => { clearInterval(timer); timer = null; };
