# 06 — Step 1: Fake profile + inconsistency check

> **Prompt for Claude Code:** Read `CLAUDE.md`, then implement the trust check that runs on every new match before any conversation. Run the acceptance checks.

## Goal

When a match is created, each user's agent checks the **other** profile. The result:
- a trust level of `ok | caution | likely_fake`, with reasons
- a list of soft inconsistencies, which feed the conversation agenda as "clarify gently" items

**Key principle:** "inconsistent" is not "fake". Real people are messy. Mild contradictions become things to clarify, not a rejection. Reserve `likely_fake` for strong signals.

## Where it runs

`onMatchCreated(match)` → `setStatus('trust_check')` → run `checkProfile(viewerId, subjectId)` for **both** directions in parallel → save into `match.trust[viewerId]`. Then:
- If either side is `likely_fake`: status `flagged_fake`, and notify that viewer with the reasons. The agent never starts for that viewer.
- Otherwise, continue to plan 07 (`briefing`).

## `services/trust/checkProfile.js`

### A. Rule checks (code, no LLM; each adds points and a flag)

| Signal | Points | Flag text |
|---|---|---|
| No photos | +25 | "No photos" |
| Bio under 15 characters, or missing prompts | +10 | "Very little profile content" |
| Phone number, email, URL, @handle, UPI, "telegram", "whatsapp me" in bio or prompts | +30 | "Pushes contact off-app" |
| Money, crypto, investment, forex, "trading profits", gift cards, "send", loan words | +40 | "Money/investment talk" |
| Age outside 18–80, or the age in the bio contradicts the age field | +30 | "Age mismatch" |
| Account younger than 10 minutes with a maxed-out profile (seed metadata only) | +10 | "Brand-new account" |

### B. LLM consistency check (tier `mid`, prompt `prompts/profileConsistency.js`)

The input is the full profile as structured JSON: tags, dealbreakers, prompts and bio. Instruction: compare the **declared tags/preferences** with what the **free text** says, and find contradictions *and* scam-script patterns. For example:
- tags say "never drinks" but a prompt says "best nights end with a few beers"
- tags say "wants kids" but the bio says "kids are not for me"
- a bio that reads like a template or is LLM-generated and generic
- sob stories, urgency, or claims of being abroad, military or on an oil rig

Output schema (zod):
```json
{
  "contradictions": [ { "a": "quote or tag", "b": "quote", "topic": "drinking", "severity": 1 } ],
  "scamSignals": [ { "signal": "short", "quote": "..." } ],
  "genericBio": false,
  "summary": "one sentence"
}
```
Severity runs 1 to 3: 1 = minor, 2 = notable, 3 = blatant.

Points: each severity-3 contradiction +20, severity-2 +8, severity-1 +2; each scam signal +25; `genericBio` +8.

### C. Optional stretch: photo check
Only if time allows. If a vision model is available on Token Factory (prefer an NVIDIA one; else Qwen-VL), check whether photo content contradicts the stated age or lifestyle. **Never** infer ethnicity, religion or caste. Skip this for DiceBear avatars.

### D. Scoring
`points` = sum, capped at 100. `score = 100 - points`.
- `ok`: score ≥ 70
- `caution`: 40–69
- `likely_fake`: < 40, **or** any scam signal combined with off-app contact pushing

Save:
```json
{ "score": 82, "level": "ok", "flags": [...], "contradictions": [...], "clarify": ["drinking: tags vs prompt"] }
```
`clarify` items are severity 1–2 contradictions, phrased as neutral topics for plan 07's agenda.

## Continuous scam watch (used by plan 08)

Export `scanMessage(text) → { flags[], severity }` using the same rule patterns (off-app contact, money, urgency). Plan 08 calls it on every incoming message. Two hits, or one severe hit: pause the agent, set status `flagged_fake`, and notify the user.

## Acceptance checks

- [ ] Add a script `scripts/trust-check.js` that runs against 6 crafted profiles in `seed/trust-cases.json`: 2 clean, 2 with mild contradictions, 1 with a blatant contradiction, 1 scammer. It prints levels, and the expected levels match: ok, ok, ok/caution, caution, caution/likely_fake, likely_fake.
- [ ] A mild contradiction appears in `clarify`, not as a rejection.
- [ ] Every contradiction includes a quote.
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-06): profile trust and consistency check`
