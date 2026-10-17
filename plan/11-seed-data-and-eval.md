# 11 — Seed personas + evaluation (v2)

> **Prompt for Claude Code:** Read `CLAUDE.md` (section "Knowledge graph — final design") and `plan/15-knowledge-graph-final.md` §8. **Part A is done** (`3966f5a`). Do Part B in the order given, with the reduced scope below (owner's decision, 2026-10-17). Every step updates `plan/PROGRESS.md` and is pushed.

## Why this matters
- **The demo needs a populated app:** people to match with, whose agents answer in their own voice and language. (Part A)
- **The "Technical implementation" criterion rewards proof:** a few honest numbers in the README. This is a nice-to-have next to the demo, video and README, so the scope is kept small and cheap.

**Budget rules (unchanged):**
- Every LLM-spending script prints an estimate (tokens and time) and needs `--yes`.
- Concurrency is 2; the RPM limiter applies.
- Stop on NVIDIA credit or quota errors; never retry in a loop.
- Results are checkpointed per pair (`eval/raw.json`), so a crash or rate limit resumes, not restarts.

---

## Part A — Seed personas ✅ done (`3966f5a`)
- 38 personas meet `seed/persona-quotas.json`, checked in code by `scripts/seed/check-personas.js`:
  - language mixes: Hinglish, Devanagari, Gujarati-English, Tamil/Marathi-English, code-switching
  - texting styles: terse, emoji-heavy, long, formal
  - 5 demo cities with ≥ 3 visible seeds for a typical new user of either gender
- `seed/pairs.json`: 20 labelled pairs (compatible, incompatible, maybe, flagged_fake, and 1 `gated`), all in one city and on the right side of the gate.
- Seeding is incremental (`User.seedHash`): the full re-seed took 1,666 s; a re-run with nothing changed takes 0 s.
- Keep `check-personas.js` passing whenever personas change.

---

## Part B — Tuning and evaluation (reduced scope)

**These scripts may read both users' graphs. This is the only place that is allowed.**

### B1. Tuning on the fixed 6-pair subset (do first; decides whether the long runs are worth it)
- **No filler fallbacks.** When a draft fails the checks:
  - drop only the failing sentences and keep the valid ones;
  - if nothing survives, do one constrained regeneration from the act plan (short, honest, in-voice, on the last message's topic, citing a fact or expressing uncertainty);
  - log the fallback rate per conversation (target < 5% of agent messages).
- **No natural end while an agenda item with importance ≥ 0.7 is unanswered.** The low-interest end and `MAX_TURNS` still apply. Near `MAX_TURNS`, steer in-voice to the open item.
- Re-run the same 6 pairs after each change. Target ≥ 5/6 correct with no filler lines. Stop after 3 iterations and report what's left.

### B2. Scale test: `scripts/eval/scale-test.js` (no LLM calls; minutes, not hours)
- Insert **2,000 synthetic users** (`synthetic: true`) directly with code into a **local `MongoMemoryReplSet`**, never Atlas:
  - random gate profiles
  - ~60 concept-linked facts each
  - voice profiles
  - compact vectors
  - all production indexes
- Report:
  - discover/gate query p50/p95 over 500 random users (`explain()` must show index use)
  - per-message context build p50/p95 with a stubbed LLM, for cache hit and miss
  - storage per user (`storage-report.js`) and the projected users that fit in M0
  - judge queue throughput with a stubbed judge

### B3. Metric scripts (computed from saved transcripts; no new chats)
| Script | Metric |
|---|---|
| `pairs.js` (the `eval.js` v2 report) | Confusion matrix (Compatible / Maybe / Not compatible), accuracy, harmful error rate (compatible ↔ incompatible), fakes caught, gated pairs never matched, mean turns, tokens and cost per pair |
| `style-fidelity.js` | The agent's VoiceProfile metric vector vs the persona's real one (normalised L1); export 20 randomised real-vs-agent reply pairs (CSV + static HTML) for a quick human "which is real?" test by the team |
| `language-fidelity.js` | The agent's language mix and code-switch rate vs the persona's, and script fidelity (Devanagari stays Devanagari) |
| `conversation-stats.js` | Agreement rate, disagreements and resolved ones, reply-length variance vs real, ask-back rate, early-end rate, filler/fallback rate, judge approval rate |
| `unsupported-claims.js` | An **offline** LLM judge labels first-person claims as supported / unsupported / contradicting the speaker's own graph. This judge exists only in eval scripts, never in the app |
| `leak-probe.js` | 2 personas × 10 adversarial probes (direct, indirect, role-play, "a friend told me…") → leak rate by disclosure level |
| `judge-eval.js` | Export 10 transcripts (balanced yes / no / maybe) to `eval/labels/` for the team to label; compute agreement once labels exist. Never blocks anything |

### B4. Ablation: `RULES=on|off` on the 6-pair subset only
- Plain agents (no act plan, no stance, no exemplars, no interest meter) vs the full engine.
- This is the headline comparison: agreement rate, disagreements, unsupported-claim rate and judge approval rate.

### B5. One full 20-pair run (`RULES=on`), exactly once, overnight
- Only after B1–B4, and only after telling the owner (show the estimate first).
- Then calibrate `JUDGE_YES_MIN` on the subset + full-run results.

### B6. Results
- Write `eval/results/latest.md` with the headline numbers:
  - pair accuracy and harmful errors
  - rules off vs on
  - style and language fidelity
  - unsupported self-claim rate
  - leak rate
  - scale
- Copy them into the README.
- **If the provider changes (plan 14) before B5,** run B5 on the final provider and embedding model, so the README numbers match the deployed app.

**Dropped from the old plan** (not worth the time or credits for the submission): `extraction-sample` / kappa with two labellers, `dup-rate`, `consistency`, `observer-accuracy`, ablations other than `RULES`, `--runs N` repeats, and the full 20-pair run with `RULES=off`.

## Acceptance checks
- [ ] B1: the 6-pair subset ≥ 5/6 correct (or the 3-iteration report), fallback rate < 5%.
- [ ] B2: the scale test prints gate p50/p95 (with index use), context-build p50/p95, bytes per user and judge throughput, with 0 LLM calls.
- [ ] B3–B4: every row in `latest.md` is filled ("pending labels" for human-labelled rows, with the export path).
- [ ] B5: the full run is done within budget; actual tokens are recorded in Status.
- [ ] The README has the headline numbers. CLAUDE.md Status and PROGRESS.md are updated.

**Commits:** `feat(plan-11b): tuning`, `feat(plan-11b): scale test`, `feat(plan-11b): metrics + ablation`, `docs(plan-11b): results`
