// Per-task model choice and output budget (plan 30 S1). The caller names a default tier; this table can move a task to
// another tier without touching the caller, and LLM_TASK_TIERS="purpose=tier,…" overrides it from the environment.
// Measured on NVIDIA (speed-before.md): Lightning (fast) p50 33–59 s with 90 s timeouts, Super (mid, reasoning off)
// 2–9 s, so every fast task runs on mid for now. Re-test fast on Token Factory (Oct 26) and switch back per task.
// maxTokens ≈ 1.5–2× the largest completion seen in production Usage (reasoning off); a call can still pass its own.
import { env } from '../../config/env.js';

export const TASKS = {
  'agent-turn': { maxTokens: 1536 }, // perceive + reply in one call (perceive max 804 + reply max 253)
  'agent-perceive': { maxTokens: 1200 },
  'agent-reply': { maxTokens: 512 },
  'agent-stance-check': { tier: 'mid', maxTokens: 64 },
  icebreakers: { tier: 'mid', maxTokens: 256 },
  'wind-down': { tier: 'mid', maxTokens: 160 },
  'date-ideas': { tier: 'mid', maxTokens: 512 },
  brief: { maxTokens: 1024 },
  'trust-check': { maxTokens: 3072 },
  // Onboarding phase 2 (plan 30 S1): 45 s per attempt and one retry; a failure falls back in code instead of waiting.
  'concept-tiebreak': { maxTokens: 1024, timeoutMs: 45_000, retries: 1 }, // one batched call per build
  'onboarding-story-facts': { maxTokens: 1280, timeoutMs: 45_000, retries: 1 },
  'onboarding-story-facts-support': { maxTokens: 256, timeoutMs: 45_000, retries: 1 },
  'onboarding-contradictions': { maxTokens: 1024, timeoutMs: 45_000, retries: 1 },
  'onboarding-style': { maxTokens: 768, timeoutMs: 45_000, retries: 1 },
  'voice-language-tags': { maxTokens: 1024, timeoutMs: 45_000, retries: 1 },
  'voice-correction': { maxTokens: 256 },
  'compact-notes': { maxTokens: 512 },
};

const overrides = Object.fromEntries((env.LLM_TASK_TIERS ?? '').split(',').map((s) => s.split('=').map((x) => x.trim())).filter(([k, v]) => k && v));

/** The tier and token cap for a call; `tier` is the caller's default. */
export function taskConfig(purpose, tier) {
  const t = TASKS[purpose] ?? {};
  return { tier: overrides[purpose] ?? t.tier ?? tier, maxTokens: t.maxTokens, timeoutMs: t.timeoutMs, retries: t.retries };
}
