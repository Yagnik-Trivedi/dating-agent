# Progress tracker

The team's single status board. Claude Code updates it after every task, plan step, checkpoint, pause or switch, and pushes it to `main`. `CLAUDE.md` → Status has the detailed acceptance results for each plan.

- **Last updated:** 2026-10-17, by Claude Code (plan 11A personas pass every quota on `feat/plan-11-personas`; full re-seed running)
- **Main-line branch:** `feat/plan-11-personas` (from `main`) · **main:** `cbd8faa` (plans 02–09 + 17 done)
- **Last commit (main line):** `d5fdbea` feat(plan-11a) on `feat/plan-11-personas`

Status key: ✅ Done · 🔄 In progress · ⏸ Paused · ⬜ Not started · 🚫 Not for Claude Code

## Plans

Build order (plan 16 / `00-START-HERE`): 02 → 03 → 04 → 17 → 05 → 06 → 07 → **08** → 09 → 10 → 11 → 14 → 12 → 13. Plans 05–11 were rewritten for the v2 knowledge graph; the v1 builds of 05–10 are in the history, but v2 replaces them.

| Plan | Title | Status | Branch | Last commit | Notes / next step |
|---|---|---|---|---|---|
| 00 | Start here | ✅ Done | main | `4cafa14` | Build order + fixed dates. |
| 01 | Accounts and local setup | 🚫 Not for Claude Code | — | — | Humans. Still open: Atlas login, Tavily key, Nebius account (see Blocked). |
| 02 | Scaffold | ✅ Done | main | `13a7f10` | |
| 03 | LLM layer | ✅ Done | main | `1567236` | Runs on NVIDIA's free API for now; only the provider changes later (plan 14). |
| 04 | Backend core + API contract | ✅ Done | main | `04b66db` | `npm run api-check` 19/19. |
| 05 | Onboarding + knowledge graph (v2) | ✅ Done | main | `1417ee0` | v1 was `219d0ef`. `feat/plan-05-kg-v2` is merged and can be deleted. |
| 06 | Trust check (v2) | ✅ Done | main | `d8d1a80` | The DB spy proves it reads only the public profile. |
| 07 | Gate, brief, agenda, conversation (v2) | ✅ Done | main | `916f89d` | No facts about the other user are stored. |
| 08 | Agent conversation: persona engine + per-turn pipeline (v2) | ✅ Done | main | `3072867` | ~76k tokens / 50 calls per conversation (v1 ~266k). Known gaps are listed in CLAUDE.md Status. `feat/plan-08-engine` is merged and can be deleted. |
| 09 | Independent judges, handoff, compaction, date ideas (v2) | ✅ Done | main | `857aff1` | Includes the structural "ask my human" fix. Meera × Ishaan → Compatible (yes/yes). `feat/plan-09-judges` and `fix/ask-my-human` are merged and can be deleted. |
| 10 | Frontend v2 patch | ⬜ Not started | — | — | **Phase 2: waits for the owner's design.** No `client/` work before that. |
| 11 | Seed personas + evaluation (v2) | ⏸ Paused | `wip/plan-11b` | `a8fc99c` | **Stopped at:** the v1 eval harness (partial), superseded by v2. **Resume:** after 10, write v2 on a new branch reusing `scripts/lib/runPair.js` + the `eval.js` report from `wip/plan-11b`; add ≥ 3 eligible seeds per demo city. |
| 12 | Deploy on free tiers + keep-alive | ⬜ Not started | — | — | Prep (render.yaml, keep-alive, self-ping, DEPLOY.md) is queued as side work. |
| 13 | Submission (README, video, Devpost) | ⬜ Not started | — | — | README skeleton is queued as side work. |
| 14 | Switch back to Nebius Token Factory | ⬜ Not started | — | — | **Due Oct 26.** Needs the Nebius account. The dry-run checklist is queued as side work. |
| 15 | Knowledge graph: final design | ✅ Done (design doc) | main | `f91d072` | Source of truth for the KG. |
| 16 | KG upgrade execution | 🔄 In progress | — | — | Steps 1–3 done; step 4: 17, 05–09 done; 11 next (owner's order: backend first, 10 later). |
| 17 | Jobs, storage and indexes | ✅ Done | main | `3522f63` | Job queue, compact vectors, gate query, indexes. |
| 18 | Architecture decisions | ⬜ Not started | main | (this commit) | Decision doc, now committed. Not folded into the plans yet; §13 maps it to 05/08/09/10/11/17 and a new 19. Needs a decision (see Blocked). |
| 19 | Verification (liveness + face match) | 🚫 Not for Claude Code | — | — | Owner's decision 2026-10-17. No file. |
| 20 | UI design brief | 🚫 Not for Claude Code (design team) | main | `11bdcf6` | The owner hands over the design for Phase 2. |
| ref | kg-upgrade-reference | ✅ Done (reference) | main | `f91d072` | Implementation detail where plan 15 is silent. |

## Owner's order (updated 2026-10-17, replaces the earlier order)

**Backend and testing first, frontend last, then deploy and submit.** No UI or `client/` work until the owner hands over the frontend design.

1. **Phase 1, backend + tests (now):**
   - finish 09 (live checks, merge)
   - 11A: seed personas + re-seed
   - 11B: evaluation harness, ablations, scale test, 20-pair runs
   - tuning: conversation quality and judge calibration
   - fix whatever the tests find

   Backend-only parts of later plans also go here when they need no UI: plan 12's `trust proxy`, Socket.IO CORS, the log level, the credit guard and `seed.js --judges`.
2. **Phase 2, frontend:** plan 10 (v2 screens) built from the owner's design (which replaces plan 20's brief), including plan 12's wake-up screen.
3. **Phase 3, go live:**
   - 14: switch to the Nebius key. Smoke-test the key as soon as it exists; if the embedding model differs, switch before 11's final eval numbers.
   - 12: render.yaml, keep-alive, DEPLOY.md
4. **Phase 4, submit:** 13 (README, Devpost; the video is by humans).

**Not for Claude Code:** 19 (verification) and 20 (design brief).

Humans, before Phase 3: Nebius account + credits, Atlas login, Tavily key (optional).

## Currently working on

**Owner's approved plan, step 3: plan 11 personas on `feat/plan-11-personas`.**

- **Step 1 ✅:** plan 09 merged (`cbd8faa`). judge-check passed every step, agent-check 3× in a row, api-check 19/19, seed-check end to end, check-indexes ✓, `npm test` 74/74.
- **Step 2 ✅:** "ask my human" is structural (`21742b6`, `522b2fb`). Tests: IPL with no cricket fact → inbox; with a "dislikes cricket" fact → none, honest dislike grounded; Hinglish "tera favourite IPL team kaunsa hai?" → inbox; a repeat → merged; a confident uncited reply → grounding problem (regeneration) + inbox. In all 3 agent-check runs Meera answered honestly ("not sure about ipl teams honestly") and the inbox item was filed.
- **Step 3 (now):**
  - a) `seed/persona-quotas.json`
  - b) `scripts/seed/restyle-personas.js` (voice answers only, cached by spec hash)
  - c) `scripts/seed/check-personas.js` (pure code, non-zero exit on a quota miss)
  - d) incremental seeding (`contentHash`, `--force`)
  - e) re-run the 08/09 checks + eval `--limit 6`, then merge
- **Step 3 progress (`d5fdbea`):**
  - a) quotas ✓, b) restyle script ✓ (NVIDIA Super returned inputs unchanged even with measured retries, so most voices were hand-written), c) `check-personas` exits 0 ✓, d) incremental seed ✓ (`User.seedHash`, `--force`).
  - 38 personas (8 new). Before → after: Hinglish 1 → 7, Devanagari 0 → 3, Gujarati 0 → 2, Tamil/Marathi 0 → 2, code-switching 3 → 17, terse 1 → 5. Cities: 7 → 5 demo cities, each with ≥ 3 visible seeds for both new users (was 1–4). Pairs failing the gate: 10 → 0.
  - **Now:** the one full re-seed (~20 min), then e) re-run the 08/09 checks + eval `--limit 6`, merge.

**Side work: paused by the owner's order above** (item 1 is done; the rest happens in Phase 2/3):

1. ✅ **CI test workflow** on `side/ci-tests` (`bbd6dcd`, **merged to `main`** in `4aa13c8` on the owner's OK). Only `.github/workflows/ci.yml`: Node 22, `npm ci` + `npm test` in `server/`, dummy env (no secrets; `LLM_ENABLED=false`; dummy `MODEL_*` IDs because `createConcept` reads the embed model name), caches the MongoDB binary, runner pinned to `ubuntu-24.04` (`ubuntu-latest` moves to Ubuntu 26 on Oct 19 and mongodb-memory-server may not know it), actions checkout@v7 / setup-node@v7 / cache@v6 (v4 ran on deprecated Node 20). GitHub Actions run 38928682293: green, 52/52, no warnings.
2. **Deploy prep (plan 12)** on `side/deploy-prep`. Touches `render.yaml`, `.github/workflows/keep-alive.yml`, `server/src/keepalive.js` (+ one line in `index.js`), and `DEPLOY.md`. Nothing schema-related.
3. **README skeleton + "How we use Nemotron + Token Factory"** (plan 13 prep) on `side/readme`.
4. **Plan 14 dry-run checklist** on `side/nebius-dryrun`: docs only, no key needed.
5. **Plan 18 §1 benchmark** (face-embedding memory/latency at 512 MB, MediaPipe prototype) in an isolated folder, on `side/verify-bench`. **Starts only after you approve the dependencies.**

## Blocked / needs a human

- **Atlas:** the DB user login fails, so `MONGODB_URI` in `.env` doesn't work. Every check runs on the local replica set (`npm run dev-db`). Fix the Atlas user/password and allow the IP.
- **`TAVILY_API_KEY` is empty:** date ideas return 503 `DATE_IDEAS_UNAVAILABLE`.
- **Nebius account + promo credits** for plan 14 (switch by Oct 26). Until then dev runs on NVIDIA's free API (~40 requests/min; it sometimes times out).
- **Plan 18:** 19 and 20 are not for Claude Code (owner, 2026-10-17). Plan 18 §2–§11 ideas get folded in only where plans 09–11 already call for them; no retro-fit of 05/17 unless the owner asks.
- **Waiting for the owner:** step 1 failed on the "ask my human" check. Options: run step 2 first (it fixes exactly this), then finish step 1.

## How to continue

```bash
git pull
git checkout main                       # plans 02–08 + 17 done; WIP branches are listed in the table
cd server && npm install && cd ../client && npm install
```

1. Create `server/.env` from `server/.env.example`. Get the keys from the team; never commit `.env`.
2. Local DB (transactions need a replica set): run `cd server && npm run dev-db` and keep it running. Then use `MONGODB_URI=mongodb://127.0.0.1:27999/dating_agent?replicaSet=testset` in `.env` or inline.
3. `npm run seed`: about 25–30 min on NVIDIA (30 personas).
4. Run it: `npm run dev` (server) and `cd client && npm run dev` (http://localhost:5173).
5. Tests: `npm test` (spins up its own in-memory replica set).
6. Simulate: `node scripts/simulate.js seed01@demo.local seed04@demo.local`.
7. **Current plan:** 09 on `feat/plan-09-judges`.

## Handoff to another Claude Code session

This section is kept current, so another session can take over at any moment (for example when a usage limit ends a session). Everything is committed and pushed after every step; at most the step in flight is lost.

**Prompt for the next session:**

> Read CLAUDE.md, then plan/PROGRESS.md (this file), then plan/16-kg-upgrade-execution.md and the plan marked 🔄. Check out the branch named under "Currently working on" and continue from its **Next** list. Follow the standing rules below. Update PROGRESS.md after every step, then commit and push.

**Standing rules (from the project owner):**
- Never print, echo, log or commit any secret value from `.env`. Check that no `.env` is tracked before every push.
- After each plan: run its acceptance checks, commit, push, update PROGRESS.md and CLAUDE.md Status, then STOP and wait for "go".
- Ask before you add a dependency (`mongodb-memory-server` is already approved), change how agent messages are sent or shown, or delete real user data. Wiping and re-seeding seed data is fine.
- LLM: NVIDIA free API for now, at low concurrency (~40 requests/min across everyone sharing the key). The switch to Nebius must need only `.env` changes.
- Plan 20 is for the design team: don't touch it, and don't restyle `client/`.
- Side work only while the main line waits at a checkpoint, each task on its own `side/*` branch (queue under "Currently working on").

**Last handoff state:** 2026-10-16 22:20 IST. Plan 09 on `feat/plan-09-judges` (`ce4c0cb`, pushed): code done, live checks need `server/.env`. Next: see "Currently working on" → Next.
