# 08 — Step 3: The agent conversation (persona engine + per-turn pipeline)

> **Prompt for Claude Code:** Read `CLAUDE.md` (section "Knowledge graph — final design"), `plan/15-knowledge-graph-final.md` §4 stage 5 and §7, and `plan/kg-upgrade-reference.md` Phases 6–7.1 for detail (plan 15 and this file win on conflicts). The engine replaces the v1 engine (`agent/beliefUpdate.js`, `prompts/claimCheck.js`, `agent/shouldStop.js`, the Hinglish guard). Implement it, run the acceptance checks.

## Goal

My agent texts **as me**:
- grounded in my graph
- in my real voice and language mix
- opinionated where I am (no sycophancy)
- variable from chat to chat (seeded randomness)

It learns about the other person **only from the transcript**, as quote-backed notes and chat moments.

The other side may be **their agent or the human themselves** (shadow mode, Take over). The pipeline is identical either way: a human's messages are just transcript lines.

## Hard rules

- **Information boundary.** My agent's inputs are (a) my own graph, voice and agenda and (b) the transcript. Never the other user's `KgFact`, `KgEdge`, `VoiceProfile`, `VoiceSample`, `Profile.gate` or answers. Their name comes from `match.perUser[].name`.
- **Cost per incoming message:** normally 2 LLM chat calls (perceive+observe; generate). Add a stance check only when `mustDisagree`, and at most **1** regeneration (`MAX_REGENERATIONS`). Style, grounding and leak checks run in code. Embedding calls are batched; the RPM limiter and spending cap apply.
- **Private facts** never reach the generate prompt as text. Only `privateGuidance` (behaviour rules) does.
- **Kept from v1 (all measured and needed):**
  - **Take over:** one tap stops the agent and discards the reply being written.
  - **Atomic Mongo lock** per (match, agent user).
  - **Deterministic honest answer** to a sincere "are you a bot?".
  - **No meeting or contact sharing; SFW only.**
  - **`scanMessage`** (plan 06) on every incoming message and every outgoing draft; severe → flag the match.
  - **Pacing:** typing indicator, then a delay ∝ words; `DEMO_FAST` / `NO_PACING` for scripts.

## 1. Persona engine: `services/persona/`

### 1.1 Per-conversation cache (`cache.js`)
- A tiny in-process LRU (a `Map`; no dependency) of `{ facts (no vectors), conceptVectors, privateFacts (+ vectors for leak checks), voiceProfile, samples (+ incoming vectors) }`.
- Keyed by `userId:graphVersion`, so any self-graph or voice write invalidates it.
- Max ~200 entries.

### 1.2 `contextBuilder.js`
- **`selectFacts({ userId, incoming, rng, k = SELECT_K })`**
  - Candidates: `public` always. `if_asked` only when the incoming message is a question about that topic: cosine ≥ `T_ASKED` **and** question detection (`?`, or an interrogative word list in English + common romanised Hindi/Gujarati: kya, kaise, kab, kyun, shu, kem, kyare). `private` never.
  - Score: `0.5·relevance + 0.3·max(importance, strength) + 0.2·recency`, sampled with softmax(score / `TOPIC_TEMP`) using `rng`. Dedupe by concept.
  - Returns facts + up to 2 untold story candidates.
- **`privateGuidance({ userId })`**: private facts + traits → non-verbatim behaviour rules ("avoid topic X; deflect lightly if asked"). Never raw text.
- **`traitRules.js`** (deterministic). Values 0.4–0.7 give no rule.

  | Trait | < 0.4 | > 0.7 |
  |---|---|---|
  | Extraversion | short replies, few `!`, rarely asks back | energetic, more `!`, asks back often |
  | Agreeableness | direct, comfortable disagreeing | warm, softens disagreement, but still disagrees on strong opinions |
  | Neuroticism | (n/a) | more reactive to low-effort replies; avoid sarcasm |
  | Openness | concrete topics | curious, playful hypotheticals |
  | Conscientiousness | casual about plans | proposes concrete plans/times |

- **`selectExemplars({ userId, incoming, rng, k = EXEMPLARS_K })`**: my `VoiceSample`s ranked by cosine(incoming, sample.incoming) with MMR diversity (mood, language). Returned as few-shot `{ incoming → reply }` pairs. Each side always gets **its own** exemplars.

### 1.3 Checks: `checks.js`
- **`styleCheck(draft, actPlan, voice)`** (code): word count within ±40% of `targetWords`; emoji, ask-back and laugh obey the plan; lowercase start and ending punctuation match my majority; the reply language matches `actPlan.language` (code heuristics + script detection); nothing from `neverSay`.
- **`groundingCheck(draft, claims, facts)`** (code, **no LLM**):
  - `generate` must list every first-person claim with the fact ids it relies on, and a stance (`positive`/`negative`/`neutral`).
  - A claim citing a missing id, or whose stance contradicts the cited fact's polarity, fails.
  - A first-person sentence ("i …", "my …", "i'm …", plus romanised equivalents like "mera", "mujhe") not covered by any listed claim fails as unsupported.
  - Unsupported claims about likes are rewritten as honest uncertainty ("never really tried it") plus an "ask my human" inbox question, rather than regenerating.
- **`stanceCheck(draft, mustDisagree)`** (LLM, tier fast, reasoning off, **only when `mustDisagree`**): verifies the draft doesn't agree or concede.
- **`leakCheck(draft, privateFacts)`** (code, on **every** outgoing agent message): alias and keyword hits against private facts' labels/aliases, plus sentence-embedding cosine ≥ `T_LEAK` against private facts' (or their concepts') vectors. Sentences are embedded in one batched call.
- **Retry policy:** any failure → **one** regeneration with the reasons. Still failing → send the best draft minus every failing sentence. If nothing is left, send a neutral reaction to their message with no self-claims. All scores are stored on `message.checks`.

## 2. Per-turn pipeline (my side S, user U, incoming message m)

Runs as the `agentTurn` job (plan 17), dedupeKey `turn:<matchId>:<userId>`, `runAt = now + AGENT_DEBOUNCE_MS`. Re-enqueueing moves `runAt`, so bursts get one reply. Take over calls `cancel()`.

### 2.1 `perceiveObserve(m)`: ONE LLM call (tier mid, reasoning off). Zod:
```js
{ concepts: [{ text, type, polarity }], claims: [{ text, conceptText?, attribute?, value?, polarity }],
  isQuestion, aboutMe, lowEffort, humor, warmth, acknowledgesDifference,
  dealbreakerHint: attribute | null,
  language: { languages: [String], script, codeSwitch },
  notes: [{ predicate, object, attribute?, value?, polarity, strength?, quote }],
  agendaHits: [{ id, quote }] }
```
- Resolve concepts and claims through `resolveConcept` (dictionary only). Look each up in **my own** graph to get `ownReaction = { strength, polarity, value } | null`.
- **Notes:** `KgFact` with `observerId: U`, `subjectId: other`, `matchId`, `conversationId`, `source: 'agent_observed'`, confidence 0.6. The quote must be verbatim in `m` (`isVerbatim`), otherwise dropped. Merge by `factKey` within (observer, subject); repeats raise confidence and append evidence.
- **`ChatEvent`** (`models/ChatEvent.js`: `{ conversationId, observerId, turn, messageId, quote, type, conceptId, weight, createdAt, archiveAt }`, index `{conversationId, observerId}`):

  | Event | When |
  |---|---|
  | `shared_interest` | `ownReaction.polarity` and the claim's polarity are both +1, and my strength ≥ 0.5 |
  | `interest_clash` | the polarities are opposite |
  | `laugh` | humor was perceived and my `laughForms` are non-empty |
  | `disagreement` | a claim conflicts with my fact of strength ≥ `STANCE_BEND` |
  | `disagreement_resolved` | `acknowledgesDifference` within `RESOLVE_WINDOW` turns, with no concession by either side |
  | `low_effort` / `boredom` | from `lowEffort` and the interest meter |
  | `question_dodged` | I asked a question and the reply ignored it |
  | `dealbreaker_hint` | `dealbreakerHint` is one of my dealbreaker attributes and the stated value ∉ my `accepts` |

- **Live shared-interest discovery happens only here:** the transcript against **my** graph, comparing polarity and values explicitly, never cosine alone.
- **Agenda:** `agendaHits` with verbatim quotes mark my agenda items `answered`.
- Emit `notes:update` (notes + events + agenda) to me only. It replaces `kg:update`.

### 2.2 `updateInterest(state, perception)` (deterministic)
```
interest += K_LIKE·s (each concept I like) − K_DISLIKE·s (each I dislike) + K_QUESTION (aboutMe question)
          + K_HUMOR (humor ∧ I laugh easily) − K_LOW_EFFORT (lowEffort) − K_REPEAT (topic already touched)
interest  = clamp(interest + K_DECAY·(baseline − interest), 0, 1);  baseline = 0.4 + 0.2·extraversion
```
`lowInterestTurns` counts consecutive turns below `LOW_INTEREST`.

### 2.3 `planAct(state, voice, perception, rng)` (deterministic sampling; stored as `message.actPlan`)

| Field | How |
|---|---|
| `targetWords` | sample from `voice.wordCounts` × `(0.5 + interest)` |
| `burst` | Bernoulli(`burstiness`) → 2–3 messages |
| `askBack` | Bernoulli(`questionBackRate × (0.5 + interest)`); never more than one question |
| `emoji` | Bernoulli(`min(1, emojiPerMessage)`), choice from `topEmojis` |
| `laugh` | humor ∧ Bernoulli(laugh rate), form from `laughForms` |
| `reactions` | per recognised concept: `excited` (strength ≥ 0.75), `positive` (≥ 0.5), `lukewarm` (> 0), `dislike` (polarity −1), `unknown` (honest "never tried / not my thing", or curious, per traits) |
| `mustDisagree` | conflicting claim vs my fact of strength ≥ `STANCE_HOLD`; `STANCE_BEND..STANCE_HOLD` → Bernoulli(0.5); below → may concede |
| `topic` | with probability `TOPIC_SHIFT` (higher when interest is low): the highest-priority open agenda item, else a sampled fact from `selectFacts` not in `topicsTouched`; with `STORY_RATE`: an untold story |
| `language` | the reply language (below) |
| `end` | `lowInterestTurns ≥ END_AFTER_LOW_TURNS`, `turn ≥ MAX_TURNS`, a natural close, or a confirmed `dealbreaker_hint`; written in my `closingStyle` |

**Reply language** (replaces the v1 Hinglish guard):
- If m's language differs from my dominant one: mirror it with probability `mirrorsLanguage`, **but only into languages in my `language.mix`**.
- Otherwise sample from `mix`.
- Code-switch with probability `codeSwitchRate`, boosted when the mood matches a `switchTrigger` (e.g. joking).
- Never reply in a language I don't use.

### 2.4 `generate(plan)` (tier mid by default, or `AGENT_MODEL_BY_SIDE[side]`; temperature = `agentState[U].temperature`)

**System prompt** (`prompts/agentReply.js`):
- ≤ 10 selected facts with ids
- 3–5 own exemplars
- trait rules + private guidance
- the act plan as hard constraints
- the last 20 transcript lines

**Anti-sycophancy rules:**
- You are <name>, not an assistant.
- Don't agree, compliment or show enthusiasm unless <name> genuinely would, given the facts.
- Being brief, bored or in disagreement is fine.
- Never claim anything not in your facts; say you're unsure instead.
- No meta-talk.

Output (zod):
```js
{ messages: [String] /*1..3*/, claims: [{ text, factIds: [String], stance }], unknownAboutMe: String|null, end: Boolean }
```
`unknownAboutMe` → `InboxItem` for my human + `inbox:new`.

**Opening:** the first speaker is picked with the conversation `rng`. The opener comes from `brief.openers` (plan 07), chosen by `rng` and re-styled to my greeting exemplars.

### 2.5 Checks → send → persist
- Run §1.3. The re-check before sending (Take over, status change, a newer human message) discards the draft.
- Pacing; then save `Message` (`authoredBy: 'agent'`, `conversationId`, `actPlan`, `checks`, `meta.usedFactIds`), update `agentState`, emit `message:new`.
- **On `end`:** send the closing line, set `Conversation.endedBy`/`endedAt`, status `evaluating`, and enqueue one `judge` job per side (plan 09).

## 3. Learning from my own side (plan 15 stage 7)
- **"I wouldn't say that"** (`POST /api/messages/:id/wouldnt-say { fix? }`, only on **my own** agent's messages):
  - With a `fix`: save `VoiceSample(edited_draft)` and run `prompts/voiceCorrection.js` (zod `{ rule, kind: 'style'|'never_say'|'fact' }`).
  - `style` / `never_say` → `VoiceProfile.corrections` / `neverSay`.
  - `fact` → a `userEdited` fact.
  - `$inc graphVersion`.
- **After handoff,** if `settings.learnFromChats` (default on): my own human messages in that chat → `VoiceSample(own_chat)`, language-tagged in batches. This triggers `rebuildVoice` every `STYLE_REBUILD_EVERY`.
- Prune voice samples to `MAX_VOICE_SAMPLES` (plan 17 `pruneToCap`).

## 4. Information-boundary spy test: `scripts/lib/dbSpy.js`
- Use `AsyncLocalStorage` to tag the current actor (`{ role: 'agent'|'judge'|'trust'|'brief'|'ui', userId, otherId }`).
- A Mongoose global plugin records every query's model + filter.
- The test runs a full simulated conversation + judges, then asserts:
  - no `KgFact`/`KgEdge` read with `subjectId: other` and `observerId: null`
  - no `VoiceProfile`/`VoiceSample` read for `other`
  - no `Profile` read for `other` except in `trust`, `brief` and the `ui` routes in `matches.js`

## 5. Simulation: `scripts/simulate.js <emailA> <emailB> [--runs N] [--seed S]`
Both sides on auto, `NO_PACING`. Prints the transcript with act plans, events, notes, check results, end reason and token usage. The same `--seed` with a stubbed LLM replays identically.

## Acceptance checks

- [ ] Unit tests: `traitRules`; `styleCheck`; `leakCheck` (keyword path + embedding path with stubbed vectors); `groundingCheck` (missing id, contradicting stance, uncovered first-person sentence); `selectFacts` never returns `private` and returns `if_asked` only for a matching question; the same seed gives the same selection; `updateInterest`; `planAct` (strong opinion → `mustDisagree`; low interest → shorter `targetWords`, then `end`); reply-language choice (never a language outside my mix; mirrors at the configured rate).
- [ ] **Seeded replay:** the same seed + stubbed LLM responses → an identical act-plan sequence.
- [ ] **Integration, two seeded users** (A strongly anti-smoking, high importance but not a dealbreaker; B mentions smoking): a `disagreement` or `interest_clash` event is recorded, and A's reply doesn't concede (stance check ran).
- [ ] **Human side** (`scripts/agent-check.js`, updated): a human chats with a seed persona's agent. Replies come with typing + pacing and at most one question. An unknown question → deflection + inbox item. A sincere "are you a bot?" → the honest answer. Take over → nothing more is sent, including an already-scheduled turn. "add me on telegram, I can help you invest" → flagged.
- [ ] **Per-message cost:** from `usage`, every agent message used ≤ 2 chat calls, +1 only when `mustDisagree`, +regeneration ≤ 1.
- [ ] The DB-spy boundary test passes.
- [ ] `simulate.js` on two seed personas: a natural chat that ends by itself (`interest`, `natural` or `max_turns`), in each persona's language mix. Record tokens and seconds per conversation in Status.
- [ ] App end to end after wipe + re-seed. The v1 judge still runs on the result until plan 09 lands.
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-08): persona engine + per-turn pipeline (perceive/observe, interest, act plan, checks)`
