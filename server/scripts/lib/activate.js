// Check scripts only: mark a throwaway account active, standing in for a passed live check (plan 30 S2 gating).
import mongoose from 'mongoose';

export async function activateForCheck(userId) {
  const conn = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  await conn.db.collection('profiles').updateOne({ userId: new mongoose.Types.ObjectId(String(userId)) }, { $set: { status: 'active', liveChecked: true } });
  await conn.close();
}
