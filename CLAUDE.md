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
- [ ] 03 LLM layer
- [ ] 04 backend core
- [ ] 05 onboarding + knowledge graph
- [ ] 06 trust check
- [ ] 07 match brief
- [ ] 08 agent conversation
- [ ] 09 compatibility + handoff
- [ ] 10 frontend
- [ ] 11 seed data + eval
- [ ] 12 deploy + keep-alive
- [ ] 13 submission
