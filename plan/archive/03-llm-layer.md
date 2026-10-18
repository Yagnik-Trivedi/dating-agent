# 03 — LLM layer (Nebius Token Factory + Nemotron)

> **Prompt for Claude Code:** Read `CLAUDE.md`, then implement the LLM layer below. Every later feature calls the LLM only through this module. Run the acceptance checks.

## Goal

One module that talks to Token Factory. It handles model tiers, reasoning stripping, JSON validation, embeddings with caching, usage logging and budget limits, so credits survive until judging ends (Dec 15).

## Build

### 1. `server/scripts/smoke.js`
- Create an `openai` client with `baseURL = NEBIUS_BASE_URL` and `apiKey = NEBIUS_API_KEY`.
- List models with `for await (const m of client.models.list())`. Print every ID, and highlight the ones matching `/nemotron|nvidia/i` and `/embed/i`.
- If `MODEL_FAST` is set, make one tiny chat call and print the **full raw `message` object**, so we can see where reasoning appears (a separate field vs. `<think>` tags inside content).
- If `MODEL_EMBED` is set, embed `"test"` and print the vector length. We need it for any vector index later.

### 2. `server/src/services/llm/client.js`
Export:

```js
chat({ tier = 'fast', messages, maxTokens, temperature = 0.7, purpose, userId, matchId })
  // → { text, usage, model, latencyMs }
chatJSON({ tier, messages, schema /* zod */, purpose, userId, matchId, maxTokens })
  // → parsed + validated object
embed(texts: string[], { purpose, userId }) // → number[][]
```

Rules:
- `tier → model`: fast = `MODEL_FAST`, mid = `MODEL_MID`, smart = `MODEL_SMART`.
- **Default `maxTokens`:** fast 2048, mid 4096, smart 8192. Reasoning models need headroom.
- **Strip reasoning:** remove `<think>…</think>` blocks and ignore any `reasoning`/`reasoning_content` field. If the cleaned text is empty but the response hit `finish_reason: 'length'`, retry once with double `maxTokens`.
- `chatJSON`:
  - Add a system line: "Return ONLY valid JSON matching the requested shape. No prose."
  - Extract from the first `{` to the last `}`, `JSON.parse`, then `schema.parse`.
  - On failure, retry once with the error message appended ("Your last output failed validation: …").
  - If it fails again, throw `LLMJsonError`.
- **Timeouts:** 60 s for fast and mid, 120 s for smart. Retry 429 and 5xx up to 2 times with exponential backoff and jitter.
- **Never log prompt contents in production logs.** Log only purpose, model, tokens and latency.

### 3. Usage logging + budget guard (`services/llm/budget.js`)
- Mongoose model `Usage`: `{ at, purpose, tier, model, userId, matchId, promptTokens, completionTokens, latencyMs, ok }`.
- Write one document per call; fire-and-forget, so a logging failure never breaks the call.
- Env limits, with defaults:
  - `LLM_DAILY_CALLS_PER_USER=300`
  - `LLM_DAILY_TOKENS_GLOBAL=3000000`
  - `LLM_SMART_DAILY_CALLS=60`
- Before each call, check the limits (keep an in-memory counter, refreshed from Mongo every 5 min). When a limit is exceeded, throw `BudgetExceededError`. Callers must handle it gracefully: the agent pauses, and the UI shows "Agent paused — daily limit reached".
- `GET /api/admin/usage` (protected by an `ADMIN_TOKEN` env header) returns today's totals by purpose and tier.

### 4. Embedding cache (`services/llm/embedCache.js`)
- Mongoose model `EmbCache`: `{ hash (sha256 of model+text), model, vector }` with a unique index on `hash`.
- `embed()` looks up the cache first and only calls the API for misses, batching up to 64 texts per request.

### 5. Prompt template convention (`services/prompts/`)
- One file per prompt, exporting `build(params) → messages[]`.
- Add `services/prompts/README.md`, listing each prompt, its tier, and its output schema. Fill it in as later plans add prompts.

### 6. Similarity helper (`services/kg/similarity.js`)
- `cosine(a, b)` and `topMatches(queryVecs, candidateVecs, k)`, in plain JS.
- Comparisons are always between two specific people (~50 × 50 facts), so in-memory cosine is fast enough. **Don't add Atlas Vector Search unless needed.**

## Acceptance checks

- [ ] `npm run smoke` prints the model list, one clean chat reply with no reasoning text, and the embedding length.
- [ ] Put the exact IDs into `.env` and `.env.example`, with placeholders in the example.
- [ ] Add a quick test script (`scripts/llm-check.js`) that runs `chatJSON` with a small zod schema 3 times and passes all 3.
- [ ] The `usage` collection shows documents after running the checks.
- [ ] Set `LLM_DAILY_CALLS_PER_USER=1` temporarily and confirm `BudgetExceededError` is thrown cleanly.
- [ ] Write the chosen model IDs and the reasoning-field finding in the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-03): Token Factory LLM layer with tiers, budgets, embedding cache`
