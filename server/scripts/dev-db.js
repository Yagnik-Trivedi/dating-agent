// Plan 17: local MongoDB as a one-member replica set (transactions work), persisted to server/.dev-db/.
//   npm run dev-db      → mongodb://127.0.0.1:27999/?replicaSet=testset
// Never for production: Atlas is already a replica set.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

if (process.env.NODE_ENV === 'production') {
  console.error('dev-db refuses to run with NODE_ENV=production (use Atlas).');
  process.exit(1);
}

const dbPath = fileURLToPath(new URL('../.dev-db/', import.meta.url));
mkdirSync(dbPath, { recursive: true });
const rs = await MongoMemoryReplSet.create({
  replSet: { name: 'testset', count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: 27999, dbPath }],
});
console.log(`READY ${rs.getUri()}`);
const stop = async () => { await rs.stop({ doCleanup: false }); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
