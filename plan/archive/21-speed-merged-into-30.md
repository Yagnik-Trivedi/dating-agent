# 21 — Speed: usable in seconds, agent chat in about 3 minutes

> **Owner, 2026-10-18 (after the first deploy):** building the knowledge graph takes 15–20 min, and the agent chat takes far too long. Fix both **before** plan 22.
> **Rule:** speed must not cost quality. Re-run the plan 11 checks listed under "Acceptance" before and after.

## Why it's slow (found in the code)
**Onboarding build (`services/kg/buildUserGraph.js`)**
1. **Concept resolution runs one at a time** (`for … await resolveConcept(...)`). Every new concept text costs 1 embedding call, plus 1 mid-tier tie-break call when it's ambiguous, and each waits for the previous one. With 40–80 concepts per user, this is most of the 15 minutes.
2. **Each story costs 2 mid-tier calls in a row** (extract, then the support check), at a concurrency of only 2.
3. **Language tags, contradictions and the style description** each make another mid-tier call, even though they're small jobs for the fast tier.
4. **Long timeouts and retries:** 120 s × 3 retries per call. One stuck call stalls the whole build. Everything also shares `LLM_MAX_RPM=35`.
5. **The user waits for all of it** before they can use the app.

**Agent chat (`services/agent/scheduler.js`, `conversation/engine.js`)**
1. **`MAX_AGENT_REPLIES_PER_MINUTE = 2`** per match. Even with an instant model, a 17-message chat can't take less than about 8.5 minutes. This is the biggest cause.
2. **Typing delay** per message: 1.5 s + 350 ms per word + 0–2 s, up to 20 s. `DEMO_PACING=fast` applies only to seed and judge accounts.
3. **A 4 s debounce before every agent turn.** That debounce is meant for a human typing several messages in a row.
4. **The typing delay runs after the LLM work** instead of overlapping it.
5. **Per message, in sequence:** embed → perceive (mid) → generate (mid) → leak-check embed → (stance check) → (one regeneration).
6. **About 17 messages per chat.**

## Step 0 — measure first
- Read the `Usage` records (purpose, tier, model, latency, ok) from the deployed DB for one real onboarding build and one real agent chat.
- Write `eval/results/speed-before.md`: calls per purpose, p50/p95 latency, total wall time, retries and timeouts.
- Confirm the deployed provider and model IDs. Never print keys.
- If the numbers point somewhere other than the causes above, report it and fix what the numbers show.

## Targets
| What | Target |
|---|---|
| Onboarding submit → user can use the app | ≤ 5 s |
| Full graph ready | p50 ≤ 2 min, p95 ≤ 4 min |
| Match → first agent message | ≤ 20 s |
| Whole agent conversation | p50 ≤ 4 min, 12–14 messages |

## Part A — onboarding in two phases
- **A1. Phase 1, instant, no LLM:**
  - Build: deterministic questionnaire facts, voice metrics (`computeVoiceProfile` + the language heuristic) and the gate.
  - Commit them, then set `onboarding.status = 'done'` and `graphStatus = 'building'`. The user goes straight to Discover; likes and browsing work.
  - "This is you" shows a small chip: "Your agent is still reading your stories, about a minute."
  - An agent conversation for a new match waits until `graphStatus = 'ready'`. Normally the graph is ready before any match exists.
- **A2. Phase 2, a background job, in parallel:**
  - **Stories:** all of them in parallel (concurrency 4). Merge extraction and the support check into **one call per story** if quality holds. Quotes are still verified in code (`isVerbatim`). If quality drops, keep two calls but in parallel.
  - **Concepts:**
    1. Normalise and dedupe the texts.
    2. Exact/alias lookup first (no calls).
    3. **One batched embedding call** for the remaining texts.
    4. Resolve them in parallel.
    5. Send every ambiguous-band tie-break in **one** batched LLM call.
  - **Language tags, contradictions, style description:** move to the **fast** tier, and run them alongside the story extraction where they don't depend on it.
  - **Onboarding calls:** 45 s timeout and 1 retry. A non-essential call that fails (tags, style, contradictions) uses its code fallback and the build continues.
  - Keep the single swap transaction, so an interrupted phase 2 leaves the phase-1 graph intact.
- **A3. Real progress:** emit `onboarding:progress { step, done, total }` over the socket, so the UI shows real progress, not a spinner.

## Part B — agent chat
- **B1.** Replace the hard-coded 2/min with `AGENT_MAX_REPLIES_PER_MINUTE` (default 12). The per-conversation message cap remains the loop guard.
- **B2.** `AGENT_PACING=fast|normal` for **everyone** (default `fast`: 0.8–3 s). `DEMO_PACING` becomes an alias. Remove the debounce on agent→agent turns; keep it only after a human message.
- **B3. Overlap compute and typing.** As soon as a message is sent, start the other side's `composeTurn` while its typing indicator shows. Then wait `max(0, pace − computeTime)`.
- **B4. Cheaper per message:**
  - Try **perceive on the fast tier**; keep generate on mid. Keep fast-tier perceive only if the plan 11 metrics hold.
  - Reuse the incoming message's embedding.
  - Batch the leak-check embedding.
  - The stance check still runs only when `mustDisagree`.
- **B5. Shorter chats:** target 12–14 messages, agenda-driven. Dealbreaker topics come first (from the judge fix). Put every number in `kg/config.js`.
- **B6. Don't make people watch:**
  - After a match, show: "Your agents are talking, about 3 min. Keep browsing; we'll let you know."
  - When the chat ends, show a toast on whatever page the user is on.
  - Watching live stays available.

## Acceptance
- [ ] Write `eval/results/speed-after.md` with the same format as `speed-before.md`, and add the before/after table to `PROGRESS.md`.
- [ ] Every target in the table is met on the deployed provider (or the gap is explained with numbers).
- [ ] Quality on the 6-pair subset is no worse than before:
  - fallback rate ≤ 7%
  - unsupported claims not higher
  - style distance not higher
  - judge accuracy not lower
- [ ] `judge-check`, `agent-check` and `npm test` pass. The DB-spy boundary test still passes.
- [ ] Killing the server mid-build leaves the phase-1 graph usable, and the job resumes.
