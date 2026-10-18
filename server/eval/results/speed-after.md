# Speed after (plan 30 S1)

Measured locally on 2026-10-18 with `node scripts/speed-check.js` (3 runs: a new user signs up, onboards, likes one seed persona, and the agents chat to a verdict). The server ran with the job worker, default `AGENT_PACING=fast` and the same provider and models as production (NVIDIA: Super for chat, Ultra for judges). "Before" is `speed-before.md` (production Usage). The per-run detail below the table comes from `scripts/speed-report.js` for run 3.

| What | Before | Run 1 | Run 2 | Run 3 | Median | Target |
|---|---|---|---|---|---|---|
| Submit → app usable | ~92 s | 0.4 s | 0.2 s | 0.04 s | **0.2 s** | ≤ 5 s ✓ |
| Full graph ready | 92 s | 14.5 s | 18.4 s | 10.1 s | **14.5 s** | p50 ≤ 2 min ✓ |
| Match → first agent message | 40 s | 35 s | 99 s | 43 s | **43 s** | ≤ 20 s ✗ (429s, see below) |
| Whole agent chat | 23 min, 18 msgs | 5.0 min | 4.7 min | 4.0 min | **4.7 min** | p50 ≤ 4 min (close) |
| Messages per chat | 18 | 13 | 13 | 13 | **13** | 12–14 ✓ |
| Model time per agent message | 26 s | 17 s | 16 s | 15 s | **16 s** | ~15 s ✓ |
| Gap between agent messages, p50 | 49 s | 18 s | 13 s | 12 s | **13 s** | — |

**What's left, and why:**
- **First message:** it is now a cached trust check (no model call) plus the brief (about 6 s). In all 3 runs the NVIDIA key answered **429 Too Many Requests** on most calls. Run 2 logged 99 429s with a single chat running, because the key is shared with the deployed site. Both briefs failed after their retries (about 33 s each), then the opening reply waited out a 30 s back-off.
- **Whole chat:** model time per message is down to about 15 s. Whole chats came out at 4.0–5.0 min, and the 429 back-offs are most of the gap to 4 minutes.
- **Re-measure:** with a separate local key (owner, plan 30 S1 note 4), then again on Token Factory on Oct 26 and on the deployed site in S7.

**Quality check (6 pairs: c1 c2 i1 i2 m1 m2), the 1-call turn vs the old 2 calls:** `eval/results-s1-*.md`, `eval/results/llm-metrics-s1-*.md`.

| | 2 calls (old) | 1 call + lean regeneration (new default) |
|---|---|---|
| Correct verdicts | 3/6 | **5/6** |
| Template fallbacks | 3/66 (4.5%) | **1/66 (1.5%)** (target ≤ 7%) |
| Unsupported self-claims (offline judge) | 9/38 = 24% | 9/35 = 26% (same count, fewer claims; within noise on 6 pairs) |
| Style distance | — (the 2-call chats were overwritten) | 0.16 (B5 baseline 0.16) |
| Tokens per pair | ~83k | **~63k** |

**What changed:**
- **Agent turns (`AGENT_TURN_MODE=merged`):** reading their message and writing mine happen in ONE call. If the merged JSON is unreadable, that turn falls back to two calls.
- **Regeneration (`AGENT_REGEN=lean`):** no regeneration when every problem is an uncited sentence, which code drops anyway.
- **Per-task model choice and output caps** (`services/llm/tasks.js`, override with `LLM_TASK_TIERS`). Every former fast-tier task runs on Super while we're on NVIDIA: Lightning's p50 was 33–59 s here.
- **Retries:** 4 instead of 3, with `Retry-After` honoured as seconds or as a date.
- **Pacing:**
  - `AGENT_PACING=fast` for everyone (0.8–3 s), overlapping the model work.
  - No debounce after an agent message.
  - `AGENT_MAX_REPLIES_PER_MINUTE` 12.
  - Chats run 12–14 messages.
- **First message:**
  - The trust check's model part is cached per profile version (`ProfileCheck`), precomputed at onboarding, on profile edits and by the seed script.
  - The brief runs in parallel with it.
- **Two-phase onboarding:**
  - Phase 1 runs with no model calls inside the submit request.
  - Phase 2 is a job: stories ×4 in parallel; concepts in one embedding call + one tie-break call; style alongside the stories; 45 s timeout and 1 retry per call; a failed story is skipped.
  - `onboarding:progress` events are sent.
  - Agent chats wait for `graphStatus: 'ready'` (at most 10 min).

---

# Speed after (plan 30 S1)

Generated 2026-10-18T17:55 UTC by `scripts/speed-report.js`, read-only, from the `Usage` records of the database in `MONGODB_URI`.

**Provider and models seen in Usage** (no keys):
- embed: nvidia `nvidia/nemotron-3-embed-1b` (3173 calls)
- fast: nvidia `nvidia/nemotron-3.5-lightning-30b-a3b` (100 calls)
- mid: nvidia `nvidia/nemotron-3-super-120b-a12b` (3338 calls)
- smart: nvidia `nvidia/nemotron-3-ultra-550b-a55b` (65 calls)

**Caveats:** Usage has one row per logical call, written when it ends, and `latencyMs` includes our retries. Retries and 429s are logged only by the server. A **failed** call used all 4 attempts: with 2 + 4 + 8 s of backoff, a run of quick 429/5xx answers fails after ~15–17 s. "Longer than one attempt" counts calls longer than one attempt's timeout (fast 90 s, mid 120 s, smart 180 s, embed 60 s). Wall time = first call start → last call end.

## Onboarding build

User `6ad506f68cd34afea954cf76`, build finished 2026-10-18 17:50:55 UTC: **9 calls**, wall time **8.8 s**; the sum of call latencies is 27 s, so the calls overlap 3.0×.

| Purpose | Tier | Calls | p50 | p95 | Max | Failed (all retries used) | Longer than one attempt |
|---|---|---|---|---|---|---|---|
| onboarding-story-facts | mid | 4 | 3.0 s | 3.8 s | 3.8 s | 2 | 0 |
| voice-language-tags | mid | 1 | 5.7 s | 5.7 s | 5.7 s | 0 | 0 |
| onboarding-story-facts-support | mid | 2 | 2.9 s | 2.9 s | 2.9 s | 2 | 0 |
| onboarding-style | mid | 1 | 3.1 s | 3.1 s | 3.1 s | 1 | 0 |
| onboarding-contradictions | mid | 1 | 0.8 s | 0.8 s | 0.8 s | 0 | 0 |

## Agent chat

Match `6ad507058cd34afea954d067` (status `evaluating`): **18 calls**, LLM wall time **242 s**.

- Messages: 13 (13 by agents). Sum of agent-* call latencies per agent message: 15 s; the rest of the gap is pacing and waiting.
- Match → first message: **43 s**; first → last message: **199 s**.
- Gap between agent messages: p50 **12 s**, p95 42 s, max 42 s.

| Purpose | Tier | Calls | p50 | p95 | Max | Failed (all retries used) | Longer than one attempt |
|---|---|---|---|---|---|---|---|
| agent-turn | mid | 12 | 12 s | 37 s | 37 s | 0 | 0 |
| brief | mid | 2 | 42 s | 42 s | 42 s | 1 | 0 |
| trust-check | mid | 1 | 42 s | 42 s | 42 s | 1 | 0 |
| agent-reply | mid | 3 | 3.0 s | 4.6 s | 4.6 s | 0 | 0 |

## All calls in this database

6676 calls from 2026-10-16T09:54 to 2026-10-18T17:55 UTC (onboarding, seeding, chats and judges together). Failed: 159 (2%).

| Purpose | Tier | Calls | p50 | p95 | Max | Failed (all retries used) | Longer than one attempt |
|---|---|---|---|---|---|---|---|
| onboarding-story-facts | mid | 507 | 6.1 s | 34 s | 53 s | 5 | 0 |
| agent-reply | mid | 654 | 2.9 s | 18 s | 37 s | 41 | 0 |
| trust-check | mid | 232 | 11 s | 37 s | 62 s | 1 | 0 |
| onboarding-story-facts-support | mid | 502 | 2.4 s | 31 s | 120 s | 8 | 1 |
| agent-perceive | mid | 349 | 6.6 s | 20 s | 51 s | 11 | 0 |
| concept | embed | 1926 | 0.3 s | 4.4 s | 48 s | 0 | 0 |
| brief | mid | 175 | 8.3 s | 40 s | 56 s | 9 | 0 |
| judge | smart | 65 | 34 s | 88 s | 125 s | 25 | 0 |
| agent-turn | mid | 122 | 12 s | 37 s | 40 s | 13 | 0 |
| icebreakers | fast | 41 | 38 s | 90 s | 90 s | 9 | 9 |
| agent-stance-check | fast | 36 | 35 s | 90 s | 90 s | 9 | 9 |
| voice-language-tags | mid | 89 | 11 s | 45 s | 48 s | 1 | 0 |
| onboarding-style | mid | 88 | 8.0 s | 35 s | 50 s | 1 | 0 |
| concept-tiebreak | mid | 245 | 1.5 s | 9.8 s | 120 s | 1 | 1 |
| eval-claim-audit | mid | 73 | 9.0 s | 26 s | 42 s | 8 | 0 |
| agent-claim-check | fast | 15 | 31 s | 90 s | 90 s | 3 | 3 |
| seed-restyle | mid | 45 | 13 s | 27 s | 43 s | 0 | 0 |
| onboarding-contradictions | mid | 94 | 2.7 s | 35 s | 37 s | 2 | 0 |
| wind-down | fast | 7 | 90 s | 90 s | 90 s | 4 | 4 |
| judge | mid | 34 | 9.4 s | 31 s | 36 s | 1 | 0 |
| eval-agreement | mid | 35 | 6.5 s | 32 s | 36 s | 2 | 0 |
| compact-notes | mid | 14 | 4.2 s | 127 s | 127 s | 2 | 2 |
| agent-incoming | embed | 1094 | 0.2 s | 0.4 s | 7.8 s | 0 | 0 |
| onboarding-embed | embed | 85 | 0.6 s | 8.7 s | 45 s | 0 | 0 |
| icebreakers | mid | 15 | 8.1 s | 41 s | 41 s | 2 | 0 |
| brief-profile-facts | mid | 22 | 6.7 s | 11 s | 14 s | 0 | 0 |
| agent-stance-check | mid | 5 | 8.6 s | 33 s | 33 s | 0 | 0 |
| wind-down | mid | 1 | 33 s | 33 s | 33 s | 1 | 0 |
| agent-claim-check | mid | 17 | 1.1 s | 4.1 s | 4.1 s | 0 | 0 |
| belief-update | mid | 9 | 1.9 s | 6.1 s | 6.1 s | 0 | 0 |
| embed-facts | embed | 24 | 0.3 s | 4.8 s | 7.3 s | 0 | 0 |
| date-ideas | fast | 1 | 22 s | 22 s | 22 s | 0 | 0 |
| inbox-answer-facts | mid | 3 | 4.1 s | 8.4 s | 8.4 s | 0 | 0 |
| eval-leak-audit | mid | 4 | 4.6 s | 4.6 s | 4.6 s | 0 | 0 |
| agent-leak-check | embed | 41 | 0.3 s | 0.5 s | 0.7 s | 0 | 0 |
| judge-reask | mid | 1 | 5.1 s | 5.1 s | 5.1 s | 0 | 0 |
| inbox-answer-facts-support | mid | 3 | 0.7 s | 1.1 s | 1.1 s | 0 | 0 |
| seed-concepts | embed | 1 | 1.5 s | 1.5 s | 1.5 s | 0 | 0 |
| voice-incoming | embed | 2 | 0.6 s | 0.6 s | 0.6 s | 0 | 0 |
