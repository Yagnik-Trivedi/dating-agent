// Plan 31 A10 from SAVED eval transcripts (no DB, no LLM): the baseline for SN vs human.
//   node scripts/eval/convo-metrics.js [--tags s1-merged-lean,full]   → eval/results/convo-metrics.md
// Each tag reads eval/raw-<tag>.json (run 1 of each pair) and its transcript files. Saved transcripts carry no agenda or
// act plan, so "about something settled" and "unprompted stories" need a live run (metrics.js); here "re-asked" counts
// matching questions about something the other side had already stated, and "with a setup" is a heuristic (≥ 15 words
// before the question). unbridgedQuestionRate uses lexical overlap here (see lib/convoMetrics.js).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { convoMetrics, parseTranscript, summarise } from './lib/convoMetrics.js';

const ROOT = new URL('../../', import.meta.url);
const arg = process.argv.indexOf('--tags');
const tags = arg > 0 ? process.argv[arg + 1].split(',') : ['s1-merged-lean', 's1-split', 'full'];
const f2 = (x) => (x == null ? '—' : Number.isFinite(x) ? x.toFixed(2) : '—');

const rows = [];
for (const tag of tags) {
  const file = new URL(`eval/raw-${tag}.json`, ROOT);
  if (!existsSync(file)) { console.warn(`no eval/raw-${tag}.json`); continue; }
  const chats = [];
  for (const r of Object.values(JSON.parse(readFileSync(file, 'utf8'))).filter((x) => x.run === 1 && x.file)) {
    const t = new URL(`eval/${r.file}`, ROOT);
    if (!existsSync(t)) continue;
    const lines = parseTranscript(readFileSync(t, 'utf8'));
    if (lines.some((l) => l.agent)) chats.push({ id: r.id, ...convoMetrics(lines) });
  }
  rows.push({ tag, chats, s: summarise(chats) });
}

const md = [
  '# Plan 31 conversation metrics (saved transcripts)', '',
  `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`node scripts/eval/convo-metrics.js\`. Targets (plan 31 A10): matching questions per chat 0–1, re-asked 0, with a setup 0, question rate ≤ 0.35, back-to-back 0, unbridgedQuestionRate falls vs SN, topic changes while they tell/vent 0.`, '',
  '| run | chats | agent msgs | matching ?s per chat (max) | re-asked | with a setup | question rate | back-to-back | unbridged rate | topic change while telling | length ratio (median) |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(({ tag, s }) => `| ${tag} | ${s.chats} | ${s.agentMsgs} | ${f2(s.matchingPerChat.reduce((a, b) => a + b, 0) / (s.chats || 1))} (${s.matchingMax}) | ${s.matchingReasked} | ${s.matchingWithSetup} | ${f2(s.questionRate)} | ${s.backToBack} | ${f2(s.unbridgedQuestionRate)} | ${s.topicChangesWhileTelling} | ${f2(s.lengthRatio)} |`),
  '', ...rows.flatMap(({ tag, chats }) => [`## ${tag}`, '', '| pair | msgs | matching ?s | re-asked | question rate | back-to-back | unbridged |', '|---|---|---|---|---|---|---|',
    ...chats.map((c) => `| ${c.id} | ${c.agentMsgs} | ${c.matching} | ${c.matchingReasked} | ${f2(c.questions / c.agentMsgs)} | ${c.backToBack} | ${c.unbridged} |`), '']),
].join('\n');
mkdirSync(new URL('eval/results/', ROOT), { recursive: true });
writeFileSync(new URL('eval/results/convo-metrics.md', ROOT), `${md}\n`);
console.log(md);
