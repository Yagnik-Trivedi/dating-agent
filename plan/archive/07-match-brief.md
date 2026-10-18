# 07 — Step 2: Match created → gate, brief, agenda, conversation

> **Prompt for Claude Code:** Read `CLAUDE.md` (section "Knowledge graph — final design"), `plan/15-knowledge-graph-final.md` §1 and §4 stage 4, and `plan/17-jobs-and-scaling.md` (for `passesGate` and the job queue). Implement this file, wipe and re-seed if the schema changed, run the acceptance checks.

## Goal

The `matchCreated` job prepares a match before anyone talks:
1. **gate re-check** (code, boolean)
2. **trust check** (plan 06)
3. **brief** per side: openers + an agenda
4. **a `Conversation` document** with a seed and per-side agent state

**Nothing is written to anyone's self graph, and nothing about the other user is stored as a fact.** The brief reads the other user's **public profile** (allowed here, like a human reading it) and **my own** graph. It never compares the two users' facts or embeddings.

## Remove (v1 code that breaks the boundary)

Remove all of these, plus their prompts, checks and Status notes:
- `prompts/profileToFacts.js` and the observer `KgFact`s with `source: 'profile'`. The brief stores nothing about the other user.
- `findOverlaps` (cosine between my facts and facts from their profile).
- `findClash` + `prompts/dealbreakerClash.js` + the `earlyDealbreaker` path; the gate replaces them.
- The agenda's "already known" value (cosine against their profile).
- The `selfFactsV1()` adapter from plan 05; nothing calls it after this plan.

## 1. At match creation (`services/matches.js#createMatch`)

- Store both display names on the match: `perUser[i].name` (first name from the public profile). From here on, agents, judges and wind-downs read the other person's name **from the match**, never from their `Profile` (Checkpoint A).
- Enqueue `matchCreated` (dedupeKey `match:<matchId>`).

## 2. Gate re-check

`passesGate(a, b)` (plan 17) on both users' current `Profile.gate`. Fail → status `closed` with `closedReason: 'gate'`:
- Both sides see "Not compatible on a dealbreaker", with no detail.
- No trust, brief or conversation tokens are spent.
- This catches answers changed between discover and the like.

## 3. Trust check

Plan 06, both directions.

## 4. Brief (`services/brief/buildBrief.js`, per viewer → subject)

**Inputs:**
- their public profile (`PUBLIC_PROFILE` projection: bio, prompts, public tags, city)
- my **own** sayable facts: `public` only, via plan 08's `selectFacts` when it exists, else the top public facts by `max(importance, strength)`
- my `VoiceProfile` (style + 3 exemplars)
- the agenda topics (§5)

**Prompt:** `prompts/matchBrief.js` (tier mid, reasoning off). Output (zod):
```json
{ "summary": "3 lines on who this person seems to be, from their profile only",
  "openers": [ { "text": "...", "hook": "which profile prompt it reacts to", "factIds": ["F3"] } ],
  "watchouts": ["..."] }
```
- 3 openers.
- Each reacts to something specific in **their** profile and is written in **my** voice, at most 2 sentences.
- An opener may mention something about me only through a listed fact id, validated in code, as in plan 08's grounding.
- Openers never invent anecdotes about me, and never mention dealbreakers or scores.
- The LLM may notice a shared interest by reading their profile text next to my facts. That's allowed, because a human would do the same. **No code compares the two users' facts or vectors.**

## 5. Agenda (from my own graph only)

These are the dimensions **I** care about that the chat should uncover:
- every B fact with `isDealbreaker`: priority 1.0, flagged `dealbreaker: true`
- the other B facts: priority = `importance`
- my top 5 `likes` by `strength`: priority = `0.5 × strength`
- trust `clarify` topics: priority 0.6

Each item is `{ id, topic, why, priority, dealbreaker?, status: 'open' }`, top 8 by priority.
- Topics are neutral phrases ("kids someday", "drinking habits").
- Private facts never become topics. `if_asked` values (e.g. religion) appear only when the user made them a dealbreaker.
- The agenda is guidance for the engine (plan 08) and the judge (plan 09). Neither the agent nor the judge treats a topic as "known" without a quote from the transcript.

Save `match.brief[viewerId] = { summary, openers, watchouts, agenda }`.

## 6. Conversation document (`models/Conversation.js`)

```js
Conversation {
  matchId, round /*1, or 2 for a follow-up*/, seed /*random int, stored for replay*/,
  status: 'active'|'ended', endedBy: 'interest'|'max_turns'|'natural'|'dealbreaker_hint'|'take_over'|null,
  agentState: { [userId]: { interest, lowInterestTurns, turn, toldStoryIds, topicsTouched,
                            temperature /*sampled from TEMP_RANGE with the seed*/, model } },
  startedAt, endedAt, archiveAt
}
```
- Index `{ matchId: 1, round: 1 }` unique.
- `Message` gets `conversationId` (indexed with `createdAt`).
- Then `setStatus('agent_chatting')` and enqueue the first agent turn (plan 08 decides who opens).

## Acceptance checks

- [ ] A pair whose answers changed after discover so that they fail the gate → `closed` (reason `gate`, no detail shown); `usage` has no trust, brief or agent calls for that match.
- [ ] A pair that passes → trust → brief → a `Conversation` with a seed and two sampled temperatures → `agent_chatting`.
- [ ] `node scripts/brief.js <viewerEmail> <subjectEmail>` prints the brief: every opener reacts to their profile, every self-claim cites a valid fact id, and the agenda lists my dealbreaker topics first with no private text.
- [ ] After the brief: `KgFact.countDocuments({ matchId, observerId: viewer })` is 0, and grep finds no `cosine(` between two users' data in `services/brief`.
- [ ] DB spy: during the brief, the only reads about the other user are `Profile` with the public projection.
- [ ] Agents, judges and wind-downs read the other person's name from `match.perUser[].name` (grep: no `Profile.findOne({ userId: other…` outside trust, brief and `matches.js`).
- [ ] App end to end after wipe + re-seed (the v1 engine still chats from the new brief).
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-07): gate re-check, profile-only brief, own-graph agenda, conversation doc`
