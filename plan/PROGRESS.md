# Progress tracker

The team's single status board. Claude Code updates it after every task, plan step, checkpoint, pause or switch, and pushes it to `main`. `CLAUDE.md` → Status has the detailed acceptance results for each plan.

- **Last updated:** 2026-10-16 21:30 IST, by Claude Code (waiting for "go" on plan 09; side work 1 (CI) pushed on `side/ci-tests`)
- **Main-line branch:** `main` (plan 08 merged; plan 09 gets `feat/plan-09-judges` when it starts) · **main:** `3072867` (plans 02–08 + 17 done)
- **Last commit (main line):** `3072867` feat(plan-08)

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
| 09 | Independent judges, handoff, compaction, date ideas (v2) | ⬜ Not started | — | — | **Next; waiting for "go".** v1 (`9889032`) still runs until v2 replaces it. |
| 10 | Frontend v2 patch | ⬜ Not started | — | — | Functional changes only. Visual restyling waits for plan 20's design. |
| 11 | Seed personas + evaluation (v2) | ⏸ Paused | `wip/plan-11b` | `a8fc99c` | **Stopped at:** the v1 eval harness (partial), superseded by v2. **Resume:** after 10, write v2 on a new branch reusing `scripts/lib/runPair.js` + the `eval.js` report from `wip/plan-11b`; add ≥ 3 eligible seeds per demo city. |
| 12 | Deploy on free tiers + keep-alive | ⬜ Not started | — | — | Prep (render.yaml, keep-alive, self-ping, DEPLOY.md) is queued as side work. |
| 13 | Submission (README, video, Devpost) | ⬜ Not started | — | — | README skeleton is queued as side work. |
| 14 | Switch back to Nebius Token Factory | ⬜ Not started | — | — | **Due Oct 26.** Needs the Nebius account. The dry-run checklist is queued as side work. |
| 15 | Knowledge graph: final design | ✅ Done (design doc) | main | `f91d072` | Source of truth for the KG. |
| 16 | KG upgrade execution | 🔄 In progress | — | — | Steps 1–3 done; step 4: 17, 05, 06, 07, 08 done, 09 next. |
| 17 | Jobs, storage and indexes | ✅ Done | main | `3522f63` | Job queue, compact vectors, gate query, indexes. |
| 18 | Architecture decisions | ⬜ Not started | main | (this commit) | Decision doc, now committed. Not folded into the plans yet; §13 maps it to 05/08/09/10/11/17 and a new 19. Needs a decision (see Blocked). |
| 19 | Verification (liveness + face match) | ⬜ Not started | — | — | **No file yet.** Plan 18 §13 says to create `19-verification.md`. |
| 20 | UI design brief | 🚫 Not for Claude Code (design team) | main | (this commit) | Prompt for Claude Design. Claude Code does not touch it. |
| ref | kg-upgrade-reference | ✅ Done (reference) | main | `f91d072` | Implementation detail where plan 15 is silent. |

## Currently working on

**Checkpoint: plan 08 is done; waiting for the owner's "go" on plan 09.**

All plan 08 checks pass: `npm test` 52/52, `agent-check` live, `api-check` 19/19, `seed-check`, `check-indexes`, plus two simulations.

**Plan 09 first steps** (for whoever continues):
1. `git checkout -b feat/plan-09-judges` from `main`, then read `plan/09-compatibility-and-handoff.md`.
2. Replace the v1 judge (`services/compat/`) with one judge job per side → `MatchDecision` with verbatim-quote validators.
3. Map yes → Compatible, unsure → Maybe, no → Not compatible; the match is the lower of the two sides; handoff only on mutual yes.
4. Carried over from 08: the smart tier (Ultra) often times out on NVIDIA, so the judge needs a fallback tier or a retry, or verdicts degrade to `maybe`.

**Side work (parallel, only while the main line waits at a checkpoint):** queue, in order:

1. ✅ **CI test workflow** on `side/ci-tests` (`a4751c5`, pushed, not merged). Only `.github/workflows/ci.yml`: Node 22, `npm ci` + `npm test` in `server/`, dummy env (no secrets; `LLM_ENABLED=false`; dummy `MODEL_*` IDs because `createConcept` reads the embed model name), caches the MongoDB binary. Verified locally with exactly that env and no `.env`: 52/52. **Next:** confirm the first GitHub Actions run is green, then merge to `main` on the owner's OK.
2. **Deploy prep (plan 12)** on `side/deploy-prep`. Touches `render.yaml`, `.github/workflows/keep-alive.yml`, `server/src/keepalive.js` (+ one line in `index.js`), and `DEPLOY.md`. Nothing schema-related.
3. **README skeleton + "How we use Nemotron + Token Factory"** (plan 13 prep) on `side/readme`.
4. **Plan 14 dry-run checklist** on `side/nebius-dryrun`: docs only, no key needed.
5. **Plan 18 §1 benchmark** (face-embedding memory/latency at 512 MB, MediaPipe prototype) in an isolated folder, on `side/verify-bench`. **Starts only after you approve the dependencies.**

## Blocked / needs a human

- **Atlas:** the DB user login fails, so `MONGODB_URI` in `.env` doesn't work. Every check runs on the local replica set (`npm run dev-db`). Fix the Atlas user/password and allow the IP.
- **`TAVILY_API_KEY` is empty:** date ideas return 503 `DATE_IDEAS_UNAVAILABLE`.
- **Nebius account + promo credits** for plan 14 (switch by Oct 26). Until then dev runs on NVIDIA's free API (~40 requests/min; it sometimes times out).
- **Decision on plan 18/19:** should plan 18 be folded into 08–11 as each is built, should 05/17 be retro-fitted (epistemic fields, supersede/dispute, pending queue), and should Claude Code write `19-verification.md`? Your note puts 19 after 05; `00-START-HERE` has no 19 yet.
- **"go" checkpoints:** each plan stops for "go" after its checks pass. **Waiting now: "go" for plan 09.**

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
7. **Next plan:** 09 (after "go").

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

**Last handoff state:** 2026-10-16 21:30 IST. Plan 08 merged to `main`; side work 1 (CI) pushed on `side/ci-tests`, nothing uncommitted. Next: plan 09 after "go"; meanwhile side work 2 (deploy prep).
