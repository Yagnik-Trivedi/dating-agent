import mongoose from 'mongoose';

/** Runs fn(session) in a transaction (retried on transient errors). Needs a replica set: Atlas, or `npm run dev-db`. */
export async function withTransaction(fn) {
  try {
    return await mongoose.connection.transaction(fn);
  } catch (err) {
    if (/replica set|Transaction numbers/i.test(err.message)) {
      throw new Error(`MongoDB transactions need a replica set (Atlas, or \`npm run dev-db\` locally): ${err.message}`);
    }
    throw err;
  }
}
