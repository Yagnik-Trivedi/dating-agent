# 05 — Onboarding + personal knowledge graph (v2, per plan 15)

> **Prompt for Claude Code:** Read `CLAUDE.md` (section "Knowledge graph — final design"), `plan/15-knowledge-graph-final.md` §2–§5 and `plan/17-jobs-and-scaling.md` (done before this plan). Use `plan/kg-upgrade-reference.md` Phases 1–4 for detail; where it disagrees with plan 15, plan 15 wins. Implement this file, wipe and re-seed test data (no migration), run the acceptance checks.

## Goal

Turn a new user's answers into their own knowledge graph (layers 2–4 of plan 15 §2):
- **Self graph:** `KgFact` with `observerId: null`, linked by `KgEdge`, normalised by a shared `Concept` dictionary.
- **Voice:** `VoiceSample`s (real messages) + `VoiceProfile` (distributions, language mix, corrections).
- **Gate:** `Profile.gate`, rebuilt from section B (the builder exists from plan 17).

Plus a review screen API so the user can see and correct all of it, and continuous-learning hooks.

**Out of bounds:** this plan never reads another user's data. `resolveConcept` maps text to the dictionary and never reads any user's facts.

**Keep the app runnable.** v1 plans 06–09 still read facts and style. Add small adapters, each deleted by the plan that rewrites its caller:
- `weight` virtual on `KgFact` (= `importance ?? strength ?? 0.5`)
- `selfFactsV1()`, which presents `isDealbreaker` facts the way the v1 brief expects
- `voiceCardV1(userId)`, which gives the v1 `styleCard` fields from `VoiceProfile`

Also update the minimal client controls (`Onboarding.jsx`) so the new questionnaire can be submitted; plan 10 polishes the UI.

---

## 1. Bug fixes first (ref Phase 1)

- **`services/kg/graph.js`:** the center node is `{ id: 'me', label: user.name, type: 'self', center: true }`; queries add `.select('-embedding')`.
- **`OnboardingReview.jsx`:** filter with `!n.center`; replace `Object.groupBy` with `reduce`. `lib/kg.js`: every consumer keys off `center`, never an id.
- **Traits:** read-only in the review. `PATCH` / `DELETE /api/kg/facts/:id` return **422** for `predicate: 'trait'`. Disclosure stays `private`.
- **Language heuristics (F34):**
  - Remove `scene` from the Hinglish list.
  - Count `na`, `ye`, `hum`, `tum` only when the message has at least one other Hinglish token.
  - The code-side list is now only a fallback for the LLM language tagging (§6).
- **Safe rebuild:** the whole build job runs inside `withTransaction` (plan 17). An interrupted build leaves the previous graph intact.

## 2. Data model (plan 15 §3; reference Phase 2 for anything plan 15 doesn't define)

### `KgFact` v2 (replaces the v1 schema; wipe test data)
```js
{
  subjectId, observerId /*null = self*/, matchId, conversationId,
  predicate: 'likes'|'dislikes'|'values'|'goal'|'lifestyle'|'trait'|'story'|'background'|'opinion'|'humor'|'reflection'|'style',
  object,                          // display label
  conceptId,                       // → Concept
  attribute, value,                // structured (section B): smoking / never; values from questions.js option lists
  accepts: [String],               // section B: partner values the user accepts
  polarity: 1 | -1,                // default 1
  strength,                        // 0..1 how much they like it / how firmly they hold an opinion
  importance,                      // 0..1 how much it matters in a partner
  isDealbreaker: Boolean,          // no separate 'dealbreaker' facts any more
  confidence,                      // by origin (table below)
  source: 'questionnaire_choice'|'questionnaire_story'|'user_answer'|'agent_observed'|'reflection'|'style_derived'|'own_chat',
  disclosure: 'public'|'if_asked'|'private',
  sensitivity: { topic, sensitive },
  userEdited: Boolean,
  evidence: [{ quote, sourceRef: { kind: 'answer'|'message'|'inbox'|'sample', id }, at }],
  firstSeen, lastConfirmed, validUntil, isCurrent,
  buildId,
  archiveAt,                        // notes only (plans 08/09)
  embedding /*Buffer, select:false; only facts with no conceptId*/, embeddingModel
}
```

**Confidence by origin:**

| Origin | Confidence |
|---|---|
| Picked from a list | 1.0 |
| Stated in text, support check yes | 0.9 |
| Inferred, or support check unclear | 0.6 |
| `agent_observed` with a verbatim quote | 0.6 (otherwise dropped) |
| `reflection` | 0.6 |
| `style_derived` | `min(0.9, n / 30)` for n samples |

- Decay at **read time** with `DECAY_HALF_LIFE_DAYS`: `confidence × 0.5^(ageDays / halfLife)`, from `lastConfirmed`.
- `factKey(f)` = `` `${predicate}|${conceptId || attribute || normalise(object)}` ``.
- **Indexes:** `{subjectId, observerId, predicate, conceptId}`, `{subjectId, observerId, attribute}`, `{observerId, conversationId}`, TTL on `archiveAt`.

### New collections (all `select: false` on vectors; indexes per plan 15 §6.6)
- **`Concept`**
  - Fields: `{ name, label, type: 'activity'|'food'|'place'|'value'|'lifestyle'|'topic'|'media'|'other', aliases: [String], embedding (Buffer), embeddingModel, verified, createdBy: 'seed'|'auto', mergedInto }`.
  - Unique `{type, name}`; index `aliases`.
  - It's a shared dictionary, **not** a cross-user link.
- **`KgEdge`**
  - Fields: `{ subjectId, observerId, from: { kind: 'fact'|'concept', id }, to: { kind, id }, type: 'SUPPORTS'|'CONTRADICTS'|'DERIVED_FROM', confidence, resolved, createdAt }`.
  - Edges stay inside ONE user's graph, or inside one observer's notes.
- **`KgTombstone`**: `{ subjectId, key /*factKey*/, createdAt }`, unique `{subjectId, key}`.
- **`VoiceSample`**
  - Fields: `{ userId, incoming, text, source: 'onboarding'|'inbox'|'approved_draft'|'edited_draft'|'own_chat'|'import', mood, lang: { languages: [String], script: 'latin'|'devanagari'|'gujarati'|'other'|'mixed', codeSwitch }, embedding /*of incoming*/, createdAt }`.
  - Index `{userId, createdAt}`. `import` is a stub only.
- **`VoiceProfile`** (one per user; **replaces `User.styleProfile`**, which is removed): exactly the shape in plan 15 §3, including `language.{mix, codeSwitchRate, switchTriggers, mirrorsLanguage}`, `corrections` and `neverSay`.
- **`User`**:
  - `graphVersion: Number`, `$inc` on every self-graph or voice write. Plan 08's per-conversation cache keys on it.
  - `settings.learnFromChats` (default true).

`ChatEvent` and `MatchDecision` are added by plans 08 and 09. Extend `scripts/check-indexes.js` with every index above.

## 3. Concept resolution: `services/kg/canonicalize.js` (ref Phase 3)

`resolveConcept({ text, type })` → `{ conceptId, decision }`:
1. **`normalise`:** lowercase, trim, collapse whitespace, strip punctuation, naive singularisation with an exceptions list ("news", "chess", "glasses"…).
2. **Exact match** on `name` or `aliases` within `type` (any type if unknown).
3. **Embedding match** (`inputType: 'query'`) against same-type concepts from an in-memory cache keyed by `embeddingModel` (refreshed on insert; capped at `CONCEPT_CACHE_MAX`):
   - `≥ T_HIGH` → match, and add the text as an alias
   - `T_LOW..T_HIGH` → LLM tie-break, `prompts/sameConcept.js` (tier mid, reasoning off, zod `{ same, conceptId? }`, top 3 candidates)
   - else → create `{ verified: false, createdBy: 'auto' }`
4. **Log every decision** to `server/eval/logs/concept-decisions.jsonl` (gitignored).

**Calibrate `T_HIGH`/`T_LOW` for `nemotron-3-embed-1b`.** Plans 07/09 found this model scores ~0.1 lower than the reference spec assumes. Measure on the seed alias map (true aliases vs unrelated pairs), set both values in `config.js`, and record the numbers in Status.

**`scripts/seed-concepts.js`** (idempotent):
- the 24 interest suggestions with aliases (`trekking: [hiking, treks, trek, mountain trips]`, `films: [movies, cinema]`, `gaming: [video games]`, `stand-up comedy: [standup, comedy shows]`, `fitness: [gym, working out]`, …)
- every section B option, as a `lifestyle` or `value` concept

## 4. Questionnaire (`services/kg/questions.js`, validated with zod on submit)

**Identity (new, first):** job/studies (text), languages spoken (multi-select + free text), optional family setup (text). These become `background` facts, `public` by default, editable.

**A — Personality:** Mini-IPIP, 20 items, 1–5 Likert. **R** = reverse-scored (6 − answer); each trait is the mean of its 4 items normalised to 0..1. Computed in code into 5 `trait` facts (`private`, `confidence` 0.8, read-only).

| # | Item | Trait | R |
|---|---|---|---|
| 1 | Am the life of the party. | Extraversion | |
| 2 | Sympathize with others' feelings. | Agreeableness | |
| 3 | Get chores done right away. | Conscientiousness | |
| 4 | Have frequent mood swings. | Neuroticism | |
| 5 | Have a vivid imagination. | Openness | |
| 6 | Don't talk a lot. | Extraversion | R |
| 7 | Am not interested in other people's problems. | Agreeableness | R |
| 8 | Often forget to put things back in their proper place. | Conscientiousness | R |
| 9 | Am relaxed most of the time. | Neuroticism | R |
| 10 | Am not interested in abstract ideas. | Openness | R |
| 11 | Talk to a lot of different people at parties. | Extraversion | |
| 12 | Feel others' emotions. | Agreeableness | |
| 13 | Like order. | Conscientiousness | |
| 14 | Get upset easily. | Neuroticism | |
| 15 | Have difficulty understanding abstract ideas. | Openness | R |
| 16 | Keep in the background. | Extraversion | R |
| 17 | Am not really interested in others. | Agreeableness | R |
| 18 | Make a mess of things. | Conscientiousness | R |
| 19 | Seldom feel blue. | Neuroticism | R |
| 20 | Do not have a good imagination. | Openness | R |

**B — Values and lifestyle:** keep the 12 items and option lists from v1 (kids, religion, location, smoking, drinking, family, career, looking for, diet, conflict, alone time). The answer shape becomes:
```js
{ answer, importance: 'low'|'medium'|'high' /* NO default: required */, accepts: [optionValue], dealbreaker: Boolean }
```
- `accepts` is the "In a partner I'd accept" multi-select. It defaults to all options.
- `dealbreaker: true` requires at least one option deselected (zod refinement).
- Importance maps to 0.3 / 0.6 / 0.9; a dealbreaker gives `isDealbreaker: true` and importance 1.0.
- Religion is used only as the user's own stated answer and preference; never inferred.

**C — Stories:** at least `MIN_STORIES` (4) answers out of 7 prompts, each with an example placeholder:
1. Describe a perfect Sunday.
2. A hill you'd die on (a small or silly opinion).
3. **Something you'll argue about with friends, and how strongly you feel about it.** (new; feeds `opinion` facts with `strength`)
4. Something you're weirdly good at.
5. The last thing that made you laugh out loud.
6. A place you want to go and why.
7. What do your close friends rely on you for?

**D — Interests:** chips (the 24 seeded concepts) + free text, each with intensity casual / into it / obsessed → `strength` 0.3 / 0.6 / 0.9.

**E — Voice:** `VOICE_SAMPLES_ONBOARDING` (15) "how would you reply?" messages across moods. Keep e1–e8 and add e9–e15:

| id | Incoming | Mood |
|---|---|---|
| e1 | hey! your profile made me smile 😄 | greeting |
| e2 | so what do you do when you're not working? | curious |
| e3 | pineapple on pizza — yes or no? | opinion |
| e4 | I'm thinking of trying a trek this weekend, ever done one? | casual |
| e5 | sorry for the late reply, crazy day | apologetic (receiving) |
| e6 | what's your idea of a good first date? | plan |
| e7 | haha you seem fun | tease |
| e8 | do you prefer texting or calls? | casual |
| e9 | I GOT THE JOB!! 🎉 | excited |
| e10 | honestly I think dogs are overrated | disagree |
| e11 | we should grab coffee sometime, when are you free? | plan |
| e12 | (you have to cancel plans you made) | apologetic |
| e13 | you're definitely the type who's late everywhere 😏 | tease |
| e14 | anyway I should sleep, early day tomorrow | closing |
| e15 | a 4–5 sentence message about their week | long_reply |

## 5. Build pipeline v2: the `buildUserGraph` job (plan 15 §4 stage 2)

`POST /onboarding/submit` validates, sets `onboarding.status = 'processing'` and enqueues `buildUserGraph` (dedupeKey per user). The user sees "building your profile…". The handler runs these steps **in one transaction**:

1. **Deterministic facts:** A (traits), B (`attribute`, `value`, `accepts`, `importance`, `isDealbreaker`, `conceptId`, `questionnaire_choice`, confidence 1.0), D (`likes` + `strength`), identity (`background`).
2. **Story extraction:**
   - Tier mid, reasoning off. The prompt `extractStoryFacts.js` returns the reference Phase 3 schema: predicate `likes|dislikes|values|goal|background|opinion|humor`, `conceptText`, `conceptType`, `polarity`, `strength`, `isCurrent`, `sensitiveTopic`, `quote`.
   - Verbatim check: drop any fact whose quote isn't in the answer.
   - **Support check:** `prompts/factSupported.js`, batched per answer. `no` → drop; `unclear` → 0.6; `yes` → 0.9.
   - Keep one `story` fact per answer (summary label; the evidence is the whole answer), with a `SUPPORTS` edge story → each extracted fact.
3. **Sensitivity:** a sensitive topic (health, family conflict, past relationships, money, religion, politics, sexuality) gives `disclosure: 'if_asked'`.
4. **Concept resolution** for every concept-bearing fact.
5. **Merge by `factKey`:**
   - `strength`: max
   - `evidence`: union
   - `firstSeen`: earliest
   - `confidence` and `source`: from the best member
   - Opposite polarities on the same key stay as two facts with a `CONTRADICTS` edge.
6. **Contradictions:** rules (same concept with opposite polarity; same attribute with a different value), plus one batched LLM call, `prompts/findContradictions.js`, comparing B lifestyle answers (smoking, drinking, diet) with story facts.
7. **Re-submit merge:**
   - Skip tombstoned keys.
   - Keep `userEdited` facts, appending evidence only.
   - Update the rest in place, preserving a user-changed disclosure.
   - Insert new facts; remove stale `questionnaire_*` facts unless `userEdited`.
   - **Never touch** `user_answer`, `agent_observed`, `reflection` or `own_chat` facts.
8. **Embeddings:** embed only facts with no `conceptId` (stories, odd free text). Concepts carry the shared vector. Polarity and values are never embedded; consumers compare them explicitly.
9. **Voice:**
   - Section E answers become `VoiceSample`s (`incoming` = the prompt, `mood` from the table). One batched LLM call (`prompts/tagLanguage.js`, tier mid, reasoning off) tags each sample `{ languages, script, codeSwitch }`; fall back to the code heuristics on failure.
   - Then `computeVoiceProfile(samples)` (code) fills every distribution in plan 15 §3: word counts, burstiness, question-back rate, emoji, laugh forms, abbreviations, lowercase rates, double punctuation, elongation, endings, pet phrases, closing style from e14, and `language.mix` / `codeSwitchRate` / `switchTriggers` (moods in which switching happens) / `mirrorsLanguage` (from replies to incoming messages in a different language; prior 0.5 when unknown).
   - Last, `prompts/describeStyle.js` writes `description`, `doList` and `dontList`, which are secondary to the examples.
10. **Gate:** `buildGate(userId)` (plan 17) from `attribute`, `value`, `accepts` and `isDealbreaker`.
11. **Caps:** `pruneToCap` to `MAX_SELF_FACTS` (lowest `confidence × max(importance, strength)` first; never `userEdited`, `user_answer`, dealbreakers or traits). `$inc graphVersion`. Emit `onboarding:done`.

On failure: `onboarding.status = 'failed'` (the previous graph is untouched), and the UI offers re-submit.

## 6. Review screen API (plan 15 §5)

- **`GET /api/kg/me`:** hub projection.
  - The user (`center: true`) → 8 hubs: **Who I am · Likes · Dislikes · Values & lifestyle · Goals · Stories · Opinions & humour · How I text**.
  - Each hub links to its facts. Node label = concept label (or `object`); size = `max(importance, strength)`; opacity = decayed confidence.
  - Traits are omitted. No embedding bytes.
- **"How I text" nodes** come from `VoiceProfile`, each with a stable id and a correctable field:
  - "Mixes Hindi & English (≈35%)"
  - "Top emojis 😂🔥"
  - "Laughs: hahaha"
  - "Short replies (~8 words)"
  - "Says 'yaar' a lot"
  - "Ends chats with 'gn 👋'"
- **`PATCH /api/kg/facts/:id`:** accepts `{ object | value | polarity | strength | disclosure }`, sets `userEdited`, re-canonicalises and re-embeds when the label changed, rebuilds the gate if B changed, and `$inc graphVersion`.
- **`DELETE /api/kg/facts/:id`:** writes a `KgTombstone`, then deletes the fact.
- **`GET /api/kg/contradictions`:** unresolved `CONTRADICTS` edges with both facts.
- **`POST /api/kg/contradictions/:edgeId/resolve { keepFactId }`:** tombstones the loser and marks the edge resolved.
- **`POST /api/kg/voice/corrections`** `{ nodeId, text? }`:
  - Known nodes map to structured changes. For example "I never use emojis" sets `emojiPerMessage = 0`, empties `topEmojis` and adds a never-say rule.
  - Free text goes through `prompts/voiceCorrection.js` (tier mid, zod `{ rule, kind: 'style'|'never_say' }`).
  - Both are appended to `corrections` / `neverSay` (`from: 'graph_edit'`).

## 7. Continuous learning (plan 15 §4 stage 7, the parts this plan owns)

- **`POST /api/inbox/:id/answer`:**
  - Extract facts (`user_answer`, 0.9, with the support check).
  - **Also** save the answer as `VoiceSample(source: 'inbox')`, language-tagged.
  - `$inc graphVersion`.
- **Periodic job handlers** (scheduled by plan 17):
  - `rebuildVoice`: recompute `VoiceProfile`, recency-weighted, after every `STYLE_REBUILD_EVERY` new samples. Keep `MAX_VOICE_SAMPLES` (the newest + an MMR-diverse set by mood/language).
  - `reflect`: after every `REFLECT_EVERY` new self facts, `prompts/reflect.js` writes 3–5 insights as `reflection` facts (0.6) with `DERIVED_FROM` edges. Disclosure is the strictest among the supporting facts.
  - `reconfirm`: daily. Facts with `isCurrent` whose `lastConfirmed` is older than `CURRENT_FACT_TTL_DAYS` get an inbox question ("Still learning guitar?").
  - `conceptCleanup`: nightly. Merge unverified duplicate concepts (same normalised name, or cosine ≥ `T_HIGH`) into the older one, repoint facts, add aliases.

## 8. Account deletion (plan 15 §4 stage 9; extend `DELETE /api/me`)

Delete:
- all their `KgFact`s, `KgEdge`s, `KgTombstone`s, `VoiceSample`s and `VoiceProfile`
- their likes, messages and inbox items
- notes **about** them written by others (`subjectId: me`)

Plans 08/09 add `ChatEvent`s and `MatchDecision`s to this list, and anonymise their side of matches (name "Deleted user", `userId` kept for referential integrity).

## 9. Seed data (keep the app runnable)

- `scripts/convert-personas-v2.js` (run once; commit the result) converts `seed/personas.json` to the new answer shape:
  - B importance from the v1 value; `accepts` = all options, or `[own answer]` for v1 dealbreakers
  - identity from the bio/design notes
  - **7 extra E samples per persona**, written in that persona's voice by the LLM (tier mid) and reviewed by hand
- Plan 11 later adds the mixed-language and emoji-heavy personas.
- `scripts/seed.js` loads the v2 shape and enqueues `buildUserGraph` per persona (the worker's concurrency applies).

## Acceptance checks

- [ ] Unit tests (`node:test`):
  - [ ] trait math with reverse scoring
  - [ ] `normalise`
  - [ ] resolution order (stubbed embed + LLM)
  - [ ] `factKey`, merge, and the tombstone skip
  - [ ] `computeVoiceProfile` on fixed samples, including language mix and code-switch rate
  - [ ] B answer zod: no importance → rejected; dealbreaker with all options accepted → rejected
- [ ] "hiking", "treks" and "trekking" resolve to one concept; `concept-decisions.jsonl` is written; calibrated `T_HIGH`/`T_LOW` are recorded in Status.
- [ ] `node scripts/onboard-sample.js`:
  - [ ] no duplicate `factKey`s and no separate dealbreaker facts
  - [ ] every story-derived fact has a `SUPPORTS` edge
  - [ ] a planted contradiction (B "never drinks" vs a story with wine) gives a `CONTRADICTS` edge
  - [ ] every LLM quote is verbatim
  - [ ] only concept-less facts have embeddings
  - [ ] 15 `VoiceSample`s with language tags; `VoiceProfile` filled; `Profile.gate` built
- [ ] Delete (tombstone) and edit (`userEdited`) both survive a re-submit. A failure injected mid-build leaves the previous graph intact.
- [ ] `GET /api/kg/me`: center node + ≤ 8 hubs including "How I text"; no traits; no embedding bytes. Trait PATCH/DELETE return 422. Resolving a contradiction removes it from `GET /api/kg/contradictions`. "I never use emojis" sets the emoji rate to 0 and adds a never-say rule.
- [ ] An inbox answer creates facts **and** a `VoiceSample(inbox)`.
- [ ] `node scripts/check-indexes.js` passes; `node scripts/storage-report.js` shows bytes per user for the seed set.
- [ ] After wipe + `npm run seed`: signup → onboarding (new questionnaire) → review → discover → match → agent chat → verdict, all still working (v1 engine via the adapters).
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-05): KG v2 — concepts, edges, tombstones, voice, build job, review API`
