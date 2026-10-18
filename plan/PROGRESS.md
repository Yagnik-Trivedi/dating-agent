# Progress tracker

The team's single status board. Claude Code updates it after every task, plan step, checkpoint, pause or switch, and pushes it to `main`. `CLAUDE.md` → Status has the detailed acceptance results for each plan.

- **Last updated:** 2026-10-18 night, by Claude Code (plan 10 merged; Atlas connects; next: live-agent browser run, judge accounts, then plan 14 when Nebius is ready)
- **Main-line branch:** `main` (`feat/plan-11-tuning` and `feat/backend-finish` merged) · **main:** `67a8666`
- **Last commit (main line):** `feat/backend-finish` (KG own-side learning, extend, plan 12 backend parts, `--judges`)

Status key: ✅ Done · 🔄 In progress · ⏸ Paused · ⬜ Not started · 🚫 Not for Claude Code · 📦 Archived · 📖 Reference

## Plans

Build order (`00-START-HERE` phase table, owner 2026-10-17):

| Phase | Plans |
|---|---|
| Done | 02 → 03 → 04 → 17 → 05 → 06 → 07 → 08 → 09 |
| 1. Backend + tests (now) | 11 Part B (B1 tuning → B2 scale test → B3 metrics → B4 ablation → B5 one full run → B6 results) |
| 2. Frontend | 10, from the owner's design (with its backend additions) |
| 3. Go live | 14 (Nebius, by Oct 26) → 12 (deploy, keep-alive, judge accounts, demo pacing §7) |
| 4. Submit | 13 (feature freeze Oct 28, submit Oct 29) |

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
| 10 | Frontend v2 (from the owner's design) | ✅ Done (live-agent browser run pending) | main | merge of `feat/plan-10-frontend` | All screens in the design on real data; CodeRabbit + ponytail reviewed; 102/102, api-check 20/20, sign-up browser flow 6/6. Pending: take-over / pause in a live chat when NVIDIA stops 429-ing; licensed landing photo. |
| 11 | Seed personas + evaluation (v2) | ✅ Done | main | `67a8666` | B1–B6 done. B5: 4/17, gate 1/1, fakes 2/2; the judges cluster on Maybe. Human labels for judge agreement pending (`eval/labels/`). |
| 12 | Deploy on free tiers + keep-alive | 🔄 Code done | main | `67a8666` | render.yaml, keep-alive, self-ping, DEPLOY.md, credit guard, demo pacing, `--judges`. Human steps in DEPLOY.md after plan 14. |
| 13 | Submission (README, video, Devpost) | ⬜ Not started | — | — | README skeleton is queued as side work. |
| 14 | Switch back to Nebius Token Factory | ⬜ Not started | — | — | **Due Oct 26.** Needs the Nebius account. The dry-run checklist is queued as side work. |
| 15 | Knowledge graph: final design | ✅ Done (design doc) | main | `f91d072` | Source of truth for the KG. |
| 16 | KG upgrade execution | 📦 Archived | main | `df05021` | Done; moved to `plan/archive/16-kg-upgrade-execution.md`. |
| 17 | Jobs, storage and indexes | ✅ Done | main | `3522f63` | Job queue, compact vectors, gate query, indexes. |
| 18 | Architecture decisions | 📖 Reference, partly adopted | main | `df05021` | See its status banner: built parts in 05–09; Maybe-extend (10), demo pacing (12 §7), metrics (11) scheduled; the rest deferred. |
| 19 | Verification (liveness + face match) | 🚫 Not for Claude Code | — | — | Owner's decision 2026-10-17. No file. |
| 20 | UI design brief | 🚫 Not for Claude Code (design team) | main | `11bdcf6` | The owner hands over the design for Phase 2. |
| ref | kg-upgrade-reference | 📦 Archived | main | `df05021` | Moved to `plan/archive/kg-upgrade-reference.md`. |

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

**Re-plan (owner, 2026-10-18 afternoon).** The design arrived (`Frontend-Design/04-direction/`, local only and gitignored), and the Tavily key is in (only **1,000 credits** for everything). Atlas: the IP allow-list is `0.0.0.0/0`, but login still fails (`bad auth`), so the **owner fixes the DB user/password in `MONGODB_URI`**. On this machine Node also needs public DNS for the Atlas SRV lookup; Render won't.

Owner's decisions:
- add `motion`, `lucide-react` and 4 `@fontsource` fonts;
- the app is called **Prelude**;
- no selfie or liveness claims: show our real trust check instead;
- build **Pause / Resume** per match.

| # | Track | What | Estimate | Status |
|---|---|---|---|---|
| 1 | Backend | Judge fix merged to main (`6eb1cc2`): rejudge 8/17, compatible 5/7, harmful 1 at JUDGE_YES_MIN 0.65; step 4 on i3/i5/c4/m1 → 2/4, 0 harmful (i5 drinking conflict caught); README numbers updated | done | ✅ |
| 2 | Backend | Tavily guard (`3ab63e8`): basic depth, TAVILY_MAX_SEARCHES (dev 30 / prod 700) + 3 per user per day as Usage rows, 30-day cache keyed by sorted interests, city fallback; key verified live by api-check (1 credit) | done | ✅ |
| 3 | Backend | Pause / Resume per match (`3ab63e8`) + /matches/:id/kg returns my chat moments and interest | done | ✅ |
| 4 | Frontend | Plan 10 on `feat/plan-10-frontend` (pushed, main merged in, 102/102 tests, api-check 20/20): design tokens/fonts/icons/motion, light + lamplight; Landing (demo chat), Sign-up (basics + consent) / Log in, Onboarding (segmented progress, How would you reply? + learning panel), This is you (radial map on real data, privacy, edit/delete, Which is right?, How you text), Introductions (blurred photos), Matches, Match room (notes in the margin, trust / shared / how they seem / agenda, Pause / Resume / Take over, I wouldn't say that, mobile sheet), Verdict (Compatible / Maybe + Let them talk longer / Not compatible + Talk anyway, date ideas after Continue), Replay, Settings (Learn from my chats, lamplight), wake-up screen. Checked in headless Chrome at 1440 and 375 (no overflow, no console errors). Left: Profile + Inbox polish, plan 10 end-to-end browser run, code-splitting (bundle 600 KB) | ~1 day → ~3 h left | 🔄 |
| 5 | Backend | Retry `seed.js --judges` (NVIDIA 429s today) | ~1 h of LLM | ⬜ |
| 6 | Review | CodeRabbit + ponytail audit once the frontend is done | ~1 h | ⬜ |
| 7 | Go live | Plan 14 (Nebius, by Oct 26) → plan 12 (DEPLOY.md human steps + live smoke) | ~4–5 h + humans | ⬜ needs Nebius + Atlas login |
| 8 | Submit | Plan 13: README, SUBMISSION.md (freeze Oct 28, submit Oct 29) | ~2–3 h | ⬜ |

**Tavily budget (1,000 credits, basic search = 1 credit):**

| Use | Credits |
|---|---|
| Dev checks | ≤ 20 |
| Pre-warming 5 demo cities × ~4 interest pairs | ~20 |
| Judge accounts | ~10 |
| Live demo and judging (Dec 1–15), behind the all-time cap | ≤ 600 |
| Reserve | ~350 |

Cached ideas never cost a credit.

**Judge fix (owner, 2026-10-18; plan 11 follow-up) on `feat/judge-fix`:** steps 1–3 need no new chats; step 4 re-runs i3, i5, c4 and m1 only after telling the owner.
- ✅ **Step 1** (`04047d6`): the decision is made in code (`services/conversation/judgeDecision.js`, numbers in `kg/config.js` `JUDGE_*`, unit-tested). The LLM lists evidence only: positives/frictions carry the F-id of my fact, dealbreakerRisk carries the option they stated.
  - **No:** a stated dealbreaker value outside my accepts, or a severity-3 friction on a fact with importance ≥ 0.9.
  - **Yes:** ≥ 2 distinct verified positives in their words on key facts (importance ≥ 0.6, a dealbreaker, or a like with strength ≥ 0.6), with no severity-3 friction and no conflicting or unclear dealbreaker.
  - **Undiscussed dealbreaker:** a severity-2 friction plus "worth asking" in the summary.
  - **Otherwise:** unsure.
  - `npm test` 97/97.
- ✅ **Step 2** (`60f7df2`):
  - Removed "prediction is weak… say unsure" from the prompt; the LLM lists evidence in both directions and its summary states no verdict.
  - Undiscussed topics are no longer LLM frictions; the code adds them.
  - Template filler lines are labelled `[system filler, not their words]` and never count as evidence.
  - 97/97.
- ✅ **Step 3** (`8afd2b5`, `e08fc44`): `scripts/eval/rejudge.js` re-judged the 17 saved B5 conversations, with no new chats (`eval/results/rejudge.md`).
  - **Accuracy:** 4/17 → **8/17**.
  - **Compatible pairs:** 0/7 → **5/7** (target ≥ 4/7 ✓).
  - **Harmful errors:** 1 → 2 at `JUDGE_YES_MIN` 0.6. Both swaps are the hidden-conflict pairs: i3 (long-term) and i5 (drinking) never actually discussed the conflict in those chats.
  - **Calibration** (`calibrate.js`, its threshold drift fixed): **0.65** keeps 8/17 and brings harmful errors back to **1** (target ✓). `JUDGE_YES_MIN` is now 0.65. It was tuned on the same data; step 4's fresh chats check it.
  - Also: the judge only sees messages up to the conversation's end (no wind-down), an unclear dealbreaker answer counts as undiscussed (per the spec), and confidence is rounded before comparing.
- ✅ **Step 4 code** (`e4aa816`):
  - **Must-ask items:** dealbreakers and answers that matter a lot (priority ≥ `ASK_EXPLICIT_PRIORITY` 0.9; i3/i5's conflicts are high-importance answers, because a dealbreaker would close the match at the gate).
  - **Counted as covered when:** my agent asked a direct question naming the attribute, or they stated it themselves.
  - **Until then:** steered to first with no tries cap, asked as one direct question, and no natural end. 99/99.
- ✅ **Step 4 re-run** (`ec4b804`, `eval/results-step4.md`; NVIDIA returned many 429s today):
  - **c4:** compatible ✓.
  - **i3:** maybe. It was a harmful "compatible" in the re-judge, so it's no longer harmful, but not yet the expected incompatible.
  - **m1:** incompatible (expected maybe). Arjun's *agent* misrepresented him ("still figuring out what I'm looking for", "just seeing how things go") while his answer is long-term, so Meera's judge rightly said no. **Fixed:** the looking_for contradiction check now catches these wordings and checks sentences that address nobody, not only ones with I/mera. 100/100.
  - **i5:** stalled at 14 messages on 429s (pair timeout). Step 4 did its job before that: Gauri's agent asked "how do you feel about drinking?" directly, and Arnav answered with his brew.
- **Next (ask the owner):** re-run i5 and m1 once NVIDIA stops returning 429s, then retry `seed.js --judges`.
- Also: the live `seed.js --judges` run hit NVIDIA 429 (rate limit) while building the first judge's graph; it will be retried after the judge fix.

**Owner, 2026-10-18:** finish ALL backend today (every KG learning path, plan 10's backend additions, plan 12's backend-only parts) plus tests; frontend only if the design arrives. B5 stays at 2 pairs at a time. Code-critique tools (ponytail, CodeRabbit) run once the coding is complete.

**B5 ✅ (final full run, `feat/plan-11-tuning` `72a9a9e`, 07:51 → 10:05 IST, RULES=on, 2 pairs at a time):**
- **Results:** 4/17 correct (24%); 1 harmful swap (c2: compatible → Not compatible); gate 1/1; fakes 2/2, 0 genuine pairs flagged.
- **Fallback rate:** 7% (22 template + 17 constrained of 294 agent messages); target < 5%.
- **Cost:** ~101k tokens per pair (1.73M total); 17.3 messages to a verdict.
- **Confusion:** compatible → maybe 6, incompatible 1. Maybe → maybe 2, incompatible 2. Incompatible → maybe 4, incompatible 2. **The judges cluster on Maybe:** one side says "unsure" in most chats, so the threshold can't help. Calibration over raw-full + raw-rules-on is flat (5/20 at every value from 0.50 to 0.95), so `JUDGE_YES_MIN` stays 0.6.
- **Offline metrics** (`eval/results/metrics-full.md`): style distance 0.16, language-mix distance 0.06, Devanagari script kept 1/1, ask-back 0.58, distinct-2 0.89. Observer notes: precision 0.27, recall 0.61.
- **Judge-agreement set exported:** `eval/labels/`, 10 transcripts (yes 2 / unsure 3 / no 5). **Needs the team to fill `human_label` in `labels.csv`.**
- **In progress:** `llm-metrics --tag full` (unsupported self-claims, agreement rate), then B6 (`latest.md` + the README Evaluation section).

**Backend finish on `feat/backend-finish`** (worktree, branched from `feat/plan-11-tuning`; `npm test` 90/90, no LLM needed):
- ✅ KG learning from my own side (plan 08 §3, plan 15 stage 7):
  - `POST /api/messages/:id/wouldnt-say { fix? }`, only on my own agent's messages. A fix becomes a `VoiceSample(edited_draft)`. The rule goes to corrections / neverSay, or becomes a `userEdited` fact when the agent got a fact wrong.
  - After handoff, my typed messages become `VoiceSample(own_chat)`, unless `settings.learnFromChats` is off (`PUT /api/me/settings { learnFromChats }`).
  - **Bug fixed:** never-say corrections stored the rule sentence, which the style check could never match. They now store the literal phrase.
- ✅ "Let them talk a bit longer" (plan 10 backend addition): `POST /api/matches/:id/extend`.
  - Allowed once per match, only on my own unsure while the match is Maybe.
  - Runs a round-2 conversation of up to `EXTEND_TURNS` (8) messages, steering to open important agenda items.
  - Then both judges run again on the whole transcript. The newest decision is the report; older ones are kept.
- ✅ Plan 12 backend parts:
  - Credit guard: `JUDGE_LIVE_CHATS_PER_DAY` (default 2). Over it, a match is `scheduled` with `startsAt` and starts the next UTC day.
  - Seeds are exempt from the per-user LLM cap.
  - `DEMO_PACING=fast` applies to seed and judge accounts only (replaces `DEMO_FAST`).
  - `LOG_LEVEL`: in production, errors plus one line per LLM call, with no message contents.
- ✅ `seed.js --judges` (`seed/judges.json`, `JUDGE_PASSWORD`):
  - 2 judge accounts that copy a seed persona's answers.
  - Real runs against each judge's gate pool fill a flagged fake, a match frozen at 6 messages (it resumes when opened) and whichever verdicts the judges reach.
  - **Not run yet** (~1 h of LLM): first after B5, then once more on Nebius in plan 12.
- **Next:**
  1. Live check of the new routes, plus one `--judges` run after B5.
  2. Plan 12 deploy prep (render.yaml, keep-alive, self-ping, DEPLOY.md) and the plan 14 dry-run checklist (no UI or accounts needed).

**B1 report (tuning stopped at the 3-iteration cap, 2026-10-17):**
- Best 4/6 (iteration 2). Gated and fake pairs are always right; i6 (values clash) right in all 3; i2 (hidden smoking) right in iterations 1 and 2.
- Fallback rate 13% → 5% → 8%.
- Left:
  1. Compatible pairs land on "maybe": one judge says yes (0.85) while the other says unsure (0.5–0.55). Calibrating `JUDGE_YES_MIN` in B5 may move some.
  2. Run-to-run variance on 6 pairs is large (i2 flipped in iteration 3).
  3. Fixed after the cap, measured by B4/B5 (`fix(plan-11)`): one vague dealbreaker hint ended c1 at 7 messages; now the first hint reopens the topic and only a second ends the chat.
- **Correctness fixes found in the B4 rules-on run** (commit `fix(plan-11): reply retries…`), measured by B5:
  - c7 stalled for 45 min after 3 quick NVIDIA failures. Replies now back off 30 s → 8 min before the sweep takes over.
  - c1 came out incompatible because Meera's agent said "haven't thought much about kids yet" while her answer is "open". When they ask about a topic my graph covers, its facts are now always in the prompt, and a hedge on it triggers the regeneration.

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
  - Full re-seed: **38 graphs in 1,666 s** (~28 min, concurrency 2, no failures). An immediate re-run: **0 s, 38 unchanged**.
  - `eval.js` restored from `wip/plan-11b` and adapted to v2 (`60130a7`): MatchDecision verdicts, `gated`, judge receipts.
  - e) ✓ agent-check passes and judge-check passes on the re-seeded data. Eval subset (6 varied pairs; the first 6 by `--limit` are all compatible): i1 gated ✓, f1 fake ✓, i6 incompatible ✓; c1, c7 and i2 → maybe. ~89k tokens per pair, 9–18 min per conversation.
  - Why the misses: (1) the engine's neutral fallback replies ("haha fair 😄", "oh nice, i like that") read as low effort to the judges; (2) i2 ended "naturally" at 14 messages without smoking coming up.
- **Step 3 ✅ merged** (`3966f5a`). **Waiting for the owner.**
- **Plan 11 remaining: the owner's reduced scope** (2026-10-17, also recorded at the top of `plan/11-seed-data-and-eval.md`). Order: tuning → scale test → metric scripts → ablation subset → ONE full run (tell the owner first) → calibration → README numbers.
  1. 🔄 **Tuning** (6-pair loop, ≤ 3 iterations, target ≥ 5/6 and no filler).
     - Iteration 1 code is on `feat/plan-11-tuning`:
       - important topics are retried;
       - the model's end is gated on the agenda;
       - a constrained regeneration replaces filler, and fallbacks are logged per message;
       - no natural end with importance ≥ 0.7 open, and near `MAX_TURNS` the agent steers to it;
       - a META wording check; agenda likes ≤ 3 words.
     - `npm test` 78/78. Iteration 1 eval is running.
     - Seen mid-run: over-strict grounding drops honest drafts, which forces fallbacks (Meera × Ishaan: 2 template + 1 constrained in 6 messages). Fixed for iteration 2 (`278a59e`): an unsure hedge never contradicts a like; "I saw you…" is about them; the same opening is blocked only from the 3rd time. `npm test` 79/79.
  3. 🔄 Metric scripts: `scripts/eval/metrics.js` done (style/language fidelity, conversation stats, observer accuracy, from saved chats, no LLM). Unsupported self-claims (offline LLM judge) and the leak probe are next.
  2. ✅ Scale test (`scripts/eval/scale-test.js`, no LLM, local in-memory replica set, 28 s): 2,000 users. Discover p50 2.1 / p95 4.2 ms on index `gate.city_1_gate.gender_1_gate.age_1`; context build per message miss 9.5 / 10.4 ms, hit 1.6 / 3.0 ms; 88 KB/user → ~5,900 users in M0. → `eval/results/scale.md`.
  4. ⬜ Ablation `RULES` on/off on the 6-pair subset.
  5. ⬜ ONE full 20-pair run, overnight, resumable (**ask the owner first**).
  6. ⬜ Judge-agreement export (10 transcripts → `eval/labels/`).
  7. ⬜ Calibrate `JUDGE_YES_MIN`; headline numbers → `eval/results/latest.md` + README.

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

> Read CLAUDE.md, then plan/PROGRESS.md (this file), then plan/00-START-HERE.md (phase table) and the plan marked 🔄. Check out the branch named under "Currently working on" and continue from its **Next** list. Follow the standing rules below. Update PROGRESS.md after every step, then commit and push.

**Standing rules (from the project owner):**
- Never print, echo, log or commit any secret value from `.env`. Check that no `.env` is tracked before every push.
- After each plan: run its acceptance checks, commit, push, update PROGRESS.md and CLAUDE.md Status, then STOP and wait for "go".
- Ask before you add a dependency (`mongodb-memory-server` is already approved), change how agent messages are sent or shown, or delete real user data. Wiping and re-seeding seed data is fine.
- LLM: NVIDIA free API for now, at low concurrency (~40 requests/min across everyone sharing the key). The switch to Nebius must need only `.env` changes.
- Plan 20 is for the design team: don't touch it, and don't restyle `client/`.
- Side work only while the main line waits at a checkpoint, each task on its own `side/*` branch (queue under "Currently working on").

**Last handoff state:** 2026-10-16 22:20 IST. Plan 09 on `feat/plan-09-judges` (`ce4c0cb`, pushed): code done, live checks need `server/.env`. Next: see "Currently working on" → Next.
