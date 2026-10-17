# 16 — Execute the knowledge-graph upgrade (prompt for Claude Code)

> **How to use:** in a fresh Claude Code session, say:
> **"Read plan/16-kg-upgrade-execution.md and follow it."**
> Claude Code then works through the steps below, stopping at each checkpoint for the human's "go".

## Inputs (read all three first)
1. `CLAUDE.md`: project rules, the temporary NVIDIA provider (switching to Nebius later via `plan/14-switch-to-nebius.md`), and the free-tier limits.
2. `plan/15-knowledge-graph-final.md`: **the source of truth** for everything the app knows about a user, including scaling (section 6).
3. `plan/kg-upgrade-reference.md`: the detailed review-driven spec (phases 0–9, F-IDs). Use it for implementation detail. **Where it conflicts with plan 15, plan 15 wins.**

## Standing rules
- **No time constraint.** Implement the full design. The only shortcut is to **wipe test data and re-seed** instead of writing a migration.
- **Never print, echo, log or commit secrets** from `.env`.
- **Stop and ask the human before:**
  - adding a new dependency
  - changing how agent messages are sent to or shown to users
  - deleting or rewriting real (non-seed) user data
- **Information boundary** (test it in code):
  - An agent or judge may read the other user's **public `Profile`** only in the trust check and the brief.
  - It must never read their `KgFact`, `KgEdge`, `VoiceProfile` or `VoiceSample`.
  - The gate is code-only and boolean.
- **Cost:** at most 2 LLM calls per agent message normally (perceive+observe; generate), plus the stance check only when `mustDisagree`, plus at most 1 regeneration. The rate limiter (`LLM_MAX_RPM`) and the spending cap (`LLM_HARD_CAP_USD`) always apply.
- **Config:** every threshold lives in `services/kg/config.js`.
- **Tests:** use the repo's existing test setup (or `node:test`). Seeded RNG per conversation, so runs are reproducible.

---

## Step 1 — Record the decisions
Add a section **"Knowledge graph — final design"** to `CLAUDE.md`, summarising in under 25 lines:
- plan 15 is the source of truth and overrides the older plans and the reference spec
- the six knowledge layers (plan 15 §2) and the information boundary
- conversation style is part of the user's knowledge (`VoiceProfile` + `VoiceSample` + "How I text" hub)
- any language mix is supported (per-sample language tagging, `mirrorsLanguage`)
- matching stays swipe-based; the gate filters discover and re-checks at match creation; no ranking by overlap
- the agent engine works whether the other side is an agent or a human
- scaling rules: concept-level embeddings, compact vectors, caps and TTLs, the Mongo job queue, the per-conversation cache, the indexed gate query

Commit: `docs(kg): record final knowledge-graph decisions`

## Step 2 — Investigate (reference spec Phase 0)
Report, with file paths:
- what plans 03, 04, 05 and 10 actually built
- where the "talk as the user" prompt is built today (if anywhere)
- how disclosure is enforced
- whether any similarity or overlap ranking exists
- which `User`/`Profile` basics exist
- the current `KgFact` schema and indexes
- the current `styleProfile` code
- the plan-10 mock layer and which mocks plans 05–09 must replace

List every conflict with plan 15 and the smallest fix for each.

**Checkpoint A: stop and wait for "go".**

## Step 3 — Rewrite the remaining plan files to match plan 15
Rewrite these plan files so that each is self-contained, matches plan 15, and has acceptance checks:

| File | Must cover |
|---|---|
| `05-onboarding-knowledge-graph.md` (patch) | ref Phases 1–4 + plan 15 §3–§4 stage 2: bug fixes; new `KgFact` fields; `Concept`/`KgEdge`/`KgTombstone`; concept resolution + seed; build pipeline v2 as a **job**; questionnaire changes (identity, importance with no default, "accept in a partner", ≥ 4 stories incl. the opinion prompt, 15 voice samples across moods); `VoiceSample`/`VoiceProfile` v2 with per-sample language tagging; `Profile.gate`; hub graph projection incl. "How I text"; review-screen API (edit, delete → tombstone, contradictions, voice corrections) |
| `06-trust-check.md` | unchanged logic; it reads only the other user's public `Profile`; it runs as part of the match-created pipeline |
| `07-match-brief.md` | gate re-check at match creation (boolean); brief and openers from the other user's public profile + my own graph; agenda from my own graph; **remove** any embedding comparison of two users' facts |
| `08-agent-conversation.md` | ref Phases 6–7.1 + plan 15 §4 stage 5 and §7: context builder (`selectFacts`, `privateGuidance`, `traitRules`, `selectExemplars`); merged perceive+observe call; notes + `ChatEvent`s; interest meter; `planAct` including reply language from `VoiceProfile.language`; generate with anti-sycophancy rules; style/grounding/stance/leak checks; ask-my-human; works against a human; per-conversation LRU cache; information-boundary spy test |
| `09-compatibility-and-handoff.md` | ref Phase 7.2: independent judge per side as a **job**; quote validators; mutual yes → handoff; wind-down/close; notes compaction job; Tavily date ideas (cached) |
| `10-frontend.md` (patch) | onboarding UI changes; hub graph with "How I text"; fact edit, delete, contradictions panel; style corrections; match room "my notes" panel; chat replay with highlighted evidence; "I wouldn't say that" on my own agent messages; "learn from my chats" setting; replace mocks as features land |
| `11-seed-data-and-eval.md` | personas with the new questionnaire shape (incl. mixed-language and emoji-heavy texters); ref Phase 9 evaluation in full + the language-fidelity metric + the 2,000-user scale test (plan 15 §8); ablation flags |
| **new** `17-jobs-and-scaling.md` | plan 15 §6: Mongo job queue + worker; compact vector storage; caps (`MAX_SELF_FACTS`, `MAX_VOICE_SAMPLES`); TTL archiving; the indexed discover gate query; all §6.6 indexes; periodic jobs (voice rebuild, reflections, re-confirm, concept cleanup, notes archive); storage-per-user report script |

Also update `plan/00-START-HERE.md` with the new build order:

**02 → 03 → 04 → 17 (jobs & indexes) → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 14 (switch to Nebius) → 12 → 13**

Commit: `docs(kg): rewrite plans 05–11 and add 17 for the final KG design`

**Checkpoint B: show the revised plan list with a one-line summary per file, then stop and wait for "go".**

## Step 4 — Implement, one plan at a time
Order: **17 → 05 → 06 → 07 → 08 → 09 → 10 → 11.**

For each plan:
1. Implement it.
2. Wipe and re-seed test data if the schema changed.
3. Run its acceptance checks and report results (pass/fail, with numbers where relevant).
4. Commit with a clear message, confirm no `.env` file is tracked, and push.
5. Update the Status section of `CLAUDE.md` (one line, plus any deviation and why).
6. **Stop and wait for "go"** before the next plan.

## Step 5 — Final report (after plan 11)
In plain words, tell the human:
- what was built
- the evaluation headline numbers (plain agents vs. rules on; style and language fidelity; leak rate; judge approval rate)
- the storage per user and the gate query latency from the scale test
- anything the human must still do manually (Tavily key, the Nebius switch via plan 14, deploy via plan 12)
