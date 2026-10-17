// Plan 11 B6: one page of headline numbers from the eval outputs (no DB, no LLM).
//   node scripts/eval/latest.js   → eval/results/latest.md (copy the headline block into the README)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const R = new URL('../../eval/', import.meta.url);
const read = (f) => (existsSync(new URL(f, R)) ? readFileSync(new URL(f, R), 'utf8') : null);
const line = (md, label) => md?.split('\n').find((l) => l.includes(label))?.replace(/^- /, '').trim() ?? `${label}: pending`;
const json = (f) => { const t = read(f); return t ? JSON.parse(t) : null; };
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—');

const full = read('results-full.md') ?? read('results.md');
const on = json('results/llm-metrics-rules-on.json')?.summary;
const off = json('results/llm-metrics-rules-off.json')?.summary;
const rulesRow = (label, f) => `| ${label} | ${on ? f(on) : '—'} | ${off ? f(off) : '—'} |`;
const metrics = read('results/metrics-full.md') ?? read('results/metrics-rules-on.md');
const claimsFull = json('results/llm-metrics-full.json')?.summary;
const scale = read('results/scale.md');
const leak = read('results/leak-probe.md');
const labels = existsSync(new URL('labels/labels.csv', R)) ? readFileSync(new URL('labels/labels.csv', R), 'utf8').split('\n').slice(1).filter((l) => /,(yes|unsure|no),/.test(l)).length : 0;

const md = [
  '# Evaluation: headline numbers', '',
  `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`node scripts/eval/latest.js\` from the files in \`eval/\`. Provider: see each source file.`, '',
  '## Labelled pairs', '',
  `- ${line(full, '**Accuracy**')}`, `- ${line(full, '**Harmful error rate**')}`, `- ${line(full, '**Gate**')}`, `- ${line(full, '**Fake detection**')}`,
  `- ${line(full, '**Fallback rate**')}`, `- ${line(full, '**Mean tokens per pair**')}`, '',
  '## Rules on vs off (6-pair subset, `RULES` ablation)', '',
  '| | rules on (full engine) | rules off (plain agents) |', '|---|---|---|',
  rulesRow('Unsupported self-claims', (s) => `${pct(s.unsupported + s.contradicts, s.claims)} of ${s.claims}`),
  rulesRow('Agreement rate', (s) => pct(s.agree, s.replies)),
  rulesRow('Disagreement rate', (s) => pct(s.disagree, s.replies)),
  rulesRow('Judge approval ("yes")', (s) => pct(s.judgeYes, s.judges)), '',
  claimsFull ? `- **Unsupported self-claims, full run**: ${pct(claimsFull.unsupported + claimsFull.contradicts, claimsFull.claims)} of ${claimsFull.claims} claims (offline judge); judge approval ${pct(claimsFull.judgeYes, claimsFull.judges)}` : '- Full-run claim audit: pending', '',
  '## Voice and language', '',
  `- ${line(metrics, '**Style distance**')}`, `- ${line(metrics, '**Language-mix distance**')}`, `- ${line(metrics, '**Script kept**')}`, '',
  '## Privacy', '', `- ${line(leak, '**Leak rate')}`, '',
  '## Judge vs humans', '', labels ? `- ${labels} human labels in \`eval/labels/labels.csv\`: run \`node scripts/eval/judge-eval.js\` for agreement + kappa.` : '- Pending labels: `node scripts/eval/judge-eval.js --export` wrote `eval/labels/` for the team.', '',
  '## Scale (no LLM)', '', ...(scale ? scale.split('\n').filter((l) => /^\| (Discover|Context)|Storage per user|Judge queue/.test(l)) : ['pending']), '',
].join('\n');
writeFileSync(new URL('results/latest.md', R), `${md}\n`);
console.log(md);
