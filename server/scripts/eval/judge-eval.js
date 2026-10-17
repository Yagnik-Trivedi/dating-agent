// Plan 11 B3: judge agreement with humans. Never blocks anything.
//   node scripts/eval/judge-eval.js --export   → eval/labels/: 10 transcripts (balanced yes / no / unsure judge decisions)
//                                                 + labels.csv for the team to fill (one row per side)
//   node scripts/eval/judge-eval.js            → agreement + Cohen's kappa once labels.csv has human labels
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '../../src/config/env.js';
import { Match } from '../../src/models/Match.js';
import { MatchDecision } from '../../src/models/MatchDecision.js';
import { Message } from '../../src/models/Message.js';
import { User } from '../../src/models/User.js';

const DIR = new URL('../../eval/labels/', import.meta.url);
const CSV = new URL('labels.csv', DIR);
mkdirSync(DIR, { recursive: true });
const LABELS = ['yes', 'unsure', 'no'];

if (process.argv.includes('--export')) {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  const decisions = await MatchDecision.find({}).sort({ createdAt: -1 }).lean();
  // Balanced: round-robin over yes / no / unsure, one side per transcript, until 10 transcripts.
  const byLabel = Object.fromEntries(LABELS.map((l) => [l, decisions.filter((d) => d.decision === l)]));
  const chosen = [];
  for (let i = 0; chosen.length < 10 && i < decisions.length; i++) {
    const d = byLabel[LABELS[i % 3]].shift();
    if (d && !chosen.some((c) => String(c.matchId) === String(d.matchId))) chosen.push(d);
    if (!LABELS.some((l) => byLabel[l].length)) break;
  }
  const rows = ['file,side,match_id,human_label (yes|unsure|no),notes'];
  for (const [i, d] of chosen.entries()) {
    const match = await Match.findById(d.matchId).lean();
    if (!match) continue;
    const users = await User.find({ _id: { $in: match.users } }, { name: 1 }).lean();
    const name = (id) => users.find((u) => String(u._id) === String(id))?.name ?? '?';
    const msgs = await Message.find({ matchId: d.matchId }).sort({ createdAt: 1 }).lean();
    const file = `t${String(i + 1).padStart(2, '0')}.md`;
    // The judge's decision is NOT in the file: humans label blind.
    writeFileSync(new URL(file, DIR), [`# ${file}: ${users.map((u) => u.name).join(' × ')}`, '', `Label for **${name(d.userId)}**: from what ${name(d.userId)}'s side learned in this chat, should ${name(d.userId)} want to keep talking? yes / unsure / no.`, '',
      ...msgs.map((m, k) => `${k + 1}. **${name(m.senderId)}**: ${m.text}`), ''].join('\n'));
    rows.push(`${file},${name(d.userId)},${d.matchId},,`);
  }
  if (existsSync(CSV)) console.log('labels.csv exists: not overwritten (delete it to re-export).');
  else writeFileSync(CSV, `${rows.join('\n')}\n`);
  console.log(`Exported ${chosen.length} transcripts to eval/labels/ (${LABELS.map((l) => `${l} ${chosen.filter((c) => c.decision === l).length}`).join(', ')}). Fill the human_label column in labels.csv.`);
  await mongoose.disconnect();
  process.exit(0);
}

if (!existsSync(CSV)) { console.log('No eval/labels/labels.csv yet: run with --export, then have the team label it. (pending labels)'); process.exit(0); }
const rows = readFileSync(CSV, 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(',')).filter((r) => LABELS.includes(r[3]?.trim()));
if (!rows.length) { console.log('labels.csv has no human labels yet (pending labels).'); process.exit(0); }
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const pairs = [];
for (const [, side, matchId, human] of rows) {
  const ds = await MatchDecision.find({ matchId }).lean();
  const users = await User.find({ _id: { $in: ds.map((d) => d.userId) } }, { name: 1 }).lean();
  const d = ds.find((x) => users.find((u) => String(u._id) === String(x.userId))?.name === side);
  if (d) pairs.push([human.trim(), d.decision]);
}
await mongoose.disconnect();
const agree = pairs.filter(([h, j]) => h === j).length / pairs.length;
const pe = LABELS.reduce((s, l) => s + (pairs.filter(([h]) => h === l).length / pairs.length) * (pairs.filter(([, j]) => j === l).length / pairs.length), 0);
const kappa = pe === 1 ? 1 : (agree - pe) / (1 - pe);
console.log(`Judge vs human: ${pairs.length} labelled sides, agreement ${(agree * 100).toFixed(0)}%, Cohen's kappa ${kappa.toFixed(2)}.`);
