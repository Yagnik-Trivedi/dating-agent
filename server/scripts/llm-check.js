// Offline asserts for the LLM layer's parsers, then live checks against Token Factory + Mongo.
//   node scripts/llm-check.js            offline + live
//   node scripts/llm-check.js --offline  offline only
//   LLM_DAILY_CALLS_PER_USER=1 node scripts/llm-check.js --budget   expect BudgetExceededError
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../src/config/env.js';
import { BudgetExceededError, chat, chatJSON, embed, extractJSON, stripReasoning } from '../src/services/llm/client.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { cosine, topMatches } from '../src/services/kg/similarity.js';

// --- offline
assert.equal(stripReasoning('<think>hmm\nok</think>\n\nHello!'), 'Hello!');
assert.equal(stripReasoning('reasoning with no open tag</think>Hi'), 'Hi');
assert.equal(stripReasoning('Answer<think>truncated reasoning'), 'Answer');
assert.equal(stripReasoning(null), '');
assert.deepEqual(extractJSON('Sure! ```json\n{"a":{"b":1}}\n``` done'), { a: { b: 1 } });
assert.throws(() => extractJSON('no json here'));
assert.equal(cosine([1, 0], [1, 0]), 1);
assert.equal(cosine([1, 0], [0, 1]), 0);
assert.equal(cosine([0, 0], [1, 1]), 0);
assert.deepEqual(topMatches([[1, 0]], [[0, 1], [1, 0.1], [1, 0]], 2)[0].map((m) => m.index), [2, 1]);
console.log('✓ offline checks passed');
if (process.argv.includes('--offline')) process.exit(0);

// --- live
const testUserId = new mongoose.Types.ObjectId('000000000000000000000001');
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

try {
  if (process.argv.includes('--budget')) {
    assert.equal(env.LLM_DAILY_CALLS_PER_USER, 1, 'run with LLM_DAILY_CALLS_PER_USER=1');
    // Today's usage may already exceed 1; either the first or the second call must be refused.
    await assert.rejects(async () => {
      for (let i = 0; i < 2; i++) await chat({ messages: [{ role: 'user', content: 'Say hi.' }], purpose: 'llm-check', userId: testUserId });
    }, BudgetExceededError);
    console.log('✓ BudgetExceededError thrown cleanly');
  } else {
    const { text } = await chat({ messages: [{ role: 'user', content: 'Say hello in five words.' }], purpose: 'llm-check' });
    assert.ok(text && !/<\/?think>/i.test(text), 'clean chat reply');
    console.log(`✓ chat: ${JSON.stringify(text)}`);

    const schema = z.object({ city: z.string().min(1), country: z.string().min(1), population_millions: z.number().positive() });
    for (let i = 1; i <= 3; i++) {
      const out = await chatJSON({
        messages: [{ role: 'user', content: 'Pick one large city. Respond as {"city": string, "country": string, "population_millions": number}.' }],
        schema,
        purpose: 'llm-check',
        userId: testUserId,
      });
      console.log(`✓ chatJSON ${i}/3: ${JSON.stringify(out)}`);
    }

    if (env.MODEL_EMBED) {
      const [a, b, again] = await embed(['I love hiking', 'Mountain trails are my weekends', 'I love hiking'], { purpose: 'llm-check' });
      assert.deepEqual(a, again);
      console.log(`✓ embed: dim=${a.length}, cosine(hiking, trails)=${cosine(a, b).toFixed(3)}`);
    }
  }
} finally {
  await flushUsage();
  console.log(`usage docs in collection: ${await mongoose.connection.db.collection('usage').countDocuments()}`);
  await mongoose.disconnect();
}
