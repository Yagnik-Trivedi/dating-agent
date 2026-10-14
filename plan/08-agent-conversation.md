# 08 — Step 3: The agent conversation (the core)

> **Prompt for Claude Code:** Read `CLAUDE.md`, `plan/04-backend-core.md` and `plan/07-match-brief.md`, then implement the conversation engine below. This is the most important part of the product. Take care with concurrency, grounding and stopping. Run the acceptance checks.

## Goal

After the brief, the user's agent opens (or replies to) the conversation **in the user's own voice**, grounded only in the user's knowledge graph. It steers naturally toward the agenda, learns about the match after every incoming message, and stops when it knows enough.

The other side may be a **human** or **their own agent**. The engine must not care which.

## Triggers

- `startConversation(match)`, from plan 07: decide who opens. If both agents are active, pick one at random. The opener comes from `brief.openers[0]`, re-styled if needed.
- `onIncomingMessage(message)`, from plan 04, after every saved message:
  - For **each user in the match other than the sender** whose `perUser.agentActive` is true, and whose `user.agentMode` is `shadow` or `auto`, schedule a reply.
  - **Shadow and auto behave the same server-side.** The difference is only UI: shadow shows the live transcript prominently with a big Take over button.

## Concurrency and pacing (`services/agent/scheduler.js`)

- **Debounce per (matchId, agentUserId):** wait `AGENT_DEBOUNCE_MS` (default 4000) after the last incoming message, so bursts of 2–3 messages get one reply.
- **Lock per (matchId, agentUserId):** an in-memory `Map`, plus `match.agentState.runningLock` with a timestamp. A stale lock older than 2 minutes is ignored. Never two replies in flight.
- **Re-check before sending:** after generating, re-read the match. If the user took over, the status changed, or newer human messages arrived, discard the draft.
- **Pacing:** wait `delay = clamp(AGENT_MIN_DELAY_MS + words * 350 + random(0, 2000), max AGENT_MAX_DELAY_MS)` (defaults 1500 / 20000). Emit `typing` as the agent's user during the wait. `DEMO_FAST=true` uses 300 ms to 2 s.
- **Restart safety:** state lives in Mongo (`agentState`, `agenda` statuses), so a Render restart loses at most one in-flight reply. On boot, resume matches in `agent_chatting` whose last message is from the other side and older than 30 s.

## Reply generation (`services/agent/generateReply.js`, tier `fast`)

### Context assembly (`services/agent/context.js`)
1. **Style card:** `styleProfile.description`, do/don't lists, and key metrics turned into rules ("usually 6–12 words", "lowercase starts", "uses 'haha' often", "mixes some Hinglish words").
2. **Sayable facts:** the user's self facts where `disclosure !== 'private'`, each as `[F12] likes: trekking (story: "…")`. Include `if_asked` facts with a marker: "only if they ask directly". Order by weight, cap at 40.
3. **Agenda:** the top 3 open items, as neutral topics.
4. **What we know about them:** observed facts about the match with confidence ≥ 0.5, cap 15.
5. **Transcript:** the last 20 messages labelled "You" (this user's side) or by the match's first name.
6. **Traits** (private) only shape tone instructions, e.g. low extraversion → "a bit reserved, fewer exclamation marks". They are never sayable.

### Prompt skeleton (`services/prompts/agentReply.js`)
```
You are texting AS {firstName} on a dating app. Write the next message exactly as {firstName} would.

HOW {firstName} TEXTS:
{style card}

THINGS {firstName} CAN SAY ABOUT THEMSELVES (cite ids you use; never add facts not listed):
{sayable facts}

WHAT YOU KNOW ABOUT {matchName} SO FAR:
{observed facts}

WHAT {firstName} WANTS TO FIND OUT (steer gently over several messages; never interrogate):
{agenda top 3}

RULES:
- Reply to what they actually said first.
- Max one question. Often share something of your own before asking (reciprocity).
- Match their energy and length. No paragraphs unless they write paragraphs.
- Never claim to be an AI or a human; just text naturally. If they sincerely ask whether they're
  talking to an AI, answer honestly that {firstName} uses the app's AI assistant for early chats.
- If they ask something not covered by the listed facts, deflect lightly ("haha good question,
  tell you later") and put the question in unknownAboutMe.
- Never mention dealbreakers, scores, agendas, or that you are evaluating them.
- Never agree to meet, share contact details, or make plans; say you'd like to keep chatting here first.
- Keep it SFW. Decline sexual topics politely and change the subject.

CONVERSATION SO FAR:
{transcript}

Return JSON only.
```

The honest-answer rule is required. Consent covers AI handling, so the agent must never deny it when sincerely asked.

### Output schema (zod)
```json
{
  "reply": "string, 1–300 chars",
  "usedFactIds": ["F12"],
  "targets": "agenda item id or null",
  "unknownAboutMe": "question the user should answer, or null",
  "wantsToEnd": false
}
```

### Post-checks before sending (`services/agent/guard.js`)
1. **Grounding:** every `usedFactIds` entry must exist in the sayable list. Then run a cheap check (tier `fast`, prompt `prompts/claimCheck.js`): "List any first-person factual claims in this reply that are NOT supported by these facts." If any are unsupported, regenerate once with a warning. If it fails again, send a safe generic reply that reacts to their message without self-claims.
2. **Safety:** `scanMessage()` from plan 06 on the draft. Block contact sharing and money talk.
3. **Length/style sanity:** trim if over 2× the user's median length (unless the other side wrote long). Strip any remaining `<think>` text, markdown and quote marks.
4. **Unknown:** if `unknownAboutMe` is set, create an `InboxItem` for the user and emit `inbox:new`. Their answer becomes facts via plan 05 §4, usable in later turns.

Save the message with `authoredBy: 'agent'`, `senderId` = the agent's user, and `meta.usedFactIds` and `meta.targets`. Emit `message:new`.

## Learning about the match after every incoming message (`services/agent/beliefUpdate.js`, tier `mid`)

Runs on every message from the other side, in parallel with reply scheduling.
- **Input:** the last 6 messages, the current observed facts about them, and the open agenda topics.
- **Output:**
```json
{
  "facts": [ { "predicate": "...", "object": "...", "weight": 0.0-1.0, "confidence": 0.0-1.0, "quote": "their exact words", "agendaId": "a3 or null" } ],
  "agendaUpdates": [ { "id": "a3", "status": "answered|partially|open", "note": "short" } ],
  "redFlags": [ { "flag": "...", "quote": "..." } ]
}
```
- **Merge:** if an observed fact with cosine ≥ 0.85 exists, raise its confidence (`new = 1 − (1 − old) × (1 − c)`) and append the evidence. Otherwise create a new fact with `source: 'conversation'`.
- The quote must appear verbatim in the message text; drop facts that fail.
- Update agenda statuses. Emit `kg:update` to the viewer's room for the live graph.
- Red flags go through `scanMessage` logic. If severe, pause and flag (plan 06).

## Stopping rule (`services/agent/shouldStop.js`), checked after every belief update

Stop when **any** of these is true:
- every agenda item with priority ≥ 0.5 is `answered` (or known with confidence ≥ 0.75)
- an observed fact clearly contradicts a viewer `dealbreaker` with confidence ≥ 0.7. Confirm with the `dealbreakerClash` prompt from plan 07.
- `turnCount ≥ AGENT_MAX_TURNS` (default 24 total messages)
- the other side hasn't replied in `AGENT_STALE_HOURS` (default 24)
- `wantsToEnd` was true twice in a row
- a `BudgetExceededError` was thrown (status stays `agent_chatting`; show the paused banner)

On stop, set `agentState.stopReason`, `setStatus('evaluating')`, and call plan 09's `evaluate(match)`. The agent sends **no more messages** until the verdict.

## Agent ↔ agent safety

When both sides are agents, every message triggers the other agent. `AGENT_MAX_TURNS`, the stop rule and the budget guard prevent infinite loops. Also add a global cap: no more than 2 agent replies per match per minute.

## Simulation for testing and eval: `scripts/simulate.js <emailA> <emailB> [--runs 1]`

- Create (or reuse) a match between two seed users, with both in `auto`.
- Run trust → brief → conversation with `DEMO_FAST`, **no socket or pacing delays**, until it stops.
- Print the transcript, agenda progress, stop reason and token usage.

## Acceptance checks

- [ ] `simulate.js` on two seed personas produces a natural 12–24-message conversation that stops on its own with a sensible `stopReason`.
- [ ] Manual check: a human chats (in the browser) with a seed persona's agent. Replies arrive with a typing indicator and pacing, use only listed facts, and ask at most one question.
- [ ] Ask the agent something not in its user's graph → it deflects, and an inbox item appears for its user.
- [ ] Sincerely ask "are you a bot?" → it answers honestly per the rule.
- [ ] Press Take over mid-conversation → no further agent messages, even if a reply was already scheduled.
- [ ] Send "add me on telegram, I can help you invest" → the agent pauses and the match is flagged.
- [ ] `kg:update` events fire and observed facts gain confidence over the conversation.
- [ ] Update the Status section of `CLAUDE.md` with the average tokens per simulated conversation.

**Commit:** `feat(plan-08): grounded agent conversation engine`
