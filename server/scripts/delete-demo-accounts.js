// Delete every demo account (seed personas, judge accounts, any @demo.local address) with all their data, the same way
// DELETE /me does (services/account.js); real accounts stay. Matches between two demo accounts go entirely; a real
// user's match with a demo account is closed and the demo side shows as "Deleted user".
//   node scripts/delete-demo-accounts.js          → dry run: lists what would go and what stays
//   node scripts/delete-demo-accounts.js --yes    → deletes (add --keep-judges to keep the judge logins)
// Uses MONGODB_URI (server/.env, or the environment).
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Profile } from '../src/models/Profile.js';
import { deleteAccount } from '../src/services/account.js';

const yes = process.argv.includes('--yes');
// --keep-judges: the pre-made hackathon judge logins (isJudge) stay.
const keepJudges = process.argv.includes('--keep-judges');
const DEMO = { $or: [{ isSeed: true }, { isJudge: true }, { email: /@demo\.local$/i }], ...(keepJudges && { isJudge: { $ne: true } }) };
const mask = (e) => String(e).replace(/^(.{2}).*@/, '$1…@');

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
try {
  const [demo, real] = await Promise.all([
    User.find(DEMO, { email: 1, name: 1, isSeed: 1, isJudge: 1 }).lean(),
    User.find({ $nor: [DEMO] }, { email: 1, name: 1, createdAt: 1, isJudge: 1 }).sort({ createdAt: 1 }).lean(),
  ]);
  const host = env.MONGODB_URI.replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, '').split(/[/?]/)[0];
  console.log(`Database: ${host}`);
  console.log(`Demo accounts: ${demo.length} (${demo.filter((u) => u.isSeed).length} seed, ${demo.filter((u) => u.isJudge).length} judge)`);
  console.log(`Accounts kept: ${real.length}`);
  for (const u of real) console.log(`  keep  ${u.name ?? '(no name)'} · ${mask(u.email)}${u.isJudge ? ' (judge login)' : ''} · joined ${u.createdAt?.toISOString().slice(0, 10) ?? '?'}`);
  if (!yes) {
    console.log('\nDry run: nothing deleted. Run again with --yes to delete the demo accounts.');
  } else {
    for (const [i, u] of demo.entries()) {
      await deleteAccount(u._id);
      if ((i + 1) % 10 === 0 || i === demo.length - 1) console.log(`  deleted ${i + 1}/${demo.length}`);
    }
    // A profile whose user is already gone (an older partial delete) is a demo leftover too.
    const orphanProfiles = await Profile.deleteMany({ userId: { $nin: (await User.find({}, { _id: 1 }).lean()).map((u) => u._id) } });
    console.log(`Done. ${await User.countDocuments(DEMO)} demo accounts left, ${await User.countDocuments()} accounts in total; ${orphanProfiles.deletedCount} orphaned profiles removed.`);
  }
} finally {
  await mongoose.disconnect();
}
