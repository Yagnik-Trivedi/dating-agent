# 06 — Step 1: Fake profile + inconsistency check

> **Prompt for Claude Code:** Read `CLAUDE.md` (section "Knowledge graph — final design") and `plan/15-knowledge-graph-final.md` §1 and §4 stage 4. The trust logic is unchanged from v1; this plan moves it into the match-created job and locks down what it may read. Implement it and run the acceptance checks.

## Goal

When a match is created, each user's agent checks the **other** user's **public profile**. The result:
- a trust level `ok | caution | likely_fake`, with reasons
- soft inconsistencies, which become "clarify gently" agenda items in plan 07

**Key principle:** "inconsistent" is not "fake". Real people are messy. Mild contradictions become things to clarify, not a rejection. Reserve `likely_fake` for strong signals.

## Information boundary (tested in code)

- The trust check is one of only two places (with the brief) where an agent reads another user's `Profile`.
- It reads **only** the `PUBLIC_PROFILE` projection (name, age, city, photos, bio, prompts, public tags) plus the account's `createdAt`.
- It never reads their `Profile.gate`, `dealbreakers`, `KgFact`, `KgEdge`, `VoiceProfile` or `VoiceSample`.
- The plan 08 DB-spy test asserts this.
- The subject's private dealbreakers are never sent to the consistency check (v1 decision, kept).

## Where it runs

It's step 2 of the `matchCreated` job (plan 17 queue, plan 07 pipeline):
1. gate re-check (plan 07)
2. **trust check**: `checkProfile(viewerId, subjectId)` for both directions in parallel → `match.trust[viewerId]`
3. brief (plan 07)

Then:
- Either side `likely_fake` → status `flagged_fake`. Only the flagging viewer gets `trust:flagged` + reasons. For the flagged side the match reads as `closed` (`statusFor`). The agents never start, and messages are refused.
- Otherwise continue to the brief.

The job is idempotent: a re-run with `match.trust` already set skips straight to the next step.

## `services/trust/checkProfile.js`

### A. Rule checks (code, no LLM; each adds points and a flag; patterns in `services/trust/rules.js`)

| Signal | Points | Flag text |
|---|---|---|
| No photos | +25 | "No photos" |
| Bio under 15 characters, or missing prompts | +10 | "Very little profile content" |
| Phone number, email, URL, @handle, UPI, "telegram", "whatsapp me" in bio or prompts | +30 | "Pushes contact off-app" |
| Money phrases: "investment opportunity", crypto, forex, "guaranteed returns", gift cards, loans | +40 | "Money/investment talk" |
| Age outside 18–80, or the age in the bio contradicts the age field | +30 | "Age mismatch" |
| Account younger than 10 minutes with a maxed-out profile | +10 | "Brand-new account" |

Money rules match **phrases**, not bare words, so "investment banker" isn't flagged.

### B. LLM consistency check (tier mid, `prompts/profileConsistency.js`)

The input is the public profile as JSON (public tags, prompts, bio; **not** dealbreakers). The model compares the declared tags with what the free text says, and finds contradictions and scam-script patterns:
- tags "never drinks" vs a prompt "best nights end with a few beers"
- template-like or generic bios
- sob stories, urgency, "abroad / military / oil rig" claims

Output (zod):
```json
{ "contradictions": [ { "a": "quote or tag", "b": "quote", "topic": "drinking", "severity": 1 } ],
  "scamSignals": [ { "signal": "short", "quote": "..." } ],
  "genericBio": false, "summary": "one sentence" }
```
- Severity uses the concrete guide in the prompt: 1 = minor, 2 = notable, 3 = blatant reversal.
- **Every contradiction must carry a verbatim profile quote**; drop the rest in code.

Points: severity 3 → +20, severity 2 → +8, severity 1 → +2; each scam signal +25; `genericBio` +8.

If the LLM call fails, the rule results still stand.

### C. Scoring

`points` = sum, capped at 100; `score = 100 − points`.
- `ok`: score ≥ 70
- `caution`: 40–69
- `likely_fake`: < 40, **or** any scam signal combined with off-app contact pushing

Save:
```json
{ "score": 82, "level": "ok", "flags": [...], "contradictions": [...], "clarify": ["drinking"] }
```
`clarify` holds severity 1–2 contradiction topics as neutral words. Plan 07 adds them to the agenda.

Photo checks are out of scope (DiceBear avatars). Never infer ethnicity, religion or caste.

## Continuous scam watch (used by plan 08)

`scanMessage(text) → { flags[], severity 0–3 }`, with the same patterns. "add me on telegram, I can help you invest" = 3. Plan 08 runs it on every incoming message and every outgoing draft.

## Acceptance checks

- [ ] `node scripts/trust-check.js`: the 6 crafted cases in `seed/trust-cases.json` land on ok, ok, ok, caution, caution, likely_fake, two runs in a row.
- [ ] A mild contradiction appears in `clarify`, not as a rejection. Every contradiction includes a verbatim quote.
- [ ] Running inside the `matchCreated` job: scammer → `flagged_fake` (closed for the flagged side, reasons only to the viewer); clean → continues to the brief. Re-running the job doesn't call the LLM again.
- [ ] DB spy (helper from plan 08, or a minimal one here): during the trust check the only reads about the subject are `Profile` with the public projection and `User.createdAt`.
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-06): trust check in the match-created job, public-profile only`
