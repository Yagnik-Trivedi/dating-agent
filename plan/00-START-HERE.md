# Start here

This folder holds the build plan as a series of prompts for Claude Code. Each file is one self-contained task with acceptance checks. `CLAUDE.md` in the project root holds the shared context. Claude Code loads it automatically, so the prompts don't repeat it.

## How to run a prompt

1. Open a terminal in `D:\projects\dating-agent` and start Claude Code.
2. Say: **"Read plan/30-final-sprint.md and continue from the next open step in PROGRESS.md."**
3. Review the diff, run the app, then commit.
4. Start a fresh Claude Code session for the next file. This keeps the context small and focused.

`01-accounts-and-setup.md` is a checklist for **humans**. Claude Code can't create accounts. Do it first.

## Order and dependencies

**All open work is in `30-final-sprint.md`** (owner, 2026-10-18). It merges the old plans 21 and 22 and the post-deploy findings. Run it in order S0 → S7.

**Live status:** `plan/PROGRESS.md` is the team's status board. Read it first.

| Phase | Plans | Notes |
|---|---|---|
| Done (in `plan/archive/`) | 02 → 03 → 04 → 17 → 05 → 06 → 07 → 08 → 09 → 11 → 10 → 19 | v2 knowledge graph, engine, judges, eval, frontend, live check |
| Now | **30** (S0 bugs → S1 speed → S6 design foundation → S2 onboarding → S3 dating-app core → S4 accounts → S5 P1 → S7 ship) | Feature freeze Oct 28, submit Oct 29 |
| Ops, used by 30 | 12 (deploy + keep-alive), 14 (Nebius check, Oct 26), 13 (submission) | |

**Reference docs:** 15 (knowledge-graph source of truth), 18 (architecture decisions; see its status banner), 01 (human checklist). Finished plans are in `plan/archive/` (still valid as references for how each part was built).

**Rules:**
- The app stays runnable after every step, and `npm run smoke:browsers` passes on the local production build.
- **Commit locally, don't push or deploy** until the owner says so (limited free-tier deploys). There's one push + deploy in plan 30 S7.
- Wipe and re-seed test data rather than migrating, **except** real users' data from now on (the site is live): write migrations for those.
- Each step: implement → acceptance checks → update `PROGRESS.md` → commit locally.

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
