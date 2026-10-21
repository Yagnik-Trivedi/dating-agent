// Plan 31 A2: fill every existing profile's public basics from its own section-B answers (and remove hidden ones, e.g.
// religion by default) by rebuilding its gate. No LLM. Seeds get the same on the next `npm run seed`.
// A profile whose public content changes gets a fresh trust consistency check (one mid-tier call) at its next match.
//   node scripts/backfill-basics.js
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Profile } from '../src/models/Profile.js';
import { buildGate } from '../src/services/match/gate.js';

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
try {
  let n = 0;
  for await (const p of Profile.find({}, { userId: 1 }).lean().cursor()) {
    await buildGate(p.userId);
    n++;
  }
  console.log(`Basics refreshed on ${n} profiles.`);
} finally {
  await mongoose.disconnect();
}
