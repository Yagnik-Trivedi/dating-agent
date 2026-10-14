import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { Usage } from '../../models/Usage.js';

export class BudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetExceededError';
    this.status = 429;
    this.code = 'BUDGET_EXCEEDED';
    this.expose = true;
  }
}

const REFRESH_MS = 5 * 60_000;
const today = () => new Date().toISOString().slice(0, 10); // UTC day
const fresh = () => ({ day: today(), refreshedAt: 0, tokens: 0, smartCalls: 0, perUser: new Map() });

let state = fresh();
const pending = new Set();

function rollover() {
  if (state.day !== today()) state = fresh();
}

// Replace in-memory counters with today's totals from Mongo (other instances / restarts).
async function refresh() {
  rollover();
  if (Date.now() - state.refreshedAt < REFRESH_MS || mongoose.connection.readyState !== 1) return;
  state.refreshedAt = Date.now();
  const rows = await Usage.aggregate([
    { $match: { at: { $gte: new Date(`${state.day}T00:00:00Z`) } } },
    { $group: { _id: { userId: '$userId', tier: '$tier' }, calls: { $sum: 1 }, tokens: { $sum: { $add: ['$promptTokens', '$completionTokens'] } } } },
  ]);
  const next = { ...fresh(), refreshedAt: state.refreshedAt };
  for (const r of rows) {
    next.tokens += r.tokens;
    if (r._id.tier === 'smart') next.smartCalls += r.calls;
    if (r._id.userId) {
      const k = String(r._id.userId);
      next.perUser.set(k, (next.perUser.get(k) ?? 0) + r.calls);
    }
  }
  state = next;
}

/** Throws BudgetExceededError if this call would exceed a daily limit. */
// ponytail: checked before the call, counted after, so bursts of concurrent calls can overshoot slightly.
export async function checkBudget({ tier, userId }) {
  await refresh().catch((err) => console.error(`budget refresh failed: ${err.message}`));
  if (state.tokens >= env.LLM_DAILY_TOKENS_GLOBAL) throw new BudgetExceededError('Agent paused — daily limit reached (global tokens)');
  if (tier === 'smart' && state.smartCalls >= env.LLM_SMART_DAILY_CALLS) throw new BudgetExceededError('Agent paused — daily limit reached (verdicts)');
  if (userId && (state.perUser.get(String(userId)) ?? 0) >= env.LLM_DAILY_CALLS_PER_USER) {
    throw new BudgetExceededError('Agent paused — daily limit reached');
  }
}

/** Count a call in memory and persist it, fire-and-forget. Never throws. */
export function recordUsage(doc) {
  rollover();
  state.tokens += (doc.promptTokens ?? 0) + (doc.completionTokens ?? 0);
  if (doc.tier === 'smart') state.smartCalls++;
  if (doc.userId) {
    const k = String(doc.userId);
    state.perUser.set(k, (state.perUser.get(k) ?? 0) + 1);
  }
  const p = Usage.create({ at: new Date(), ...doc })
    .catch((err) => console.error(`usage log failed (${doc.purpose}): ${err.message}`))
    .finally(() => pending.delete(p));
  pending.add(p);
}

/** Wait for in-flight usage writes (scripts call this before disconnecting). */
export const flushUsage = () => Promise.all(pending);

export async function usageToday() {
  const since = new Date(`${today()}T00:00:00Z`);
  const byPurposeTier = await Usage.aggregate([
    { $match: { at: { $gte: since } } },
    {
      $group: {
        _id: { purpose: '$purpose', tier: '$tier' },
        calls: { $sum: 1 },
        failed: { $sum: { $cond: ['$ok', 0, 1] } },
        promptTokens: { $sum: '$promptTokens' },
        completionTokens: { $sum: '$completionTokens' },
        avgLatencyMs: { $avg: '$latencyMs' },
      },
    },
    { $sort: { calls: -1 } },
  ]);
  const rows = byPurposeTier.map(({ _id, avgLatencyMs, ...r }) => ({ ..._id, ...r, avgLatencyMs: Math.round(avgLatencyMs ?? 0) }));
  return {
    day: today(),
    totals: {
      calls: rows.reduce((s, r) => s + r.calls, 0),
      tokens: rows.reduce((s, r) => s + r.promptTokens + r.completionTokens, 0),
      smartCalls: rows.filter((r) => r.tier === 'smart').reduce((s, r) => s + r.calls, 0),
    },
    limits: {
      dailyCallsPerUser: env.LLM_DAILY_CALLS_PER_USER,
      dailyTokensGlobal: env.LLM_DAILY_TOKENS_GLOBAL,
      smartDailyCalls: env.LLM_SMART_DAILY_CALLS,
    },
    byPurposeTier: rows,
  };
}
