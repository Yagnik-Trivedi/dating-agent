# Start here

This folder holds the build plan as a series of prompts for Claude Code. Each file is one self-contained task with acceptance checks. `CLAUDE.md` in the project root holds the shared context. Claude Code loads it automatically, so the prompts don't repeat it.

## How to run a prompt

1. Open a terminal in `D:\projects\dating-agent` and start Claude Code.
2. Say: **"Read plan/0X-<name>.md and implement it. Run the acceptance checks at the end and report the results."**
3. Review the diff, run the app, then commit.
4. Start a fresh Claude Code session for the next file. This keeps the context small and focused.

`01-accounts-and-setup.md` is a checklist for **humans**. Claude Code can't create accounts. Do it first.

## Order and dependencies

The knowledge graph and agent engine were rebuilt as v2 (design: `15-knowledge-graph-final.md`). Plans 05–11 describe the v2 build.

**Live status:** `plan/PROGRESS.md` is the team's status board (what's done, in progress or blocked, and how to continue). Read it first.

**Build order** (owner's phases, 2026-10-17):

| Phase | Plans | Notes |
|---|---|---|
| Done | 02 → 03 → 04 → 17 → 05 → 06 → 07 → 08 → 09 | v2 knowledge graph and engine |
| 1. Backend + tests (now) | 11 (Part B: tuning, scale test, metrics, ablation, one full run) | Reduced scope, see plan 11 |
| 2. Frontend | 19 (live check: backend + vision script now, plain screen; cut-off Oct 25) → 10 (from the owner's final design; includes the small backend additions it lists) | No restyling of `client/` before the design hand-over; plan 19's new plain screen is the exception |
| 3. Go live | 14 (switch to Nebius, by Oct 26) → 12 (deploy, keep-alive, judge accounts, demo pacing) | |
| 4. Submit | 13 (README, Devpost; the video is by humans) | Feature freeze Oct 28, submit Oct 29 |

**Reference docs:** 15 (knowledge-graph source of truth), 18 (architecture decisions; see its status banner), 20 (design background), 01 (human checklist). Finished execution docs are in `plan/archive/`.

**Rules for every plan from 17 onward:**
- The app stays runnable after each plan: signup → onboarding → discover → match → agent chat works end to end (degraded is fine, broken isn't), with seed data re-loaded by the updated seed script.
- Wipe and re-seed test data instead of writing migrations.
- Each plan: implement → acceptance checks → commit + push → one Status line in `CLAUDE.md` → stop for "go".

## Team split (4 people)

| Person | Owns | Plan files |
|---|---|---|
| A — Agent lead | LLM layer, conversation engine, judges | 03, 08, 09 |
| B — Backend lead | Scaffold, models, auth, matching, jobs, sockets, deploy | 02, 04, 17, 12 |
| C — Frontend lead | All UI | 10 |
| D — Trust + data lead | KG, trust check, brief, seed data, eval, video, README | 05, 06, 07, 11, 13, 14 |

**Branches:** `feat/plan-05-onboarding-kg`, and so on. Open a PR into `main`; one other person skims it before merge. Never push `.env`.

## Fixed dates

| Date | What |
|---|---|
| by Oct 26 | Switch to Nebius Token Factory (plan 14) before the final deploy |
| Oct 28 | Feature freeze: video, README, Devpost write-up |
| Oct 29 | **Submit** (Oct 30 10:30 PM IST deadline is buffer only) |
| through Dec 15 | Demo URL stays live and testable (judging) |

Plan 16 sets no other time constraint: build the full design, in the order above.

## Rules for the whole team

- If a plan file is wrong or a better approach appears, update the plan file in the same PR and note it in the Status section of `CLAUDE.md`.
- Watch credit usage daily. Check the `usage` collection or `GET /api/admin/usage`. Credits must last through judging (Dec 1–15).
- Don't add features after Oct 28. Bug fixes only.
