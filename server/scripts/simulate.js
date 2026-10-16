// Plan 08/09: run an agent↔agent pre-date between two users, no pacing delays, and print what happened.
//   node scripts/simulate.js <emailA> <emailB> [--runs 1]
// Users listed in seed/personas.json are created (with their full knowledge graph) if missing.
// Each run starts from a fresh match: trust → brief → conversation → verdicts (+ wind-down), until it settles.
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { InboxItem } from '../src/models/InboxItem.js';
import { ChatEvent } from '../src/models/ChatEvent.js';
import { Conversation } from '../src/models/Conversation.js';
import { KgFact } from '../src/models/KgFact.js';
import { Message } from '../src/models/Message.js';
import { User } from '../src/models/User.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { ensurePersona } from './lib/personas.js';
import { NO_PACING, runPair } from './lib/runPair.js';

const args = process.argv.slice(2);
const emails = args.filter((a) => a.includes('@'));
const runs = Number(args[args.indexOf('--runs') + 1]) || 1;
if (emails.length !== 2) {
  console.error('usage: node scripts/simulate.js <emailA> <emailB> [--runs 1]');
  process.exit(1);
}
Object.assign(env, NO_PACING); // the 2-replies-per-minute loop guard still applies

async function runOnce(a, b) {
  const { match: m, messages, usage, seconds, tokens, smartCalls } = await runPair(a, b);
  const names = { [a._id]: a.name, [b._id]: b.name };
  console.log(`\nStop reason: ${m.agentState?.stopReason ?? '(none: still ' + m.status + ')'}${m.agentState?.stopDetail ? ` — ${m.agentState.stopDetail.why}` : ''}`);
  console.log(`Messages: ${messages.length} in ${seconds} s`);
  const conv = await Conversation.findOne({ matchId: m._id }).sort({ round: -1 }).lean();
  console.log(`Conversation ended by: ${conv?.endedBy ?? '—'} (seed ${conv?.seed})`);
  const full = await Message.find({ matchId: m._id }).sort({ createdAt: 1 }).lean();
  console.log('\nTranscript [act plan · checks]:');
  for (const [i, x] of full.entries()) {
    const p = x.actPlan;
    const plan = !p ? '' : p.honestAI ? 'honest-AI' : p.fromBrief ? 'brief opener'
      : `~${p.targetWords}w ${p.language?.primary}${p.language?.codeSwitch ? `+${p.language.secondary}` : ''}${p.askBack ? ' ?' : ''}${p.emoji ? ` ${p.emoji}` : ''}${p.mustDisagree ? ' DISAGREE' : ''}${p.topic ? ` →${p.topic.kind}:${p.topic.text}` : ''}${p.end ? ` END:${p.end}` : ''} i=${p.interest?.toFixed?.(2) ?? '–'}`;
    const c = x.checks;
    const chk = !c ? '' : [c.regenerated && 'regen', c.dropped?.length && `dropped ${c.dropped.length}`, c.leak?.length && 'LEAK', c.stance?.length && 'conceded'].filter(Boolean).join(', ');
    console.log(`${String(i + 1).padStart(2)}. ${names[x.senderId]}: ${x.text}${plan ? `\n      [${plan}${chk ? ` · ${chk}` : ''}]` : ''}`);
  }
  for (const u of [a, b]) {
    console.log(`\n${u.name}'s agenda:`);
    for (const x of m.brief?.[String(u._id)]?.agenda ?? []) console.log(`  ${x.status.padEnd(9)} p=${x.priority.toFixed(2)}  ${x.topic}${x.dealbreaker ? ' (dealbreaker)' : ''}`);
    const notes = await KgFact.find({ matchId: m._id, observerId: u._id, source: 'agent_observed' }).lean();
    console.log(`  notes about the other (verbatim-quoted): ${notes.length}${notes.length ? ` e.g. ${notes.slice(0, 4).map((f) => `${f.predicate}: ${f.object}`).join(' | ')}` : ''}`);
    const events = await ChatEvent.find({ matchId: m._id, observerId: u._id }).lean();
    console.log(`  chat moments: ${JSON.stringify(events.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + 1 }), {}))}`);
  }
  const ids = new Set(messages.map((x) => String(x._id)));
  for (const u of [a, b]) {
    const r = m.report?.[String(u._id)];
    if (!r) continue;
    const dims = Object.entries(r.dimensions).map(([k, d]) => `${k} ${d.score}/${d.confidence}`).join(', ');
    console.log(`\n${u.name}'s verdict: ${r.verdict.toUpperCase()} (score ${r.score}, confidence ${r.avgConfidence}, chemistry ${r.chemistry})\n  ${dims}\n  ${r.summary}`);
    for (const x of r.reasons) console.log(`  ✓ ${x.text}  [${x.messageIds.length} receipts${x.messageIds.every((id) => ids.has(id)) ? '' : ', SOME MISSING'}]`);
    for (const x of r.concerns) console.log(`  ⚠ ${x.text}  [${x.messageIds.length} receipts]`);
    for (const q of r.askYourself) console.log(`  ? ${q}`);
    if (r.icebreakers?.length) console.log(`  icebreakers: ${r.icebreakers.join(' | ')}`);
  }
  console.log(`\nFinal status: ${m.status}`);
  const inbox = await InboxItem.find({ matchId: m._id }).lean();
  if (inbox.length) console.log(`\nAsk-my-human items: ${inbox.map((i) => `${names[i.userId]}: "${i.question}"`).join(' | ')}`);
  if (m.agentState?.redFlags) console.log(`Red flags: ${JSON.stringify(m.agentState.redFlags)}`);
  console.log(`\nTokens: ${tokens} total across ${usage.reduce((s, u) => s + u.calls, 0)} calls (smart tier: ${smartCalls} calls)`);
  for (const u of usage) console.log(`  ${u._id.padEnd(22)} ${String(u.calls).padStart(3)} calls  ${String(u.tokens).padStart(7)} tokens`);
  return { status: m.status, stopReason: m.agentState?.stopReason, messages: messages.length, tokens };
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
