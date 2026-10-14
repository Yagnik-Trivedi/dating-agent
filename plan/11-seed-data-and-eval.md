# 11 — Seed personas + evaluation harness

> **Prompt for Claude Code:** Read `CLAUDE.md`. Part A (persona generation) can be done right after plan 04/05. Part B (eval) needs plans 06–09. Do the part you're asked for, then run its acceptance checks.

## Why this matters

- **The demo needs a populated app:** real-feeling people to match with, whose agents respond.
- **The "Technical implementation" judging criterion rewards proof.** A confusion matrix on labelled pairs in the README is something few hackathon teams have.

---

## Part A — Seed personas (`scripts/generate-personas.js` → `seed/personas.json`, committed)

Generate **30 personas** once with tier `mid`, review them by hand, and commit the JSON. Never regenerate on deploy; this saves credits.

**Mix:**
- 24 normal personas: varied Indian cities (Ahmedabad, Mumbai, Bengaluru, Pune, Delhi, Hyderabad, Chennai), ages 21–34, varied genders and orientations, varied personalities, values, interests and texting styles (some Hinglish, some formal, some emoji-heavy, some terse).
- 3 personas with **mild inconsistencies** (tags vs prompts disagree on one thing).
- 2 personas that are **likely fake** (scam scripts: investment talk, pushing to Telegram).
- 1 persona with **very thin content**.

**Each persona includes:**
- `email` (`seedNN@demo.local`)
- `password`: a shared demo password, stored only in `seed/README.md` for the team. Seed accounts aren't real users.
- the profile fields (plan 04)
- **full onboarding answers** (plan 05 sections A–E), so `buildUserGraph` creates their graph
- `agentMode: 'auto'`
- `isSeed: true`
- `photos`: DiceBear URLs, e.g. `https://api.dicebear.com/9.x/notionists/svg?seed=<name>`
- `designNotes`: a hidden field for humans explaining the persona's intent

**Rules:** SFW only. No real people. No inferred caste, religion or ethnicity. Religion appears only as the persona's own stated importance.

### `scripts/seed.js`
- Upserts users and profiles and runs `buildUserGraph` for each, with concurrency 3.
- Idempotent: running it twice doesn't duplicate anything.
- **Auto-like:** seed users like every real (non-seed) user who likes them, so a new user who likes a seed persona matches instantly. Implement this in the like handler with an `isSeed` check, with a small random delay (2–8 s) for realism.

### Pairs file: `seed/pairs.json`
Hand-label **20 pairs** from the seed set with the expected verdict and a reason:
- 7 designed compatible (shared values, goals and interests; compatible styles)
- 7 designed incompatible (5 dealbreaker conflicts that only surface **in conversation**, not in tags; 2 lifestyle and values mismatches)
- 4 ambiguous ("maybe")
- 2 involving fake personas (expected `flagged_fake`)

---

## Part B — Evaluation harness (`scripts/eval.js`)

- For each pair in `seed/pairs.json`, run the full pipeline via the `simulate.js` internals: trust → brief → conversation → evaluate. Use `DEMO_FAST`, no pacing.
- **Budget control:**
  - `--runs 1` by default
  - `--limit N` to try a subset first
  - print the estimated tokens before starting and require `--yes` to proceed
- **Record per pair:** expected, predicted (for both viewers), score, stop reason, turn count, tokens, and seconds.
- **Write `eval/results.md`:**
  - a 3×3 confusion matrix (compatible / maybe / incompatible), plus fake-detection accuracy
  - accuracy and "harmful error rate": a compatible pair predicted incompatible, or vice versa
  - mean turns to verdict, mean tokens per pair, and estimated cost per pair
  - a table of every pair with a one-line reason and links to its transcript file in `eval/transcripts/`
- **Optional `--runs 3`:** report the verdict agreement rate across runs. This is the stability metric.

**Tuning loop:** if results are poor, adjust `services/compat/config.js` weights and thresholds and the agent prompts, re-run on `--limit 6`, then run the full set once. Commit the final `eval/results.md`, and copy the headline numbers into the README.

## Acceptance checks

- [ ] Part A: `npm run seed` loads 30 personas with graphs. Logging in as a new user and liking 3 seed personas produces 3 matches whose agents start chatting.
- [ ] Part B: `npm run eval -- --limit 4 --yes` completes and writes `eval/results.md` with a confusion matrix.
- [ ] The full eval run fits within the credit budget. Record the actual tokens in the Status section of `CLAUDE.md`.

**Commits:** `feat(plan-11a): seed personas` and `feat(plan-11b): evaluation harness + results`
