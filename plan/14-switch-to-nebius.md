# 14 — Switch the LLM provider back to Nebius Token Factory

> **Target: done by Oct 26**, before deploy (plan 12) is final. The hackathon requires runtime calls to Nebius Token Factory using a Nemotron model, so the demo URL, README and video must run on Nebius. Development ran on NVIDIA's free API (build.nvidia.com) because Token Factory needs a payment card. The switch is **`.env` only, no code changes**.

**Never paste key values into chat, commits, issues or logs.**

## Checklist

- [ ] **Credentials.** In `server/.env`:
  - `NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1/`
  - `NEBIUS_API_KEY=<the Nebius key>` (replaces the `nvapi-...` key)
- [ ] **Model IDs.** Run `cd server && npm run smoke` against Token Factory and copy the exact IDs into `server/.env`:
  - `MODEL_FAST` = Nemotron 3 Nano
  - `MODEL_MID` = Nemotron 3 Super
  - `MODEL_SMART` = Nemotron 3 Ultra. **If Ultra isn't listed, use Super here too.**
  - `MODEL_EMBED` = an embedding model from the listing (prefer an NVIDIA/Nemotron one)
  - `MODEL_VISION` = a Nemotron VL from the listing (photo moderation; the live check was removed on 2026-10-19). If no Nemotron VL is listed, photo moderation needs the code-only fallback in plan 30 S7 (pending + manual review). Re-run `npm run photo-moderation:check`.
  - Check the smoke output: the chat reply must be clean (no reasoning text), and note the embedding vector length.
  - Update the ID comments in `server/.env.example`.
- [ ] **Prices + hard cap.** From the Token Factory pricing page, set USD per 1M tokens as `input,output`:
  - `LLM_PRICE_FAST`, `LLM_PRICE_MID`, `LLM_PRICE_SMART`, `LLM_PRICE_EMBED`
  - `LLM_HARD_CAP_USD` = the credits we're willing to spend in total (leave headroom below the $50 of promo credits, e.g. 35)
  - Keep `LLM_ENABLED=true`. Flip it to `false` to stop all spending instantly.
  - `LLM_MAX_RPM`: raise it if Token Factory's rate limit is higher than NVIDIA's ~40/min.
- [ ] **Verify spending protection** with the new prices: `node scripts/spend-cap-check.js` (makes 1 real call into a throwaway DB).
- [ ] **Re-embed.** Vectors from different embedding models can't be compared:
  `node scripts/reembed.js --prune-cache` (re-embeds every fact whose `embeddingModel` differs, then drops old cached vectors).
- [ ] **Re-check similarity thresholds** if the embedding model changed. They were calibrated for `nvidia/nemotron-3-embed-1b` and all live in `server/src/services/kg/config.js`: concept resolution `T_HIGH` / `T_LOW`, `T_ASKED` (if-asked facts) and `T_LEAK` (leak check). Re-run `node scripts/calibrate-concepts.js`, then `node scripts/onboard-sample.js`, `node scripts/agent-check.js` and `node scripts/judge-check.js`, and adjust the thresholds if a check fails.
- [ ] **Reasoning switch.** The client sends `chat_template_kwargs: { enable_thinking: false }` for reasoning-off calls (`LLM_REASONING_FAST/MID/SMART`; agent replies, perceive/observe and the stance check run with reasoning off). If Nebius rejects it, the client logs "provider rejects chat_template_kwargs" once and continues with reasoning on. In that case raise timeouts/`max_tokens` or pick faster models, and re-run `node scripts/agent-check.js`.
- [ ] **Judge model.** On NVIDIA, Ultra (`MODEL_SMART`) returned 404 and the judge fell back to the mid tier (recorded in `MatchDecision.judgeModel`). If Ultra is listed on Token Factory, confirm `judge-check.js` uses it. If it isn't, set `MODEL_SMART` to Super so no call is wasted on a 404.
- [ ] **Latency.** Record the p50/p95 per call for each tier and the wall-clock time of one simulated conversation. On NVIDIA a conversation took 9–18 min. If Nebius is much faster, update the pacing and the demo plan (plan 12 §7).
- [ ] **Smoke the agent.** Run `scripts/simulate.js` on 2 seed pairs (one compatible, one where a dealbreaker surfaces in chat) and the 6-pair eval subset (`scripts/eval.js --limit 6`). Compare verdicts and token usage with the NVIDIA runs; note cost per simulated conversation from `GET /api/admin/usage`.
- [ ] **Provider flag.** `LLM_PROVIDER=nebius`.
- [ ] **README.** Update the "How we use NVIDIA Nemotron + Nebius Token Factory" section: final model IDs per tier and why, and remove any mention of the temporary NVIDIA key.
- [ ] **Render.** Update the same env vars on the Render service (`NEBIUS_*`, `MODEL_*`, `LLM_PROVIDER`, `LLM_PRICE_*`, `LLM_HARD_CAP_USD`, `LLM_MAX_RPM`), redeploy, then check `GET /health/deep` and `GET /api/admin/usage` (`provider` should say `nebius`).
- [ ] **Re-seed production data** after re-embedding, if seeds were built with the old embedding model: `node scripts/seed.js` is incremental, so use `--force` only if `reembed.js` couldn't cover it.
- [ ] **CLAUDE.md.** Remove the "Temporary LLM provider" section and record the final model IDs in Status.
