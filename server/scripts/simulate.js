// Plan 08: run an agent↔agent pre-date between two users, no pacing delays, and print what happened.
//   node scripts/simulate.js <emailA> <emailB> [--runs 1]
// Users listed in seed/personas.json are created (with their full knowledge graph) if missing.
// Each run starts from a fresh match: trust → brief → conversation → verdicts (+ wind-down), until it settles.
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { InboxItem } from '../src/models/InboxItem.js';
import { KgFact } from '../src/models/KgFact.js';
import { Match } from '../src/models/Match.js';
import { Message } from '../src/models/Message.js';
import { Usage } from '../src/models/Usage.js';
import { User } from '../src/models/User.js';
import { beliefUpdatesSettled } from '../src/services/agent/index.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { createMatch } from '../src/services/matches.js';
import { ensurePersona } from './lib/personas.js';

const args = process.argv.slice(2);
const emails = args.filter((a) => a.includes('@'));
const runs = Number(args[args.indexOf('--runs') + 1]) || 1;
if (emails.length !== 2) {
  console.error('usage: node scripts/simulate.js <emailA> <emailB> [--runs 1]');
  process.exit(1);
}

// No debounce, no typing delay. The 2-replies-per-minute loop guard still applies.
Object.assign(env, { AGENT_DEBOUNCE_MS: 0, AGENT_MIN_DELAY_MS: 0, AGENT_MAX_DELAY_MS: 0, DEMO_FAST: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = ['matched', 'trust_check', 'briefing', 'agent_chatting', 'evaluating'];

async function runOnce(a, b) {
  const old = await Match.findOne({ users: { $all: [a._id, b._id] } });
  if (old) {
    await Promise.all([Message.deleteMany({ matchId: old._id }), KgFact.deleteMany({ matchId: old._id }), InboxItem.deleteMany({ matchId: old._id }), Usage.deleteMany({ matchId: old._id })]);
    await old.deleteOne();
  }
  const names = { [a._id]: a.name, [b._id]: b.name };
  const t0 = Date.now();
  const match = await createMatch(a._id, b._id);

  let printed = 0, status = 'matched', lastStatus = '';
  while (LIVE.includes(status) && Date.now() - t0 < 45 * 60_000) {
    await sleep(2000);
    const m = await Match.findById(match._id).lean();
    status = m.status;
    if (status !== lastStatus) { console.log(`  [${Math.round((Date.now() - t0) / 1000)} s] status → ${status}`); lastStatus = status; }
    const msgs = await Message.find({ matchId: match._id }).sort({ createdAt: 1 }).skip(printed).lean();
    for (const msg of msgs) console.log(`  ${String(++printed).padStart(2)}. ${names[msg.senderId]} (${msg.authoredBy}): ${msg.text}`);
  }
  // Let in-flight belief updates finish before reading the agendas.
  for (let i = 0; i < 3; i++) { await sleep(2000); await beliefUpdatesSettled(); }
  const m = await Match.findById(match._id).lean();
  console.log(`\nStop reason: ${m.agentState?.stopReason ?? '(none: still ' + m.status + ')'}${m.agentState?.stopDetail ? ` — ${m.agentState.stopDetail.why}` : ''}`);
  console.log(`Messages: ${printed} in ${Math.round((Date.now() - t0) / 1000)} s`);
  for (const u of [a, b]) {
    const agenda = m.brief?.[String(u._id)]?.agenda ?? [];
    console.log(`\n${u.name}'s agenda:`);
    for (const x of agenda) console.log(`  ${x.status.padEnd(9)} p=${x.priority.toFixed(2)} conf=${(x.confidence ?? 0).toFixed(2)}  ${x.topic}`);
    const learned = await KgFact.find({ matchId: m._id, observerId: u._id, source: { $in: ['conversation', 'profile'] } }).lean();
    const raised = learned.filter((f) => f.evidence.length > 1).length;
    console.log(`  facts about the other: ${learned.length} (${learned.filter((f) => f.source === 'conversation').length} from chat, ${raised} confirmed more than once)`);
  }
  const messageIds = new Set((await Message.find({ matchId: m._id }, { _id: 1 }).lean()).map((x) => String(x._id)));
  for (const u of [a, b]) {
    const r = m.report?.[String(u._id)];
    if (!r) continue;
    const dims = Object.entries(r.dimensions).map(([k, d]) => `${k} ${d.score}/${d.confidence}`).join(', ');
    console.log(`\n${u.name}'s verdict: ${r.verdict.toUpperCase()} (score ${r.score}, confidence ${r.avgConfidence}, chemistry ${r.chemistry})\n  ${dims}\n  ${r.summary}`);
    for (const x of r.reasons) console.log(`  ✓ ${x.text}  [${x.messageIds.length} receipts${x.messageIds.every((id) => messageIds.has(id)) ? '' : ', SOME MISSING'}]`);
    for (const x of r.concerns) console.log(`  ⚠ ${x.text}  [${x.messageIds.length} receipts]`);
    for (const q of r.askYourself) console.log(`  ? ${q}`);
    if (r.icebreakers?.length) console.log(`  icebreakers: ${r.icebreakers.join(' | ')}`);
  }
  console.log(`\nFinal status: ${m.status}`);
  const inbox = await InboxItem.find({ matchId: m._id }).lean();
  if (inbox.length) console.log(`\nAsk-my-human items: ${inbox.map((i) => `${names[i.userId]}: "${i.question}"`).join(' | ')}`);
  if (m.agentState?.redFlags) console.log(`Red flags: ${JSON.stringify(m.agentState.redFlags)}`);

  await flushUsage();
  const usage = await Usage.aggregate([
    { $match: { matchId: m._id } },
    { $group: { _id: '$purpose', calls: { $sum: 1 }, smart: { $sum: { $cond: [{ $eq: ['$tier', 'smart'] }, 1, 0] } }, tokens: { $sum: { $add: ['$promptTokens', '$completionTokens'] } } } },
    { $sort: { tokens: -1 } },
  ]);
  const total = usage.reduce((s, u) => s + u.tokens, 0);
  console.log(`\nTokens: ${total} total across ${usage.reduce((s, u) => s + u.calls, 0)} calls (smart tier: ${usage.reduce((s, u) => s + u.smart, 0)} calls)`);
  for (const u of usage) console.log(`  ${u._id.padEnd(22)} ${String(u.calls).padStart(3)} calls  ${String(u.tokens).padStart(7)} tokens`);
  return { status: m.status, stopReason: m.agentState?.stopReason, messages: printed, tokens: total, verdicts: Object.values(m.report ?? {}).map((r) => r.verdict) };
}

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
try {
  const [a, b] = [await ensurePersona(emails[0]), await ensurePersona(emails[1])];
  await User.updateMany({ _id: { $in: [a._id, b._id] } }, { $set: { agentMode: 'auto' } });
  const results = [];
  for (let i = 1; i <= runs; i++) {
    console.log(`\n=== Run ${i}/${runs}: ${a.name} × ${b.name}`);
    results.push(await runOnce(a, b));
  }
  if (runs > 1) {
    const avg = (k) => Math.round(results.reduce((s, r) => s + r[k], 0) / runs);
    console.log(`\nAverage over ${runs} runs: ${avg('messages')} messages, ${avg('tokens')} tokens; stop reasons: ${results.map((r) => r.stopReason).join(', ')}`);
  }
} finally {
  await flushUsage();
  await mongoose.disconnect();
}
