// The only module that talks to Nebius Token Factory. Everything else calls chat / chatJSON / embed.
import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { checkBudget, recordUsage } from './budget.js';
import { getCached, hashText, putCached } from './embedCache.js';

export { BudgetExceededError } from './budget.js';

export class LLMJsonError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LLMJsonError';
  }
}

const MODEL_ENV = { fast: 'MODEL_FAST', mid: 'MODEL_MID', smart: 'MODEL_SMART', embed: 'MODEL_EMBED' };
const DEFAULT_MAX_TOKENS = { fast: 2048, mid: 4096, smart: 8192 };
const TIMEOUT_MS = { fast: 60_000, mid: 60_000, smart: 120_000, embed: 60_000 };
const EMBED_BATCH = 64;
const JSON_RULE = 'Return ONLY valid JSON matching the requested shape. No prose.';

let openai;
function client() {
  if (!env.NEBIUS_API_KEY) throw new Error('NEBIUS_API_KEY is not set (server/.env)');
  // SDK retries 429/5xx twice with exponential backoff + jitter.
  openai ??= new OpenAI({ apiKey: env.NEBIUS_API_KEY, baseURL: env.NEBIUS_BASE_URL, maxRetries: 2 });
  return openai;
}

function modelFor(tier) {
  const key = MODEL_ENV[tier];
  if (!key) throw new Error(`Unknown LLM tier: ${tier}`);
  if (!env[key]) throw new Error(`${key} is not set (server/.env); run scripts/smoke.js to list model IDs`);
  return env[key];
}

/** Remove reasoning so it never reaches a user-visible message. */
export function stripReasoning(text) {
  let out = (text ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '');
  const close = out.toLowerCase().lastIndexOf('</think>'); // reasoning with no opening tag
  if (close !== -1) out = out.slice(close + '</think>'.length);
  const open = out.search(/<think>/i); // truncated reasoning, never closed
  if (open !== -1) out = out.slice(0, open);
  return out.trim();
}

/** Text from the first `{` to the last `}`, parsed. */
export function extractJSON(text) {
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

/** → { text, usage, model, latencyMs } */
export async function chat({ tier = 'fast', messages, maxTokens, temperature = 0.7, purpose, userId, matchId }) {
  const model = modelFor(tier);
  await checkBudget({ tier, userId });
  let max = maxTokens ?? DEFAULT_MAX_TOKENS[tier];

  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    let res;
    try {
      res = await client().chat.completions.create(
        { model, messages, max_tokens: max, temperature },
        { timeout: TIMEOUT_MS[tier] },
      );
    } catch (err) {
      recordUsage({ purpose, tier, model, userId, matchId, latencyMs: Date.now() - started, ok: false });
      console.error(`llm ${purpose} (${model}) failed: ${err.status ?? ''} ${err.message}`);
      throw err;
    }
    const latencyMs = Date.now() - started;
    const choice = res.choices?.[0];
    const text = stripReasoning(choice?.message?.content); // reasoning / reasoning_content fields are ignored
    recordUsage({
      purpose, tier, model, userId, matchId, latencyMs, ok: Boolean(text),
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
    });
    // Reasoning ate the whole budget: retry once with double headroom.
    if (!text && choice?.finish_reason === 'length' && attempt === 0) {
      max *= 2;
      continue;
    }
    return { text, usage: res.usage, model, latencyMs };
  }
}

/** → schema-validated object; one corrective retry, then LLMJsonError. */
export async function chatJSON({ tier = 'fast', messages, schema, purpose, userId, matchId, maxTokens, temperature = 0.3 }) {
  // Some chat templates reject a second system message, so merge into the first.
  const base = messages[0]?.role === 'system'
    ? [{ ...messages[0], content: `${messages[0].content}\n\n${JSON_RULE}` }, ...messages.slice(1)]
    : [{ role: 'system', content: JSON_RULE }, ...messages];

  let msgs = base;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await chat({ tier, messages: msgs, maxTokens, temperature, purpose, userId, matchId });
    try {
      return schema.parse(extractJSON(text));
    } catch (err) {
      lastError = err;
      msgs = [
        ...base,
        { role: 'assistant', content: text || '(empty)' },
        { role: 'user', content: `Your last output failed validation: ${err.message}\nReturn ONLY the corrected JSON.` },
      ];
    }
  }
  console.error(`llm ${purpose}: invalid JSON after retry: ${lastError.message}`);
  throw new LLMJsonError(`${purpose}: model returned invalid JSON`);
}

/** → number[][] in input order. Cached per (model, text). */
export async function embed(texts, { purpose = 'embed', userId } = {}) {
  const model = modelFor('embed');
  const hashes = texts.map((t) => hashText(model, t));
  const cached = await getCached(hashes);

  const misses = [...new Map(texts.map((t, i) => [hashes[i], t])).entries()].filter(([h]) => !cached.has(h));
  for (let i = 0; i < misses.length; i += EMBED_BATCH) {
    const batch = misses.slice(i, i + EMBED_BATCH);
    await checkBudget({ tier: 'embed', userId });
    const started = Date.now();
    let res;
    try {
      res = await client().embeddings.create({ model, input: batch.map(([, t]) => t) }, { timeout: TIMEOUT_MS.embed });
    } catch (err) {
      recordUsage({ purpose, tier: 'embed', model, userId, latencyMs: Date.now() - started, ok: false });
      throw err;
    }
    recordUsage({ purpose, tier: 'embed', model, userId, latencyMs: Date.now() - started, ok: true, promptTokens: res.usage?.prompt_tokens ?? 0 });
    const entries = res.data
      .sort((a, b) => a.index - b.index)
      .map((d, j) => ({ hash: batch[j][0], model, vector: d.embedding }));
    for (const e of entries) cached.set(e.hash, e.vector);
    await putCached(entries);
  }
  return hashes.map((h) => cached.get(h));
}
