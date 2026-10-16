# 15 — Knowledge graph: final design (source of truth)

> **For Claude Code:** this file is the agreed design for everything the app knows about a user. It combines the original plan 05, the review-driven spec in `plan/kg-upgrade-reference.md` (F-IDs refer to the review doc) and the team decisions below.
> - When this file and `kg-upgrade-reference.md` disagree, **this file wins**.
> - When older plan files (05–11) disagree with this file, update them to match it.
> - No time constraint: implement the full design. The only shortcut kept is wiping test data and re-seeding instead of writing a migration.

---

## 1. Team decisions (override the upgrade spec where they differ)

1. **Public profile vs. private graph.** An agent may read the other user's **public profile** (photos, bio, prompts, public tags), just as a human would. It uses this for the trust check (plan 06) and the brief and openers (plan 07). It must **never** read the other user's `KgFact`s, edges, embeddings, voice data or private answers.
   - The only other cross-user path is the chat transcript.
   - The dealbreaker gate also crosses users, but it returns a boolean and nothing else.
2. **Matching stays swipe-based.** There is no automatic pairing (`nextPairs`).
   - The gate filters the discover deck (as a database query) and runs again when a match is created.
   - The discover order is random. Nothing is ranked by graph overlap.
3. **The other side may be a human.** In shadow mode, the person you're chatting with may be typing themselves. The conversation engine must work whether the other side is an agent or a human.
4. **Conversation style is part of the user's knowledge.** It's stored as a voice layer (distributions and real samples) and shown in the graph as a "How I text" hub that the user can correct.
5. **Any language mix is supported,** not just Hinglish. Each message is tagged per sample by language and script.
6. **Scale is designed in from day one** (section 6).

---

## 2. The six layers of what we know about a user

| Layer | What it holds | Stored in | Who can read it |
|---|---|---|---|
| 1. Public profile | name, age, city, photos, bio, prompts, public tags | `Profile` | Everyone, including the other user's agent |
| 2. Gate profile | basics (age range wanted, gender preference, city/radius), section B answers as attribute → value, `accepts`, dealbreaker flags | `Profile.gate` (denormalised, indexed) | Gate code only; never an LLM, never another user |
| 3. Self graph | identity, preferences, values, goals, lifestyle, interests, stories, opinions, humour, traits, reflections | `KgFact` (`observerId: null`) + `KgEdge` + `Concept` | The user's own agent and judge only. `private` facts never reach a prompt whose output another user sees |
| 4. Voice | style distributions, language mix, habits, corrections, never-say list, real example messages | `VoiceProfile` + `VoiceSample` | The user's own agent only |
| 5. Notes about others | what my agent learned about a match, each with a verbatim quote, plus chat moments | `KgFact` (`observerId: me`, `subjectId: them`, `conversationId`) + `ChatEvent` | My agent and judge only |
| 6. Decisions | my judge's verdict on a chat, with quotes | `MatchDecision` | Me only (never the other side's reasons) |

**Boundaries** (privacy and contact rules) cut across all layers:
- `disclosure` on every fact
- `neverSay` and avoid-topics in `VoiceProfile`
- `KgTombstone` for deleted facts

---

## 3. Data model

Fields not mentioned here keep the definitions from `kg-upgrade-reference.md` Phase 2.

### KgFact (self facts and notes)
```js
{
  subjectId, observerId /*null = self*/, matchId, conversationId,
  predicate: 'likes'|'dislikes'|'values'|'goal'|'lifestyle'|'trait'|'story'|'background'|'opinion'|'humor'|'reflection'|'style',
  object,                         // display label
  conceptId,                      // → Concept (shared dictionary)
  attribute, value,               // structured, e.g. smoking / never (values from a fixed list)
  accepts: [String],              // section B: partner values the user accepts
  polarity: 1 | -1,
  strength,                       // 0..1 how much they like it / how firmly they hold an opinion
  importance,                     // 0..1 how much it matters in a partner
  isDealbreaker: Boolean,
  confidence,                     // by origin (table below)
  source: 'questionnaire_choice'|'questionnaire_story'|'user_answer'|'agent_observed'|'reflection'|'style_derived'|'own_chat',
  disclosure: 'public'|'if_asked'|'private',
  sensitivity: { topic, sensitive },
  userEdited: Boolean,
  evidence: [{ quote, sourceRef: { kind: 'answer'|'message'|'inbox'|'sample', id }, at }],
  firstSeen, lastConfirmed, validUntil, isCurrent,
  buildId,
  embedding /*only for facts with no conceptId (see 6.3)*/, embeddingModel
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
| `style_derived` | Sample-size based |

Confidence decays at read time with `DECAY_HALF_LIFE_DAYS`.

### Other collections
These are as in the spec:
- `Concept`
- `KgEdge` (`SUPPORTS` / `CONTRADICTS` / `DERIVED_FROM`)
- `KgTombstone`
- `ChatEvent`
- `MatchDecision`

### VoiceSample
```js
{ userId, incoming /*message being replied to, nullable*/, text,
  source: 'onboarding'|'inbox'|'approved_draft'|'edited_draft'|'own_chat'|'import',
  mood: 'greeting'|'excited'|'apologetic'|'disagree'|'plan'|'tease'|'closing'|'long_reply'|'casual'|..., 
  lang: { languages: [String], script: 'latin'|'devanagari'|'gujarati'|'other'|'mixed', codeSwitch: Boolean },
  embedding /*of incoming, small dims*/, createdAt }
```

### VoiceProfile (one per user; replaces `user.styleProfile`)
```js
{
  userId, sampleCount, builtAt,
  wordCounts: [Number],                 // distribution, sampled per message
  burstiness, questionBackRate,
  emojiPerMessage, topEmojis: [String], emojiPlacement: { end, inline },
  laughForms: { haha, hahaha, lol, lmao, hehe, other },
  abbrevRate, abbrevs: [String],        // u, rn, tbh, idk, ngl...
  lowercaseStartRatio, lowercaseIRate, doublePunctRate, elongationRate /* "sooo" */,
  endings: { none, '.', '!', '?', '..', emoji },
  petPhrases: [String],
  closingStyle: String,
  language: {
    mix: { [lang]: share },              // e.g. { en: 0.6, hi_latn: 0.35, gu_latn: 0.05 }
    codeSwitchRate,
    switchTriggers: [ 'joking', 'emotion', ... ],
    mirrorsLanguage: Number              // 0..1 tendency to answer in the other person's language
  },
  description, doList, dontList,        // LLM summary (secondary to examples)
  corrections: [{ rule, kind: 'style'|'never_say', from: 'edited_draft'|'wouldnt_say'|'graph_edit', at }],
  neverSay: [String]
}
```

### Profile.gate (denormalised for the gate query)
```js
gate: {
  age, gender, interestedIn: [String], ageMin, ageMax, city, geo /*optional 2dsphere*/, radiusKm,
  values: { smoking: 'never', drinking: 'socially', kids: 'want', diet: 'veg', ... },
  accepts: { smoking: ['never','socially'], ... },
  dealbreakers: [ 'smoking', ... ]       // attributes where isDealbreaker = true
}
```
This is rebuilt whenever onboarding or a section B answer changes.

---

## 4. What we learn, where it goes, and when

### Stage 1 — Signup
| Learned | Stored in |
|---|---|
| name, email, required AI-agent consent | `User` |
| age, gender, interested in, city | `Profile` + `Profile.gate` |

### Stage 2 — Onboarding questionnaire
Runs once and can be re-submitted. Processing is an **async background job**; the user sees "building your profile…".

| Section | What we ask | Becomes | Where |
|---|---|---|---|
| Identity (new) | job/studies, languages spoken, optional family setup | `background` facts (`public` by default, editable) | `KgFact` |
| A. Personality | Mini-IPIP, 20 items | 5 `trait` facts, computed in code; always `private`; read-only in the review | `KgFact` |
| B. Values and lifestyle | 10 questions; importance with **no default**; "In a partner I'd accept" multi-select; dealbreaker toggle | `values`/`goal`/`lifestyle` facts with `attribute`, `value`, `accepts`, `importance`, `isDealbreaker`, confidence 1.0 | `KgFact` + `Profile.gate` |
| C. Stories | ≥ 4 prompts with example answers, including "something you'll argue about and how strongly" | 1 `story` fact per answer, plus extracted `likes`/`dislikes`/`values`/`goal`/`opinion`/`humor` facts with quotes, `SUPPORTS` edges story → fact, sensitivity tags (sensitive topics → `if_asked`) | `KgFact` + `KgEdge` |
| D. Interests | chips + free text + intensity | `likes` facts with `conceptId` and `strength` | `KgFact` |
| E. Voice | **15** "how would you reply?" messages across moods: greeting, curious, opinion, excited news, polite disagreement, making a plan, cancelling/apology, light teasing, ending a chat, reply to a long message… | 15 `VoiceSample`s with mood + language tags → `VoiceProfile` | `VoiceSample` + `VoiceProfile` |
| F. Review screen | hub graph; edit wording/strength/privacy; delete; "Which is right?" for contradictions; "How I text" corrections | `userEdited` flags, tombstones, resolved `CONTRADICTS` edges, voice corrections | `KgFact`, `KgTombstone`, `KgEdge`, `VoiceProfile` |

**The build job pipeline** (`buildUserGraph`), in order:
1. Deterministic facts (A, B, D, identity).
2. Story extraction (tier mid), then the verbatim quote check, then the support check (yes / unclear / no).
3. Sensitivity tagging.
4. Concept resolution: alias match, then embedding match, then an LLM tie-break for borderline cases.
5. Merge by `factKey` (dedupe across sections).
6. Contradiction detection: rule-based, plus one batched LLM call comparing B answers with stories.
7. Re-submit merge: tombstones are skipped, `userEdited` facts are kept, and `user_answer`, `agent_observed`, `reflection` and `own_chat` facts are never touched.
8. Embed only facts that have no concept.
9. Language-tag the voice samples (one batched LLM call), then compute the `VoiceProfile`.
10. Rebuild `Profile.gate`.
11. Project the graph view.

Run the whole job as one Mongo transaction. Atlas runs as a replica set, so transactions are available.

### Stage 3 — Discover
- The deck is a **single indexed Mongo query** built from `Profile.gate`:
  - basics: age, gender, city
  - my dealbreakers against their values
  - their dealbreakers against my values
- Results are random-sampled; no ranking.
- **Nothing new is learned** at this stage.

### Stage 4 — Match created
1. **Gate re-check** (code, boolean). On fail, the match closes as "not compatible on a dealbreaker", with no detail.
2. **Trust check** (plan 06) on the other user's **public profile**. Result: `match.trust[viewer]`.
3. **Brief** (plan 07):
   - Inputs: the other user's public profile, plus my own graph.
   - Outputs: openers and an agenda. The agenda is built from **my own** graph: the dimensions I care about that the chat should uncover.
   - Stored in `match.brief[viewer]`.
4. A conversation document is created with `seed`, per-side `agentState` and a sampled temperature.

**Nothing is written to anyone's self graph** at this stage.

### Stage 5 — During the chat (per incoming message, for my agent)
| Step | Learned or produced | Stored in |
|---|---|---|
| perceive + observe (**one** LLM call) | concepts, claims, isQuestion, humour, warmth, low effort, dealbreaker hint, language of the message | in memory |
| notes | facts about them, each with a verbatim quote (dropped otherwise) | `KgFact` (`observerId: me`, `conversationId`) |
| moments | shared_interest, interest_clash, laugh, disagreement(_resolved), low_effort, boredom, warmth, question_dodged, dealbreaker_hint | `ChatEvent` |
| interest meter + act plan | interest, targetWords, emoji, laugh, askBack, mustDisagree, topic/story, reply language, end | `agentState` + `message.actPlan` |
| generate + checks | reply in my voice (≤ 10 sampled facts + 3–5 own exemplars + trait rules + private guidance); style, grounding, stance (only if mustDisagree), leak checks | `Message` (+ `checks`) |
| unknown about me | "ask my human" question | `InboxItem` |

**Live shared-interest discovery** happens only here: my agent spots an overlap by comparing the transcript with **my** graph, comparing likes vs dislikes and values explicitly (F15).

### Stage 6 — After the chat
1. **Judge job,** one per side, async, independent, temperature 0.
   - Inputs: my full self graph (including private), my notes and ChatEvents, and the transcript.
   - Every point must cite a quote, and it must list frictions.
   - Output: `MatchDecision`.
2. **Mutual yes** means handoff. Otherwise a wind-down or close (as in plan 09).
3. **Notes compaction job:** a closed match's raw notes and ChatEvents are summarised into the `MatchDecision`, then archived (TTL) after `NOTES_RETENTION_DAYS`. A handed-off match keeps its notes.

### Stage 7 — Continuous learning (whenever it happens)
| Trigger | Learned | Stored in |
|---|---|---|
| User answers an "ask my human" question | new facts (`user_answer`, 0.9) + a voice sample | `KgFact` + `VoiceSample(inbox)` |
| "I wouldn't say that" on my agent's message, optionally with a fix | a correction rule (style / never-say / wrong fact) | `VoiceProfile.corrections` / `neverSay`, or a `userEdited` fact |
| Graph review edit or delete | fact change or tombstone | `KgFact` / `KgTombstone` |
| After handoff, the user's own messages in that chat (only if the "learn from my chats" setting is on; default on, can be turned off) | real voice samples, the best data we get | `VoiceSample(own_chat)` |
| Optional: paste your own old chats (only your lines kept) | voice samples | `VoiceSample(import)` |

### Stage 8 — Periodic background jobs
| Job | When | What it does |
|---|---|---|
| Voice rebuild | every `STYLE_REBUILD_EVERY` (20) new samples | recompute `VoiceProfile`, recency-weighted |
| Reflections | every `REFLECT_EVERY` (10) new self facts | 3–5 insights as `reflection` facts with `DERIVED_FROM` edges; strictest disclosure among supporters |
| Re-confirm | facts with `isCurrent` older than `CURRENT_FACT_TTL_DAYS` (180) | inbox question: "Still learning guitar?" |
| Concept cleanup | nightly | merge unverified duplicate concepts, add aliases |
| Notes archive | daily | TTL clean-up of closed matches' raw notes and messages |

### Stage 9 — Deletion
- **Fact delete:** a tombstone, so it never returns on rebuild.
- **Account delete:**
  - remove all their `KgFact`s, voice data, decisions, likes, messages and inbox items
  - remove notes **about** them written by others
  - anonymise their side of matches

---

## 5. How the graph is shown (hub layout)
- Centre: the user.
- 8 hubs: **Who I am · Likes · Dislikes · Values & lifestyle · Goals · Stories · Opinions & humour · How I text**.
- Each hub links to its fact nodes. Node size is `max(importance, strength)`; opacity is confidence.
- Traits are not shown.
- The **"How I text" hub** shows readable style nodes generated from `VoiceProfile`, each correctable:
  - "Mixes Hindi & English (≈35%)"
  - "Top emojis 😂🔥"
  - "Laughs: hahaha"
  - "Short replies (~8 words)"
  - "Says 'yaar' a lot"
  - "Ends chats with 'gn 👋'"
- A correction such as "I never use emojis" updates `VoiceProfile` (emoji rate set to 0, plus a never-say rule).
- **Match room:** the right panel shows **my notes** about the match (from the transcript only) growing live.

---

## 6. Scaling: built in from the start

**The core property:** every graph operation touches **one or two users' data**, never the whole user base.
- There is no global graph walk and no all-pairs comparison. Cross-user graph comparison is banned anyway.
- Per-match cost therefore stays roughly constant as the number of users grows. Total storage grows linearly.

### 6.1 What grows and how it is bounded
| Grows with | Data | Bound / fix |
|---|---|---|
| Users | self facts | capped by merge-by-concept; soft cap `MAX_SELF_FACTS` (≈ 150) with low-confidence pruning |
| Users | voice samples | keep `MAX_VOICE_SAMPLES` (≈ 200): the newest plus a diverse set (MMR by mood/language) |
| Conversations | notes, ChatEvents, agent messages | scoped by `conversationId`; summarised into `MatchDecision`; raw data TTL-archived after `NOTES_RETENTION_DAYS` (≈ 30) for closed matches |
| Vocabulary (sub-linear) | concepts | saturates; indexed by `type + name` and `aliases`; nightly duplicate merge |

### 6.2 "Do we re-check after every conversation?" No full re-scans
After each chat we process **only that chat**: two judge jobs plus compaction. Everything else is **incremental and event-driven**:
- the voice rebuild runs every 20 new samples, not every chat
- reflections run every 10 new facts
- the onboarding build runs only on submit
- no job ever scans all users

### 6.3 Embeddings (the biggest storage cost)
- **Embed concepts, not facts.** Most facts point to a shared `Concept`, so its embedding is stored **once for all users**. Only facts without a concept (stories, odd free text) get their own.
- **Store vectors as BSON binary float32** (or int8-quantised) instead of arrays of doubles, which cuts size by 2–8×. Use reduced dimensions if the embedding model supports it.
- **Never load embeddings unless needed.** Use `select: false` and projections everywhere.
- **Concept similarity search:** use an in-memory cache while there are fewer than ~5k concepts. Beyond that, switch to an Atlas Vector Search index on `Concept.embedding`. This uses 1 of M0's 3 search indexes.
- **Rough M0 budget (512 MB),** which is why 6.3 matters:
  - without these fixes, 1 user ≈ 80 facts × 8 KB embedding ≈ 640 KB, so only ~500 users fit
  - with concept-level embeddings, float32 and small dims, 1 user ≈ 30–60 KB, so ~8–10k users fit, before archiving old messages

### 6.4 Hot path (per message)
- Load my facts and `VoiceProfile` **once per conversation** into an in-process LRU cache, keyed by `userId + graphVersion`, and invalidate it on any write.
- Pre-compute fact and sample embeddings at write time; only the incoming message is embedded per turn.
- At most 2 LLM calls per message normally (perceive+observe, then generate), plus the stance check only when `mustDisagree`, plus at most 1 regeneration. The style and leak checks run in code.
- Embedding calls are batched; the rate limiter and spending cap apply (plan 03).

### 6.5 Async work: a job queue in Mongo (no Redis, free)
- A `jobs` collection with a tiny worker loop: `type`, `payload`, `status`, `runAt`, `attempts`, `lockedUntil`.
- Jobs: `buildUserGraph`, `judge`, `compactNotes`, `rebuildVoice`, `reflect`, `reconfirm`, `conceptCleanup`.
- Jobs are idempotent, retry with backoff, and run concurrency-limited so they respect the LLM rate limit.
- The same code later moves to a real queue (or Nebius Serverless Jobs) without changes.

### 6.6 Indexes (create from day one)
- `KgFact`:
  - `{subjectId, observerId, predicate, conceptId}`
  - `{subjectId, observerId, attribute}`
  - `{observerId, conversationId}`
  - TTL on archived notes
- `Profile`:
  - `gate.city, gate.gender, gate.age`
  - per-attribute `gate.values.*`
  - `2dsphere` on `gate.geo` if used
- `Message`: `{matchId, createdAt}`
- `VoiceSample`: `{userId, createdAt}`
- `Concept`: unique `{type, name}`, plus `aliases`
- `jobs`: `{status, runAt}`

### 6.7 Later, if the user count grows a lot
- Shard by `subjectId` / `userId`. Every query is already user-scoped, so this needs no redesign.
- Move concept search to Atlas Vector Search. Move jobs to a managed queue or serverless jobs.

---

## 7. Conversation engine and judge
Implement exactly as `kg-upgrade-reference.md` Phase 7, with these additions:
- `perceive` and `observe` are **one** LLM call.
- The reply language comes from `planAct`, using `VoiceProfile.language` (mix, `mirrorsLanguage`, and switch triggers such as joking) plus the language of the incoming message.
- If the other side is a human (shadow mode), the engine is the same. The human's messages are just transcript lines.
- **Information-boundary test:** a spy on DB access must prove the speaking agent and the judge never read the other user's `KgFact`, `VoiceProfile` or `VoiceSample`. Public `Profile` reads are allowed only in the trust check and the brief.

## 8. Evaluation
Implement `kg-upgrade-reference.md` Phase 9 in full, plus:
- **Language-fidelity metric:** the agent's language mix and code-switch rate vs. the user's real ones.
- **Scale test:** seed 2,000 synthetic users and report:
  - gate query latency (p50/p95)
  - per-message latency excluding LLM time
  - storage per user
  - judge queue throughput

## 9. Config
Every threshold lives in `services/kg/config.js`. These are the spec's values plus:
- `MAX_SELF_FACTS: 150`
- `MAX_VOICE_SAMPLES: 200`
- `NOTES_RETENTION_DAYS: 30`
- `VOICE_SAMPLES_ONBOARDING: 15`
- `MIN_STORIES: 4`
- `EMBED_DIMS: null` (null = model default)
