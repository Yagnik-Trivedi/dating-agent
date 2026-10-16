# Progress tracker

The team's single status board. Claude Code updates it after every task, plan step, checkpoint, pause or switch, and pushes it to `main`. `CLAUDE.md` → Status has the detailed acceptance results for each plan.

- **Last updated:** 2026-10-16 23:05 IST, by Claude Code (plan 09: code done, live checks blocked on `server/.env`)
- **Main-line branch:** `feat/plan-09-judges` (from `main`) · **main:** `3072867` (plans 02–08 + 17 done)
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
| 09 | Independent judges, handoff, compaction, date ideas (v2) | 🔄 In progress | `feat/plan-09-judges` | `ce4c0cb` | Code, unit tests, scripts and client patch done; `npm test` 63/63, `api-check` 19/19. **Live checks blocked: no `server/.env` on this machine.** |
| 10 | Frontend v2 patch | ⬜ Not started | — | — | Functional changes only. Visual restyling waits for plan 20's design. |
| 11 | Seed personas + evaluation (v2) | ⏸ Paused | `wip/plan-11b` | `a8fc99c` | **Stopped at:** the v1 eval harness (partial), superseded by v2. **Resume:** after 10, write v2 on a new branch reusing `scripts/lib/runPair.js` + the `eval.js` report from `wip/plan-11b`; add ≥ 3 eligible seeds per demo city. |
| 12 | Deploy on free tiers + keep-alive | ⬜ Not started | — | — | Prep (render.yaml, keep-alive, self-ping, DEPLOY.md) is queued as side work. |
| 13 | Submission (README, video, Devpost) | ⬜ Not started | — | — | README skeleton is queued as side work. |
| 14 | Switch back to Nebius Token Factory | ⬜ Not started | — | — | **Due Oct 26.** Needs the Nebius account. The dry-run checklist is queued as side work. |
| 15 | Knowledge graph: final design | ✅ Done (design doc) | main | `f91d072` | Source of truth for the KG. |
| 16 | KG upgrade execution | 🔄 In progress | — | — | Steps 1–3 done; step 4: 17, 05, 06, 07, 08 done, 09 in progress. |
| 17 | Jobs, storage and indexes | ✅ Done | main | `3522f63` | Job queue, compact vectors, gate query, indexes. |
| 18 | Architecture decisions | ⬜ Not started | main | (this commit) | Decision doc, now committed. Not folded into the plans yet; §13 maps it to 05/08/09/10/11/17 and a new 19. Needs a decision (see Blocked). |
| 19 | Verification (liveness + face match) | ⬜ Not started | — | — | **No file yet.** Plan 18 §13 says to create `19-verification.md`. |
| 20 | UI design brief | 🚫 Not for Claude Code (design team) | main | (this commit) | Prompt for Claude Design. Claude Code does not touch it. |
| ref | kg-upgrade-reference | ✅ Done (reference) | main | `f91d072` | Implementation detail where plan 15 is silent. |

## Currently working on

**Plan 09 on `feat/plan-09-judges`** (owner said "go" 2026-10-16 ~21:45 IST).

**Done so far** (`4c08336`, pushed): judge job per side (`services/conversation/judge.js`, smart at t=0 → mid reasoning-off fallback, `judgeModel` recorded; last failed attempt writes an honest `unsure` so a match never hangs) → `MatchDecision`; code validators (verbatim quotes mapped to real message ids, generic positives rejected, frictions or a justification, `dealbreakerRisk` when a `dealbreaker_hint` exists, yes below `JUDGE_YES_MIN` → unsure, a hinted dealbreaker is never an automatic yes) with one re-ask (`judge-reask`); `settle` (lower label, atomic, wind-down with exemplars + closing style from a "no" side whose agent is active); `decide` / "Talk anyway" on `MatchDecision` (reopening un-archives); `compactNotes` job on closed/flagged_fake; `GET /matches/:id/report`, `GET /conversations/:id/replay`; date ideas from my `shared_interest` events + my city; account deletion (ChatEvents, MatchDecisions, "Deleted user", messages kept only in handed-off matches). Removed v1 `compat/evaluate.js`, `compat/config.js`, prompts `alignment` + `verdict`, `Match.report`. `npm test` 63/63 (11 new: validators + settle/handoff/wind-down/Talk anyway/compaction).

Then (`ce4c0cb`, pushed): `scripts/judge-check.js` replaces v1 `compat-check.js` (anti-smoking friction, a dealbreaker that surfaces only in chat → no + dealbreakerRisk + one wind-down + compaction + "Talk anyway", one judge call per side, DB spy, handoff on the simulate pair, date ideas cache/503/spy); `simulate.js` prints MatchDecisions; `runPair` also clears decisions, moments and conversations; `check-indexes` covers `matchdecisions`; Report page shows quotes, the dealbreaker notice from `dealbreakerRisk` and the no-friction justification; account deletion also removes chats once both sides are gone. **Verified without an LLM key:** `npm test` 63/63, `api-check` 19/19 (local dev-db, placeholder env, AI off), `check-indexes` all ✓ incl. TTL, client build OK.

**Next:**
1. **Copy `server/.env` onto this machine** (blocked: none here).
2. Live on NVIDIA (dev-db, wipe + re-seed): `node scripts/simulate.js seed01@demo.local seed04@demo.local` (designed compatible → both yes), then `node scripts/judge-check.js`, `seed-check`, `agent-check`; tune `JUDGE_YES_MIN` only if the compatible pair lands on unsure.
3. CLAUDE.md Status line for plan 09, final commit `feat(plan-09): …`, merge to `main`, stop for "go".
4. Not doing: the optional round-2 follow-up chat (plan 09 §2 "Optional").

**Side work (parallel, only while the main line waits at a checkpoint):** queue, in order:

1. ✅ **CI test workflow** on `side/ci-tests` (`bbd6dcd`, pushed, **not merged; merge to `main` on the owner's OK**). Only `.github/workflows/ci.yml`: Node 22, `npm ci` + `npm test` in `server/`, dummy env (no secrets; `LLM_ENABLED=false`; dummy `MODEL_*` IDs because `createConcept` reads the embed model name), caches the MongoDB binary, runner pinned to `ubuntu-24.04` (`ubuntu-latest` moves to Ubuntu 26 on Oct 19 and mongodb-memory-server may not know it), actions checkout@v7 / setup-node@v7 / cache@v6 (v4 ran on deprecated Node 20). GitHub Actions run 38928682293: green, 52/52, no warnings.
2. **Deploy prep (plan 12)** on `side/deploy-prep`. Touches `render.yaml`, `.github/workflows/keep-alive.yml`, `server/src/keepalive.js` (+ one line in `index.js`), and `DEPLOY.md`. Nothing schema-related.
3. **README skeleton + "How we use Nemotron + Token Factory"** (plan 13 prep) on `side/readme`.
4. **Plan 14 dry-run checklist** on `side/nebius-dryrun`: docs only, no key needed.
5. **Plan 18 §1 benchmark** (face-embedding memory/latency at 512 MB, MediaPipe prototype) in an isolated folder, on `side/verify-bench`. **Starts only after you approve the dependencies.**

## Blocked / needs a human

- **Atlas:** the DB user login fails, so `MONGODB_URI` in `.env` doesn't work. Every check runs on the local replica set (`npm run dev-db`). Fix the Atlas user/password and allow the IP.
- **`TAVILY_API_KEY` is empty:** date ideas return 503 `DATE_IDEAS_UNAVAILABLE`.
- **Nebius account + promo credits** for plan 14 (switch by Oct 26). Until then dev runs on NVIDIA's free API (~40 requests/min; it sometimes times out).
- **Decision on plan 18/19:** should plan 18 be folded into 08–11 as each is built, should 05/17 be retro-fitted (epistemic fields, supersede/dispute, pending queue), and should Claude Code write `19-verification.md`? Your note puts 19 after 05; `00-START-HERE` has no 19 yet.
- **"go" checkpoints:** each plan stops for "go" after its checks pass. Plan 09 got "go".
- **`server/.env` is missing on the current dev machine** (C:\Users\viranshul): plan 09's live checks can't run until it's copied in.

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
