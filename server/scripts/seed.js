// Plan 11: load seed/personas.json into Mongo (users, profiles, knowledge graphs). Idempotent and incremental: users are
// upserted by email, and a graph is (re)built only when it is missing or the persona changed (contentHash of its
// profile + answers, stored as User.seedHash). --force rebuilds every graph.
//   node scripts/seed.js [--force] [--concurrency N] [--judges]
// --judges then creates the pre-baked judge accounts (seed/judges.json, scripts/seed/judges.js): real engine runs,
// ~1 hour and ~0.5M tokens on the first run; re-runs only fill missing states. Logins use JUDGE_PASSWORD.
// Seed logins use SEED_PASSWORD from server/.env (never committed). Without it, seed accounts can't be logged into.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { KgFact } from '../src/models/KgFact.js';
import { Profile } from '../src/models/Profile.js';
import { User } from '../src/models/User.js';
import { buildUserGraph } from '../src/services/kg/buildUserGraph.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { mapLimit } from '../src/utils/mapLimit.js';
import { buildGate } from '../src/services/match/gate.js';
import { precheckProfile } from '../src/services/trust/checkProfile.js';

const personas = JSON.parse(readFileSync(new URL('../seed/personas.json', import.meta.url)));
const force = process.argv.includes('--force') || process.argv.includes('--rebuild');
const argN = process.argv.indexOf('--concurrency');
// A graph build makes ~15 LLM calls a minute; the client's global limiter enforces LLM_MAX_RPM, this just avoids queueing.
const concurrency = argN > 0 ? Number(process.argv[argN + 1]) : Math.max(1, Math.floor(env.LLM_MAX_RPM / 15));
const contentHash = (p) => createHash('sha1').update(JSON.stringify({ profile: p.profile, answers: p.answers })).digest('hex').slice(0, 16);
if (!env.SEED_PASSWORD) console.warn('⚠ SEED_PASSWORD is not set: seed accounts get a random password nobody knows');

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const passwordHash = await bcrypt.hash(env.SEED_PASSWORD ?? randomUUID(), 10);
const t0 = Date.now();
let built = 0, skipped = 0;
const failed = [];
try {
  await mapLimit(personas, concurrency, async (p) => {
    const hash = contentHash(p);
    const user = await User.findOneAndUpdate(
      { email: p.email },
      {
        $set: { name: p.profile.name, agentMode: p.agentMode, isSeed: true, consentAgent: true, 'onboarding.answers': p.answers, ...(env.SEED_PASSWORD && { passwordHash }) },
        // Without SEED_PASSWORD the random hash is for new accounts only: a re-run never locks out an existing login.
        $setOnInsert: { consentAt: new Date(), 'onboarding.status': 'processing', ...(!env.SEED_PASSWORD && { passwordHash }) },
      },
      { upsert: true, new: true, runValidators: true },
    );
    await Profile.updateOne({ userId: user._id }, { $set: { userId: user._id, ...p.profile, demo: true } }, { upsert: true });
    await buildGate(user._id);
    // Plan 30 S1: the trust check's model part, once per profile version, so a match with a seed never waits for it.
    await precheckProfile({ userId: user._id }).catch((err) => console.error(`trust precheck ${p.email}: ${err.message}`));
    const hasGraph = await KgFact.exists({ subjectId: user._id, observerId: null, source: 'questionnaire_choice' }); // v2 graph
    if (hasGraph && !force && user.onboarding.status === 'done' && user.seedHash === hash) { skipped++; return console.log(`= ${p.profile.name} (${p.email}) unchanged`); }
    await User.updateOne({ _id: user._id }, { $set: { 'onboarding.status': 'processing' } });
    try {
      await buildUserGraph(user._id);
      await User.updateOne({ _id: user._id }, { $set: { seedHash: hash } });
      built++;
      console.log(`✓ ${p.profile.name} (${p.email}) graph built`);
    } catch (err) {
      // One provider timeout shouldn't sink the other 29; a re-run builds only what's missing.
      await User.updateOne({ _id: user._id }, { $set: { 'onboarding.status': 'failed' } });
      failed.push(p.email);
      console.error(`✖ ${p.profile.name} (${p.email}): ${err.message}`);
    }
  });
  console.log(`\nSeeded ${personas.length} personas (${built} graphs built, ${skipped} unchanged) in ${Math.round((Date.now() - t0) / 1000)} s at concurrency ${concurrency}.`);
  if (failed.length) {
    console.log(`${failed.length} graph(s) failed: ${failed.join(', ')}. Run the seed again to build them.`);
    process.exitCode = 1;
  }
  if (process.argv.includes('--judges') && !failed.length) {
    if (!env.JUDGE_PASSWORD) console.warn('⚠ JUDGE_PASSWORD is not set: judge accounts get a random password nobody knows');
    const { seedJudges } = await import('./seed/judges.js'); // starts a job worker: only when asked
    const report = await seedJudges({ passwordHash: await bcrypt.hash(env.JUDGE_PASSWORD ?? randomUUID(), 10) });
    const missing = Object.entries(report).filter(([, r]) => r.missing.length);
    console.log(missing.length
      ? `\nJudge states missing: ${missing.map(([e, r]) => `${e}: ${r.missing.join(', ')}`).join('; ')}. Re-run to try the remaining partners.`
      : '\nJudge accounts ready: every state present.');
    (await import('./lib/worker.js')).stopWorker();
  }
} finally {
  await flushUsage();
  await mongoose.disconnect();
}
