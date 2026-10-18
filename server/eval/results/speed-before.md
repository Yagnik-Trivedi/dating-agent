# Speed before (plan 30 S1)

Generated 2026-10-18T15:02 UTC by `scripts/speed-report.js`, read-only, from the `Usage` records of the database in `MONGODB_URI`.

**Provider and models seen in Usage** (no keys):
- embed: nvidia `nvidia/nemotron-3-embed-1b` (933 calls)
- fast: nvidia `nvidia/nemotron-3.5-lightning-30b-a3b` (35 calls)
- mid: nvidia `nvidia/nemotron-3-super-120b-a12b` (1425 calls)
- smart: nvidia `nvidia/nemotron-3-ultra-550b-a55b` (18 calls)

**Caveats:** Usage has one row per logical call, written when it ends, and `latencyMs` includes our retries. Retries and 429s are logged only by the server. A **failed** call used all 4 attempts: with 2 + 4 + 8 s of backoff, a run of quick 429/5xx answers fails after ~15–17 s. "Longer than one attempt" counts calls longer than one attempt's timeout (fast 90 s, mid 120 s, smart 180 s, embed 60 s). Wall time = first call start → last call end.

## Onboarding build

User `6ad4bbef1be9c1b03336db22`, build finished 2026-10-18 12:54:43 UTC: **23 calls**, wall time **92 s**; the sum of call latencies is 122 s, so the calls overlap 1.3×.

| Purpose | Tier | Calls | p50 | p95 | Max | Failed (all retries used) | Longer than one attempt |
|---|---|---|---|---|---|---|---|
| concept-tiebreak | mid | 3 | 16 s | 16 s | 16 s | 2 | 0 |
| onboarding-story-facts | mid | 5 | 2.3 s | 10 s | 10 s | 0 | 0 |
| onboarding-story-facts-support | mid | 5 | 0.9 s | 16 s | 16 s | 1 | 0 |
| onboarding-style | mid | 1 | 16 s | 16 s | 16 s | 1 | 0 |
| voice-language-tags | mid | 1 | 14 s | 14 s | 14 s | 0 | 0 |
| onboarding-contradictions | mid | 1 | 3.2 s | 3.2 s | 3.2 s | 0 | 0 |
| concept | embed | 6 | 0.3 s | 0.3 s | 0.3 s | 0 | 0 |
| onboarding-embed | embed | 1 | 0.5 s | 0.5 s | 0.5 s | 0 | 0 |

## Agent chat

Match `6ad4c1d51be9c1b03336e618` (status `compatible`): **66 calls**, LLM wall time **1573 s**.

- Messages: 18 (18 by agents). Sum of agent-* call latencies per agent message: 26 s; the rest of the gap is pacing and waiting.
- Match → first message: **40 s**; first → last message: **1403 s**.
- Gap between agent messages: p50 **49 s**, p95 335 s, max 335 s.

| Purpose | Tier | Calls | p50 | p95 | Max | Failed (all retries used) | Longer than one attempt |
|---|---|---|---|---|---|---|---|
| agent-perceive | mid | 27 | 9.3 s | 21 s | 21 s | 5 | 0 |
| agent-reply | mid | 31 | 3.4 s | 17 s | 17 s | 5 | 0 |
| judge | smart | 2 | 51 s | 51 s | 51 s | 0 | 0 |
| icebreakers | fast | 2 | 33 s | 33 s | 33 s | 0 | 0 |
| brief | mid | 2 | 14 s | 14 s | 14 s | 0 | 0 |
| trust-check | mid | 2 | 12 s | 12 s | 12 s | 0 | 0 |

## All calls in this database

2411 calls from 2026-10-18T09:13 to 2026-10-18T13:22 UTC (onboarding, seeding, chats and judges together). Failed: 76 (3%).

| Purpose | Tier | Calls | p50 | p95 | Max | Failed (all retries used) | Longer than one attempt |
|---|---|---|---|---|---|---|---|
| agent-perceive | mid | 202 | 8.0 s | 22 s | 120 s | 21 | 3 |
| onboarding-story-facts | mid | 250 | 7.0 s | 25 s | 75 s | 0 | 0 |
| agent-reply | mid | 323 | 3.3 s | 17 s | 136 s | 24 | 2 |
| concept | embed | 740 | 0.4 s | 7.8 s | 41 s | 0 | 0 |
| onboarding-story-facts-support | mid | 250 | 2.7 s | 16 s | 120 s | 4 | 1 |
| agent-stance-check | fast | 18 | 59 s | 90 s | 90 s | 5 | 5 |
| judge | smart | 17 | 40 s | 86 s | 86 s | 0 | 0 |
| concept-tiebreak | mid | 199 | 1.5 s | 12 s | 31 s | 6 | 0 |
| voice-language-tags | mid | 42 | 11 s | 37 s | 120 s | 1 | 1 |
| icebreakers | fast | 15 | 33 s | 90 s | 90 s | 3 | 3 |
| trust-check | mid | 28 | 16 s | 57 s | 67 s | 2 | 0 |
| brief | mid | 38 | 13 s | 25 s | 30 s | 5 | 0 |
| onboarding-style | mid | 43 | 9.2 s | 20 s | 37 s | 1 | 0 |
| onboarding-contradictions | mid | 45 | 2.0 s | 17 s | 31 s | 2 | 0 |
| wind-down | fast | 1 | 88 s | 88 s | 88 s | 0 | 0 |
| onboarding-embed | embed | 42 | 1.2 s | 6.6 s | 7.4 s | 0 | 0 |
| agent-incoming | embed | 150 | 0.2 s | 0.4 s | 0.8 s | 0 | 0 |
| voice-correction | mid | 3 | 17 s | 17 s | 17 s | 2 | 0 |
| judge-reask | smart | 1 | 28 s | 28 s | 28 s | 0 | 0 |
| date-ideas | fast | 1 | 16 s | 16 s | 16 s | 0 | 0 |
| compact-notes | mid | 2 | 4.8 s | 4.8 s | 4.8 s | 0 | 0 |
| persona-load | embed | 1 | 0.7 s | 0.7 s | 0.7 s | 0 | 0 |
