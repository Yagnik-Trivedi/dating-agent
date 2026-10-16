# Start here

This folder holds the build plan as a series of prompts for Claude Code. Each file is one self-contained task with acceptance checks. `CLAUDE.md` in the project root holds the shared context. Claude Code loads it automatically, so the prompts don't repeat it.

## How to run a prompt

1. Open a terminal in `D:\projects\dating-agent` and start Claude Code.
2. Say: **"Read plan/0X-<name>.md and implement it. Run the acceptance checks at the end and report the results."**
3. Review the diff, run the app, then commit.
4. Start a fresh Claude Code session for the next file. This keeps the context small and focused.

`01-accounts-and-setup.md` is a checklist for **humans**. Claude Code can't create accounts. Do it first.

## Order and dependencies

**The knowledge-graph design changed (plan 15, executed by plan 16).** Plans 02–04 stay as built. Plans 05–11 were rewritten to match `15-knowledge-graph-final.md`, and the new plan 17 lays the foundation. `kg-upgrade-reference.md` is the detailed reference spec; plan 15 wins where they disagree.

**Build order:**

**02 → 03 → 04 → 17 (jobs & indexes) → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 14 (switch to Nebius) → 12 → 13**

```
02 scaffold ─► 03 LLM layer ─► 04 backend core ─► 17 jobs, vectors, gate, indexes
                                                      ▼
                                05 KG v2: concepts, edges, voice, build job, review API
                                                      ▼
                                06 trust check (public profile only, in the match-created job)
                                                      ▼
                                07 gate re-check, profile-only brief, own-graph agenda, conversation doc
                                                      ▼
                                08 persona engine + per-turn pipeline (perceive/observe, act plan, checks)
                                                      ▼
                                09 independent judges, handoff, compaction, date ideas
                                                      ▼
                                10 frontend v2 ─► 11 seed personas + evaluation + scale test
                                                      ▼
                                14 switch to Nebius ─► 12 deploy + keep-alive ─► 13 submission
```

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
