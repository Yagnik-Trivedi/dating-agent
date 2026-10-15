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
- [ ] **Smoke the agent.** Run `scripts/simulate.js` on 2 seed pairs (one compatible, one dealbreaker) and an eval subset (`scripts/eval.js`, a few pairs). Compare verdicts and token usage with the NVIDIA runs; note cost per simulated conversation from `GET /api/admin/usage`.
- [ ] **Provider flag.** `LLM_PROVIDER=nebius`.
- [ ] **README.** Update the "How we use NVIDIA Nemotron + Nebius Token Factory" section: final model IDs per tier and why, and remove any mention of the temporary NVIDIA key.
- [ ] **Render.** Update the same env vars on the Render service (`NEBIUS_*`, `MODEL_*`, `LLM_PROVIDER`, `LLM_PRICE_*`, `LLM_HARD_CAP_USD`, `LLM_MAX_RPM`), redeploy, then check `GET /health/deep` and `GET /api/admin/usage` (`provider` should say `nebius`).
- [ ] **CLAUDE.md.** Remove the "Temporary LLM provider" section and record the final model IDs in Status.
