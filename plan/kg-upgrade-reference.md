# KG upgrade: per-user graphs, pre-chat dealbreaker gate, human-like agent conversations, evaluation

> **Prompt for Claude Code:** Read `CLAUDE.md`, `plan/04-backend-core.md`, `plan/05-onboarding-knowledge-graph.md` and this file. Start with **Phase 0 (investigate)** and report back before changing anything. Then implement the phases in order. After each phase, run its acceptance checks, update the Status section of `CLAUDE.md` and commit. Stop and ask before:
> - changing how agent messages are sent or shown to users
> - running any migration that deletes or rewrites existing `KgFact` documents
> - adding a dependency

> Rename this file to the next free plan number in `plan/` (e.g. `plan/11-kg-upgrade.md`).

## Goal

Each user has a clean personal knowledge graph that their agent uses to talk **as** them. Matching works like this:

1. **Pre-chat gate.** A deterministic dealbreaker and basics check runs before any chat.
2. **Agent conversation.** The two agents talk. Each knows only its own user's graph and learns about the other person **only from the conversation**, writing quote-backed notes (observer facts and chat events).
3. **Independent judges.** A separate judge per side decides from the transcript and notes. It's a match only if both say yes.

**The core problem this plan solves:** LLM agents talking to each other become agreeable, sycophantic and predictable. The graph and the conversation engine must make chats grounded, opinionated, variable and true to each user, so the decision carries real signal.

Stay on MongoDB/Mongoose. Do **not** introduce Neo4j.

Flaw IDs (F1–F38) refer to the review doc "Knowledge Graph Review and Upgrade Guide".

## Ground rules (apply to every phase)

- **No cross-user graph comparison in the product.** Code must never read user B's graph (facts, concepts, embeddings, profile answers) on behalf of user A's agent or judge, and must never rank or score pairs by graph or answer overlap.
  - The only cross-user data path is the conversation transcript.
  - Exceptions: the pre-chat gate (dealbreakers and basics only, boolean result), and offline evaluation scripts under `scripts/eval/`.
- **Never put the raw text of a `private` fact into a prompt whose output another user will see.**
- **Never delete** `user_answer`, `userEdited` or tombstoned data during rebuilds.
- **Keep changes minimal and in the existing style:**
  - ESM
  - zod schemas for every LLM output
  - `chatJSON({ tier, reasoning, messages, schema, purpose, userId })`
  - `embed(texts, { inputType })`
  - `mapLimit` for LLM fan-out
- **No new heavy dependencies.** Small utilities are fine inline.
- **Config:** every threshold and constant lives in `services/kg/config.js` so evaluation can sweep it.
- **Randomness:** use a seeded RNG per conversation (seed stored on the conversation) so evaluation runs are reproducible.
- **Tests:** unit-test pure functions with the repo's test setup, or `node:test` if there is none.

---

## Phase 0 — Investigate (report before coding)

Find and summarise, with file paths:

1. **The agent-to-agent conversation loop.** Where the "match room" or agent chat runs, how turns are generated, who speaks first, how a chat ends, and which model(s) and temperature are used.
2. **How observer facts (`observerId`) are written today**, and how the match decision is made (by whom, with what input).
3. **Where the "talk as the user" prompt is built.** Grep for `styleProfile`, `KgFact.find`, `disclosure`, `observerId`, `extractStoryFacts`, `topMatches`.
4. **Disclosure enforcement.** Whether `private` or `if_asked` facts reach any speaking prompt, and whether enforcement is in code or only in prompt instructions.
5. **Draft approval.** Whether users approve or edit agent messages anywhere.
6. **Pair selection.** How pairs are chosen today, and whether any similarity or overlap ranking exists (`similarity.js`, `topMatches`).
7. **`User` profile basics.** Whether it stores job/studies, city, languages, age, gender preference or age range.
8. **Replica set.** Whether MongoDB runs as a replica set (needed for transactions).
9. **Existing schemas.** The `KgFact` schema and indexes, plus `prompts/extractStoryFacts.js` and `prompts/describeStyle.js`.

List anything that conflicts with this plan and propose the smallest adjustment.

---

## Phase 1 — Bug fixes (F26, F28, F30–F35)

- **`services/kg/graph.js`:**
  - The center node is `{ id: 'me', label: user.name, type: 'self', center: true }`.
  - Add `.select('-embedding')`.
- **`OnboardingReview.jsx`:**
  - Filter with `!n.center`.
  - Replace `Object.groupBy` with a `reduce`.
- **`lib/kg.js` `factsToGraph`:** keep `center: true`, and make every consumer key off `center`, not the id.
- **Traits (F26):**
  - Hidden or read-only in the review list.
  - `PATCH` and `DELETE /api/kg/facts/:id` reject `predicate: 'trait'`.
  - Disclosure stays `private`.
- **`styleProfile.js` Hinglish list (F34):**
  - Remove `scene`.
  - Count `na`, `ye`, `hum` and `tum` only when the message has at least one other Hinglish token.
- **Safe rebuild (F28):**
  - Use a transaction if the database is a replica set.
  - Otherwise insert the new docs first (tagged `buildId`), then delete old non-protected docs whose `buildId` differs.

**Acceptance**
- The user renders as the large center node.
- There is no `embedding` field in the `/api/kg/me` payload.
- Trait PATCH/DELETE returns 4xx.
- An interrupted rebuild leaves the previous graph intact.

---

## Phase 2 — Data model (F2, F4–F8, F11, F25, F27, F29)

### `KgFact` (extend; existing fields keep working)

```js
{
  subjectId, observerId, matchId,               // existing. observerId=null: self fact. observerId=A, subjectId=B: A's agent's note about B
  conversationId: ObjectId,                     // for observer facts
  predicate,                                    // likes|dislikes|values|goal|lifestyle|trait|story|background|opinion|reflection
  object,                                       // display label (keep)
  attribute: String, value: String,             // section-B structured facts, e.g. smoking / never
  accepts: [String],                            // section B: partner values the user accepts
  polarity: { type: Number, enum: [1, -1], default: 1 },
  conceptId: { type: ObjectId, ref: 'Concept' },
  strength: Number,                             // 0..1 how much they like / how strongly they hold it
  importance: Number,                           // 0..1 how much it matters in a partner (section B)
  isDealbreaker: { type: Boolean, default: false },
  confidence: Number,
  source: { type: String, enum: ['questionnaire_choice', 'questionnaire_story', 'user_answer', 'agent_observed', 'reflection', 'style_import'] },
  disclosure: { type: String, enum: ['public', 'if_asked', 'private'] },
  sensitivity: { topic: String, sensitive: Boolean },
  userEdited: { type: Boolean, default: false },
  evidence: [{ quote: String, sourceRef: { kind: String, id: String }, at: Date }],  // kind: 'answer' | 'message' | 'inbox'
  firstSeen: Date, lastConfirmed: Date, validUntil: Date,
  buildId: String,
  embedding: [Number], embeddingModel: String,
}
```

- Keep `weight` as a virtual: `importance ?? strength ?? 0.5`.
- Indexes:
  - `{ subjectId: 1, observerId: 1, predicate: 1, conceptId: 1 }`
  - `{ subjectId: 1, observerId: 1, attribute: 1 }`
  - `{ observerId: 1, conversationId: 1 }`

**Confidence by origin (F8):**

| Origin | Confidence |
|---|---|
| Picked from a list | 1.0 |
| Stated in text, support check yes | 0.9 |
| LLM-inferred, or support check unclear | 0.6 |
| `agent_observed` | 0.6 with a verbatim quote, else dropped |
| `reflection` | 0.6 |

Apply decay at read time with `DECAY_HALF_LIFE_DAYS`.

### New collections

```js
// Concept: a shared vocabulary, NOT a cross-user link. Used to normalise each user's own facts
// and to recognise topics mentioned in a chat.
Concept { name, label, type: enum['activity','food','place','value','lifestyle','topic','media','other'],
          aliases: [String], embedding: [Number], embeddingModel, verified: Boolean, createdBy: enum['seed','auto'] }
// unique (type, name); index aliases

// KgEdge: links between facts inside ONE user's graph (or inside one observer's notes)
KgEdge { subjectId, observerId, from: { kind: enum['fact','concept'], id }, to: { kind, id },
         type: enum['SUPPORTS','CONTRADICTS','DERIVED_FROM'], confidence, resolved: Boolean, createdAt }

// KgTombstone (F27): deleted facts never return on rebuild
KgTombstone { subjectId, key, createdAt }   // key = factKey(): `${predicate}|${conceptId || attribute || normalise(object)}`

// VoiceSample (F16–F19): the user's own writing
VoiceSample { userId, incoming, text, source: enum['onboarding','inbox','approved_draft','edited_draft','import'], mood, embedding, createdAt }

// ChatEvent: notable moments recorded by ONE side's agent during a chat
ChatEvent { conversationId, observerId, turn, messageId, quote,
            type: enum['shared_interest','interest_clash','laugh','disagreement','disagreement_resolved',
                       'low_effort','boredom','warmth','question_dodged','dealbreaker_hint'],
            conceptId, weight, createdAt }

// MatchDecision: one per side per conversation
MatchDecision { conversationId, userId, otherUserId, decision: enum['yes','no','unsure'], confidence,
                positives: [{ quote, why, messageId }], frictions: [{ quote, why, severity, messageId }],
                dealbreakerRisk: [{ attribute, quote }], summaryForUser, judgeModel, createdAt }
```

**Conversation state.** Extend the existing conversation/match document found in Phase 0:
- `seed`
- `status`
- `endedBy` (`interest` | `max_turns` | `natural` | `dealbreaker_hint`)
- `agentState: { [userId]: { interest, lowInterestTurns, turn, toldStoryIds, topicsTouched, temperature, model } }`
- per message: `actPlan` and `checks` (for replay and evaluation)

### Migration `scripts/migrate-kg-v2.js` (dry-run by default; `--apply` writes; idempotent)

- **`source`:**
  - `questionnaire` facts with evidence quotes or `predicate: 'story'` become `questionnaire_story`.
  - Other `questionnaire` facts become `questionnaire_choice`.
  - `inferred` becomes `reflection`.
  - Existing observer facts become `agent_observed`.
- **Section B:**
  - `attribute` and `value` come from `value` and `TOPICS`.
  - `importance` comes from `weight`.
  - Fold each `dealbreaker` fact into `isDealbreaker: true`.
  - Default `accepts` to all options.
- **Section D:** `strength` from `weight`.
- **Stories:** `strength` from the LLM weight.
- **Concepts:** resolve every self fact to a `conceptId` (Phase 3), then re-embed.
- **Print a summary.**

**Acceptance**
- The dry-run prints a plan.
- `--apply` twice is a no-op the second time.
- The existing UI still renders.

---

## Phase 3 — Concept resolution: `services/kg/canonicalize.js` (F1–F4)

`resolveConcept({ text, type, userId })` returns `{ conceptId, decision }`:

1. **`normalise`:** lowercase, trim, collapse whitespace, strip punctuation, naive singularisation with an exceptions list.
2. **Exact match** on `name` or `aliases` within `type` (across all types if `type` is unknown).
3. **Embedding match.** Embed with `inputType: 'query'` and cosine against same-type concepts (in-memory cache keyed by `embeddingModel`, refreshed on insert).
   - `>= T_HIGH`: match, and add an alias.
   - `T_LOW..T_HIGH`: LLM tie-break with `prompts/sameConcept.js` (tier `mid`, `reasoning: false`, zod `{ same: boolean, conceptId?: string }`, top 3 candidates).
   - Otherwise: create a concept with `{ verified: false, createdBy: 'auto' }`.
4. **Log every decision** to `eval/logs/concept-decisions.jsonl`.

This function only maps text to a dictionary entry. It must never return or read any user's facts.

**Seed `scripts/seed-concepts.js`:**
- The 24 interest suggestions, with an alias map, e.g. `trekking: [hiking, treks, trek, mountain trips]`, `films: [movies, cinema]`, `gaming: [video games]`, `stand-up comedy: [standup, comedy shows]`, `fitness: [gym, working out]`.
- Every section-B option as a `lifestyle` or `value` concept.

**Story extraction prompt update** (`prompts/extractStoryFacts.js` and the zod schema in `extractFacts.js`):

```json
{ "predicate": "likes|dislikes|values|goal|background|opinion",
  "conceptText": "short noun phrase", "conceptType": "activity|food|place|value|lifestyle|topic|media|other",
  "polarity": 1, "strength": 0.0, "isCurrent": false,
  "sensitiveTopic": "none|health|family_conflict|past_relationships|money|religion|politics|sexuality",
  "quote": "exact words from the answer" }
```

For `opinion` facts, `strength` = how firmly they hold it. This drives stance-holding in Phase 7.

**Acceptance**
- Unit tests for `normalise` and for the resolution order (stubbed embed and LLM).
- "hiking", "treks" and "trekking" resolve to one concept.
- The decision log is written.

---

## Phase 4 — Build pipeline v2: `services/kg/buildUserGraph.js` (F4–F12, F25, F27, F29)

1. **Deterministic facts:**
   - **B:** `{ predicate, attribute, value, accepts, importance, isDealbreaker, conceptId, source: 'questionnaire_choice', confidence: 1 }`. No separate `dealbreaker` facts.
   - **D:** `likes` + `conceptId` + `strength`.
   - **A:** `trait` facts (private).
2. **Story facts:**
   - Extract, then run the verbatim check.
   - Then run the **support check** (F9): `prompts/factSupported.js`, batched per answer, zod `{ supported: 'yes' | 'no' | 'unclear' }`. `no` drops the fact; `unclear` gives 0.6; `yes` gives 0.9.
   - Keep the story summary fact.
   - Create `SUPPORTS` edges from the story to each fact extracted from it.
3. **Sensitivity (F25):** a sensitive topic gives `disclosure: 'if_asked'`.
4. **Canonicalise** every concept-bearing fact.
5. **Merge (F4)** by `factKey()`:
   - `strength`: max
   - `evidence`: union
   - `firstSeen`: earliest
   - `confidence` and `source`: from the best member
   - If polarities disagree, keep both facts and add a `CONTRADICTS` edge.
6. **Contradictions (F10):**
   - Same concept with opposite polarity.
   - Same attribute with a different value.
   - Plus one batched LLM call (`prompts/findContradictions.js`) comparing B lifestyle answers (smoking, drinking, diet) with story facts.
7. **Re-submit merge (F27):**
   - Skip tombstoned keys.
   - Keep `userEdited` facts, appending evidence only.
   - Update the rest in place, preserving user-changed disclosure.
   - Insert new facts.
   - Remove stale `questionnaire_*` facts unless `userEdited`.
   - Never touch `user_answer`, `agent_observed` or `reflection`.
8. **Embeddings (F6):** `factText` = the concept label for concept facts, else `object`. Polarity and values are never embedded; consumers compare them explicitly.
9. **Style profile v2** (Phase 6.4), and `VoiceSample`s from section E (`incoming` = the prompt message).

**Questionnaire changes** (`questions.js`, `Onboarding.jsx`, zod validation on submit):
- **Section B:**
  - Importance has **no default** (F7).
  - After importance, add "In a partner I'd accept" as a multi-select defaulting to all options. When importance is `dealbreaker`, at least one option must be deselected.
  - The shape becomes `{ answer, importance, accepts }`.
- **Section C:**
  - `MIN_STORIES = 4`, with an example placeholder per prompt.
  - Add one prompt that elicits an opinion with strength: "Something you'll argue about with friends, and how strongly you feel about it".
- **Section E:** keep `e1–e8` and add `e9–e15`, covering:
  - excited news
  - disagreeing politely
  - making a plan
  - cancelling and apologising
  - light teasing
  - ending a conversation
  - a reply to a long message
- **Identity (F22), only if Phase 0 found no such fields:** optional job/studies, city and languages, stored as `background` facts.

**Acceptance**
- `scripts/onboard-sample.js` produces:
  - no duplicate keys
  - no separate dealbreaker facts
  - `SUPPORTS` edges on story-derived facts
  - a `CONTRADICTS` edge for a planted contradiction
- Delete and edit both survive re-submit.
- Unit tests cover `factKey`, merge and the tombstone skip.

---

## Phase 5 — Pre-chat gate and pairing (F13, F15)

Refactor the existing pairing/compat code found in Phase 0; do not duplicate it. Remove or disable any similarity- or overlap-based ranking (report what you removed).

- **`services/match/gate.js` → `passesGate(a, b)`:** pure code, no LLM, returns `{ ok, reasons }`.
  - **Dealbreakers, both directions:** for each B attribute where `a.isDealbreaker` and `b.value ∉ a.accepts`, it fails, and vice versa.
  - **Basics,** if those fields exist: age range, gender preference, city/radius.
  - **Returns a boolean only.** No score. Neither agent sees why a pair was excluded.
- **`services/match/pairing.js` → `nextPairs()`:**
  - Candidates: active users passing `passesGate` who haven't chatted before.
  - Choose randomly (seeded) or round-robin.
  - Cap at `MAX_CHATS_PER_USER_PER_DAY`.
  - **Never order candidates by any similarity.**
- **`similarity.js` / `topMatches`:** keep only for in-chat concept recognition (Phase 7), always paired with a polarity and value check (F15).

**Acceptance**
- Unit tests:
  - dealbreaker mismatches are filtered in both directions
  - the gate returns no score
  - `nextPairs` output is independent of interest overlap: shuffle-invariance test with two users who share many likes vs none, same selection probability under a fixed seed
- Grep shows no remaining use of fact-embedding similarity for pair ranking.

---

## Phase 6 — Persona engine (F16–F24)

### 6.1 Context builder: `services/persona/contextBuilder.js`

**`selectFacts({ userId, incomingText, rng, k = SELECT_K })`:**
- **Candidates:**
  - `public` facts always.
  - `if_asked` facts only when the incoming message is a question about that topic: cosine ≥ `T_ASKED` **and** question detection (`?` or an interrogative word list, including Hinglish `kya`, `kaise`, `kab`, `kyun`).
  - `private` facts never.
- **Score:** `0.5·relevance + 0.3·max(importance, strength) + 0.2·recency`.
- **Sample** k facts with softmax(score / `TOPIC_TEMP`), using `rng`, rather than taking the top-k deterministically.
- Dedupe by concept.
- Return the facts, plus up to 2 story candidates not yet told in this conversation.

**`privateGuidance({ userId })`:** turns private facts and traits into non-verbatim behaviour rules (e.g. "avoid topic X; deflect lightly if asked"). It never includes raw private text.

**`traitRules.js`** (deterministic):

| Trait | < 0.4 | > 0.7 |
|---|---|---|
| Extraversion | short replies, few `!`, rarely asks back | energetic, more `!`, asks back often |
| Agreeableness | direct, comfortable disagreeing | warm, softens disagreement, but still disagrees on strong opinions |
| Neuroticism | (n/a) | more reactive to low-effort replies; avoid sarcasm |
| Openness | concrete topics | curious, playful hypotheticals |
| Conscientiousness | casual about plans | proposes concrete plans/times |

Values between 0.4 and 0.7 produce no rule.

**`selectExemplars({ userId, incomingText, rng, k = EXEMPLARS_K })`:** rank `VoiceSample`s by cosine(incoming, sample.incoming), with MMR diversity. Include them as few-shot `{ incoming → reply }` pairs. Each side always gets **its own** user's exemplars (F36).

### 6.2 Post-draft checks: `services/persona/checks.js`

- **`styleCheck(draft, actPlan, profile)`:**
  - Words within ±40% of `actPlan.targetWords`.
  - Emoji, ask-back and laugh obey the plan.
  - Lowercase start and ending punctuation match the user's majority.
- **`leakCheck(draft, privateFacts)`:** alias/keyword hits plus sentence cosine ≥ `T_LEAK`.
- **`groundingCheck(draft, ownFacts)`:** an LLM labels the draft's self-claims `supported | contradicts | unsupported`.
  - `unsupported`: rewrite as honest uncertainty ("never really tried it"), and create an inbox question for the user ("Do you like X?").
  - `contradicts`: regenerate.
- **`stanceCheck(draft, mustDisagree)`:** if the plan requires disagreement, an LLM classifier verifies the draft does not agree or concede. Otherwise regenerate.
- **Retries:** at most `MAX_REGENERATIONS`, then send the best draft minus any leaking sentence. Log all scores on the message.

### 6.3 Learning loop (F18, F19)

- **Inbox answers:** save as facts (existing) **and** as `VoiceSample(source: 'inbox')`.
- **If a draft-approval flow exists:**
  - Approve: `VoiceSample(approved_draft)`.
  - Edit: `VoiceSample(edited_draft)`, plus an LLM diff summary, zod `{ rule, kind: 'style' | 'never_say' | 'fact' }`, appended to `styleProfile.corrections` / `styleProfile.neverSay`, or saved as a `userEdited` fact.
- **If no approval flow exists:** report this, and propose a "fix this reply" control in the user's own chat replay view (Phase 8).
- **Rebuild the style profile** every `STYLE_REBUILD_EVERY` new samples, recency-weighted.

### 6.4 `styleMetrics` v2 (F17)

**Store distributions, not just means,** so Phase 7 can sample from them:
- `wordCounts: [n…]` (all samples)
- `burstiness` (messages per turn, when multi-message data exists)
- `questionBackRate`
- `emojiPerMessage` and `topEmojis` (top 5)
- `laughForms` (distribution over `haha`, `hahaha+`, `lol`, `lmao`, `hehe`)
- `abbrevRate` (`u ur rn tbh idk btw ngl imo omg pls thx k`)
- `lowercaseStartRatio`, `lowercaseIRate`
- `endings` distribution
- `petPhrases` (1–3-grams in ≥ 2 samples, minus stopwords)
- `doublePunctRate`
- `closingStyle` (from the e-sample about ending a conversation)

### 6.5 Reflections (optional, lowest priority)

Every `REFLECT_EVERY` new facts:
- `prompts/reflect.js` produces 3–5 insights with `supportingFactIds`.
- Each is saved as a `reflection` fact with `DERIVED_FROM` edges.
- Disclosure is the strictest among its supporters.

**Acceptance**
- Unit tests:
  - `traitRules`
  - `styleCheck`
  - `leakCheck` (keyword path)
  - `selectFacts` never returns `private`, and returns `if_asked` only for a matching question
  - a seeded `rng` gives a reproducible selection
- Inbox answers create `VoiceSample`s.

---

## Phase 7 — Conversation engine (the core problem: F14, F36–F38)

Extend the existing agent-to-agent loop found in Phase 0 (`services/conversation/engine.js` or equivalent).

**Information boundary:** an agent's inputs are (a) its own user's graph and voice profile and (b) the transcript. Nothing else about the other user, not even their profile answers.

### 7.1 Per-turn pipeline for the speaking side S (user U), given incoming message `m`

**1. `perceive(m)`**

- One LLM call (tier `mid`, `reasoning: false`), zod:
  ```js
  { concepts: [{ text, type, polarity }], claims: [{ text, conceptText?, attribute?, value?, polarity }],
    isQuestion, aboutMe, lowEffort, humor, warmth, acknowledgesDifference, dealbreakerHint: attribute | null }
  ```
- Resolve `concepts` and `claims` via `resolveConcept` (dictionary only).
- Look up each resolved concept or attribute in **U's own** graph to get `ownReaction = { strength, polarity, value } | null`.

**2. `observe(m)`: write U's notes about the other user**

- Observer facts: `observerId = U`, `subjectId = other`, `conversationId`, `source: 'agent_observed'`.
  - `evidence.quote` must appear verbatim in `m` (reuse `isVerbatim`); otherwise drop the note.
  - Merge by `factKey` within (observer, subject).
- `ChatEvent`s:

| Event | When |
|---|---|
| `shared_interest` | `ownReaction.polarity` and the claim's polarity are both +1, and strength ≥ 0.5 |
| `interest_clash` | the polarities are opposite |
| `laugh` | humor was perceived and U's `laughForms` are non-empty |
| `disagreement` | a claim conflicts with a U fact of strength ≥ `STANCE_BEND` |
| `disagreement_resolved` | `acknowledgesDifference` within `RESOLVE_WINDOW` turns after a disagreement, with no concession by either side |
| `low_effort` / `boredom` | from `lowEffort` and the interest meter |
| `question_dodged` | U asked a question and the reply ignored it |
| `dealbreaker_hint` | `dealbreakerHint` was set |

- **Live shared-node discovery** happens here and only here: the overlap is detected from the transcript against U's own graph.

**3. `updateInterest(state, perception)`** (deterministic; starting constants in config, tune with evaluation)

```
interest += K_LIKE·s for each concept U likes (s = strength)
          − K_DISLIKE·s for each concept U dislikes
          + K_QUESTION if aboutMe question
          + K_HUMOR if humor and U laughs easily
          − K_LOW_EFFORT if lowEffort
          − K_REPEAT if topic already in topicsTouched
interest = clamp(interest + K_DECAY·(baseline − interest), 0, 1)
baseline = 0.4 + 0.2·extraversion
```

If `interest < LOW_INTEREST`, increment `lowInterestTurns`; otherwise reset it.

**4. `planAct(state, profile, perception, rng)`** (deterministic sampling; the plan is stored on the message)

| Field | How it is set |
|---|---|
| `targetWords` | sample from `profile.wordCounts` × `(0.5 + interest)` |
| `burst` | Bernoulli(`burstiness`), giving 2–3 messages |
| `askBack` | Bernoulli(`questionBackRate × (0.5 + interest)`) |
| `emoji` | Bernoulli(`min(1, emojiPerMessage)`), choice from `topEmojis` |
| `laugh` | humor perceived ∧ Bernoulli(laugh rate), form sampled from `laughForms` |
| `reactions` | per recognised concept: `excited` (strength ≥ 0.75), `positive` (≥ 0.5), `lukewarm` (> 0), `dislike` (polarity −1), `unknown` (not in graph: honest "never tried / not my thing", or curious, per traits) |
| `mustDisagree` | conflicting claims vs U facts with strength ≥ `STANCE_HOLD`; between `STANCE_BEND` and `STANCE_HOLD` is optional (Bernoulli 0.5); below that U may concede |
| `topic` | with probability `TOPIC_SHIFT` (higher when interest is low), sample a new topic from `selectFacts`, excluding `topicsTouched`; with probability `STORY_RATE`, tell an untold story |
| `end` | `lowInterestTurns ≥ END_AFTER_LOW_TURNS`, or `turn ≥ MAX_TURNS`, or a natural close; written in U's `closingStyle` |

**5. `generate(plan)`:** use `contextBuilder` (Phase 6) plus the act plan as hard constraints.

The system prompt includes these anti-sycophancy rules:
- You are <name>, not an assistant.
- Do not agree, compliment or show enthusiasm unless <name> genuinely would, given the facts.
- Being brief, bored or in disagreement is fine.
- Never claim anything not in your facts; say you're unsure instead.
- No meta-talk.

Per conversation, sample a temperature for each side from `TEMP_RANGE`. Use `AGENT_MODEL_BY_SIDE` if configured, so the two sides can run on different models (F36).

**6. `checks`:** `styleCheck`, `groundingCheck`, `stanceCheck`, `leakCheck` (Phase 6.2).

**7. Persist** the message(s), `actPlan`, `checks` and the updated `agentState`.

**Opening:** pick the first speaker at random. The opener is sampled from U's greeting style (e1-style replies) plus a sampled topic from U's own public facts.

### 7.2 Judge: `services/conversation/judge.js` (F38)

- **When:** after the conversation ends, once per side, independently.
- **Setup:**
  - Different prompt from the speaking agent.
  - `JUDGE_MODEL` if configured.
  - Temperature 0.
- **Input:**
  - U's full self graph (including private facts, traits, dealbreakers and accepts; the output is a decision, never shown to the other side)
  - U's observer notes and ChatEvents
  - the transcript
- **Never** the other user's graph.
- **Output (zod):** `MatchDecision` fields. Validators:
  - Every `positives[].quote` and `frictions[].quote` must appear verbatim in the transcript.
  - Generic positives without a quote are rejected.
  - `frictions` must be non-empty unless `noFrictionJustification` is given.
  - `dealbreakerRisk` must be listed if any `dealbreaker_hint` event exists.
- **Rubric in the prompt:**
  - Weigh evidence of genuine connection: `shared_interest` with high own strength, `laugh`, `disagreement_resolved`, `warmth`.
  - Weigh evidence of friction: `interest_clash`, unresolved `disagreement` on strong values, `boredom`, `question_dodged`, an early end due to low interest.
  - Politeness alone is not evidence.
- **Decision:** `yes` requires `confidence ≥ JUDGE_YES_MIN`, calibrated on the labelled evaluation set.
  - `unsure`: optionally schedule one short follow-up chat, or ask the user via the inbox.
- **Mutual:** it's a match only when both sides' decisions are `yes`.
- **Shown to the user:** their own side's `summaryForUser` and quotes only. The other side's reasons are never shown.

**Acceptance**
- **Seeded replay:** the same seed and the same model responses (with a stubbed LLM) give an identical act-plan sequence.
- **Unit tests:**
  - `updateInterest`
  - `planAct` (strong opinion leads to `mustDisagree`; low interest leads to shorter `targetWords` and eventually `end`)
  - the judge validators
- **Integration with two seeded users** (one strongly anti-smoking with high importance but not a dealbreaker, the other mentions smoking):
  - a `disagreement` or `interest_clash` event is recorded
  - the anti-smoking agent's reply does not concede
  - the judge lists it as a friction
- **Information boundary test:** a spy on `KgFact.find` / `Concept` access shows the speaking agent and judge never query the other user's facts.

---

## Phase 8 — Review & replay UI (F27, F31, F32, F10)

- **`/api/kg/me` hub layout:**
  - user (`center: true`) → category hubs → facts
  - traits omitted
  - label = concept label
  - size = `max(importance, strength)`
- **Fact editing:** `PATCH /api/kg/facts/:id` accepts `{ object | value | polarity | strength | disclosure }`, sets `userEdited`, re-canonicalises and re-embeds.
- **Delete:** writes a tombstone.
- **Contradictions panel:** "Which is right?" resolves a `CONTRADICTS` edge and tombstones the loser.
- **Chat replay view:** `GET /api/conversations/:id/replay` returns:
  - messages
  - the viewer's own side's ChatEvents
  - the viewer's own `MatchDecision` (positives, frictions, summary)
  - the final mutual result

  The UI highlights evidence moments in the transcript. If there is no draft-approval flow, add "this isn't how I'd say it" on the user's own agent messages, feeding Phase 6.3.

**Acceptance**
- The graph renders ≤ 8 hubs.
- An edit persists across re-submit.
- A resolved contradiction leaves the panel.
- The replay shows highlighted evidence and never exposes the other side's decision reasons.

---

## Phase 9 — Evaluation harness: `scripts/eval/` (paper + competition)

These scripts may read both users' graphs. This is the **only** place that is allowed.

- **Personas:**
  - `eval/personas/*.json`: 20–30 consenting real testers.
  - Loader creates `TEST_` users.
  - Synthetic personas are marked `synthetic: true` and used only for load or debug.
- **`extraction-sample.js` / `score-extraction.js`:** 100 random facts to CSV for two labellers, then precision and Cohen's kappa.
- **`dup-rate.js`:** distinct concepts per mention, before vs after, plus the concept-decision distribution.
- **`style-fidelity.js`:**
  - Hold out 3 e-samples per persona.
  - Generate replies to the same incoming messages.
  - Report style distance (normalised L1 over the metric vector).
  - Export randomised real-vs-agent pairs (CSV plus a static HTML form) for the human "which is real?" test.
- **`conversation-stats.js`** (per chat and aggregate):
  - agreement rate (LLM labels each reply agree/disagree/neutral)
  - disagreements and resolved disagreements
  - topic shifts
  - reply-length variance vs the user's real variance
  - ask-back rate vs real
  - distinct-2
  - early-end rate
  - judge approval rate
- **`observer-accuracy.js`:** compare A's notes on B (concept + polarity, attribute + value) with B's self graph. Reports precision (notes that are true) and recall (share of B's public facts discovered).
- **`judge-eval.js`:** humans label 30 transcripts yes/no per side. Reports agreement and kappa with the judge.
- **`consistency.js`:** 20 probe questions per persona; an LLM judge labels consistent or contradiction.
- **`leak-probe.js`:** adversarial probes (direct, indirect, role-play, "a friend told me…"). Reports the leak rate per disclosure level.
- **Ablation flags (CLI or env):**
  - `RULES=off|on` — plain agents vs the six conversation rules; the headline comparison
  - `JUDGE=self|separate`
  - `KNOWLEDGE=raw|flat|graph`
  - `VOICE=description|exemplars|exemplars_check`
  - `LEARN=0|10`
- **Output:** `eval/results/<timestamp>.json` plus `eval/results/latest.md`.

**Acceptance**
- `node scripts/eval/run-all.js --personas eval/personas --ablate all` completes on 3 personas.
- `latest.md` has every metric row filled.

---

## Config defaults: `services/kg/config.js` (starting values; tune with Phase 9)

```js
export const KG = {
  // concepts & retrieval
  T_HIGH: 0.85, T_LOW: 0.75, T_ASKED: 0.6, T_LEAK: 0.8,
  DECAY_HALF_LIFE_DAYS: 365, CURRENT_FACT_TTL_DAYS: 180,
  SELECT_K: 10, EXEMPLARS_K: 4, MIN_STORIES: 4, TOPIC_TEMP: 0.7,
  MAX_REGENERATIONS: 2, STYLE_REBUILD_EVERY: 20, REFLECT_EVERY: 10,
  // pairing
  MAX_CHATS_PER_USER_PER_DAY: 5,
  // conversation engine
  STANCE_HOLD: 0.7, STANCE_BEND: 0.4, RESOLVE_WINDOW: 4,
  K_LIKE: 0.25, K_DISLIKE: 0.25, K_QUESTION: 0.05, K_HUMOR: 0.05,
  K_LOW_EFFORT: 0.1, K_REPEAT: 0.05, K_DECAY: 0.1,
  LOW_INTEREST: 0.3, END_AFTER_LOW_TURNS: 3, MAX_TURNS: 30,
  TOPIC_SHIFT: 0.25, STORY_RATE: 0.2, TEMP_RANGE: [0.7, 1.0],
  AGENT_MODEL_BY_SIDE: null, JUDGE_MODEL: null,
  // judge
  JUDGE_YES_MIN: 0.6,
};
```

## Commit plan

```
feat(kg-0): investigation report
fix(kg-1): center node, trait lock, safe rebuild, small fixes
feat(kg-2): models (concept, edge, tombstone, voice, chat event, decision) + migration
feat(kg-3): concept resolution + seed
feat(kg-4): build pipeline v2 + accepts/importance questionnaire
feat(kg-5): pre-chat dealbreaker gate + overlap-free pairing
feat(kg-6): persona engine (context, checks, learning loop, style v2)
feat(kg-7): conversation engine (perceive, notes, interest, act plan, checks) + independent judges
feat(kg-8): hub graph, fact edit, contradictions, chat replay
feat(kg-9): evaluation harness + ablations
```

## Out of scope (do not do now)

- Any match score, ranking or "why you match" view built from comparing two users' graphs or answers.
- Neo4j or any other database.
- Fine-tuning models.
- Importing third-party chat exports. Only stub `VoiceSample.source = 'import'`.
