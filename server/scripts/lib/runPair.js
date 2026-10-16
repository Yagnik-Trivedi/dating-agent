// One full pipeline run between two users, used by simulate.js and eval.js: fresh match → trust → brief →
// conversation → verdicts (+ wind-down), until the match settles. Callers set the no-pacing env first.
import { InboxItem } from '../../src/models/InboxItem.js';
import { KgFact } from '../../src/models/KgFact.js';
import { Match } from '../../src/models/Match.js';
import { Message } from '../../src/models/Message.js';
import { Usage } from '../../src/models/Usage.js';
import { beliefUpdatesSettled } from '../../src/services/agent/index.js';
import { flushUsage } from '../../src/services/llm/budget.js';
import { createMatch } from '../../src/services/matches.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = ['matched', 'trust_check', 'briefing', 'agent_chatting', 'evaluating'];
export const NO_PACING = { AGENT_DEBOUNCE_MS: 0, AGENT_MIN_DELAY_MS: 0, AGENT_MAX_DELAY_MS: 0, DEMO_FAST: false };

/** → { match (final, lean), messages, seconds, usage: [{ _id: purpose, calls, smart, tokens }], tokens, smartCalls } */
export async function runPair(a, b, { log = console.log, timeoutMin = 45 } = {}) {
  const old = await Match.findOne({ users: { $all: [a._id, b._id] } });
  if (old) {
    await Promise.all([Message.deleteMany({ matchId: old._id }), KgFact.deleteMany({ matchId: old._id }), InboxItem.deleteMany({ matchId: old._id }), Usage.deleteMany({ matchId: old._id })]);
    await old.deleteOne();
  }
  const names = { [a._id]: a.name, [b._id]: b.name };
  const t0 = Date.now();
  const created = await createMatch(a._id, b._id);

  let printed = 0, status = 'matched', lastStatus = '';
  while (LIVE.includes(status) && Date.now() - t0 < timeoutMin * 60_000) {
    await sleep(2000);
    status = (await Match.findById(created._id, { status: 1 }).lean()).status;
    if (status !== lastStatus) { log(`  [${Math.round((Date.now() - t0) / 1000)} s] status → ${status}`); lastStatus = status; }
    const msgs = await Message.find({ matchId: created._id }).sort({ createdAt: 1 }).skip(printed).lean();
    for (const msg of msgs) log(`  ${String(++printed).padStart(2)}. ${names[msg.senderId]} (${msg.authoredBy}): ${msg.text}`);
  }
  for (let i = 0; i < 3; i++) { await sleep(2000); await beliefUpdatesSettled(); } // in-flight belief updates
  await flushUsage();
  const [match, messages, usage] = await Promise.all([
    Match.findById(created._id).lean(),
    Message.find({ matchId: created._id }).sort({ createdAt: 1 }).lean(),
    Usage.aggregate([
      { $match: { matchId: created._id } },
      { $group: { _id: '$purpose', calls: { $sum: 1 }, smart: { $sum: { $cond: [{ $eq: ['$tier', 'smart'] }, 1, 0] } }, tokens: { $sum: { $add: ['$promptTokens', '$completionTokens'] } } } },
      { $sort: { tokens: -1 } },
    ]),
  ]);
  return {
    match, messages, usage,
    seconds: Math.round((Date.now() - t0) / 1000),
    tokens: usage.reduce((s, u) => s + u.tokens, 0),
    smartCalls: usage.reduce((s, u) => s + u.smart, 0),
  };
}
