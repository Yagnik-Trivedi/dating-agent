// Speed report from Usage records (plan 30 S1). Read-only: it never writes to the database it reads.
//   node scripts/speed-report.js --out eval/results/speed-before.md [--user <id>] [--match <id>] [--label before]
// Without --user/--match it takes the most recent real (non-seed) onboarding build, and the most recent agent chat
// with a judge (a finished chat). Usage has one row per logical call, written when the call ends; `latencyMs`
// includes our retries. Retry and 429 counts live only in the server log, so a call longer than its tier's
// per-attempt timeout is reported as "≥ 1 retry or timeout".
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Match } from '../src/models/Match.js';
import { Message } from '../src/models/Message.js';
import { Usage } from '../src/models/Usage.js';
import { User } from '../src/models/User.js';

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const ONBOARDING = /^(onboarding-|concept|voice-language-tags)/;
const TIMEOUT_MS = { fast: 90_000, mid: 120_000, smart: 180_000, embed: 60_000, vision: 60_000 }; // llm/client.js
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const sec = (ms) => (ms == null ? '—' : ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`);
const span = (rows) => rows.length ? Math.max(...rows.map((r) => +r.at)) - Math.min(...rows.map((r) => +r.at - (r.latencyMs ?? 0))) : 0;

function table(rows) {
  const by = new Map();
  for (const r of rows) by.set(`${r.tier}|${r.purpose}`, [...(by.get(`${r.tier}|${r.purpose}`) ?? []), r]);
  const lines = ['| Purpose | Tier | Calls | p50 | p95 | Max | Failed (all retries used) | Longer than one attempt |', '|---|---|---|---|---|---|---|---|'];
  for (const [k, rs] of [...by].sort((a, b) => b[1].reduce((s, r) => s + (r.latencyMs ?? 0), 0) - a[1].reduce((s, r) => s + (r.latencyMs ?? 0), 0))) {
    const [tier, purpose] = k.split('|'), lat = rs.map((r) => r.latencyMs ?? 0);
    lines.push(`| ${purpose} | ${tier} | ${rs.length} | ${sec(pct(lat, 0.5))} | ${sec(pct(lat, 0.95))} | ${sec(Math.max(...lat))} | ${rs.filter((r) => r.ok === false).length} | ${rs.filter((r) => (r.latencyMs ?? 0) > (TIMEOUT_MS[tier] ?? Infinity)).length} |`);
  }
  return lines.join('\n');
}

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
const seedIds = new Set((await User.find({ isSeed: true }, { _id: 1 }).lean()).map((u) => String(u._id)));

// Onboarding build: one user's onboarding rows.
let userId = arg('user');
if (!userId) {
  const builds = await Usage.aggregate([{ $match: { purpose: ONBOARDING, userId: { $ne: null } } }, { $group: { _id: '$userId', last: { $max: '$at' }, n: { $sum: 1 } } }, { $sort: { last: -1 } }]);
  userId = String((builds.find((b) => !seedIds.has(String(b._id))) ?? builds[0])?._id ?? '');
}
// Bounded by onboarding.completedAt: mid-chat concept lookups are also logged as "concept".
const done = userId ? await User.findById(userId, { 'onboarding.completedAt': 1 }).lean() : null;
const doneAt = done?.onboarding?.completedAt;
const ob = userId ? await Usage.find({ userId, purpose: ONBOARDING, ...(doneAt && { at: { $lte: new Date(+doneAt + 5000) } }) }).sort({ at: 1 }).lean() : [];
const obSeed = seedIds.has(userId);

// Agent chat: one match's rows (perceive/reply/… up to and including the judges).
let matchId = arg('match');
if (!matchId) matchId = String((await Usage.findOne({ purpose: 'judge', matchId: { $ne: null } }).sort({ at: -1 }).lean())?.matchId ?? '');
const chat = matchId ? await Usage.find({ matchId }).sort({ at: 1 }).lean() : [];
const match = matchId ? await Match.findById(matchId, { createdAt: 1, status: 1 }).lean() : null;
const msgs = matchId ? await Message.find({ matchId }, { createdAt: 1, authoredBy: 1 }).sort({ createdAt: 1 }).lean() : [];
const agentMsgs = msgs.filter((m) => m.authoredBy === 'agent');
const firstMsgAfterMatch = match && msgs[0] ? +msgs[0].createdAt - +match.createdAt : null;
const chatWall = msgs.length > 1 ? +msgs.at(-1).createdAt - +msgs[0].createdAt : null;
const gaps = agentMsgs.slice(1).map((m, i) => +m.createdAt - +agentMsgs[i].createdAt);

const allRows = await Usage.find({ tier: { $ne: 'search' } }, { at: 1, tier: 1, purpose: 1, latencyMs: 1, ok: 1 }).sort({ at: 1 }).lean();
const models = await Usage.aggregate([{ $match: { tier: { $ne: 'search' } } }, { $group: { _id: { provider: '$provider', tier: '$tier', model: '$model' }, n: { $sum: 1 } } }, { $sort: { '_id.tier': 1 } }]);
const label = arg('label') ?? 'before';
const md = `# Speed ${label} (plan 30 S1)

Generated ${new Date().toISOString().slice(0, 16)} UTC by \`scripts/speed-report.js\`, read-only, from the \`Usage\` records of the database in \`MONGODB_URI\`.

**Provider and models seen in Usage** (no keys):
${models.map((m) => `- ${m._id.tier}: ${m._id.provider ?? '?'} \`${m._id.model ?? '—'}\` (${m.n} calls)`).join('\n')}

**Caveats:** Usage has one row per logical call, written when it ends, and \`latencyMs\` includes our retries. Retries and 429s are logged only by the server. A **failed** call used all 4 attempts: with 2 + 4 + 8 s of backoff, a run of quick 429/5xx answers fails after ~15–17 s. "Longer than one attempt" counts calls longer than one attempt's timeout (fast 90 s, mid 120 s, smart 180 s, embed 60 s). Wall time = first call start → last call end.

## Onboarding build

User \`${userId || '—'}\`${obSeed ? ' (a seed persona: seeding runs the same build)' : ''}, build finished ${doneAt?.toISOString().slice(0, 19).replace('T', ' ') ?? '—'} UTC: **${ob.length} calls**, wall time **${sec(span(ob))}**; the sum of call latencies is ${sec(ob.reduce((s, r) => s + (r.latencyMs ?? 0), 0))}, so the calls overlap ${span(ob) ? (ob.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / span(ob)).toFixed(1) : '—'}×.

${table(ob)}

## Agent chat

Match \`${matchId || '—'}\` (status \`${match?.status ?? '—'}\`): **${chat.length} calls**, LLM wall time **${sec(span(chat))}**.

- Messages: ${msgs.length} (${agentMsgs.length} by agents). Sum of agent-* call latencies per agent message: ${sec(agentMsgs.length ? chat.filter((r) => /^agent-/.test(r.purpose)).reduce((s, r) => s + (r.latencyMs ?? 0), 0) / agentMsgs.length : null)}; the rest of the gap is pacing and waiting.
- Match → first message: **${sec(firstMsgAfterMatch)}**; first → last message: **${sec(chatWall)}**.
- Gap between agent messages: p50 **${sec(pct(gaps, 0.5))}**, p95 ${sec(pct(gaps, 0.95))}, max ${sec(gaps.length ? Math.max(...gaps) : null)}.

${table(chat)}

## All calls in this database

${allRows.length} calls from ${allRows[0]?.at.toISOString().slice(0, 16) ?? '—'} to ${allRows.at(-1)?.at.toISOString().slice(0, 16) ?? '—'} UTC (onboarding, seeding, chats and judges together). Failed: ${allRows.filter((r) => r.ok === false).length} (${allRows.length ? Math.round((100 * allRows.filter((r) => r.ok === false).length) / allRows.length) : 0}%).

${table(allRows)}
`;
const out = arg('out');
if (out) writeFileSync(out, md);
console.log(md);
await mongoose.disconnect();
