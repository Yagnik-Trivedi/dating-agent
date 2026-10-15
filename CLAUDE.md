# Project context for Claude Code

Read this file first in every session. Build tasks live in `plan/`, numbered in the order they should be built. When asked to "do plan/0X", read that file and implement exactly it. Don't jump ahead to later plan files.

## What we're building

A MERN dating web app with a built-in AI agent. It is our entry for the **Nebius x NVIDIA Global AI Hackathon** (Devpost). The deadline is **Oct 30, 2026, 10:00 AM PDT (10:30 PM IST)**, and we target submitting on Oct 29.

**Problem:** dating apps match on preferences, not character. People find out after 2–3 conversations that a match isn't compatible.

**Solution:** after a match, the user's AI agent handles the early conversation for them. The agent:

1. checks the match's profile for fakes and inconsistencies
2. reads the match's profile and prompts to understand them before talking
3. holds the early conversation in the user's own voice, grounded in the user's personal knowledge graph
4. classifies the match as **Compatible / Maybe / Not compatible**, with evidence

Compatible means the user takes over the chat. Not compatible means the agent politely winds it down, and the user never spent time on it.

## Non-negotiable product rules

- **Consent at signup.** Every user must tick: "Early conversations with your matches may be handled by AI agents, including yours." Signup is blocked without it. Store `consentAgent: true` and `consentAt`.
- **Every message stores `authoredBy: 'human' | 'agent'`.** This is used for the audit log and the reveal at handoff ("your first 14 messages were handled by agents").
- **The user stays in control.** Agent modes are `off`, `shadow` (agent replies, user watches live, can take over) and `auto`. **Take over** is one tap and immediately stops the agent for that match.
- **The agent never invents facts about its user.** Anything it says about the user must come from the user's knowledge graph. If it needs something unknown, it deflects naturally and creates an "ask my human" question.
- **The agent respects disclosure tiers** (`public | if_asked | private`). Private facts are never sent to the model as sayable content.
- **No inference of caste, religion, ethnicity or race from names or photos.** Use religion only if the user lists it as their own stated preference or dealbreaker.
- **Keep demo and seed content SFW.** Judges review the video.
- **The other side of a conversation can be a human or another agent.** The code must work for both.

## Hackathon requirements the code must satisfy

- Runtime calls to **Nebius Token Factory** (OpenAI-compatible API) using at least one **NVIDIA Nemotron** model.
- Public GitHub repo with an **MIT LICENSE** file at the root, so GitHub shows it in the About section.
- A README with setup steps plus a section on how Nemotron and Token Factory are used (which model handles which task, and why).
- A working demo URL that stays live and testable **through Dec 15, 2026** (end of judging).
- Track: Best Apps & Agents.

## Everything must be FREE

| Need | Free choice | Limits to respect |
|---|---|---|
| LLM | Nebius Token Factory promo credits ($25 form + $25 Builders Program) | Credits are finite. Log every call, enforce budgets, use the cheapest tier that works. |
| Database | MongoDB Atlas **M0** | 512 MB storage, max 3 search indexes |
| Frontend hosting | Vercel Hobby | Static SPA build |
| Backend hosting | Render **Free** web service (exactly ONE) | Spins down after 15 min idle; 750 free hours/month per workspace, which covers exactly one service running 24/7. Never create a second free Render service. |
| Keep-alive | cron-job.org + GitHub Actions schedule (free on public repos) + server self-ping | See `plan/12-deploy-free-and-keepalive.md` |
| Web search | Tavily free tier / Builders Program credits | Cache results |
| Avatars | DiceBear (free avatar URLs) | No real people's photos in seed data |

Do NOT use Nebius AI Cloud compute (Serverless Jobs or Endpoints). The free credits cover Token Factory only. Don't add any paid service or anything that requires a credit card.

## Tech stack

- **Server:** Node 22, Express 5, Socket.IO 4, Mongoose 8, zod, jsonwebtoken, bcryptjs, `openai` SDK (pointed at Token Factory), `@tavily/core`. ESM (`"type": "module"`). Plain JavaScript; no TypeScript, to keep velocity high.
- **Client:** React + Vite, Tailwind CSS v4 (`@tailwindcss/vite`), React Router, axios, socket.io-client, react-force-graph-2d.
- **Auth:** JWT in the `Authorization: Bearer` header, stored in localStorage. Socket.IO authenticates with the same token in the `auth` handshake field. Frontend and backend are on different domains, so avoid cookies.

## Repo layout

```
dating-agent/
  CLAUDE.md            ← this file
  plan/                ← build prompts (read-only for Claude Code unless asked)
  LICENSE              ← MIT
  README.md
  render.yaml          ← Render blueprint (free plan)
  .github/workflows/keep-alive.yml
  server/
    src/
      index.js           app + socket bootstrap
      config/            env loading + validation (zod)
      models/            Mongoose models
      routes/            Express routers
      middleware/        auth, error handler, rate limit
      sockets/           socket handlers
      services/
        llm/             Token Factory client, tiers, budget, usage log
        prompts/         prompt templates (one file per prompt)
        kg/              fact extraction, embeddings, similarity, queries
        trust/           fake/inconsistency check
        brief/           match understanding + agenda
        agent/           conversation engine, pacing, locks, stop rules, exit
        compat/          scoring + verdict report
        tavily/          date ideas
      utils/
    scripts/             smoke test, seed, eval, simulate
    seed/                personas.json, pairs.json (committed)
    eval/                results.md (generated)
  client/
    src/
      pages/ components/ lib/ (api.js, socket.js) hooks/ styles/
```

## Temporary LLM provider (NVIDIA build.nvidia.com, until we switch back to Nebius)

- Token Factory needs a payment card, so **development and testing currently run on NVIDIA's free API** (`https://integrate.api.nvidia.com/v1`, `nvapi-...` key) while a teammate sets up the Nebius account with the promo credits.
- The env var names stay the same: `NEBIUS_BASE_URL` / `NEBIUS_API_KEY` currently hold the NVIDIA URL and key. `LLM_PROVIDER=nvidia|nebius` is for logging and README notes only.
- **Before final deployment for judging we switch back to Nebius Token Factory.** The hackathon requires runtime Token Factory calls, so the final demo, README and video must use Nebius. The switch must need **only `.env` changes, no code changes**. Checklist: `plan/14-switch-to-nebius.md` (target: by Oct 26).
- The NVIDIA free tier allows ~40 requests/min in total: the LLM client has a global limiter (`LLM_MAX_RPM`, default 35); keep simulate/eval at low concurrency.
- Spending protection for when a real card is attached: per-model prices in env, cost stored per call, all-time `LLM_HARD_CAP_USD` (default 35) blocks every call, `LLM_ENABLED=false` kill switch.
- **Never print, echo, log or commit any secret value from `.env`.**

## LLM model routing

The exact model IDs come from `.env`. Copy them from `GET /v1/models` (run `server/scripts/smoke.js`) and never hard-code them.

| Env var | Model | Use for |
|---|---|---|
| `MODEL_FAST` | Nemotron 3 Nano | Conversation turns, quick classifiers |
| `MODEL_MID` | Nemotron 3 Super | Fact extraction, belief updates, trust check, seed generation |
| `MODEL_SMART` | Nemotron 3 Ultra | Final compatibility verdict ONLY (expensive) |
| `MODEL_EMBED` | Any embedding model on Token Factory | Fact embeddings |

**Gotcha:** the Nemotron models on Token Factory are reasoning models. If `max_tokens` is too small, the reasoning eats the budget and `content` comes back empty. Always set a generous `max_tokens` (≥ 2048 for chat turns), strip `<think>…</think>` and any reasoning field, and never let reasoning text reach a user-visible message.

All LLM calls go through `server/src/services/llm/client.js`. Nothing else imports `openai` directly.

## Coding conventions

- Small modules, one responsibility each. Prompt text lives in `services/prompts/*.js` as exported template functions, never inline in business logic.
- Validate every LLM JSON output with zod, retry once on failure, then fail gracefully: log it and keep the app running.
- Every Express route uses async error handling and returns `{ error: { code, message } }` on failure.
- Every env var is validated at boot in `config/env.js`. Fail fast with a clear message.
- Never commit `.env`. Keep `.env.example` up to date whenever a new env var is added.
- Write a short `README` section or JSDoc only when it explains something non-obvious.
- Test as you go: each plan file ends with acceptance checks. Run them and report results before saying a task is done.
- Commit after each plan file with a message like `feat(plan-05): onboarding + knowledge graph`.

## Commands

```bash
# server
cd server && npm run dev        # nodemon src/index.js
node scripts/smoke.js           # verify Token Factory + list model IDs
node scripts/seed.js            # load seed personas into Mongo
node scripts/simulate.js <userA> <userB>   # run an agent↔agent pre-date, no delays
node scripts/eval.js            # run labelled pairs, write eval/results.md

# client
cd client && npm run dev        # http://localhost:5173
```

## Status

Keep this updated at the end of each plan file: one line per completed plan item, plus any decisions that deviate from the plan.

- [x] 02 scaffold — Node 24 locally (engines >=22). Mongoose pinned to 8 (npm latest is 9). Vite 8 + React 19. JWT_SECRET must be >= 32 chars.
- [x] 03 LLM layer — acceptance checks pass **on NVIDIA** (temporary provider): smoke lists models + clean reply + 2048-dim embedding; `llm-check` 3/3 chatJSON + cached embed; `--budget` (LLM_DAILY_CALLS_PER_USER=1) throws BudgetExceededError; `spend-cap-check` proves the $0.01 cap and LLM_ENABLED=false block calls instantly. Usage docs verified in the in-memory test DB (Atlas pending, see below). **Model IDs (NVIDIA):** fast `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` (the listed `nvidia/nemotron-nano-3-30b-a3b` 404s for our account; Omni is slow, 18–42 s/call, and returns 503 when busy — `nvidia/nemotron-3.5-lightning-30b-a3b` answers in ~10 s if latency hurts), mid `nvidia/nemotron-3-super-120b-a12b`, smart `nvidia/nemotron-3-ultra-550b-a55b`, embed `nvidia/nemotron-3-embed-1b`. **Reasoning finding:** all three Nemotron chat models return reasoning in a separate `message.reasoning_content` field; `content` is clean (no <think> tags). Retries are now our own (3 attempts, backoff+jitter, honours Retry-After) so every attempt passes the global RPM limiter; SDK retries off. Timeouts raised to 90/120/180 s for NVIDIA latency. Embeddings send `input_type` (auto-dropped if a provider rejects it); KgFact stores `embeddingModel`; `scripts/reembed.js` refreshes mismatches. Spend: per-tier prices (`LLM_PRICE_*`), `costUsd` per Usage doc, all-time total, `LLM_HARD_CAP_USD` fails closed (blocks if prices are set but spend can't be read), `LLM_ENABLED` kill switch; GET /api/me returns `system.agentPaused` and the UI shows a banner. **Atlas: NOT connecting yet** — TLS rejected (SSL alert 80) = this machine's IP not on the Atlas Network Access list.
- [x] 04 backend core — `npm run api-check [baseUrl]` runs a 19-step e2e check (REST + sockets + DELETE /me), all passing against a local in-memory Mongo; two real browser windows not tested (no UI yet). Postman v2.1 collection in server/api-collection/ (Bruno can import it). Additions: Match.pairKey (unique, prevents duplicate matches on simultaneous likes), Match.lastMessageAt, perUser.lastReadAt (unread counts). message:new goes to `user:<id>` rooms because authoredBy is redacted per viewer; match rooms carry typing. Discover filters by mutual gender/interestedIn; dealbreakers are hidden from other users. Socket events ack `{ ok, error? }`. Inbox answer just stores it (plan 08 adds facts); date-ideas returns 501.
- [x] 05 onboarding + knowledge graph — `node scripts/onboard-sample.js` passes on NVIDIA (in-memory DB; Atlas login still failing): offline unit checks (trait reverse-scoring, B/D mapping, style metrics, verbatim-quote check) + live build of a realistic user in ~100 s → 43 facts, 5 correct traits, every LLM quote verbatim (non-verbatim ones are dropped in code), every fact embedded with `embeddingModel`, populated styleProfile (metrics + description + do/don't lists), valid /api/kg/me graph, inbox answer → `user_answer` facts that survive re-submit. Real browser onboarding (mocks off) verified: signup → A–E → processing (69 s) → review with real facts, toggle + delete. Story extraction runs 2 at a time (rate-limit friendly). Deviations: the user's own religion answer defaults to `if_asked` (never raised unprompted); emoji-only tokens don't count as words in style metrics; a server restart marks in-flight onboarding as `failed` so the UI offers re-submit; submit validates the answer shape with zod. Plan-10 mocks for onboarding/sample graph removed; the demo match mock remains until plans 06–09. Graph view labels only important nodes when > 16 nodes (hover for the rest).
- [x] 06 trust check — `node scripts/trust-check.js` passes on NVIDIA (in-memory DB; Atlas login still failing), 2 runs in a row: all 6 crafted cases in `seed/trust-cases.json` land on their expected level (ok, ok, ok, caution, caution, likely_fake), mild contradictions become `clarify` topics, every contradiction carries a verbatim profile quote (others dropped in code); real pipeline verified: mutual like → trust_check → `flagged_fake` (scammer) / `briefing` (clean). Rule patterns + `scanMessage(text) → { flags, severity 0–3 }` live in `services/trust/rules.js` for plan 08 ("add me on telegram, I can help you invest" = 3). Deviations: the subject's dealbreakers are NOT sent to the consistency check (they're private and the result is shown to the viewer); money rules match phrases ("investment opportunity", "guaranteed returns") not bare words, so "investment banker" isn't flagged; the prompt has a concrete severity guide (needed: the model rated blatant reversals as 2); a flagged match reads as `closed` for the flagged side (`statusFor`), only the flagging viewer gets `trust:flagged` + reasons; messages are refused on flagged matches; matches stuck in matched/trust_check are resumed on boot. If the LLM check fails, rule results still stand. Photo check (stretch) skipped. `services/brief/index.js#startBrief` is the plan-07 hook (no-op).
- [ ] 07 match brief
- [ ] 08 agent conversation
- [ ] 09 compatibility + handoff
- [x] 10 frontend — all screens + live match room. Verified in headless Chrome (puppeteer, not committed) against the real API + in-memory Mongo with `VITE_USE_MOCKS=true`: signup→onboarding→review→discover→match→room→take over (input unlocks in <50 ms)→report receipts→continue→reveal; 0 console errors; no horizontal scroll at 375px; light + dark. Mocks (`client/src/lib/mock.js`) add a scripted demo match `/matches/demo` and stand in for plans 05–09 (onboarding status, sample graph, inbox item); delete once those land. Contract assumptions for later plans: `kg:update` may carry `{ agenda }` to update agenda statuses live; agenda items may carry `confidence`; report `dimensions[key] = { score, confidence }`, `report.chemistry`, `report.icebreakers`; date-ideas returns `{ ideas: [{ title, why, link }], icebreakers? }`; "Talk anyway" on an incompatible report calls `POST /decision { continue }`, so plan 09 must reopen the match on that. Bundle 620 KB (force-graph); code-split if load time matters.
- [ ] 11 seed data + eval
- [ ] 12 deploy + keep-alive
- [ ] 13 submission
- [ ] 14 switch back to Nebius Token Factory (by Oct 26) — checklist in plan/14-switch-to-nebius.md
