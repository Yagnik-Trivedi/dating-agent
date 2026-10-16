// Plan 17 §6: sync every model's indexes, then assert the plan 15 §6.6 set exists (for the models built so far).
//   node scripts/check-indexes.js
// Plans 05/08/09 add their collections' indexes to EXPECTED.
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import '../src/models/Concept.js';
import '../src/models/EmbCache.js';
import '../src/models/InboxItem.js';
import '../src/models/Job.js';
import '../src/models/KgEdge.js';
import '../src/models/KgFact.js';
import '../src/models/KgTombstone.js';
import '../src/models/Like.js';
import '../src/models/Match.js';
import '../src/models/Message.js';
import '../src/models/Profile.js';
import '../src/models/SearchCache.js';
import '../src/models/Usage.js';
import '../src/models/User.js';
import '../src/models/VoiceProfile.js';
import '../src/models/VoiceSample.js';
import { GATE_ATTRIBUTES } from '../src/services/match/gate.js';

const EXPECTED = {
  profiles: [
    { key: { 'gate.city': 1, 'gate.gender': 1, 'gate.age': 1 } },
    { key: { 'gate.dealbreakers': 1 } },
    ...GATE_ATTRIBUTES.map((k) => ({ key: { [`gate.values.${k}`]: 1 } })),
    { key: { geo: '2dsphere' } },
  ],
  kgfacts: [
    { key: { subjectId: 1, observerId: 1, predicate: 1, conceptId: 1 } }, { key: { subjectId: 1, observerId: 1, attribute: 1 } },
    { key: { observerId: 1, conversationId: 1 } }, { key: { archiveAt: 1 }, ttl: true },
  ],
  concepts: [{ key: { type: 1, name: 1 }, unique: true }, { key: { aliases: 1 } }],
  kgedges: [{ key: { subjectId: 1, observerId: 1, type: 1 } }],
  kgtombstones: [{ key: { subjectId: 1, key: 1 }, unique: true }],
  voicesamples: [{ key: { userId: 1, createdAt: 1 } }],
  voiceprofiles: [{ key: { userId: 1 }, unique: true }],
  messages: [{ key: { matchId: 1, createdAt: -1 } }, { key: { archiveAt: 1 }, ttl: true }],
  jobs: [{ key: { status: 1, runAt: 1 } }, { key: { dedupeKey: 1 }, unique: true }, { key: { finishedAt: 1 }, ttl: true }],
};

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
for (const model of Object.values(mongoose.models)) await model.syncIndexes();

let missing = 0;
for (const [coll, wanted] of Object.entries(EXPECTED)) {
  const have = await mongoose.connection.db.collection(coll).indexes();
  for (const w of wanted) {
    const hit = have.find((i) => JSON.stringify(i.key) === JSON.stringify(w.key));
    const ok = hit && (!w.unique || hit.unique) && (!w.ttl || hit.expireAfterSeconds !== undefined);
    if (!ok) missing++;
    console.log(`${ok ? '✓' : '✖'} ${coll} ${JSON.stringify(w.key)}${w.unique ? ' unique' : ''}${w.ttl ? ' TTL' : ''}`);
  }
}
await mongoose.disconnect();
if (missing) {
  console.error(`\n${missing} index(es) missing`);
  process.exit(1);
}
console.log('\nAll expected indexes exist.');
