// Ephemeral replica set for checks and node:test suites: start() → connected mongoose, stop() tears it down.
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let rs;

export async function start() {
  if (process.env.NODE_ENV === 'production') throw new Error('testDb is for local checks only');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri('test'));
  return rs.getUri('test');
}

export async function stop() {
  await mongoose.disconnect();
  await rs?.stop();
}
