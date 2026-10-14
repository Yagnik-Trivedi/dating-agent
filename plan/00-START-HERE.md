# Start here

This folder holds the build plan as a series of prompts for Claude Code. Each file is one self-contained task with acceptance checks. `CLAUDE.md` in the project root holds the shared context. Claude Code loads it automatically, so the prompts don't repeat it.

## How to run a prompt

1. Open a terminal in `D:\projects\dating-agent` and start Claude Code.
2. Say: **"Read plan/0X-<name>.md and implement it. Run the acceptance checks at the end and report the results."**
3. Review the diff, run the app, then commit.
4. Start a fresh Claude Code session for the next file. This keeps the context small and focused.

`01-accounts-and-setup.md` is a checklist for **humans**. Claude Code can't create accounts. Do it first.

## Order and dependencies

```
01 accounts (humans) ─► 02 scaffold ─► 03 LLM layer ─► 04 backend core (defines the API contract)
                                                          │
                     ┌────────────────────┬───────────────┼────────────────────┐
                     ▼                    ▼               ▼                    ▼
           05 onboarding + KG     06 trust check    10 frontend         11a seed personas
                     │                    │          (against the API      (generation only)
                     └─────────┬──────────┘           contract in 04)
                               ▼
                         07 match brief
                               ▼
                       08 agent conversation
                               ▼
                    09 compatibility + handoff ─► 11b eval harness
                               ▼
                 12 deploy + keep-alive ─► 13 submission
```

After 04 is merged, 05, 06, 10 and the persona-generation half of 11 can run **in parallel** on separate branches.

## Team split (4 people)

| Person | Owns | Plan files |
|---|---|---|
| A — Agent lead | LLM layer, conversation engine, verdict | 03, 08, 09 |
| B — Backend lead | Scaffold, models, auth, matching, sockets, deploy | 02, 04, 12 |
| C — Frontend lead | All UI | 10 |
| D — Trust + data lead | KG, trust check, brief, seed data, eval, video, README | 05, 06, 07, 11, 13 |

**Branches:** `feat/plan-05-onboarding-kg`, and so on. Open a PR into `main`; one other person skims it before merge. Never push `.env`.

## Timeline (today: Oct 14)

| Dates | Milestone (definition of done) | Plan files |
|---|---|---|
| Oct 14–15 | Accounts done, keys work, `smoke.js` prints Nemotron IDs, repo on GitHub with MIT | 01, 02, 03 |
| Oct 16–18 | Two humans can sign up, match and chat live; onboarding writes facts to Mongo | 04, 05, 06, 10 (screens), 11a |
| Oct 19–22 | **Full pipeline runs end to end for one pair:** match → trust → brief → agent chat → stop | 07, 08 |
| Oct 23–25 | Verdict report + handoff + date ideas; eval numbers exist | 09, 10 (report + KG view), 11b |
| Oct 26–27 | Deployed on free tiers, keep-alive running, demo accounts work | 12 |
| Oct 28 | **Feature freeze.** Video, README, Devpost write-up | 13 |
| Oct 29 | **Submit.** Oct 30 is buffer only (deadline 10:30 PM IST). | 13 |

## Rules for the whole team

- If a plan file is wrong or a better approach appears, update the plan file in the same PR and note it in the Status section of `CLAUDE.md`.
- Watch credit usage daily. Check the `usage` collection or `GET /api/admin/usage`. Credits must last through judging (Dec 1–15).
- Don't add features after Oct 28. Bug fixes only.
