// Proves the hard spending cap and the kill switch block LLM calls.
//   node scripts/spend-cap-check.js
// Uses a throwaway database (<db>_spendtest, dropped at the end) so fake costs never touch the real
// all-time total, and makes exactly ONE real LLM call (tier mid) priced absurdly high to cross a $0.01 cap.
import 'dotenv/config';
import assert from 'node:assert/strict';

const uri = new URL(process.env.MONGODB_URI);
uri.pathname = `${uri.pathname.replace(/^\/|\/$/g, '') || 'dating_agent'}_spendtest`;
process.env.MONGODB_URI = uri.toString();
process.env.LLM_HARD_CAP_USD = '0.01';
process.env.LLM_PRICE_MID = '1000,1000'; // $1000 per 1M tokens → any real reply costs > $0.01
process.env.LLM_ENABLED = 'true';

const { default: mongoose } = await import('mongoose');
const { env } = await import('../src/config/env.js');
const { BudgetExceededError, chat, embed } = await import('../src/services/llm/client.js');
const { flushUsage, pauseReason, usageToday } = await import('../src/services/llm/budget.js');
const { Usage } = await import('../src/models/Usage.js');

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
await mongoose.connection.dropDatabase();
const ask = () => chat({ tier: 'mid', messages: [{ role: 'user', content: 'Reply with the single word: ok' }], purpose: 'spend-cap-check' });

try {
  assert.equal(env.LLM_HARD_CAP_USD, 0.01);

  // 1. Under the cap: the call goes through and its cost is computed from the response usage.
  const first = await ask();
  await flushUsage();
  const doc = await Usage.findOne({ purpose: 'spend-cap-check' }).lean();
  assert.ok(doc.costUsd > 0.01, `cost ${doc.costUsd} should exceed the $0.01 cap`);
  assert.equal(doc.costUsd, ((doc.promptTokens + doc.completionTokens) * 1000) / 1e6);
  console.log(`✓ call 1 allowed: ${doc.promptTokens}+${doc.completionTokens} tokens → $${doc.costUsd.toFixed(4)} (reply: ${JSON.stringify(first.text)})`);

  // 2. Cap reached: every call is refused before any network request.
  const t0 = Date.now();
  await assert.rejects(ask, (err) => err instanceof BudgetExceededError && err.code === 'SPEND_CAP');
  await assert.rejects(() => embed(['blocked?']), (err) => err.code === 'SPEND_CAP');
  assert.ok(Date.now() - t0 < 1000, 'blocked calls must not reach the network');
  assert.equal(await Usage.countDocuments(), 1, 'blocked calls must not be logged as usage');
  assert.equal(pauseReason().code, 'SPEND_CAP');
  const admin = await usageToday();
  assert.equal(admin.spend.remainingUsd, 0);
  console.log(`✓ cap $0.01 reached → chat + embed blocked instantly (${Date.now() - t0} ms); admin shows remaining $0`);

  // 3. Kill switch beats everything, even with plenty of budget left.
  env.LLM_HARD_CAP_USD = 1e9;
  env.LLM_ENABLED = false;
  await assert.rejects(ask, (err) => err.code === 'LLM_DISABLED');
  assert.equal(pauseReason().code, 'LLM_DISABLED');
  console.log('✓ LLM_ENABLED=false → calls fail immediately');
  console.log('\nSpend protection checks passed.');
} finally {
  await flushUsage();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
