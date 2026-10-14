# 09 — Step 4: Compatibility verdict, handoff, date ideas

> **Prompt for Claude Code:** Read `CLAUDE.md` and `plan/08-agent-conversation.md`, then implement the evaluation, the verdict report, the handoff flow and Tavily date ideas. Run the acceptance checks.

## Goal

When the conversation stops, each user's agent produces a verdict **for its own user**: Compatible / Maybe / Not compatible. Every reason cites real messages. Then it hands off or winds down.

**Honest framing** (put this in the README too): pre-meeting compatibility prediction is weak in research (e.g. Joel, Eastwick & Finkel, 2017). The product's job is to **filter clear mismatches and fakes and save time**, not to predict love. The user can always override.

## `services/compat/evaluate.js`: run for each viewer in the match

### 1. Dimension scores (code; each 0..1 plus a confidence)

| Dimension | How |
|---|---|
| `dealbreakers` | 0 if any confirmed clash (plan 08 stop rule), else 1. **Hard gate.** |
| `valuesGoals` | For each viewer `values`/`goal` fact: find the best-matching observed fact (cosine ≥ 0.75). Ask tier `fast` (`prompts/alignment.js`, batched) whether each pair is aligned, neutral or conflicting (1 / 0.5 / 0). Take the weighted mean by viewer weight. |
| `lifestyle` | Same method on `lifestyle` facts. |
| `interests` | Overlap of the viewer's top interests with observed likes (cosine ≥ 0.80), weighted by intensity. |
| `communication` | From the transcript: ratio of their median message length to the viewer's (closer to 1 is better), question balance, response latency (humans only), and the share of their messages that ask something back. |
| `personality` | Light-touch only: match the viewer's trait-based tone preferences against observed signals. Weight is small. |

Confidence per dimension = the mean confidence of the observed facts used. 0 if none.

### 2. Judge (tier `smart`, `prompts/verdict.js`, ONE call per viewer)

Input:
- the viewer's top facts (no private content beyond what's needed: summarize traits as tone preferences)
- the dimension scores
- the agenda with its statuses
- the transcript with message IDs

Output:
```json
{
  "chemistry": 0.0,
  "reasons": [ { "text": "short", "messageIds": ["..."] } ],
  "concerns": [ { "text": "short", "messageIds": ["..."] } ],
  "askYourself": ["question the user should think about"],
  "summary": "2 sentences, plain language"
}
```
`chemistry` is the judge's read of rapport (0–1). Each reason/concern must cite at least one message ID that exists. Validate this and drop items that don't.

### 3. Verdict (code)
```
score = 0.30*valuesGoals + 0.20*lifestyle + 0.15*interests + 0.15*communication + 0.10*personality + 0.10*chemistry
if dealbreakers == 0                     → 'incompatible'
else if score ≥ 0.70 and avgConf ≥ 0.5   → 'compatible'
else if score < 0.50 and avgConf ≥ 0.5   → 'incompatible'
else                                     → 'maybe'
```
Weights and thresholds live in `services/compat/config.js` so plan 11's eval can tune them.

Save `match.report[viewerId] = { verdict, score, dimensions, reasons, concerns, askYourself, summary, evaluatedAt }`. Emit `report:ready` to the viewer. The overall match status is the "lower" of the two verdicts (`incompatible` < `maybe` < `compatible`). Each user only ever sees **their own** report.

## Handoff flow

- **Compatible or Maybe:** the user gets a "Your agent thinks you two click" (or "Worth a look") card with the report and two buttons:
  - **Continue as myself:** `decision: 'continue'`. Sets `agentActive=false` for that user.
  - **Pass**
  - If **both** choose continue: status `handed_off`. Emit to both, and the chat UI shows the **reveal**: "The first N messages were handled by your agents. From here on it's just you two." `authoredBy` becomes visible on both sides.
  - If one side continues and the other is still deciding, the agent keeps the conversation politely idle (no new messages).
- **Incompatible:** the agent sends **one** kind wind-down message in the user's style (`prompts/windDown.js`, tier `fast`), e.g. "hey, really enjoyed chatting! I don't think we're quite on the same page on a few things, but wishing you the best 🙂". Then status `closed`. The user can open the report and **override** ("Talk anyway"), which sets `agentActive=false` and reopens the match.
- **Flagged fake:** no wind-down message. Just close and show the user the trust reasons.

## Date ideas (Tavily) — `GET /api/matches/:id/date-ideas`

Only for `compatible`/`maybe`/`handed_off` matches.
- Build a query from the two cities (or the shared city) plus the top 2 shared interests, e.g. "specialty coffee and live music spots in Ahmedabad".
- Call `@tavily/core` search with `maxResults: 5`.
- Summarize into 3 ideas with tier `fast`: `{ title, why (ties to a shared interest), link }`.
- **Cache** by query string in Mongo for 7 days to save credits.
- **Icebreakers:** 3 conversation starters from the overlaps (tier `fast`), stored with the report.

## Acceptance checks

- [ ] `simulate.js` on a designed compatible pair → `compatible`, with reasons that cite real message IDs.
- [ ] `simulate.js` on a designed dealbreaker pair → `incompatible`, plus a wind-down message in the right style.
- [ ] Both users press Continue → `handed_off`, and the reveal text appears in the API response for messages.
- [ ] Override on an incompatible match reopens it.
- [ ] Date ideas return 3 items. A second call within 7 days hits the cache (check the logs).
- [ ] Only 1 `smart`-tier call per viewer per evaluation. Verify in the `usage` collection.
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-09): compatibility verdict, handoff, date ideas`
