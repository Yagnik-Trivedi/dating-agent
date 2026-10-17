// Plan 11 B3: the two metrics that need an offline LLM judge (eval only, never in the app), from SAVED conversations:
// - unsupported self-claim rate: every claim an agent made about its own user, labelled against that user's graph
// - agreement rate: each agent reply labelled agree / disagree / neutral vs the message before it
//   node scripts/eval/llm-metrics.js [--tag rules-on] --yes   → eval/results/llm-metrics[-tag].json + .md
// Cost: one mid-tier call per side (claims) + one per conversation (agreement), ~3 calls per conversation.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../../src/config/env.js';
import { KgFact } from '../../src/models/KgFact.js';
import { Match } from '../../src/models/Match.js';
import { MatchDecision } from '../../src/models/MatchDecision.js';
import { Message } from '../../src/models/Message.js';
import { User } from '../../src/models/User.js';
import { flushUsage } from '../../src/services/llm/budget.js';
import { chatJSON } from '../../src/services/llm/client.js';
import { items } from '../../src/utils/zodItems.js';
import * as prompts from './prompts.js';

const args = process.argv.slice(2);
const tag = args.includes('--tag') ? args[args.indexOf('--tag') + 1] : null;
const ROOT = new URL('../../', import.meta.url);
const raw = JSON.parse(readFileSync(new URL(`eval/raw${tag ? `-${tag}` : ''}.json`, ROOT), 'utf8')); // --tag rules-off → eval/raw-rules-off.json
const pairs = JSON.parse(readFileSync(new URL('seed/pairs.json', ROOT), 'utf8'));
const runs = Object.values(raw).filter((r) => r.run === 1 && r.turns > 0);
console.log(`${runs.length} conversation(s), ~${runs.length * 3} mid-tier calls.`);
if (!args.includes('--yes')) process.exit(0);

const claimSchema = z.object({ claims: items(z.object({ text: z.string(), label: z.enum(['supported', 'unsupported', 'contradicts']), fact: z.string().nullable().catch(null) })) });
const labelSchema = z.object({ labels: items(z.object({ n: z.coerce.number(), label: z.enum(['agree', 'disagree', 'neutral']) })) });
const call = (schema, messages, purpose) => chatJSON({ tier: 'mid', reasoning: false, temperature: 0, schema, purpose, messages });

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const out = [];
for (const r of runs) {
  const pair = pairs.find((p) => p.id === r.id);
  const users = await User.find({ email: { $in: [pair.a, pair.b] } }, { name: 1 }).lean();
  const match = await Match.findOne({ users: { $all: users.map((u) => u._id) } }).lean();
  if (!match) continue;
  const messages = await Message.find({ matchId: match._id }).sort({ createdAt: 1 }).lean();
  const name = (id) => users.find((u) => String(u._id) === String(id))?.name;
  const row = { pair: r.id, claims: [], labels: [], decisions: [] };
  for (const u of users) {
    const mine = messages.filter((m) => m.authoredBy === 'agent' && String(m.senderId) === String(u._id)).map((m) => m.text);
    if (!mine.length) continue;
    const facts = (await KgFact.find({ subjectId: u._id, observerId: null, predicate: { $nin: ['trait', 'style'] } }, { predicate: 1, object: 1, polarity: 1 }).lean())
      .map((f) => `- ${f.predicate}${f.polarity === -1 ? ' (NOT)' : ''}: ${f.object}`);
    const res = await call(claimSchema, prompts.claimAudit({ name: u.name, facts, messages: mine }), 'eval-claim-audit').catch((e) => (console.error(`claims ${r.id}/${u.name}: ${e.message}`), { claims: [] }));
    row.claims.push(...res.claims.map((c) => ({ ...c, speaker: u.name })));
  }
  const lines = messages.map((m) => `${name(m.senderId)}: ${m.text}`);
  const res = await call(labelSchema, prompts.agreementLabels({ lines }), 'eval-agreement').catch((e) => (console.error(`agreement ${r.id}: ${e.message}`), { labels: [] }));
  row.labels = res.labels.filter((l) => l.n >= 2 && messages[l.n - 1]?.authoredBy === 'agent').map((l) => l.label);
  row.decisions = (await MatchDecision.find({ matchId: match._id }, { decision: 1 }).lean()).map((d) => d.decision);
  out.push(row);
  console.log(`  ${r.id}: ${row.claims.length} claims (${row.claims.filter((c) => c.label !== 'supported').length} not supported), ${row.labels.length} replies labelled`);
}
await flushUsage();
await mongoose.disconnect();

const all = out.flatMap((r) => r.claims);
const bad = all.filter((c) => c.label !== 'supported');
const labels = out.flatMap((r) => r.labels);
const decisions = out.flatMap((r) => r.decisions);
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—');
const summary = {
  tag, conversations: out.length, claims: all.length, unsupported: all.filter((c) => c.label === 'unsupported').length, contradicts: all.filter((c) => c.label === 'contradicts').length,
  replies: labels.length, agree: labels.filter((l) => l === 'agree').length, disagree: labels.filter((l) => l === 'disagree').length,
  judgeYes: decisions.filter((d) => d === 'yes').length, judges: decisions.length,
};
const md = [
  `# LLM-judged metrics${tag ? ` (${tag})` : ''}`, '',
  `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`node scripts/eval/llm-metrics.js\` (offline mid-tier judge, eval only) over ${out.length} saved conversations.`, '',
  `- **Unsupported self-claim rate**: ${bad.length}/${all.length} = ${pct(bad.length, all.length)} (${summary.unsupported} unsupported, ${summary.contradicts} contradicting the speaker's own graph)`,
  `- **Agreement rate**: ${pct(summary.agree, labels.length)} of agent replies agree, ${pct(summary.disagree, labels.length)} disagree, ${pct(labels.length - summary.agree - summary.disagree, labels.length)} neutral (${labels.length} replies)`,
  `- **Judge approval rate**: ${pct(summary.judgeYes, decisions.length)} of judge decisions are "yes" (${decisions.length} decisions)`, '',
  '## Claims that were not supported', '',
  ...bad.map((c) => `- ${c.speaker} (${out.find((r) => r.claims.includes(c)).pair}): "${c.text}" → **${c.label}**${c.fact ? ` (${c.fact})` : ''}`), '',
].join('\n');
mkdirSync(new URL('eval/results/', ROOT), { recursive: true });
writeFileSync(new URL(`eval/results/llm-metrics${tag ? `-${tag}` : ''}.json`, ROOT), `${JSON.stringify({ summary, rows: out }, null, 2)}\n`);
writeFileSync(new URL(`eval/results/llm-metrics${tag ? `-${tag}` : ''}.md`, ROOT), `${md}\n`);
console.log(`\n${md}`);
