// Owner's prompt check (2026-10-28): start agent chats between real accounts that have made NO LLM calls today
// (UTC day, the same day the daily budget uses), so neither side runs out of budget mid-chat.
// Picks the first N men and N women (onboarding done, profile active, not seed or judge accounts) with 0 calls today
// and pairs man 1 with woman 1, man 2 with woman 2, skipping any pair that already has a match. Nothing is deleted.
//   node scripts/fresh-pairs.js                     → plan only (dry run)
//   node scripts/fresh-pairs.js --yes               → create the matches (admin: no gate, no daily cap)
//   --pairs 2                                       → how many pairs (default 2)
//   --depth demo                                    → these matches only: 3 short sessions ~1 min apart (default: CHAT_DEPTH)
//   --instant                                       → these matches' agents reply with no debounce or typing delay
// Uses MONGODB_URI from server/.env. Only enqueues jobs: the running server's worker does the trust check, brief and chat.
import 'dotenv/config';
import mongoose from 'mongoose';
import { Match } from '../src/models/Match.js';
import { Profile } from '../src/models/Profile.js';
import { Usage } from '../src/models/Usage.js';
import { User } from '../src/models/User.js';
import { createMatch } from '../src/services/matches.js';

const argv = process.argv.slice(2);
const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const YES = argv.includes('--yes');
const INSTANT = argv.includes('--instant');
const PAIRS = Number(arg('--pairs') ?? 2);
const DEPTH = arg('--depth');
if (DEPTH && !['full', 'demo', 'chain', 'short'].includes(DEPTH)) throw new Error(`unknown --depth ${DEPTH}`);

await mongoose.connect(process.env.MONGODB_URI);
console.log(`database: ${mongoose.connection.host.replace(/^[^.]+/, '***')} · ${YES ? 'MATCH' : 'dry run'}`);

const since = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
const usedToday = new Set((await Usage.distinct('userId', { at: { $gte: since }, userId: { $ne: null } })).map(String));
const users = await User.find({ isSeed: { $ne: true }, isJudge: { $ne: true }, 'onboarding.status': 'done' }, { name: 1 }).lean();
const fresh = users.filter((u) => !usedToday.has(String(u._id)));
const profiles = new Map((await Profile.find({ userId: { $in: fresh.map((u) => u._id) }, status: 'active' }, { userId: 1, gender: 1 }).lean()).map((p) => [String(p.userId), p]));
const byGender = (g) => fresh.filter((u) => profiles.get(String(u._id))?.gender === g);
const men = byGender('man'), women = byGender('woman');
console.log(`0 LLM calls today: ${men.length} men (${men.map((u) => u.name).join(', ') || 'none'}) · ${women.length} women (${women.map((u) => u.name).join(', ') || 'none'})`);

const pairs = [];
const taken = new Set();
for (const m of men) {
  if (pairs.length >= PAIRS) break;
  for (const w of women) {
    if (taken.has(String(w._id))) continue;
    const pairKey = [String(m._id), String(w._id)].sort().join('_');
    if (await Match.exists({ pairKey })) continue; // already matched: keep their chat, try the next woman
    pairs.push([m, w]);
    taken.add(String(w._id));
    break;
  }
}
if (pairs.length < PAIRS) console.log(`only ${pairs.length} new pair(s) possible`);

for (const [m, w] of pairs) {
  if (!YES) { console.log(`  would match ${m.name} × ${w.name}`); continue; }
  const match = await createMatch(m._id, w._id, { admin: true, ...(DEPTH && { chatDepth: DEPTH }), instant: INSTANT });
  console.log(`  matched ${m.name} × ${w.name} → ${match?._id ?? 'skipped (an account is not active)'}`);
}
if (!YES) console.log('\nRe-run with --yes to create these matches.');
await mongoose.disconnect();
