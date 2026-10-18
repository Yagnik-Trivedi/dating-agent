// Owner's judge fix, step 3: re-judge the saved conversations of the last full run (eval/raw-full.json) with the
// current judge (decision in code), no new chats. For each labelled non-fake pair: delete the conversation's
// MatchDecisions, run judgeSide for both sides, settle the pair offline with settle()'s rule (the lower label wins;
// no wind-down is re-sent), and write eval/results/rejudge.md (next to the old numbers) + eval/raw-rejudge.json
// (for calibrate.js). ~2 judge calls per pair (+ re-asks and icebreakers).
//   node scripts/eval/rejudge.js [--only c1,i3] [--concurrency 2] --yes
import { readFileSync, writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '../../src/config/env.js';
import { Conversation } from '../../src/models/Conversation.js';
import { Match } from '../../src/models/Match.js';
import { MatchDecision } from '../../src/models/MatchDecision.js';
import { User } from '../../src/models/User.js';
import { LABEL, lowerVerdict } from '../../src/services/compat/report.js';
import { judgeSide } from '../../src/services/conversation/judge.js';
import { flushUsage } from '../../src/services/llm/budget.js';
import { mapLimit } from '../../src/utils/mapLimit.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const R = new URL('../../eval/', import.meta.url);
const LABELS = ['compatible', 'maybe', 'incompatible'];
const old = JSON.parse(readFileSync(new URL('raw-full.json', R), 'utf8'));
const pairs = JSON.parse(readFileSync(new URL('../seed/pairs.json', R), 'utf8'));
let rows = Object.values(old).filter((r) => r.run === 1 && LABELS.includes(r.expected));
if (opt('only')) rows = rows.filter((r) => opt('only').split(',').includes(r.id));
console.log(`${rows.length} saved conversation(s) to re-judge (~${rows.length * 2} judge calls).`);
if (!args.includes('--yes')) { console.log('Add --yes to start.'); process.exit(0); }

env.LLM_DAILY_CALLS_PER_USER = Math.max(env.LLM_DAILY_CALLS_PER_USER, 5000); // seed personas judge many pairs
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

const out = {};
try {
  await mapLimit(rows, Number(opt('concurrency', 2)), async (r) => {
    const p = pairs.find((x) => x.id === r.id);
    const users = await User.find({ email: { $in: [p.a, p.b] } }, { email: 1 }).lean();
    const match = await Match.findOne({ users: { $all: users.map((u) => u._id) } }).lean();
    const conv = match && await Conversation.findOne({ matchId: match._id }).sort({ round: -1 }).lean();
    if (!conv) { console.log(`  ✖ ${r.id}: no saved conversation`); return; }
    await MatchDecision.deleteMany({ conversationId: conv._id });
    const ds = [];
    for (const u of match.users) ds.push(await judgeSide({ conversationId: conv._id, userId: u }));
    const predicted = lowerVerdict(LABEL[ds[0].decision], LABEL[ds[1].decision]);
    out[`${r.id}#1`] = { ...r, oldPredicted: r.predicted, predicted, verdicts: ds.map((d) => LABEL[d.decision]), scores: ds.map((d) => d.confidence),
      reasons: ds.map((d) => d.validation?.reason ?? null), oldVerdicts: r.verdicts, oldScores: r.scores };
    console.log(`  ${predicted === r.expected ? '✓' : '✖'} ${r.id}: ${r.predicted} → ${predicted} (${ds.map((d) => `${d.decision} ${d.confidence}: ${d.validation?.reason ?? ''}`).join(' | ')})`);
  });
} finally {
  await flushUsage();
  await mongoose.disconnect();
}
writeFileSync(new URL('raw-rejudge.json', R), `${JSON.stringify(out, null, 2)}\n`);

// --- report: new vs old, same definitions as eval.js
const res = Object.values(out).sort((a, b) => a.id.localeCompare(b.id));
const stats = (key) => ({
  correct: res.filter((r) => r[key] === r.expected).length,
  harmful: res.filter((r) => (r.expected === 'compatible' && r[key] === 'incompatible') || (r.expected === 'incompatible' && r[key] === 'compatible')).length,
  compatible: res.filter((r) => r.expected === 'compatible' && r[key] === 'compatible').length,
});
const matrix = (key) => LABELS.map((e) => `| **${e}** | ${LABELS.map((p) => res.filter((r) => r.expected === e && r[key] === p).length).join(' | ')} |`);
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—');
const [n, o] = [stats('predicted'), stats('oldPredicted')];
const nComp = res.filter((r) => r.expected === 'compatible').length;
const md = [
  '# Re-judge: the B5 conversations with the decision made in code', '',
  `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`node scripts/eval/rejudge.js\`. Same ${res.length} saved conversations as the full run (no new chats); only the judges changed. The gated pair and the two fakes never reach a judge and are unchanged (1/1, 2/2).`, '',
  '| | before (B5 judges) | after (decision in code) | target |', '|---|---|---|---|',
  `| Accuracy (non-fake pairs) | ${o.correct}/${res.length} = ${pct(o.correct, res.length)} | **${n.correct}/${res.length} = ${pct(n.correct, res.length)}** | |`,
  `| Compatible pairs called Compatible | ${o.compatible}/${nComp} | **${n.compatible}/${nComp}** | ≥ 4/${nComp} |`,
  `| Harmful errors (compatible ↔ incompatible) | ${o.harmful} | **${n.harmful}** | ≤ ${o.harmful} |`, '',
  '## Confusion matrix after (rows = expected, columns = predicted)', '',
  '| expected \\ predicted | compatible | maybe | incompatible |', '|---|---|---|---|', ...matrix('predicted'), '',
  '## Confusion matrix before', '',
  '| expected \\ predicted | compatible | maybe | incompatible |', '|---|---|---|---|', ...matrix('oldPredicted'), '',
  '## Per pair', '',
  '| pair | expected | before | after | judges after (confidence: why) |', '|---|---|---|---|---|',
  ...res.map((r) => `| ${r.id} | ${r.expected} | ${r.oldPredicted} | ${r.predicted === r.expected ? '✓ ' : '✖ '}${r.predicted} | ${r.verdicts.map((v, i) => `${v} (${r.scores[i]}: ${r.reasons[i] ?? '—'})`).join(' / ')} |`), '',
];
writeFileSync(new URL('results/rejudge.md', R), `${md.join('\n')}\n`);
console.log(`\n${md.slice(4, 9).join('\n')}\nWrote eval/results/rejudge.md and eval/raw-rejudge.json.`);
process.exit(0);
