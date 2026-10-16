// Verify Token Factory access and discover model IDs. Talks to the API directly (raw output on purpose),
// and needs only NEBIUS_API_KEY, not Mongo/JWT.
import 'dotenv/config';
import OpenAI from 'openai';

const { NEBIUS_API_KEY, MODEL_FAST, MODEL_EMBED } = process.env;
const baseURL = process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1/';
if (!NEBIUS_API_KEY) {
  console.error('✖ NEBIUS_API_KEY is not set in server/.env');
  process.exit(1);
}
const client = new OpenAI({ apiKey: NEBIUS_API_KEY, baseURL });

console.log(`Models at ${baseURL}\n`);
const ids = [];
for await (const m of client.models.list()) ids.push(m.id);
ids.sort();
for (const id of ids) {
  const tag = /embed/i.test(id) ? '  ← EMBED' : /nemotron|nvidia/i.test(id) ? '  ← NEMOTRON' : '';
  console.log(`${tag ? '★' : ' '} ${id}${tag}`);
}
console.log(`\n${ids.length} models total.`);

if (MODEL_FAST) {
  console.log(`\n--- chat test: ${MODEL_FAST}`);
  const started = Date.now();
  const res = await client.chat.completions.create({
    model: MODEL_FAST,
    messages: [{ role: 'user', content: 'Say hello in exactly five words.' }],
    max_tokens: 2048,
  });
  console.log(`latency ${Date.now() - started} ms, finish_reason=${res.choices[0].finish_reason}, usage=${JSON.stringify(res.usage)}`);
  console.log('raw message object:');
  console.dir(res.choices[0].message, { depth: null });
} else {
  console.log('\n(set MODEL_FAST to run a chat test)');
}

if (MODEL_EMBED) {
  console.log(`\n--- embed test: ${MODEL_EMBED}`);
  const res = await client.embeddings.create({ model: MODEL_EMBED, input: ['test'] });
  console.log(`vector length: ${res.data[0].embedding.length}`);
  // Plan 17: does the provider accept reduced dimensions? If so, KG.EMBED_DIMS can shrink stored vectors.
  try {
    const small = await client.embeddings.create({ model: MODEL_EMBED, input: ['test'], dimensions: 256 });
    const n = small.data[0].embedding.length;
    console.log(n === 256 ? 'dimensions=256: supported (KG.EMBED_DIMS can be set)' : `dimensions ignored (got ${n}); keep KG.EMBED_DIMS = null`);
  } catch (err) {
    console.log(`dimensions not supported (${err.status ?? err.name}); keep KG.EMBED_DIMS = null`);
  }
} else {
  console.log('\n(set MODEL_EMBED to run an embedding test)');
}
