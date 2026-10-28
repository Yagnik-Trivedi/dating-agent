// Restart ONE pair's chat from scratch: back up and delete everything between the two accounts (match, messages,
// conversation, chat events, verdicts, likes, inbox items and notes from that match), then match them again as an
// admin match (no gate, no daily cap). Every other match is untouched. Dry run by default.
//   node scripts/rematch-pair.js Yagu Yagunguni         → plan only
//   node scripts/rematch-pair.js Yagu Yagunguni --yes   → back up to server/backups/<time>-pair/, wipe, re-match
//   --depth demo                                        → this match only: 3 short sessions ~1 min apart (default: CHAT_DEPTH)
//   --instant                                           → this match's agents reply with no debounce or typing delay
//   --takeover Krish                                    → Krish's agent is off from the start; Krish types himself
//   --lang hinglish|gujarati                            → this match only: both agents text in Hinglish / Gujarati + English
// Names match User.name exactly (case-insensitive). Uses MONGODB_URI from server/.env. Only enqueues jobs: the running
// server's worker does the trust check, brief and chat, so don't run a local worker against the same database.
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { createMatch } from '../src/services/matches.js';

const argv = process.argv.slice(2);
const DEPTH = argv.includes('--depth') ? argv[argv.indexOf('--depth') + 1] : null;
const TAKEOVER = argv.includes('--takeover') ? argv[argv.indexOf('--takeover') + 1] : null;
const LANG = argv.includes('--lang') ? argv[argv.indexOf('--lang') + 1] : null;
const LANGS = { hinglish: { mix: { hi_latn: 0.7, en: 0.3 }, codeSwitchRate: 0.8 }, gujarati: { mix: { gu_latn: 0.5, en: 0.5 }, codeSwitchRate: 0.8 } };
const [nameA, nameB] = argv.filter((a, i) => !a.startsWith('--') && !['--depth', '--takeover', '--lang'].includes(argv[i - 1]));
const YES = argv.includes('--yes');
const INSTANT = argv.includes('--instant');
if (!nameA || !nameB) throw new Error('usage: node scripts/rematch-pair.js <nameA> <nameB> [--depth full|demo|chain|short] [--instant] [--takeover <name>] [--lang hinglish|gujarati] [--yes]');
if (TAKEOVER && ![nameA, nameB].some((n) => n.toLowerCase() === TAKEOVER.toLowerCase())) throw new Error(`--takeover must be ${nameA} or ${nameB}`);
if (LANG && !LANGS[LANG]) throw new Error(`unknown --lang ${LANG}`);
if (DEPTH && !['full', 'demo', 'chain', 'short'].includes(DEPTH)) throw new Error(`unknown --depth ${DEPTH}`);

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
console.log(`database: ${mongoose.connection.host.replace(/^[^.]+/, '***')} · ${YES ? 'WIPE + MATCH' : 'dry run'}`);

const exact = (name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
async function one(name) {
  const found = await User.find({ name: exact(name), isSeed: { $ne: true }, isJudge: { $ne: true } }, { name: 1, email: 1, 'onboarding.status': 1 }).lean();
  if (found.length !== 1) throw new Error(`expected exactly one account named "${name}", found ${found.length}`);
  if (found[0].onboarding?.status !== 'done') throw new Error(`${found[0].name} hasn't finished onboarding (no agent)`);
  return found[0];
}
const a = await one(nameA), b = await one(nameB);
const pairKey = [String(a._id), String(b._id)].sort().join('_');
const matchIds = (await db.collection('matches').find({ pairKey }, { projection: { _id: 1 } }).toArray()).map((m) => m._id);
const ab = [{ observerId: a._id, subjectId: b._id }, { observerId: b._id, subjectId: a._id }];

const PAIR_DATA = [
  ['matches', { _id: { $in: matchIds } }], ['messages', { matchId: { $in: matchIds } }],
  ['conversations', { matchId: { $in: matchIds } }], ['chatevents', { matchId: { $in: matchIds } }],
  ['matchdecisions', { matchId: { $in: matchIds } }], ['inboxitems', { matchId: { $in: matchIds } }],
  ['likes', { $or: [{ fromUserId: a._id, toUserId: b._id }, { fromUserId: b._id, toUserId: a._id }] }],
  ['kgfacts', { $or: [{ matchId: { $in: matchIds } }, ...ab] }], ['kgedges', { $or: ab }],
  ['jobs', { 'payload.matchId': { $in: matchIds.map(String) }, status: { $in: ['queued', 'running', 'failed'] } }],
];

console.log(`${a.name} × ${b.name}: ${matchIds.length} existing match(es)`);
if (YES) {
  const dir = new URL(`../backups/${new Date().toISOString().replace(/[:.]/g, '-')}-pair/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const [name, filter] of PAIR_DATA) {
    const docs = await db.collection(name).find(filter).toArray();
    writeFileSync(new URL(`${name}.json`, dir), JSON.stringify(docs));
    const { deletedCount } = await db.collection(name).deleteMany(filter);
    console.log(`  ${name.padEnd(15)} backed up ${String(docs.length).padStart(4)} · deleted ${deletedCount}`);
  }
  console.log(`backup: ${dir.pathname}`);
  const takenOver = TAKEOVER ? (TAKEOVER.toLowerCase() === nameA.toLowerCase() ? a : b)._id : null;
  const m = await createMatch(a._id, b._id, { admin: true, ...(DEPTH && { chatDepth: DEPTH }), instant: INSTANT, takenOver, ...(LANG && { language: LANGS[LANG] }) });
  console.log(`matched ${a.name} × ${b.name} → ${m?._id ?? 'skipped (an account is not active)'}`);
} else {
  for (const [name, filter] of PAIR_DATA) console.log(`  would delete ${name.padEnd(15)} ${await db.collection(name).countDocuments(filter)}`);
  console.log('\nRe-run with --yes to wipe and re-match.');
}
await mongoose.disconnect();
