// Plan 11: load seed/personas.json into Mongo (users, profiles, knowledge graphs). Idempotent: users are upserted by
// email and graphs are only built when missing (or with --rebuild).
//   node scripts/seed.js [--rebuild]
// Seed logins use SEED_PASSWORD from server/.env (never committed). Without it, seed accounts can't be logged into.
import { randomUUID } from 'node:crypto';
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

const personas = JSON.parse(readFileSync(new URL('../seed/personas.json', import.meta.url)));
const rebuild = process.argv.includes('--rebuild');
if (!env.SEED_PASSWORD) console.warn('⚠ SEED_PASSWORD is not set: seed accounts get a random password nobody knows');

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const passwordHash = await bcrypt.hash(env.SEED_PASSWORD ?? randomUUID(), 10);
const t0 = Date.now();
let built = 0;
const failed = [];
try {
  await mapLimit(personas, 3, async (p) => {
    const user = await User.findOneAndUpdate(
      { email: p.email },
      {
        $set: { name: p.profile.name, agentMode: p.agentMode, isSeed: true, consentAgent: true, 'onboarding.answers': p.answers, passwordHash },
        $setOnInsert: { consentAt: new Date(), 'onboarding.status': 'processing' },
      },
      { upsert: true, new: true, runValidators: true },
    );
    await Profile.updateOne({ userId: user._id }, { $set: { userId: user._id, ...p.profile } }, { upsert: true });
    const hasGraph = await KgFact.exists({ subjectId: user._id, observerId: null, source: 'questionnaire' });
    if (hasGraph && !rebuild && user.onboarding.status === 'done') return console.log(`= ${p.profile.name} (${p.email}) already seeded`);
    await User.updateOne({ _id: user._id }, { $set: { 'onboarding.status': 'processing' } });
    try {
      await buildUserGraph(user._id);
      built++;
      console.log(`✓ ${p.profile.name} (${p.email}) graph built`);
    } catch (err) {
      // One provider timeout shouldn't sink the other 29; a re-run builds only what's missing.
      await User.updateOne({ _id: user._id }, { $set: { 'onboarding.status': 'failed' } });
      failed.push(p.email);
      console.error(`✖ ${p.profile.name} (${p.email}): ${err.message}`);
    }
  });
  console.log(`\nSeeded ${personas.length} personas (${built} graphs built) in ${Math.round((Date.now() - t0) / 1000)} s.`);
  if (failed.length) {
    console.log(`${failed.length} graph(s) failed: ${failed.join(', ')}. Run the seed again to build them.`);
    process.exitCode = 1;
  }
} finally {
  await flushUsage();
  await mongoose.disconnect();
}
