# 11 — Seed personas + evaluation (v2)

> **Prompt for Claude Code:** Read `CLAUDE.md` (section "Knowledge graph — final design"), `plan/15-knowledge-graph-final.md` §8 and `plan/kg-upgrade-reference.md` Phase 9. Start by restoring the reusable v1 harness from the WIP branch: `git checkout wip/plan-11b -- server/scripts/lib/runPair.js server/scripts/eval.js`, then adapt them. Implement this file, run the acceptance checks.

## Why this matters

- **The demo needs a populated app:** people to match with, whose agents answer in their own voice and language.
- **The "Technical implementation" criterion rewards proof:** labelled-pair accuracy, plain agents vs. rules on, style and language fidelity, leak rate, judge agreement, and a scale test, all in the README.

**Budget rules:**
- Every LLM-spending script prints an estimate and needs `--yes`.
- Concurrency is low (2–3) and the RPM limiter applies.
- Raising `LLM_DAILY_TOKENS_GLOBAL` for a run happens on the command line, never in `.env`, and is noted in Status.

---

## Part A — Seed personas (`seed/personas.json`, committed)

**30 personas** in the v2 questionnaire shape (plan 05 §4). Keep the 30 from v1 (already converted by plan 05's script) and edit them so the set covers:

- **Language mixes:**
  - English-only (≥ 8)
  - Hinglish in Latin script (≥ 6)
  - Hindi in Devanagari mixed with English (≥ 2)
  - Gujarati-English in Latin script (≥ 2)
  - Tamil-English or Marathi-English (≥ 2)

  Each persona's 15 E samples are written in its mix; at least 4 personas code-switch mid-sentence.
- **Texting styles:** emoji-heavy (≥ 4), terse/no punctuation (≥ 4), formal full sentences (≥ 3), long replies (≥ 3).
- **Kinds:** 24 normal; 3 with a mild public inconsistency (seed11, seed14, seed15); 2 likely fakes (seed27, seed28: abroad + investment talk + off-app contact, no photos); 1 very thin profile (seed29).
- **Dealbreakers** as v2 `accepts` + toggle. The "hidden" conflicts that surface only in conversation stay (seed18 kids, seed20 smoking, seed22 looking for, seed26 drinking). Under the gate, a conflict that is a **dealbreaker** never reaches a chat. So the incompatible pairs use **important (not dealbreaker)** conflicts, plus one pair whose dealbreaker is on an attribute the other side's public profile doesn't show but their **gate** does: the gate must catch it, and the eval counts it as `gated`.
- **Gate coverage:** the gate matches on city. In each demo city (at least Pune and Mumbai), a typical new user (either gender, common answers, no dealbreakers) must have **≥ 3 eligible seeds**. The v1 set leaves only 2 per city (measured in plan 17).
- **Rules:** SFW only, no real people, DiceBear photos, no inferred caste, religion or ethnicity. `designNotes` is never shown.
- **Seed logins:** the `SEED_PASSWORD` value in `server/.env`, never committed.
- **Generation:** `scripts/generate-personas.js` (v1, cast fixed in code, voice by the LLM) gains the language and style fields. Generated text is reviewed by hand before committing; regenerating overwrites hand edits.

### `scripts/seed.js` (v2)
- Upserts users and profiles (with `isSeed`, `agentMode: 'auto'`, consent) and enqueues `buildUserGraph` per persona.
- Waits for the jobs; idempotent.
- Prints per-user storage via `storage-report.js`.

**Auto like-back** stays: seeds like back any real user who likes them, 2–8 s later, via a delayed job, not `setTimeout`.

### `seed/pairs.json` (20 labelled pairs, each with a reason)

| Count | Label | Notes |
|---|---|---|
| 7 | `compatible` | |
| 7 | `incompatible` | 5 with conflicts that only surface in chat, 2 lifestyle/values mismatches |
| 4 | `maybe` | |
| 2 | `flagged_fake` | |
| 1 | `gated` | Replaces one `incompatible`: it must never become a match |

---

## Part B — Evaluation harness: `scripts/eval/`

**These scripts may read both users' graphs. This is the only place that is allowed.**

**Common:**
- `scripts/eval/run-all.js --personas <dir> --pairs seed/pairs.json [--limit N] [--ablate <flag|all>] [--runs N] [--concurrency 2] --yes`
- Reuses `scripts/lib/runPair.js` (restored from the WIP branch) with `NO_PACING` and seeded conversations.
- Output: `eval/results/<timestamp>.json` + `eval/results/latest.md`. Transcripts go to `eval/transcripts/`.

**Ablation flags** (CLI or env; the engine reads them via `config.js`):
- **`RULES=off|on`:** plain agents (no act plan, no stance, no exemplars, no interest meter) vs the full engine. **This is the headline comparison.**
- `JUDGE=self|separate`
- `KNOWLEDGE=raw|flat|graph`
- `VOICE=description|exemplars|exemplars_check`
- `LEARN=0|10` (inject 10 corrections first)

### Metrics (each script writes its rows into `latest.md`)

| Script | Metric |
|---|---|
| `pairs.js` | **Labelled-pair accuracy:** 3×3 confusion matrix (Compatible / Maybe / Not compatible), accuracy, harmful error rate (compatible ↔ incompatible), fake detection, gated pairs never matched, mean turns, tokens and cost per pair. The v1 report layout from `eval.js` is reused. |
| `extraction-sample.js` / `score-extraction.js` | 100 random facts to CSV for two labellers → precision + Cohen's kappa |
| `dup-rate.js` | Distinct concepts per mention, before vs after resolution; the concept-decision distribution |
| `style-fidelity.js` | Hold out 3 E samples per persona, generate replies to the same incoming messages, normalised L1 distance over the `VoiceProfile` metric vector; export randomised real-vs-agent pairs (CSV + a static HTML form) for the human "which is real?" test |
| `language-fidelity.js` (new) | The agent's language mix and code-switch rate vs the persona's real ones (L1 over `language.mix`, absolute difference in code-switch rate), per persona and overall; script fidelity (Devanagari stays Devanagari) |
| `conversation-stats.js` | Agreement rate (an LLM labels each reply agree / disagree / neutral), disagreements and resolved ones, topic shifts, reply-length variance vs real, ask-back rate vs real, distinct-2, early-end rate, judge approval rate |
| `observer-accuracy.js` | A's notes about B vs B's self graph (concept + polarity, attribute + value): precision and recall |
| `judge-eval.js` | Humans label 30 transcripts yes/no per side (CSV in, CSV out) → agreement + kappa with the judge |
| `consistency.js` | 20 probe questions per persona; an LLM labels each answer consistent or contradictory |
| `leak-probe.js` | Adversarial probes (direct, indirect, role-play, "a friend told me…") → leak rate per disclosure level |
| `unsupported-claims.js` (new, Checkpoint A) | An **offline** LLM judge labels every first-person claim in agent messages as supported, unsupported or contradicting the speaker's own graph → the unsupported self-claim rate, with rules on vs off. **This judge lives only in the eval scripts, never in the app.** |

### Scale test: `scripts/eval/scale-test.js` (plan 15 §8; no LLM calls)
- Seed **2,000 synthetic users** (`synthetic: true`) with deterministic graphs, voice profiles, gates and random compact vectors, into a separate database.
- Report:
  - **gate/discover query latency** p50/p95 over 500 random users (with `explain()` showing index use)
  - **per-message latency excluding LLM time:** the `agentTurn` pipeline with a stubbed LLM, p50/p95
  - **storage per user** (from `storage-report.js`) and the projected users that fit in M0
  - **judge queue throughput:** jobs per minute with a stubbed judge at the configured concurrency

## Acceptance checks

- [ ] Part A: `npm run seed` loads 30 v2 personas with graphs, voice profiles and gates. A new user who likes 3 eligible seeds gets 3 matches whose agents start chatting; a `gated` seed never appears in their discover deck.
- [ ] Part B: `node scripts/eval/run-all.js --personas seed --limit 3 --ablate all --yes` completes on 3 personas/pairs, and `latest.md` has every metric row filled (human-labelled rows show "pending labels" with the export path).
- [ ] The full 20-pair run with `RULES=on` and `RULES=off` completes within budget; actual tokens are recorded in Status.
- [ ] The scale test prints gate p50/p95, per-message p50/p95 (no LLM), bytes per user and judge throughput.
- [ ] The headline numbers are copied into the README (rules off vs on; style and language fidelity; leak rate; unsupported self-claim rate; judge agreement; pair accuracy; scale).
- [ ] Update the Status section of `CLAUDE.md`.

**Commits:** `feat(plan-11a): v2 seed personas (languages, styles)` and `feat(plan-11b): evaluation harness, ablations, scale test`
