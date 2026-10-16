// Plan 17 §1: transactions commit and roll back on the replica set; dev-db refuses production.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { withTransaction } from '../src/services/db.js';
import { start, stop } from '../scripts/lib/testDb.js';

const Thing = mongoose.model('TxThing', new mongoose.Schema({ n: Number }));

before(async () => { await start(); await Thing.createCollection(); });
after(stop);

test('withTransaction commits, and rolls back when fn throws', async () => {
  await withTransaction(async (session) => { await Thing.create([{ n: 1 }], { session }); });
  await assert.rejects(withTransaction(async (session) => {
    await Thing.create([{ n: 2 }], { session });
    throw new Error('interrupted');
  }), /interrupted/);
  assert.deepEqual((await Thing.find().lean()).map((t) => t.n), [1]);
});

test('dev-db exits with an error when NODE_ENV=production', () => {
  const script = fileURLToPath(new URL('../scripts/dev-db.js', import.meta.url));
  const res = spawnSync(process.execPath, [script], { env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 20_000 });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /refuses/);
});
