// The only module that talks to the LLM provider (Nebius Token Factory, or NVIDIA build.nvidia.com while
// we're on the temporary key). Everything else calls chat / chatJSON / embed. Provider switch = .env only.
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
// Generous: NVIDIA's free endpoints can take 30–40 s for a reasoning reply.
const TIMEOUT_MS = { fast: 90_000, mid: 120_000, smart: 180_000, embed: 60_000 };
const MAX_RETRIES = 3;
const EMBED_BATCH = 64;
const JSON_RULE = 'Return ONLY valid JSON matching the requested shape. No prose.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let openai;
function client() {
  if (!env.NEBIUS_API_KEY) throw new Error('NEBIUS_API_KEY is not set (server/.env)');
  if (!openai) {
    // Retries are ours (below) so every attempt goes through the rate limiter.
    openai = new OpenAI({ apiKey: env.NEBIUS_API_KEY, baseURL: env.NEBIUS_BASE_URL, maxRetries: 0 });
    console.log(`LLM provider: ${env.LLM_PROVIDER} (${new URL(env.NEBIUS_BASE_URL).host})`);
  }
  return openai;
}

function modelFor(tier) {
  const key = MODEL_ENV[tier];
  if (!key) throw new Error(`Unknown LLM tier: ${tier}`);
  if (!env[key]) throw new Error(`${key} is not set (server/.env); run scripts/smoke.js to list model IDs`);
  return env[key];
}

/** The model new embeddings are made with; store it next to every vector. */
export const embeddingModel = () => modelFor('embed');
/** The model ID a tier runs on (to record which model made a decision). */
export const modelId = (tier) => modelFor(tier);

// --- global rate limit: at most LLM_MAX_RPM requests in any 60 s window (NVIDIA free tier ≈ 40/min total).
const stamps = [];
async function acquireSlot() {
  for (;;) {
    const now = Date.now();
    while (stamps.length && now - stamps[0] >= 60_000) stamps.shift();
    if (stamps.length < env.LLM_MAX_RPM) {
      stamps.push(now);
      return;
    }
    await sleep(60_000 - (now - stamps[0]) + 25);
  }
}

const retryable = (err) => err.status === 429 || err.status >= 500 || (err.status === undefined && /Connection|Timeout/.test(err.name ?? ''));

/** Run one API request through the limiter, retrying 429/5xx/network errors with backoff + jitter. */
async function request(label, fn, retries = MAX_RETRIES) {
  for (let attempt = 0; ; attempt++) {
    await acquireSlot();
    try {
      return await fn();
    } catch (err) {
      if (!retryable(err) || attempt >= retries) throw err;
      const retryAfter = Number(err.headers?.get?.('retry-after'));
      const delay = retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 2000 * 2 ** attempt) + Math.random() * 1000;
      console.warn(`llm ${label}: ${err.status ?? err.name}, retry ${attempt + 1}/${retries} in ${Math.round(delay / 1000)}s`);
      await sleep(delay);
    }
  }
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

// Nemotron's reasoning can be switched off per request (vLLM-style chat_template_kwargs). Off = ~0.5–2 s replies
// instead of 10–40 s, and no runaway reasoning eating max_tokens. Per tier via LLM_REASONING_*; if a provider
// rejects the parameter we drop it for good, like input_type below.
const REASONING_ENV = { fast: 'LLM_REASONING_FAST', mid: 'LLM_REASONING_MID', smart: 'LLM_REASONING_SMART' };
let sendThinkingSwitch = true;
const thinkingOff = (tier, reasoning) => sendThinkingSwitch && (reasoning ?? env[REASONING_ENV[tier]]) === false;

/**
 * → { text, usage, model, latencyMs, costUsd }. `reasoning` overrides the tier's LLM_REASONING_* default; `model` overrides
 * the tier's model ID (budget + limits still follow the tier); `retries` caps our retries (default MAX_RETRIES).
 */
export async function chat({ tier = 'fast', messages, maxTokens, temperature = 0.7, purpose, userId, matchId, reasoning, model: modelOverride, retries }) {
  const model = modelOverride ?? modelFor(tier);
  await checkBudget({ tier, userId });
  let max = maxTokens ?? DEFAULT_MAX_TOKENS[tier];

  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    let res;
    const call = () => client().chat.completions.create(
      { model, messages, max_tokens: max, temperature, ...(thinkingOff(tier, reasoning) && { chat_template_kwargs: { enable_thinking: false } }) },
      { timeout: TIMEOUT_MS[tier] },
    );
    try {
      res = await request(`${purpose}/${tier}`, call, retries).catch(async (err) => {
        if (!(thinkingOff(tier, reasoning) && err.status === 400 && /chat_template_kwargs|extra/i.test(err.message))) throw err;
        sendThinkingSwitch = false;
        console.warn(`llm: provider rejects chat_template_kwargs; reasoning stays on from now on`);
        return request(`${purpose}/${tier}`, call, retries);
      });
    } catch (err) {
      recordUsage({ purpose, tier, model, userId, matchId, latencyMs: Date.now() - started, ok: false });
      console.error(`llm ${purpose} (${model}) failed: ${err.status ?? ''} ${err.message}`);
      throw err;
    }
    const latencyMs = Date.now() - started;
    const choice = res.choices?.[0];
    // `reasoning_content` / `reasoning` fields are ignored; inline <think> blocks are stripped.
    const text = stripReasoning(choice?.message?.content);
    const costUsd = recordUsage({
      purpose, tier, model, userId, matchId, latencyMs, ok: Boolean(text),
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
    });
    // Reasoning ate the whole budget: retry once with double headroom.
    if (!text && choice?.finish_reason === 'length' && attempt === 0) {
      max *= 2;
      await checkBudget({ tier, userId });
      continue;
    }
    return { text, usage: res.usage, model, latencyMs, costUsd };
  }
}

/** → schema-validated object; one corrective retry, then LLMJsonError. */
export async function chatJSON({ tier = 'fast', messages, schema, purpose, userId, matchId, maxTokens, temperature = 0.3, reasoning, model, retries }) {
  // Some chat templates reject a second system message, so merge into the first.
  const base = messages[0]?.role === 'system'
    ? [{ ...messages[0], content: `${messages[0].content}\n\n${JSON_RULE}` }, ...messages.slice(1)]
    : [{ role: 'system', content: JSON_RULE }, ...messages];

  let msgs = base;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await chat({ tier, messages: msgs, maxTokens, temperature, purpose, userId, matchId, reasoning, model, retries });
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

// NVIDIA retrieval embedders take `input_type` (query | passage); other providers may reject it.
// Send it, and drop it for good if the provider complains.
let sendInputType = true;

/**
 * → number[][] in input order. Cached per (model, inputType, text).
 * inputType: 'passage' for stored facts (fact↔fact comparisons), 'query' for search queries.
 */
export async function embed(texts, { purpose = 'embed', userId, inputType = 'passage' } = {}) {
  const model = modelFor('embed');
  const hashes = texts.map((t) => hashText(model, inputType, t));
  const cached = await getCached(hashes);

  const misses = [...new Map(texts.map((t, i) => [hashes[i], t])).entries()].filter(([h]) => !cached.has(h));
  for (let i = 0; i < misses.length; i += EMBED_BATCH) {
    const batch = misses.slice(i, i + EMBED_BATCH);
    await checkBudget({ tier: 'embed', userId });
    const started = Date.now();
    const call = () => client().embeddings.create(
      { model, input: batch.map(([, t]) => t), ...(sendInputType && { input_type: inputType }) },
      { timeout: TIMEOUT_MS.embed },
    );
    let res;
    try {
      res = await request(`${purpose}/embed`, call).catch(async (err) => {
        if (!(sendInputType && err.status === 400 && /input_type|extra/i.test(err.message))) throw err;
        sendInputType = false;
        console.warn(`llm embed: ${model} rejects input_type; sending without it from now on`);
        return request(`${purpose}/embed`, call);
      });
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
