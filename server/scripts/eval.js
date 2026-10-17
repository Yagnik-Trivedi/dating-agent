// Plan 11 Part B (v2): run the labelled pairs in seed/pairs.json through the full pipeline and write eval/results.md.
// Verdicts come from each side's MatchDecision (yes → compatible, unsure → maybe, no → incompatible; the lower wins);
// a pair the gate closes at match creation is 'gated'.
//   node scripts/eval.js [--limit N] [--only c1,i2] [--runs 1] [--concurrency 2] [--resume] --yes
// Prints the estimated tokens first and does nothing without --yes. Results accumulate in eval/raw.json, so a run that
// hits the daily token budget can continue tomorrow with --resume. Personas come from `npm run seed`.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Usage } from '../src/models/Usage.js';
import { User } from '../src/models/User.js';
import { MatchDecision } from '../src/models/MatchDecision.js';
import { LABEL, lowerVerdict } from '../src/services/compat/report.js';
import { flushUsage, usageToday } from '../src/services/llm/budget.js';
import { mapLimit } from '../src/utils/mapLimit.js';
import { ensurePersona } from './lib/personas.js';
import { NO_PACING, runPair } from './lib/runPair.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const runs = Number(opt('runs', 1));
const concurrency = Number(opt('concurrency', 2));
const DIR = new URL('../eval/', import.meta.url);
const RAW = new URL('raw.json', DIR);
// Measured on NVIDIA (v2 plans 08/09): ~76k tokens per conversation + ~10k for the two judges; a fake stops at the trust check.
const EST = { normal: 90_000, fake: 6_000 };

let pairs = JSON.parse(readFileSync(new URL('../seed/pairs.json', import.meta.url)));
if (opt('only')) pairs = pairs.filter((p) => opt('only').split(',').includes(p.id));
if (opt('limit')) pairs = pairs.slice(0, Number(opt('limit')));
const raw = args.includes('--resume') && existsSync(RAW) ? JSON.parse(readFileSync(RAW)) : {};
const jobs = pairs.flatMap((p) => Array.from({ length: runs }, (_, r) => ({ pair: p, run: r + 1, key: `${p.id}#${r + 1}` }))).filter((j) => !raw[j.key]);
const estimate = jobs.reduce((s, j) => s + EST[j.pair.expected === 'flagged_fake' ? 'fake' : 'normal'], 0);
console.log(`${jobs.length} run(s) to do (${pairs.length} pairs × ${runs}), estimated ~${(estimate / 1e6).toFixed(1)}M tokens, concurrency ${concurrency}.`);
if (!args.includes('--yes')) {
  console.log('Add --yes to start.');
  process.exit(0);
}

Object.assign(env, NO_PACING);
// Personas are bots: each appears in several pairs, so the per-user daily call cap would stop them mid-eval.
// The global daily token budget and the all-time USD cap still apply.
env.LLM_DAILY_CALLS_PER_USER = Math.max(env.LLM_DAILY_CALLS_PER_USER, 5000);
mkdirSync(new URL('transcripts/', DIR), { recursive: true });
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

const predictedOf = (m, decisions) => {
  if (m.status === 'flagged_fake') return 'flagged_fake';
  if (m.closedReason === 'gate') return 'gated';
  const vs = decisions.map((d) => LABEL[d.decision]);
  return vs.length === 2 ? lowerVerdict(vs[0], vs[1]) : `none (${m.status})`;
};

function transcriptMd(job, a, b, res, predicted, decisions) {
  const name = (id) => (String(id) === String(a._id) ? a.name : b.name);
  const reports = [a, b].map((u) => {
    const d = decisions.find((x) => String(x.userId) === String(u._id));
    if (!d) return `### ${u.name}'s judge\n(no decision)`;
    return [
      `### ${u.name}'s judge: ${d.decision} → ${LABEL[d.decision]} (confidence ${d.confidence}, ${d.judgeModel})`,
      d.summaryForUser, '',
      ...d.positives.map((x) => `- ✓ "${x.quote}": ${x.why}`), ...d.frictions.map((x) => `- ⚠ "${x.quote}": ${x.why}`),
      ...d.dealbreakerRisk.map((x) => `- ⛔ ${x.attribute}: "${x.quote}"`),
    ].join('\n');
  });
  return [
    `# ${job.pair.id} (run ${job.run}): ${a.name} × ${b.name}`, '',
    `Expected **${job.pair.expected}**, predicted **${predicted}**. ${job.pair.reason}.`, '',
    `Stop: ${res.match.agentState?.stopReason ?? '—'} · ${res.messages.length} messages · ${res.tokens} tokens · ${res.seconds} s`, '',
    ...reports, '', '## Transcript', '',
    ...res.messages.map((m, i) => `${i + 1}. **${name(m.senderId)}** (${m.authoredBy}): ${m.text}`),
    res.match.trust ? `\n## Trust\n\n${[a, b].map((u) => `- ${u.name}'s view: ${res.match.trust[String(u._id)]?.level} (${(res.match.trust[String(u._id)]?.flags ?? []).join('; ') || 'no flags'})`).join('\n')}` : '',
  ].join('\n');
}

// Owner's tuning target: < 5% of agent messages are a template fallback, and no fixed filler line ever.
const FILLER = /^(haha fair 😄|oh nice, i like that|ha that makes sense)$/i;
const fallbacksOf = (messages) => {
  const agent = messages.filter((m) => m.authoredBy === 'agent');
  return {
    agentMsgs: agent.length,
    templateFallbacks: agent.filter((m) => m.checks?.fallback === 'template' || FILLER.test(m.text.trim())).length,
    constrained: agent.filter((m) => m.checks?.fallback === 'constrained').length,
  };
};

let stopped = null;
await mapLimit(jobs, concurrency, async (job) => {
  if (stopped) return;
  const today = await usageToday();
  const need = EST[job.pair.expected === 'flagged_fake' ? 'fake' : 'normal'];
  if (today.totals.tokens + need > env.LLM_DAILY_TOKENS_GLOBAL || today.paused) {
    stopped = today.paused ?? `daily token budget (${today.totals.tokens} of ${env.LLM_DAILY_TOKENS_GLOBAL} used)`;
    return;
  }
  const [a, b] = [await ensurePersona(job.pair.a), await ensurePersona(job.pair.b)];
  await User.updateMany({ _id: { $in: [a._id, b._id] } }, { $set: { agentMode: 'auto' } });
  console.log(`▶ ${job.key}: ${a.name} × ${b.name} (expected ${job.pair.expected})`);
  const res = await runPair(a, b, { log: () => {} });
  const decisions = await MatchDecision.find({ matchId: res.match._id }).lean();
  const predicted = predictedOf(res.match, decisions);
  const costUsd = (await Usage.aggregate([{ $match: { matchId: res.match._id } }, { $group: { _id: null, usd: { $sum: '$costUsd' } } }]))[0]?.usd ?? 0;
  const file = `transcripts/${job.pair.id}-run${job.run}.md`;
  writeFileSync(new URL(file, DIR), transcriptMd(job, a, b, res, predicted, decisions));
  raw[job.key] = {
    id: job.pair.id, run: job.run, expected: job.pair.expected, predicted, reason: job.pair.reason,
    names: [a.name, b.name],
    verdicts: [a, b].map((u) => { const d = decisions.find((x) => String(x.userId) === String(u._id)); return d ? LABEL[d.decision] : null; }),
    scores: [a, b].map((u) => decisions.find((x) => String(x.userId) === String(u._id))?.confidence ?? null),
    stopReason: res.match.agentState?.stopReason ?? null, status: res.match.status,
    turns: res.messages.length, tokens: res.tokens, smartCalls: res.smartCalls, costUsd, seconds: res.seconds, file,
    ...fallbacksOf(res.messages),
  };
  writeFileSync(RAW, `${JSON.stringify(raw, null, 2)}\n`);
  console.log(`  ${predicted === job.pair.expected ? '✓' : '✖'} ${job.key}: predicted ${predicted} (${res.match.agentState?.stopReason ?? '—'}, ${res.messages.length} msgs, ${res.tokens} tokens, ${res.seconds} s)`);
});
if (stopped) console.log(`\n⏸ Stopped early: ${stopped}. Re-run with --resume (tomorrow, or raise LLM_DAILY_TOKENS_GLOBAL).`);

// --- results.md from everything in raw.json
const rows = Object.values(raw).sort((x, y) => x.id.localeCompare(y.id) || x.run - y.run);
const first = rows.filter((r) => r.run === 1);
const LABELS = ['compatible', 'maybe', 'incompatible'];
const normal = first.filter((r) => !['flagged_fake', 'gated'].includes(r.expected));
const gated = first.filter((r) => r.expected === 'gated');
const fakes = first.filter((r) => r.expected === 'flagged_fake');
const cell = (e, p) => normal.filter((r) => r.expected === e && (p === 'other' ? !LABELS.includes(r.predicted) : r.predicted === p)).length;
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—');
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const harmful = normal.filter((r) => (r.expected === 'compatible' && r.predicted === 'incompatible') || (r.expected === 'incompatible' && r.predicted === 'compatible')).length;
const byPair = Object.groupBy(rows, (r) => r.id);
const multi = Object.values(byPair).filter((rs) => rs.length > 1);
const stable = multi.filter((rs) => rs.every((r) => r.predicted === rs[0].predicted)).length;

const md = [
  '# Evaluation results', '',
  `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`node scripts/eval.js\` on **${env.LLM_PROVIDER}** (fast \`${env.MODEL_FAST}\`, mid \`${env.MODEL_MID}\`, smart \`${env.MODEL_SMART}\`).`,
  `${first.length} labelled pairs from \`seed/pairs.json\`${multi.length ? `, ${multi.length} of them run more than once` : ''}. Agent↔agent, no pacing. "Predicted" is the match verdict: the lower of the two agents' verdicts.`, '',
  '## Confusion matrix (rows = expected, columns = predicted)', '',
  '| expected \\ predicted | compatible | maybe | incompatible | other |', '|---|---|---|---|---|',
  ...LABELS.map((e) => `| **${e}** | ${LABELS.map((p) => cell(e, p)).join(' | ')} | ${cell(e, 'other')} |`), '',
  `- **Accuracy** (non-fake pairs): ${normal.filter((r) => r.predicted === r.expected).length}/${normal.length} = ${pct(normal.filter((r) => r.predicted === r.expected).length, normal.length)}`,
  `- **Harmful error rate** (compatible ↔ incompatible swapped): ${harmful}/${normal.length} = ${pct(harmful, normal.length)}`,
  `- **Gate**: ${gated.filter((r) => r.predicted === 'gated').length}/${gated.length} gated pairs never became a chat`,
  `- **Fake detection**: ${fakes.filter((r) => r.predicted === 'flagged_fake').length}/${fakes.length} fake pairs flagged; ${normal.filter((r) => r.predicted === 'flagged_fake').length} genuine pairs wrongly flagged`,
  multi.length ? `- **Stability**: ${stable}/${multi.length} pairs got the same verdict on every run` : null,
  `- **Fallback rate** (template or filler, target < 5%): ${pct(rows.reduce((s, r) => s + (r.templateFallbacks ?? 0), 0), rows.reduce((s, r) => s + (r.agentMsgs ?? 0), 0))} of agent messages; constrained regenerations: ${rows.reduce((s, r) => s + (r.constrained ?? 0), 0)}`,
  `- **Mean turns to verdict**: ${mean(normal.map((r) => r.turns)).toFixed(1)} messages`,
  `- **Mean tokens per pair**: ${Math.round(mean(normal.map((r) => r.tokens))).toLocaleString('en')} (fake pairs: ${Math.round(mean(fakes.map((r) => r.tokens))).toLocaleString('en')}); total ${rows.reduce((s, r) => s + r.tokens, 0).toLocaleString('en')} tokens across ${rows.length} runs`,
  `- **Cost per pair** at the configured \`LLM_PRICE_*\`: $${mean(normal.map((r) => r.costUsd)).toFixed(4)}${env.LLM_PROVIDER === 'nvidia' ? ' (NVIDIA free tier: prices are 0)' : ''}`,
  `- **Smart-tier calls**: ${rows.reduce((s, r) => s + r.smartCalls, 0)} (max 2 per pair: one judge per side; a fallback to mid is recorded per decision)`, '',
  '## Every pair', '',
  '| pair | people | expected | predicted | judges (confidence) | stop | turns | fallbacks | tokens | why it was labelled | transcript |', '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id}${r.run > 1 ? ` #${r.run}` : ''} | ${r.names.join(' × ')} | ${r.expected} | ${r.predicted === r.expected ? '✓ ' : '✖ '}${r.predicted} | ${r.verdicts.map((v, i) => `${v ?? '—'}${r.scores[i] != null ? ` (${r.scores[i]})` : ''}`).join(' / ')} | ${r.stopReason ?? '—'} | ${r.turns} | ${r.templateFallbacks ?? '—'}/${r.agentMsgs ?? '—'} | ${r.tokens.toLocaleString('en')} | ${r.reason} | [link](${r.file}) |`),
  '',
].filter((l) => l !== null).join('\n');
writeFileSync(new URL('results.md', DIR), `${md}\n`);
console.log(`\nWrote eval/results.md (${first.length} pairs).`);
await flushUsage();
await mongoose.disconnect();
