// A rejected AI key (401/403) pauses the agent visibly instead of failing every call silently (production, 2026-10-22:
// 579 calls in 3 days all failed with 401 while the UI showed nothing). One probe per 5 minutes checks the key again.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBudget, markAuthFailure, markAuthOk, pauseReason } from '../src/services/llm/budget.js';

test('a rejected key pauses the agent with a reason; the next call is blocked until the probe window; success clears it', async () => {
  assert.equal(pauseReason()?.code ?? null, null);
  markAuthFailure();
  assert.deepEqual(pauseReason(), { code: 'PROVIDER_AUTH', message: 'Agent paused — the AI provider rejected our API key' });
  await assert.rejects(checkBudget({ tier: 'mid' }), (err) => err.name === 'BudgetExceededError' && err.code === 'PROVIDER_AUTH');
  markAuthOk();
  assert.equal(pauseReason(), null);
});
