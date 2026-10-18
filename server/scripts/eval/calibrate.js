// Plan 11 B5: calibrate JUDGE_YES_MIN from saved eval runs (no LLM, no DB).
// A judge "yes" below the threshold becomes "unsure"; the pair label is the lower of the two sides. For each threshold:
// accuracy and harmful errors over every labelled conversation in the given raw files.
//   node scripts/eval/calibrate.js [raw-full.json raw-rules-on.json …]   → eval/results/calibration.md
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { KG } from '../../src/services/kg/config.js';

const R = new URL('../../eval/', import.meta.url);
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['raw-full.json', 'raw-rules-on.json'];
const RANK = { incompatible: 0, maybe: 1, compatible: 2 };
const LABELS = ['compatible', 'maybe', 'incompatible'];
const rows = files.filter((f) => existsSync(new URL(f, R))).flatMap((f) => Object.values(JSON.parse(readFileSync(new URL(f, R), 'utf8'))).map((r) => ({ ...r, file: f })))
  .filter((r) => LABELS.includes(r.expected) && r.verdicts?.every((v) => LABELS.includes(v)));

const labelAt = (r, t) => r.verdicts.map((v, i) => (v === 'compatible' && (r.scores[i] ?? 0) < t ? 'maybe' : v)).reduce((a, b) => (RANK[a] <= RANK[b] ? a : b));
const table = [];
for (let i = 0; i <= 9; i++) {
  const t = Math.round((0.5 + 0.05 * i) * 100) / 100; // exact steps: 0.5 + 0.05 + … drifted to 0.6000000000000001
  const preds = rows.map((r) => [r.expected, labelAt(r, t)]);
  table.push({ t, correct: preds.filter(([e, p]) => e === p).length, harmful: preds.filter(([e, p]) => (e === 'compatible' && p === 'incompatible') || (e === 'incompatible' && p === 'compatible')).length });
}
const best = table.reduce((a, b) => (b.correct > a.correct || (b.correct === a.correct && b.harmful < a.harmful) ? b : a), table[0]);
const md = [
  '# Judge threshold calibration (JUDGE_YES_MIN)', '',
  `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`node scripts/eval/calibrate.js\` from ${files.join(', ')}: ${rows.length} labelled conversations with both judges' decisions.`,
  `A "yes" below the threshold becomes "unsure" (Maybe); the pair is the lower side. Current value: ${KG.JUDGE_YES_MIN}.`, '',
  '| threshold | correct | harmful errors |', '|---|---|---|',
  ...table.map((x) => `| ${x.t.toFixed(2)}${x.t === KG.JUDGE_YES_MIN ? ' (current)' : ''} | ${x.correct}/${rows.length} | ${x.harmful} |`), '',
  `**Best: ${best.t.toFixed(2)}** (${best.correct}/${rows.length} correct, ${best.harmful} harmful). The threshold can only turn a low-confidence yes into Maybe; it cannot help pairs where a judge already said unsure or no.`, '',
].join('\n');
writeFileSync(new URL('results/calibration.md', R), `${md}\n`);
console.log(md);
