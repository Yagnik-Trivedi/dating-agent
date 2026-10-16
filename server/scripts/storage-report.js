// Plan 17 §7: storage per user, per collection (BSON sizes), and how many users fit in Atlas M0 (512 MB).
//   node scripts/storage-report.js
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';

const M0_BYTES = 512 * 1024 * 1024;
// The field that says whose data a document is (arrays count once per user).
const OWNER = { users: '_id', profiles: 'userId', kgfacts: 'subjectId', likes: 'fromUserId', messages: 'senderId', inboxitems: 'userId',
  matches: 'users', usages: 'userId', concepts: null, kgedges: 'subjectId', kgtombstones: 'subjectId', voicesamples: 'userId',
  voiceprofiles: 'userId', chatevents: 'observerId', matchdecisions: 'userId', conversations: null, embcaches: null, jobs: null, searchcaches: null };
const VECTOR = { kgfacts: 'embedding', embcaches: 'vector', concepts: 'embedding', voicesamples: 'embedding' };

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const db = mongoose.connection.db;
const users = await db.collection('users').countDocuments() || 1;
const rows = [];
for (const { name } of await db.listCollections().toArray()) {
  const vec = VECTOR[name];
  const [agg] = await db.collection(name).aggregate([{ $group: {
    _id: null, docs: { $sum: 1 }, bytes: { $sum: { $bsonSize: '$$ROOT' } },
    ...(vec && { vecBytes: { $sum: { $cond: [{ $eq: [{ $type: `$${vec}` }, 'binData'] }, { $binarySize: `$${vec}` }, 0] } } }),
  } }]).toArray();
  if (!agg) continue;
  rows.push({ name, docs: agg.docs, bytes: agg.bytes, vecBytes: agg.vecBytes ?? 0, perUser: OWNER[name] === null ? 'shared' : agg.bytes / users });
}
rows.sort((a, b) => b.bytes - a.bytes);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`users: ${users}\n`);
console.log('collection'.padEnd(16), 'docs'.padStart(8), 'total'.padStart(12), 'vectors'.padStart(12), 'per user'.padStart(12));
for (const r of rows) console.log(r.name.padEnd(16), String(r.docs).padStart(8), kb(r.bytes).padStart(12), kb(r.vecBytes).padStart(12), (typeof r.perUser === 'number' ? kb(r.perUser) : r.perUser).padStart(12));
// Shared collections (concept dictionary, embedding cache, jobs) grow sub-linearly, so they're not divided by users.
const perUser = rows.reduce((s, r) => s + (typeof r.perUser === 'number' ? r.perUser : 0), 0);
const shared = rows.reduce((s, r) => s + (typeof r.perUser === 'number' ? 0 : r.bytes), 0);
console.log(`\nper-user data: ${kb(perUser)}/user; shared: ${kb(shared)} → ~${Math.floor((M0_BYTES - shared) / perUser).toLocaleString('en')} users fit in M0 (before indexes)`);
await mongoose.disconnect();
