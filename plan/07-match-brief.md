# 07 — Step 2: Understand the match before talking (brief + agenda)

> **Prompt for Claude Code:** Read `CLAUDE.md`, then implement the pre-conversation brief. It runs after the trust check passes. Run the acceptance checks.

## Goal

Before the first message, each user's agent:
1. turns the match's profile into low-confidence facts about the match
2. compares them against its own user's graph
3. produces a short brief, an **agenda** of what to find out, and 3 grounded openers
4. detects an **early dealbreaker clash**, so no tokens are wasted

## Steps (`services/brief/buildBrief.js`, run for each direction: viewer → subject)

### 1. Profile → observed facts
Tier `mid`, prompt `prompts/profileToFacts.js`.
- **Input:** the subject's profile JSON.
- **Output:** a facts array (same shape as plan 05), each with a quote from the profile.
- **Save as `KgFact`** with:
  - `subjectId` = match
  - `observerId` = viewer
  - `matchId`
  - `source: 'profile'`
  - `confidence: 0.4`, or 0.6 for explicit structured tags like `wantsKids`
- Embed them.

### 2. Compare with the viewer's own graph (code)
Load viewer self-facts and these observed facts, with embeddings.
- **Overlaps:** pairs with cosine ≥ 0.80 across likes/interests/values. Keep the top 5.
- **Early dealbreaker clash:** any viewer `dealbreaker` fact versus an observed fact with cosine ≥ 0.80 that directly contradicts it. Use tier `fast`, prompt `prompts/dealbreakerClash.js`, returning `{ clash: boolean, why: string }` for the top 3 candidates only. If clash is true and the observed fact came from a structured tag (confidence ≥ 0.6), set `earlyDealbreaker`.

### 3. Agenda: what this conversation must uncover
Build candidate dimensions from the viewer's graph:
- every `dealbreaker`, `values`, `goal` and `lifestyle` fact
- the top 5 interests

For each dimension:
- `importance` = viewer fact `weight`
- `knownConfidence` = the max confidence of any observed fact about the match that relates to it (cosine ≥ 0.75), else 0
- `priority = importance × (1 − knownConfidence)`

Also add trust `clarify` items from plan 06 with priority 0.6.

Keep the top 8 as `agenda: [{ id, topic, why, priority, status: 'open' }]`. Topics are neutral phrases ("kids someday", "drinking habits", "weekend energy: going out vs staying in"). **Never** put a private fact's content in a topic string the agent might echo.

### 4. Brief + openers
Tier `mid`, prompt `prompts/matchBrief.js`. Input: the subject's profile, the overlaps, the top agenda topics, and the viewer's style description. Output:
```json
{
  "summary": "3 lines on who this person seems to be",
  "openers": [ { "text": "...", "hook": "which profile prompt/overlap it uses" } ],
  "watchouts": ["..."]
}
```
Openers must reference something specific in the match's profile, be written in the viewer's style, and be at most 2 sentences.

### 5. Save + continue
Save `match.brief[viewerId] = { summary, overlaps, agenda, openers, watchouts, earlyDealbreaker }`. Then:
- If either side has `earlyDealbreaker`: skip the conversation, go straight to plan 09 (verdict `incompatible`, reason = the clash, evidence = profile quotes). The user can still override.
- Otherwise, `setStatus('agent_chatting')` and call plan 08's `startConversation(match)`.

## Acceptance checks

- [ ] Add a script `scripts/brief.js <viewerEmail> <subjectEmail>` that prints the brief.
- [ ] For a pair sharing "trekking", the overlap shows up and at least one opener references it.
- [ ] For a pair where A has the dealbreaker "no smoking" and B's tags say smoking "regularly", the result is `earlyDealbreaker` and the conversation is skipped.
- [ ] The agenda is sorted by priority and contains no private fact text.
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-07): match brief, agenda, openers, early dealbreaker`
