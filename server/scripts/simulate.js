// Plan 08: run an agent↔agent pre-date between two users, no pacing delays, and print what happened.
//   node scripts/simulate.js <emailA> <emailB> [--runs 1]
// Users listed in seed/personas.json are created (with their full knowledge graph) if missing.
// Each run starts from a fresh match: trust → brief → conversation, until the stop rule ends it.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { InboxItem } from '../src/models/InboxItem.js';
import { KgFact } from '../src/models/KgFact.js';
import { Match } from '../src/models/Match.js';
import { Message } from '../src/models/Message.js';
import { Profile } from '../src/models/Profile.js';
import { Usage } from '../src/models/Usage.js';
import { User } from '../src/models/User.js';
import { beliefUpdatesSettled } from '../src/services/agent/index.js';
import { buildUserGraph } from '../src/services/kg/buildUserGraph.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { createMatch } from '../src/services/matches.js';

const args = process.argv.slice(2);
const emails = args.filter((a) => a.includes('@'));
const runs = Number(args[args.indexOf('--runs') + 1]) || 1;
if (emails.length !== 2) {
  console.error('usage: node scripts/simulate.js <emailA> <emailB> [--runs 1]');
  process.exit(1);
}

// No debounce, no typing delay. The 2-replies-per-minute loop guard still applies.
Object.assign(env, { AGENT_DEBOUNCE_MS: 0, AGENT_MIN_DELAY_MS: 0, AGENT_MAX_DELAY_MS: 0, DEMO_FAST: false });
const personas = JSON.parse(readFileSync(new URL('../seed/personas.json', import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = ['matched', 'trust_check', 'briefing', 'agent_chatting'];

async function ensureUser(email) {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  const p = personas.find((x) => x.email === email);
  if (!p) throw new Error(`${email} not found and not in seed/personas.json`);
  console.log(`creating ${p.profile.name} (${email}) and building their graph…`);
  const user = await User.create({
    email, passwordHash: await bcrypt.hash(randomUUID(), 10), name: p.profile.name, consentAgent: true, consentAt: new Date(),
    agentMode: p.agentMode, isSeed: true, onboarding: { status: 'processing', answers: p.answers },
  });
  await Profile.create({ userId: user._id, ...p.profile });
  await buildUserGraph(user._id);
  return user;
}

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
  const inbox = await InboxItem.find({ matchId: m._id }).lean();
  if (inbox.length) console.log(`\nAsk-my-human items: ${inbox.map((i) => `${names[i.userId]}: "${i.question}"`).join(' | ')}`);
  if (m.agentState?.redFlags) console.log(`Red flags: ${JSON.stringify(m.agentState.redFlags)}`);

  await flushUsage();
  const usage = await Usage.aggregate([
    { $match: { matchId: m._id } },
    { $group: { _id: '$purpose', calls: { $sum: 1 }, tokens: { $sum: { $add: ['$promptTokens', '$completionTokens'] } } } },
    { $sort: { tokens: -1 } },
  ]);
  const total = usage.reduce((s, u) => s + u.tokens, 0);
  console.log(`\nTokens: ${total} total across ${usage.reduce((s, u) => s + u.calls, 0)} calls`);
  for (const u of usage) console.log(`  ${u._id.padEnd(22)} ${String(u.calls).padStart(3)} calls  ${String(u.tokens).padStart(7)} tokens`);
  return { status: m.status, stopReason: m.agentState?.stopReason, messages: printed, tokens: total };
}

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
try {
  const [a, b] = [await ensureUser(emails[0]), await ensureUser(emails[1])];
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
