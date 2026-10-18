# 09 — Step 4: Independent judges, handoff, compaction, date ideas

> **Prompt for Claude Code:** Read `CLAUDE.md` (section "Knowledge graph — final design"), `plan/15-knowledge-graph-final.md` §4 stage 6 and `plan/archive/kg-upgrade-reference.md` Phase 7.2. This replaces v1's code-computed dimension scores (`services/compat/config.js` weights, `alignmentDims`, `interestsDim`). Implement it, run the acceptance checks.

## Goal

When a conversation ends, **each side's judge decides for its own user**, independently, from:
- that user's own graph
- that user's own notes and chat moments
- the transcript

Every point cites a verbatim quote. Then:
- **mutual yes** → handoff
- otherwise → a wind-down or close

Raw notes of closed matches are compacted and archived.

**Honest framing** (README too): pre-meeting compatibility prediction is weak in research (e.g. Joel, Eastwick & Finkel, 2017). The product filters clear mismatches and fakes and saves time. It doesn't predict love. The user can always override.

## 1. Judge job: `services/conversation/judge.js` (job type `judge`, one per side, dedupeKey `judge:<conversationId>:<userId>`)

**Setup:**
- A different prompt from the speaking agent (`prompts/judge.js`).
- Tier smart (`JUDGE_MODEL` if set), temperature 0.
- If the smart model is unavailable (timeout/5xx after retries), fall back to tier mid with reasoning off, and record which model ran in `judgeModel`. On NVIDIA's free tier Ultra has timed out for hours at a time.

**Input:**
- my **full** self graph, including private facts, traits, dealbreakers and `accepts` (the output is a decision, never shown to the other side)
- my notes and `ChatEvent`s for this conversation
- my agenda with statuses
- the transcript, with ids `m1…mN` mapped back in code
- **never** the other user's graph

**Output** (zod) → `models/MatchDecision.js`:
```js
MatchDecision { conversationId, matchId, userId, otherUserId,
  decision: 'yes'|'no'|'unsure', confidence,
  positives: [{ quote, why, messageId }], frictions: [{ quote, why, severity, messageId }],
  dealbreakerRisk: [{ attribute, quote }], noFrictionJustification,
  summaryForUser, notesSummary /*filled by compaction*/, judgeModel, createdAt }
```
Index `{ userId: 1, matchId: 1 }`.

**Validators** (code; a failure triggers one re-ask, then the offending items are dropped):
- Every `positives[].quote` and `frictions[].quote` appears **verbatim** in the transcript and maps to a real message.
- Generic positives without a quote are rejected.
- `frictions` is non-empty unless `noFrictionJustification` is given.
- `dealbreakerRisk` is non-empty if any `dealbreaker_hint` event exists.
- `decision: 'yes'` requires `confidence ≥ JUDGE_YES_MIN` (calibrated on plan 11's labelled pairs); a lower-confidence yes becomes `unsure`.

**Rubric in the prompt:**
- **Connection:** `shared_interest` with high own strength, `laugh`, `disagreement_resolved`, `warmth`.
- **Friction:** `interest_clash`, unresolved `disagreement` on strong values, `boredom`, `question_dodged`, an early end for low interest, `dealbreaker_hint`.
- Politeness alone is not evidence.
- A dealbreaker topic never discussed is a friction ("you never found out where they stand on X"), not a pass.

## 2. What the user sees (mapping; Checkpoint A)

| Judge decision | Shown as |
|---|---|
| `yes` | **Compatible** |
| `unsure` | **Maybe** |
| `no` | **Not compatible** |

- The match status is the **lower** of the two sides (`incompatible` < `maybe` < `compatible`). Each user sees only their own `summaryForUser`, positives, frictions and quotes (the "receipts"). **The other side's reasons are never shown.**
- `GET /api/matches/:id/report` returns my `MatchDecision` + the mapped label. The v1 `match.report` field is removed.
- **Handoff only on mutual yes:**
  - Both judges `yes` → both users get "Your agent thinks you two click" with **Continue as myself** / **Pass**. When both press Continue → `handed_off`, both agents off, and the chat shows the **reveal**: "The first N messages were handled by your agents. From here on it's just you two."
  - `unsure` on either side → **Maybe**. The agents pause and each user decides. Handoff still needs both users to press Continue.
- **Not compatible** on my side → my agent (if still active) sends **one** kind wind-down in my voice (`prompts/windDown.js` with my exemplars + `closingStyle`), then `closed`. If I took over, nothing is sent.
- **"Talk anyway"** (only when **my own** decision is `no`) reopens the match as Maybe with my agent off; the other side then decides. Continue on a match the other side closed → 409.
- **Flagged fake:** no wind-down, just closed with the trust reasons (plan 06).
- **Optional follow-up:** if both sides are `unsure`, a user may ask for one short follow-up chat (`Conversation.round = 2`, `MAX_TURNS / 2`).
- **Replay:** `GET /api/conversations/:id/replay` returns the messages, **my** side's `ChatEvent`s, **my** `MatchDecision` and the final mutual result, never the other side's decision or events. Plan 10 renders it.

## 3. Notes compaction: the `compactNotes` job (on close, not on handoff)

- Summarise my notes + `ChatEvent`s for the conversation into `MatchDecision.notesSummary` (tier mid, reasoning off, ≤ 120 words, quotes kept).
- Then set `archiveAt = now + NOTES_RETENTION_DAYS` on that conversation's notes, `ChatEvent`s and agent messages. The TTL indexes (plan 17) remove them later.
- **A handed-off match keeps its notes.**

## 4. Date ideas (Tavily): `GET /api/matches/:id/date-ideas`

- Only for compatible, maybe or handed-off matches.
- **Query from my own data only** (Checkpoint A): the labels of my `shared_interest` `ChatEvent`s (top 2 by weight) + **my** city, e.g. "trekking and filter coffee spots for a first date in Pune". The other user's `Profile` is not read.
- `@tavily/core` search with `maxResults: 5` → 3 ideas `{ title, why, link }` (tier fast; links only from the results).
- Cached by query in `SearchCache` for 7 days (TTL).
- No `TAVILY_API_KEY` → 503 `DATE_IDEAS_UNAVAILABLE`, and the UI says so.
- **Icebreakers:** 3 starters from my `shared_interest` events (tier fast), stored on my `MatchDecision` for yes/unsure.

## 5. Account deletion (completes plan 05 §8)

Also delete the user's `ChatEvent`s and `MatchDecision`s. Anonymise their side of matches and messages: name "Deleted user", text kept only where the other user's history needs it.

## Acceptance checks

- [ ] Unit tests for the validators: a non-verbatim quote is dropped; a generic positive is rejected; empty frictions without a justification → re-ask; a `dealbreaker_hint` event without `dealbreakerRisk` → re-ask; a low-confidence yes → `unsure`.
- [ ] Integration (the plan 08 anti-smoking pair): A's judge lists the smoking disagreement as a friction with a verbatim quote.
- [ ] `simulate.js` on a designed compatible seed pair → both `yes` (Compatible) with verbatim receipts; on a pair whose dealbreaker surfaces in chat → `no` with `dealbreakerRisk`, plus one wind-down in the right voice; then closed.
- [ ] Exactly one judge call per side per conversation (`usage`, purpose `judge`, smart or recorded fallback).
- [ ] DB spy: the judge reads only its own user's graph, notes and events, plus the transcript.
- [ ] Mutual yes + both Continue → `handed_off` + reveal. "Talk anyway" reopens only for the side whose own decision is `no`.
- [ ] `compactNotes` fills `notesSummary` and sets `archiveAt`; a handed-off match keeps its notes; `check-indexes.js` shows the TTL indexes.
- [ ] Date ideas use only my events + my city (spy); a second call within 7 days hits the cache; no key → 503.
- [ ] App end to end after wipe + re-seed. The frontend shows the new report (minimal changes here; plan 10 polishes).
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-09): independent judges, MatchDecision, handoff, compaction, date ideas`
