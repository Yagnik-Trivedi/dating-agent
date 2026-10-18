import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { Usage } from '../../models/Usage.js';
import { User } from '../../models/User.js';

export class BudgetExceededError extends Error {
  constructor(message, code = 'BUDGET_EXCEEDED') {
    super(message);
    this.name = 'BudgetExceededError';
    this.status = 429;
    this.code = code;
    this.expose = true;
  }
}

const REFRESH_MS = 5 * 60_000;
const today = () => new Date().toISOString().slice(0, 10); // UTC day
// exempt: seed accounts skip the per-user cap (shared by every judge who matches them) but count toward the global one.
const fresh = () => ({ day: today(), refreshedAt: 0, tokens: 0, smartCalls: 0, perUser: new Map(), exempt: new Set() });

let state = fresh();
// All-time spend. `loaded` = we have read the total from Mongo at least once in this process.
const spend = { usd: 0, loaded: false };
const pending = new Set();

/** USD per 1M tokens for a tier's model, from LLM_PRICE_<TIER>. */
export const priceFor = (tier) => env[`LLM_PRICE_${tier.toUpperCase()}`] ?? { input: 0, output: 0 };
export const costOf = (tier, promptTokens = 0, completionTokens = 0) => {
  const p = priceFor(tier);
  return (promptTokens * p.input + completionTokens * p.output) / 1e6;
};
const pricesActive = () => ['fast', 'mid', 'smart', 'embed', 'vision'].some((t) => priceFor(t).input > 0 || priceFor(t).output > 0);

function rollover() {
  if (state.day !== today()) state = { ...fresh(), refreshedAt: 0 };
}

// Replace in-memory counters with today's totals + all-time spend from Mongo (other instances / restarts).
export async function refresh({ force = false } = {}) {
  rollover();
  if ((!force && Date.now() - state.refreshedAt < REFRESH_MS) || mongoose.connection.readyState !== 1) return;
  state.refreshedAt = Date.now();
  const [rows, [all], seeds] = await Promise.all([
    Usage.aggregate([
      { $match: { at: { $gte: new Date(`${state.day}T00:00:00Z`) } } },
      { $group: { _id: { userId: '$userId', tier: '$tier' }, calls: { $sum: 1 }, tokens: { $sum: { $add: ['$promptTokens', '$completionTokens'] } } } },
    ]),
    // ponytail: full scan of `usage` every 5 min; keep a running counter doc if the collection grows large.
    Usage.aggregate([{ $group: { _id: null, usd: { $sum: '$costUsd' } } }]),
    User.find({ isSeed: true }, { _id: 1 }).lean(),
  ]);
  const next = { ...fresh(), refreshedAt: state.refreshedAt, exempt: new Set(seeds.map((u) => String(u._id))) };
  for (const r of rows) {
    next.tokens += r.tokens;
    if (r._id.tier === 'smart') next.smartCalls += r.calls;
    if (r._id.userId) {
      const k = String(r._id.userId);
      next.perUser.set(k, (next.perUser.get(k) ?? 0) + r.calls);
    }
  }
  state = next;
  spend.usd = Math.max(spend.usd, all?.usd ?? 0); // never lower than what this process has already counted
  spend.loaded = true;
}

/** Why AI is paused right now, or null. Cheap and sync (used by GET /api/me for the UI banner). */
export function pauseReason() {
  rollover();
  if (!env.LLM_ENABLED) return { code: 'LLM_DISABLED', message: 'Agent paused — AI is switched off' };
  if (spend.usd >= env.LLM_HARD_CAP_USD) return { code: 'SPEND_CAP', message: 'Agent paused — spending cap reached' };
  if (state.tokens >= env.LLM_DAILY_TOKENS_GLOBAL) return { code: 'BUDGET_EXCEEDED', message: 'Agent paused — daily limit reached' };
  return null;
}

/** Throws BudgetExceededError if this call must not happen. */
// ponytail: checked before the call, counted after, so bursts of concurrent calls can overshoot slightly.
export async function checkBudget({ tier, userId }) {
  if (!env.LLM_ENABLED) throw new BudgetExceededError('Agent paused — AI is switched off', 'LLM_DISABLED');
  await refresh({ force: !spend.loaded }).catch((err) => console.error(`budget refresh failed: ${err.message}`));
  // Fail closed: with real prices we must know the all-time spend before spending more.
  if (pricesActive() && !spend.loaded) throw new BudgetExceededError('Agent paused — spend tracking unavailable', 'SPEND_UNKNOWN');
  const paused = pauseReason();
  if (paused) throw new BudgetExceededError(paused.message, paused.code);
  if (tier === 'smart' && state.smartCalls >= env.LLM_SMART_DAILY_CALLS) throw new BudgetExceededError('Agent paused — daily limit reached (verdicts)');
  if (userId && !state.exempt.has(String(userId)) && (state.perUser.get(String(userId)) ?? 0) >= env.LLM_DAILY_CALLS_PER_USER) {
    throw new BudgetExceededError('Agent paused — daily limit reached');
  }
}

/** Count a call in memory and persist it, fire-and-forget. Never throws. → costUsd */
export function recordUsage(doc) {
  rollover();
  const costUsd = costOf(doc.tier, doc.promptTokens, doc.completionTokens);
  console.log(`llm ${doc.purpose} ${doc.tier}: ${(doc.promptTokens ?? 0) + (doc.completionTokens ?? 0)} tokens, ${doc.latencyMs ?? 0} ms${doc.ok === false ? ', FAILED' : ''}`);
  state.tokens += (doc.promptTokens ?? 0) + (doc.completionTokens ?? 0);
  spend.usd += costUsd;
  if (doc.tier === 'smart') state.smartCalls++;
  if (doc.userId) {
    const k = String(doc.userId);
    state.perUser.set(k, (state.perUser.get(k) ?? 0) + 1);
  }
  const p = Usage.create({ at: new Date(), provider: env.LLM_PROVIDER, ...doc, costUsd })
    .catch((err) => console.error(`usage log failed (${doc.purpose}): ${err.message}`))
    .finally(() => pending.delete(p));
  pending.add(p);
  return costUsd;
}

/** Wait for in-flight usage writes (scripts call this before disconnecting). */
export const flushUsage = () => Promise.all(pending);

export async function usageToday() {
  const since = new Date(`${today()}T00:00:00Z`);
  const [byPurposeTier, [all]] = await Promise.all([
    Usage.aggregate([
      { $match: { at: { $gte: since } } },
      {
        $group: {
          _id: { purpose: '$purpose', tier: '$tier' },
          calls: { $sum: 1 },
          failed: { $sum: { $cond: ['$ok', 0, 1] } },
          promptTokens: { $sum: '$promptTokens' },
          completionTokens: { $sum: '$completionTokens' },
          costUsd: { $sum: '$costUsd' },
          avgLatencyMs: { $avg: '$latencyMs' },
        },
      },
      { $sort: { calls: -1 } },
    ]),
    Usage.aggregate([{ $group: { _id: null, usd: { $sum: '$costUsd' } } }]),
  ]);
  const rows = byPurposeTier.map(({ _id, avgLatencyMs, ...r }) => ({ ..._id, ...r, avgLatencyMs: Math.round(avgLatencyMs ?? 0) }));
  const allTimeUsd = Math.max(all?.usd ?? 0, spend.usd);
  const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
  return {
    day: today(),
    provider: env.LLM_PROVIDER,
    paused: pauseReason(),
    spend: {
      enabled: env.LLM_ENABLED,
      todayUsd: sum('costUsd'),
      allTimeUsd,
      capUsd: env.LLM_HARD_CAP_USD,
      remainingUsd: Math.max(0, env.LLM_HARD_CAP_USD - allTimeUsd),
      pricesPer1M: Object.fromEntries(['fast', 'mid', 'smart', 'embed', 'vision'].map((t) => [t, priceFor(t)])),
    },
    totals: {
      calls: sum('calls'),
      tokens: sum('promptTokens') + sum('completionTokens'),
      smartCalls: rows.filter((r) => r.tier === 'smart').reduce((s, r) => s + r.calls, 0),
    },
    limits: {
      maxRpm: env.LLM_MAX_RPM,
      dailyCallsPerUser: env.LLM_DAILY_CALLS_PER_USER,
      dailyTokensGlobal: env.LLM_DAILY_TOKENS_GLOBAL,
      smartDailyCalls: env.LLM_SMART_DAILY_CALLS,
    },
    byPurposeTier: rows,
  };
}
