// Owner's test run (2026-10-22): wipe every match and chat, then match the real accounts with each other so their agents
// talk on the live site. Dry run by default (prints what it would do); nothing changes without the flags.
//   node scripts/admin-matches.js                  → plan only
//   node scripts/admin-matches.js --wipe           → back up to server/backups/<time>/, then delete all match data
//   node scripts/admin-matches.js --match          → rebuild failed graphs, create the matches (admin: no gate, no daily cap)
// Uses MONGODB_URI from server/.env. Only enqueues jobs: the running server's worker does the trust check, brief and chat.
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { Profile } from '../src/models/Profile.js';
import { User } from '../src/models/User.js';
import { startUserGraphBuild } from '../src/services/kg/buildUserGraph.js';
import { createMatch } from '../src/services/matches.js';

const WIPE = process.argv.includes('--wipe');
const MATCH = process.argv.includes('--match');
// Everything that belongs to a match or a like. Notes about a match partner are KgFacts with an observerId.
const MATCH_DATA = [
  ['matches', {}], ['messages', {}], ['conversations', {}], ['chatevents', {}], ['matchdecisions', {}], ['likes', {}],
  ['inboxitems', { matchId: { $ne: null } }], ['kgfacts', { observerId: { $ne: null } }], ['kgedges', { observerId: { $ne: null } }],
  ['jobs', { 'payload.matchId': { $exists: true }, status: { $in: ['queued', 'running', 'failed'] } }],
];

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
console.log(`database: ${mongoose.connection.host.replace(/^[^.]+/, '***')} · ${WIPE ? 'WIPE' : ''} ${MATCH ? 'MATCH' : ''}${WIPE || MATCH ? '' : 'dry run'}`);

if (WIPE) {
  const dir = new URL(`../backups/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const [name, filter] of MATCH_DATA) {
    const docs = await db.collection(name).find(filter).toArray();
    writeFileSync(new URL(`${name}.json`, dir), JSON.stringify(docs));
    const { deletedCount } = await db.collection(name).deleteMany(filter);
    console.log(`  ${name.padEnd(15)} backed up ${String(docs.length).padStart(4)} · deleted ${deletedCount}`);
  }
  console.log(`backup: ${dir.pathname}`);
} else {
  for (const [name, filter] of MATCH_DATA) console.log(`  would delete ${name.padEnd(15)} ${await db.collection(name).countDocuments(filter)}`);
}

// The real accounts that finished onboarding (seed personas are the team's; an account with no answers has no agent).
const users = await User.find({ isSeed: { $ne: true }, 'onboarding.status': 'done' }, { name: 1, graphStatus: 1 }).lean();
const profiles = new Map((await Profile.find({ userId: { $in: users.map((u) => u._id) } }, { userId: 1, gender: 1, interestedIn: 1 }).lean()).map((p) => [String(p.userId), p]));
const wants = (a, b) => { const pa = profiles.get(String(a._id)), pb = profiles.get(String(b._id)); return !pa?.interestedIn?.length || pa.interestedIn.includes(pb?.gender); };
const pairs = [];
for (let i = 0; i < users.length; i++) for (let j = i + 1; j < users.length; j++) if (wants(users[i], users[j]) && wants(users[j], users[i])) pairs.push([users[i], users[j]]);
const skipped = await User.find({ isSeed: { $ne: true }, 'onboarding.status': { $ne: 'done' } }, { name: 1 }).lean();
console.log(`\n${pairs.length} pairs (both sides interested in the other's gender; city and age ignored):`);
for (const [a, b] of pairs) console.log(`  ${a.name} × ${b.name}`);
if (skipped.length) console.log(`not matched (onboarding not finished): ${skipped.map((u) => u.name).join(', ')}`);

if (MATCH) {
  const failed = users.filter((u) => u.graphStatus === 'failed');
  for (const u of failed) {
    await User.updateOne({ _id: u._id }, { $set: { graphStatus: 'building' } }); // the match waits for it (awaitGraph, ≤ 10 min)
    await startUserGraphBuild(u._id);
  }
  if (failed.length) console.log(`\nrebuilding graphs: ${failed.map((u) => u.name).join(', ')}`);
  for (const [a, b] of pairs) {
    const m = await createMatch(a._id, b._id, { admin: true });
    console.log(`  matched ${a.name} × ${b.name} → ${m?._id ?? 'skipped (an account is not active)'}`);
  }
}
await mongoose.disconnect();
