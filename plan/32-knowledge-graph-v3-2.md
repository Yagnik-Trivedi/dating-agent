# 32: Knowledge graph v3 (a real, multi-hop personal knowledge graph)

> Requested by Arya, 2026-10-21: rebuild the knowledge graph part, make it multi-hop, use the best methods available.
> It works together with plan 31 (how the agent talks). Plan 31 decides *when and how* to speak; plan 32 decides *what the agent knows and how it finds it*.
> Based on: the two research reports in this conversation, `BUG_BY_GEMINI.md` section 9 (long-term KG architecture), plan 15 (current KG), and the code as of commit `eeef8e3`.
> Everything sits behind `KG_VERSION=v2|v3`. v3 is a **superset** of v2: every v2 collection and field keeps working, so the app can switch back in one line.
> **Updated 2026-10-22** with the useful points from the team's status report (`Prelude-status-report-2026-10-22.md`) and the code on GitHub at `0d67cc8`:
> - Plan 31 H1 is built (needToAsk, profile basics, `CONVO_MODE=human`, judge `worthAsking`, audit fixes). Plan 32 builds on that code; it doesn't redo it.
> - **The whole of plan 32 is now after the hackathon.** The report's time count and the merge risk with H1's files make that the right call. Only K0's offline ontology seed may run before Oct 28, because it changes nothing at runtime.
> - New sections from the report: A6.9 (how you text: self-report beats desktop samples, separate bubbles), A6.10 (one source of truth when a profile basic is edited), and a filter for small inbox questions in A6.6.

---

## 0. Why rebuild, in one page

**What the graph is today (v2):**
- A list of facts per user (`KgFact`): "likes: trekking", "smoking: never", "story: my dad recorded his pocket".
- Shared concepts (`Concept`) with one embedding each, but **flat**: "Hampta Pass" and "Kedarkantha" are not connected to each other or to "trekking".
- Only three kinds of links (`KgEdge`): a story SUPPORTS a fact, two facts CONTRADICT, a reflection is DERIVED_FROM facts.
- Retrieval is one hop: the facts whose concept vector is closest to their message.
- Topics are "near" each other only through regex word lists (`planAct.js` `BRIDGES`) or embedding scores that sit close together for this model.

**What that causes:**
- The agent can't connect things. They say "just did Kedarkantha"; the agent doesn't know that's a Himalayan trek like the user's own Hampta Pass trip.
- The agent knows *what* the user likes but never *why*, so it can't relate on a deeper level ("trekking is how I clear my head").
- Stories are flat text. The agent can't find "the story with my sister" when they mention their own sister.
- Facts never expire or get replaced; confidence goes up by fixed steps.
- A mentor's fair criticism: "it's not really a knowledge graph".

**What v3 adds:**
1. A shared **ontology**: concepts with "is a kind of" and "is located in" links (trekking → outdoors; Kedarkantha → Himalayan trek → trekking; Manali → Himachal → India).
2. A real **personal graph**: the people, places and events in the user's life, their stories as structured episodes, and typed links between everything.
3. **Why-chains** (means-end ladders): activity → what it gives me → what I value.
4. **Time**: facts have "true from / true until"; new facts replace old ones instead of overwriting them.
5. **Evidence-based confidence** instead of fixed numbers.
6. **Multi-hop retrieval**: personalized PageRank over the user's graph plus the ontology, returning facts *and the path that explains why they're relevant*.
7. **Life areas**: the graph grouped into areas (outdoors, food, family, work...), each with a short summary.
8. An **adaptive builder** that finds gaps in the graph and asks about them.

**The rule that does not change:** nothing ever reads or walks another user's graph. Multi-hop happens inside one user's graph plus the shared ontology (which holds no user data). The other person only ever contributes what they say in the chat.

---

# Part A: The design

## A1. Methods chosen, and methods rejected

| Method | Where it comes from | Used for | Decision |
|---|---|---|---|
| Typed property graph per user | standard KG practice | people, places, events, facts, links | **use** |
| Shared ontology (DAG of concepts, IS_A / LOCATED_IN) | WordNet / Wikidata style taxonomies | multi-hop bridging, "near the topic", explainable relatedness | **use** |
| Personalized PageRank retrieval | HippoRAG (2024) | multi-hop "what in my graph is relevant to what they said" | **use** |
| Wu-Palmer similarity on the ontology | classic WordNet measure | how close two concepts are, as a number with a reason | **use** |
| Bi-temporal facts (valid time + recorded time), supersede instead of delete | Zep / Graphiti (2025) | people change; old facts stay as history | **use** |
| Episodes as raw source, graph derived from them | Graphiti, A-MEM | rebuildable graph, provenance | **use** |
| Note evolution (new memory relinks old) | A-MEM (2025) | a new story can update links of older ones | **use, light** |
| Means-end laddering | Kelly / Reynolds & Gutman (consumer research) | why-chains from activity to value | **use** |
| Reflection tree (insights citing facts) | Generative Agents (Park et al. 2023) | patterns like "plans weekends around being outdoors" | **use (already exists, extend)** |
| Community summaries | Microsoft GraphRAG (2024) | life-area summaries for "what are you like?" | **use, simplified** (life areas, not Leiden levels; graphs are small) |
| Beta-distribution confidence from evidence counts | Bayesian updating, first report section 6 | confidence and "how sure" words | **use** |
| Rule-based inference with provenance (Datalog-lite) | classic KG reasoning | transitive IS_A, weak "interested in" inferences | **use, inferred facts are only hedged** |
| Uncertainty-driven questions | first report section 5 (GATE, PEBOL) | which question to ask the user next | **use for the builder, simple version** |
| Knowledge graph embeddings (TransE, RotatE), GNNs | KG completion research | link prediction | **reject**: needs cross-user data or huge graphs; ours are ~300 nodes per user |
| Neo4j / FalkorDB | graph databases | storage | **reject**: second database, no shared transactions with Mongo, free-tier pauses, and our graphs are tiny (see `BUG_BY_GEMINI.md` section 9) |
| Python graph microservice (NetworkX) | | | **reject** as a live service (one free Render service, DB-spy boundary); Python only for offline scripts |
| LLM reasoning over the subgraph every turn (Think-on-Graph) | 2024 research | | **reject per turn** (cost, latency); allowed in offline jobs |
| Cross-user multi-hop (user → concept → other user) | Gemini's suggestion | | **forbidden** by the product's privacy design |

## A2. The data model

### A2.1 The shared ontology (no user data)

`Concept` (exists) gains:

| Field | Meaning | Example |
|---|---|---|
| `kind` | what sort of thing | `activity`, `place`, `food`, `media`, `genre`, `value`, `emotion`, `life_area`, `role`, `org`, `event_type`, `topic` |
| `broader: [ObjectId]` | IS_A, more general concepts (a DAG, several parents allowed) | Kedarkantha → [Himalayan trek]; Himalayan trek → [trekking]; trekking → [outdoors] |
| `locatedIn: [ObjectId]` | for places | Hampta Pass → [Himachal Pradesh] → [India] |
| `lifeArea` | the top-level area it belongs to | outdoors & adventure |
| `depth` | distance from its life area (computed) | 3 |
| `related: [{ id, w }]` | optional weak links that aren't IS_A | biryani ↔ Hyderabad |
| `verified` | checked by the seed script or a person | true |

**Life areas** (the top of the ontology):
outdoors & adventure, travel, food & drink, arts & media, music, sports & fitness, games & tech, work & study, money & career, family, friends & social life, home & daily routine, animals & nature, beliefs & values, wellbeing, love & relationships.

**Values** are concepts too (`kind: value`), with their own small hierarchy:
freedom → independence; growth → learning, ambition; connection → family, friendship; calm → mental space, slowing down; fun → adventure, humour; security → stability, planning; honesty; kindness; tradition.

**How it's built:**
- A seed script creates the life areas, the value tree and about 800 to 1,500 concepts common in this app's world (Indian cities and states, treks, foods, festivals, film genres, sports, college and work life), each placed under a parent. The LLM proposes in batches; a second pass checks every placement; a person spot-checks 100.
- New concepts made during onboarding or chats get a parent proposed by the LLM from a short list of candidate parents (retrieved by embedding), and the code only accepts a parent that already exists. Until then the concept hangs directly under its life area.
- The nightly `conceptCleanup` job (exists) also attaches orphans and merges duplicates.

### A2.2 The personal graph (one per user)

Nodes:

| Node | Collection | Example | Notes |
|---|---|---|---|
| **Statement** | `KgFact` (exists, extended) | likes trekking; values honesty; smoking: never; currently: exam week | the v2 fact, now a node with typed links |
| **Entity** | `KgEntity` (new) | my sister (role: sibling); "the gang" (my friend group); Surat (my hometown); Ahmedabad University; my dog Bruno | people by **role**, first name only if the user wrote it; places and orgs link to a concept |
| **Episode** | `KgEpisode` (new) | "Hampta Pass trek with Goral, 2025: stuck at the camp in rain, best maggi ever" | a structured story: when, where, who, what happened, feelings, meaning, a short tellable version |
| **Pattern** | `KgFact` predicate `reflection` (exists) | plans weekends around being outdoors | derived from 2+ nodes |
| **Behaviour** | `KgFact` predicate `behavior` (new) | deflects compliments with a joke; slow to talk about family | from scenario replies, voice samples and "I wouldn't say that" edits; read by plan 31 for pace |
| **Source** | `KgSource` (new) | the raw answer, interview turn, inbox answer, scenario reply, own chat message | everything the graph was built from, kept so the graph can be rebuilt |

Statement predicates (extended set):
`likes`, `dislikes`, `does` (habit, with frequency), `wants` (goal), `values`, `believes` (opinion, with strength), `is` (identity, trait), `has` (pet, possession, role), `knows` (skill), `avoids`, `boundary` (what not to share), `current` (a state that will change), plus the v2 ones (`lifestyle`, `goal`, `story`, `background`, `humor`, `style`, `trait`) kept as aliases.

Edges (`KgEdge`, extended; every edge has `confidence`, `evidence`, `validFrom`, `validTo`, `disclosure`):

| Edge | From → to | Meaning | Example |
|---|---|---|---|
| `ABOUT` | statement/episode → concept | what it's about | likes trekking → trekking |
| `INVOLVES` | episode → entity | who or what was part of it | Hampta trek → Goral |
| `AT` | episode → entity/concept (place) | where | Hampta trek → Hampta Pass |
| `FELT` | episode → concept (emotion) | the feeling | Hampta trek → joy, exhaustion |
| `SERVES` | statement → statement (value) | the why-chain: this gives me that | likes trekking → "clearing my head" → values calm |
| `EXAMPLE_OF` | episode → statement | a story that shows a fact | Hampta trek → likes trekking (was SUPPORTS) |
| `REFINES` | statement → statement | a more specific version | likes Himalayan treks → likes trekking |
| `RELATIONSHIP` | self → entity | how a person relates to me | self → my sister (sibling, close) |
| `LED_TO` | episode → episode | life-story order and cause | moved to Ahmedabad → joined the photography club |
| `SUPERSEDES` | statement → statement | the new one replaced the old one | "stopped guitar" → "learning guitar" |
| `CONTRADICTS` | statement ↔ statement | unresolved clash, the user decides | (exists) |
| `DERIVED_FROM` | pattern/inferred → sources | where an insight came from | (exists) |

The **self** is implicit: every node with `subjectId: me` belongs to it.

### A2.3 Time

Every statement and edge gets:
- `validFrom`, `validTo` (when it was true in the user's life; may be approximate or unknown)
- `recordedAt` (when we learned it; exists as `firstSeen`)
- `isCurrent` (exists) for things that will change: current job, current obsession, this week's exams

A newer statement about the same thing does not overwrite the older one:
- same attribute, newer source, current-type → `SUPERSEDES`, the old one gets `validTo`
- otherwise → `CONTRADICTS`, and the user resolves it in "This is you" (exists)

The agent only ever says what's valid now. The old version stays as history ("used to play guitar").

### A2.4 Confidence from evidence, not fixed numbers

Every statement keeps two counts:
- `support` (α): evidence for it, each weighted by its source (a direct answer counts more than a passing mention)
- `against` (β): contradictions, "I wouldn't say that" edits that remove it, inbox answers that deny it

`confidence = α / (α + β)`, starting from a prior per source type.
The source weights start from sensible defaults and are later learned: a source type whose facts the user often corrects gets a lower weight (first report, "learned source reliability").
The UI shows words ("sure", "fairly sure", "guessing"), never percentages.

This replaces the fixed `confidence: 0.6`, `+0.15` per confirmation and similar constants.

### A2.5 Inference (careful)

A few rules run in code, with provenance:
- IS_A is transitive in the ontology (for reasoning only, nothing stored per user).
- likes X, and X is a kind of Y, gives "probably interested in Y": an **inferred** statement, `DERIVED_FROM` X, weak confidence. The agent may hedge with it ("kind of an outdoors person I guess"), never state it as fact.
- 2+ statements about the same life area with high strength give that area a "big part of my life" flag (for the UI and summaries).
- Inferred statements take the **strictest** disclosure of their sources and never infer sensitive categories (religion, caste, health, sexuality, income), as today.

### A2.6 Life areas and summaries

- Each statement, entity and episode belongs to life areas through its concepts.
- A job writes one short summary per area that has enough nodes ("Outdoors: treks most months, Hampta Pass last year, camping with college friends"), citing node ids. It runs after a build and when an area changes a lot.
- Used for: the "This is you" map (hubs), the brief, the judge, and answers to broad questions ("so what are you like?") without loading every fact.

## A3. Multi-hop retrieval: how the agent finds what's relevant

This replaces `selectFacts()` (cosine sampling) in v3 mode.

**Inputs each turn:** their latest message(s), my last message, the current thread.

**Steps:**
1. **Find entry points.** Resolve the concepts and entities they mentioned (the existing resolver, plus my own entities' aliases: "my sister" in their message doesn't match my sister, but "trek" does match trekking). Add the concepts of my last message, with a lower weight.
2. **Build the local graph.** My nodes and edges (already in the persona cache), plus the ontology concepts they touch and their ancestors up to 3 levels.
3. **Personalized PageRank** from the entry points, about 20 iterations, with edge-type weights (ABOUT and EXAMPLE_OF strong, IS_A medium, RELATED weak, CONTRADICTS zero). This finds nodes 2 to 4 hops away that are truly connected, not just similar-sounding.
4. **Rank** the reached nodes by: PageRank score × confidence × importance × recency, keeping only what's sayable (disclosure rules, as today) and valid now.
5. **Return paths.** For each picked node, the shortest path from an entry point, written as a short reason: "Kedarkantha → Himalayan trek ← Hampta Pass ← your Hampta trek story".
6. Fall back to v2's cosine selection only when nothing was reached (for example, small talk with no concepts).

**What the reply prompt gets:** the same `[F1] likes: trekking` lines as today, plus `[E1]` episodes with their short tellable version, and a `why:` hint per item ("connects to their Kedarkantha trek"). Grounding stays exactly the same: every self-claim cites an id, checked in code.

**Cost:** zero model calls. A few milliseconds in memory per turn (about 300 personal nodes plus a few hundred ontology nodes).

**Three examples:**

*Bridging through the ontology.*
They: "just got back from Kedarkantha, legs are dead"
Entry: Kedarkantha → IS_A Himalayan trek → my episode "Hampta Pass with Goral" (ABOUT Hampta Pass, IS_A Himalayan trek).
Agent: "kedarkantha!! did hampta last year, I know that leg pain 😂"
Path stored on the message: Kedarkantha → Himalayan trek ← Hampta Pass ← episode.

*Relating through a why-chain.*
They: "running every morning is basically my therapy"
Entry: running → IS_A fitness; "therapy" → calm (value).
My graph: likes trekking SERVES "clearing my head" SERVES values calm.
Agent: "honestly same, trekking is how I clear my head"
The judge later sees a value-level overlap: both use something active to clear their head, with their quote as evidence.

*People in my life.*
They: "my sister's wedding is next month, total chaos"
Entry: role sibling + wedding (event type).
My graph: entity my sister (RELATIONSHIP sibling) ← INVOLVES ← episode "my cousin's wedding, I ended up doing all the decor".
Agent: "omg wedding season. I got stuck doing decor at my cousin's, good luck 😂"

## A4. "Near the topic" with the ontology (feeds plan 31)

Plan 31 asks "is what was just said near this topic?" for the one possible matching question, and for when to share something.

v3 answers it with the ontology instead of regex lists:
- `relatedness(a, b)` = Wu-Palmer similarity on the IS_A DAG (shared ancestor depth), boosted if a LOCATED_IN or RELATED link exists.
- "near" = relatedness at or above `KG.NEAR_MIN`, tuned on a hand-labelled set (section A9).
- The regex bridges stay as a backup for words the ontology doesn't know yet.
- Every decision has a reason (the shared ancestor), which shows in Replay.

## A5. Why-chains (means-end ladders)

**Why:** liking is shallow; values are what make two people click (Sakamoto et al. 2025 found value similarity raised trust and closeness between agents; laddering is how researchers get from habits to values).

**How they're built:**
- The extraction step (A6) pulls "because" and "so that" links out of what the user says ("I trek because it clears my head").
- The adaptive interviewer asks "why does that matter to you?" for strong likes that have no chain yet.
- A chain ends at a value concept from the ontology.

**Where they're used:**
- The agent: a share move can give the why, not just the what ("it's how I reset").
- The judge: value-level compatibility (their stated reasons vs my chains), always with their quotes.
- The "This is you" map: a likes → reason → value view the user can correct.

## A6. The builder: how the graph is made

### A6.1 Everything starts as a source

Every input is saved raw first as a `KgSource`: onboarding answers, interview turns, inbox answers, scenario replies, "your life right now", corrections, and (with consent) the user's own messages after a handoff.
The graph is derived from sources, so it can always be rebuilt with a better extractor.

### A6.2 Extraction (one mid-tier call per source, batched)

The extractor returns, for each source, with a verbatim quote for every item:
- **entities:** people (by role, plus first name only if written), places, orgs, pets, groups
- **episodes:** if the text tells something that happened: when, where, who, what, feelings, what it meant, and a 1 to 2 sentence tellable version in the user's own words
- **statements:** predicate, object, qualifiers (frequency, intensity, time, polarity), whether it's current
- **reasons:** "X because Y" / "X so that Y" pairs
- **relations:** between the above (INVOLVES, AT, LED_TO...)
- **sensitivity:** the existing sensitive-topic tag

Code then checks:
- every quote is verbatim in the source (exists today for stories; now for everything)
- every predicate and edge type is from the allowed list (anything else is dropped and logged)
- no sensitive category was inferred

### A6.3 Resolution

- **Concepts:** the existing resolver (alias, embedding, LLM tie-break), plus ontology placement for new ones (A2.1).
- **Entities inside one user:** "my sister", "didi" and "Riya" become one entity through aliases, the role, and one LLM tie-break when unsure. Never across users.
- **Statements:** the existing `factKey` merge, now adding evidence (α) instead of bumping a number.

### A6.4 Merge and time

- Same statement again → more support.
- Same attribute, different value → SUPERSEDES (newer and current-type) or CONTRADICTS (the user decides).
- User edits, tombstones and "protected sources" keep working exactly as in `planResubmit`.
- The whole write is one transaction, as today.

### A6.5 After the write (jobs, no user waiting)

- life-area summaries (A2.6)
- patterns / reflections (exists, now over statements and episodes)
- behaviour statements from scenario replies and voice samples
- inference rules (A2.5)
- **gap analysis** for the builder (A6.6)
- `graphVersion` bump (exists), so the persona cache reloads

### A6.6 Finding what to ask next (the adaptive builder)

The graph itself says what's missing:
- a life area the user marked as important (from their answers or interests) with few nodes
- a strong like with no why-chain
- a very important gate answer with no story behind it
- an entity mentioned often but never described
- a current-state statement about to expire
- (after the hackathon) a scenario where the agent answers differently each time it's sampled (first report, section 5)

Each gap becomes a candidate question, picked from the seed bank (A6.7) or written by the interviewer. The best one goes to:
- the onboarding story interview (one at a time, follow up or move on)
- the inbox ("your agent wants to know..."), at most one a day

**Not every unknown is worth a question.** The H1 test chat filed three "ask my human" items on small details ("which temple?"). A gap or a chat question becomes an inbox item only if:
- it's about a life area, a value, a strong like, or something very important to the user (a node with importance or strength at "high"), or
- the same unknown came up in two or more chats.
Small details (which temple, which café, which episode) are answered honestly in the chat ("not sure honestly") and never filed. The rule lives in `agent/askMyHuman.js` + `v3/gaps.js`, with the threshold in config.

### A6.7 The seed bank (short version)

Seeds, not a checklist. Each one fills a kind of gap.

- **Life story:** "If your life so far were a book, what would the chapters be called?" / "Tell me about a moment you felt most like yourself."
- **Daily life:** "Walk me through a normal weekday." / "What did you do last Friday night?"
- **Your life right now:** "What's keeping you busy this week?" / "Something you're looking forward to?"
- **People:** "Who are the people you see most? How would you describe each in a few words?"
- **Why-chains:** "You said you love X. What does it give you?" then "Why does that matter to you?"
- **Humour:** "Last thing that made you laugh out loud?"
- **Values in action:** "Tell me about the last real disagreement with someone close. What happened?"
- **Future as scenes:** "Picture a normal Sunday ten years from now. Who's there?"
- **Boundaries:** "Anything you'd hate an AI to bring up for you?"

### A6.8 Onboarding, end to end

1. **Core, required, ~5 min** (exists): basics, photos, prompts, values answers, 5 reply samples.
2. **Your life right now, ~1 min, suggested:** 3 quick prompts (plan 31 A9).
3. **Story interview, ~5 to 10 min, optional:** the adaptive interviewer driven by gap analysis, max 10 turns, "I'd rather not" moves on for good.
4. **Mood replies, optional** (plan 31 A9).
5. **Keep learning:** inbox questions from gap analysis, "I wouldn't say that", own chats after handoff (with consent).

### A6.9 How you text: what the user says beats what desktop typing shows

**The problem (found by the team):** someone who does onboarding on a laptop types plain, emoji-free replies. The voice profile then says "rarely uses emoji", while on the phone they use lots of emoji and send several short messages in a row. The agent copies the laptop version.

Two causes in the code:
- `computeVoiceProfile` learns everything from the typed reply samples, with no idea which device they came from.
- `burstiness` (the chance of sending 2 messages instead of 1) is the share of samples that contain a line break. Almost nobody presses Enter inside one onboarding text box, so it's near 0 for everyone, and agent replies come out as one bubble. (The scheduler already sends each message as its own bubble; the plan just almost never asks for two.)

**The fix, as part of the graph:**
1. A short "How do you usually text?" card in onboarding (taps, not typing, under 20 seconds):
   - emoji: a lot / some / rarely
   - several short messages in a row, or one longer message
   - stickers or GIFs: often / sometimes / never
   - message length: short / medium / long
   - lowercase / normal capitals
2. Saved as a `KgSource` (`kind: self_report`) and as **behaviour** statements ("sends several short messages", "uses a lot of emoji") with a high source weight.
3. `VoiceSample` gets `device: mobile | desktop`, from the browser (a touch screen and the screen width, not the user agent alone).
4. `computeVoiceProfile` blends: the self-report sets the prior; mobile samples count fully; desktop samples count less for emoji, length and bursts (they still count fully for wording, language mix and humour). Own chats after handoff, from the phone, slowly override everything.
5. If the reply step is on a desktop keyboard, a small hint: "Type like you do on your phone. Emoji picker: Win + . / Cmd + Ctrl + Space."
6. "How I text" in "This is you" shows these as chips the user can correct, and a correction is a source too.
7. Emoji choice: the agent picks from the user's own top emoji and the self-report, never an emoji copied from a sample's context (the H1 test chat produced 😞 and 🍍 that way).

Stickers and GIFs are recorded as a habit but not sent by the agent (the chat only supports text, emoji and photos).

This part is small (about 4 to 6 hours) and doesn't need the rest of v3. **It can ship before the hackathon** on the v2 graph: the card, the device flag, the blend and the bubble fix. The behaviour statements become v3 nodes later.

### A6.10 One source of truth for profile basics

**The problem (found by the team, confirmed in `routes/profile.js`):** H1 fills the public basics (kids, smoking...) from the user's onboarding answers. If the user later edits a basic on their profile, only the shown tag changes (`tagsEdited`). The onboarding answer, the gate and the graph still hold the old value. So the profile can say "doesn't smoke" while the gate and the agent think "socially".

**The fix:**
- A basic has one source of truth: the user's answer. Editing it on the profile updates the answer (section B), which writes a `KgSource` (`kind: profile_edit`), which rebuilds the statement (the old one gets SUPERSEDED, with `validTo`), the gate, and the public tag, in that order and in one job.
- The "show on my profile" switch only changes visibility, never the answer.
- A test: edit a basic → the answer, the statement, the gate and the tag all agree.

This is also small and can ship before the hackathon on the v2 graph (without the SUPERSEDES edge, which comes with v3).

## A7. Notes about a match (observer graph)

Unchanged rule: my agent's notes about them come only from the chat, each with their exact words.
New:
- Notes link to ontology concepts, so multi-hop runs over **my graph + my notes about them**, both mine.
- Their stated reasons ("it's my therapy") become note-level why-chains, so the judge can compare values.
- Nothing about them is ever stored in my self graph, and nothing of mine in theirs.

## A8. Privacy and safety

- The information boundary stays exactly as today and the DB-spy test covers the new collections (`KgEntity`, `KgEpisode`, `KgSource`).
- The ontology holds no user data: no "who likes this" queries, ever.
- Disclosure tiers on every node and edge; an edge or inferred node takes the strictest tier of what it connects; paths are filtered before they reach a prompt.
- People: roles by default. Third-party first names reach the model only if the user wrote them in an answer meant for the agent, and never in a message to a match by default (`KG.SAY_THIRD_PARTY_NAMES=false`).
- Sensitive categories are never inferred (as today). A story that touches health, family conflict or past relationships is stored with that sensitivity and never offered as a share.
- Deleting a source deletes everything derived only from it (provenance makes this exact). "Delete my data" covers all new collections.

## A9. Evaluation

| What | How | Target |
|---|---|---|
| Extraction precision | 30 hand-labelled answers from seed personas | ≥ 0.85 of items correct, 100% verbatim quotes |
| Entity resolution | 20 hand-made alias cases ("didi" = "my sister") | ≥ 0.9 |
| Ontology placement | 100 random concepts checked by a person | ≥ 0.9 correct parent |
| Multi-hop retrieval | 40 hand-labelled (their message → the fact or episode that should come up) across seed personas | recall@5 better than v2 cosine; every path makes sense |
| "Near the topic" | 60 labelled (message, topic) pairs | precision and recall better than the regex bridges |
| Grounding | `scripts/eval` unsupported self-claims | not higher than v2 |
| Persona fidelity | hidden real message test (first report section 7): can an LLM judge pick the user's real reply among agent replies? | closer to chance than v2 |
| Judge | the 20-pair eval | accuracy not lower than v2; share of value-level evidence reported |
| Cost | onboarding tokens per user, per-turn retrieval time | onboarding at most +50%; retrieval < 20 ms |
| Storage | `scripts/storage-report.js` | fits M0 for ≥ 2,500 users |

---

# Part B: Fitting it into this repo

## B1. What stays

- MongoDB on Atlas M0, one Render service, the jobs queue, transactions, `graphVersion` + the persona LRU cache.
- `KgFact` stays the statement node (new fields added, none removed). v2 readers (32 call sites) keep working.
- The concept resolver (`canonicalize.js`), int8 vectors, `planResubmit`, tombstones, user edits, contradictions UI, inbox, voice profile and samples.
- Grounding by fact ids in code, leak check, disclosure tiers, the DB spy.
- Everything plan 31 H1 built (`0d67cc8`): `needToAsk` in the brief (known from gate / profile / chat, for_you, askOnce), public profile basics with `tagsHidden` / `tagsEdited`, `CONVO_MODE=human` moves and mood, the judge's `worthAsking`, `scripts/eval/lib/convoMetrics.js`. v3 plugs into these: for example, `needToAsk` can also mark an item known from my notes about them, and "near the topic" in human-mode `planAct` switches to the ontology.

## B2. Storage and limits

Per user today: ~88 KB. v3 adds roughly:
- 20 to 40 entities, 10 to 30 episodes, 300 to 800 edges (~150 bytes each), sources (raw text, capped)
- estimate 150 to 220 KB per user → about 2,500 to 3,500 users on M0's 512 MB.

The shared ontology: 1,500 to 5,000 concepts, int8 vectors (~2 KB each) → under 12 MB.

Caps in `kg/config.js`: `MAX_SELF_NODES` 300 (statements + entities + episodes), `MAX_EDGES` 1,500, `MAX_SOURCES` 200, raw source text trimmed at 2,000 characters. The prune keeps user-edited, protected and high-confidence nodes (as `pruneToCap` does today).

New indexes: `KgEntity { subjectId, observerId }`, `KgEpisode { subjectId, observerId }`, `KgEdge { subjectId, observerId, type }` (exists), `Concept { broader }`, `Concept { lifeArea }`, `KgSource { subjectId, createdAt }`.

## B3. Libraries

Preferred: **no new dependency**. Personalized PageRank, Wu-Palmer, BFS paths and life-area grouping are each under 100 lines of plain JS on Maps.
Optional, only with the owner's approval (standing rule): `graphology` (MIT) if the code gets cleaner with it.

## B4. Files

**New models:** `server/src/models/KgEntity.js`, `KgEpisode.js`, `KgSource.js`.
**Changed models:** `Concept.js` (kind, broader, locatedIn, lifeArea, depth, related), `KgEdge.js` (new types, evidence, validFrom/validTo, disclosure, `from/to.kind` adds `entity`, `episode`), `KgFact.js` (new predicates, `support`, `against`, `validFrom`, `validTo`, `inferred`).

**New services** in `server/src/services/kg/v3/`:
- `ontology.js`: load the DAG in memory, ancestors, Wu-Palmer `relatedness()`, placement of new concepts.
- `extract.js` + `prompts/extractGraph.js`: the A6.2 extractor and its code checks.
- `entities.js`: entity resolution inside one user.
- `temporal.js`: supersede vs contradict.
- `confidence.js`: α/β updates and source weights.
- `infer.js`: the A2.5 rules.
- `retrieve.js`: entry points, local graph, personalized PageRank, ranking, paths (A3).
- `lifeAreas.js` + `prompts/lifeAreaSummary.js`: summaries (A2.6).
- `gaps.js`: gap analysis (A6.6).
- `interview.js` + `prompts/interviewer.js` + `interviewSeeds.js`: the adaptive interviewer.

**Changed services:**
- `kg/buildUserGraph.js`: sources first; v3 extraction for stories, interview and "life right now" answers; v2 path kept for `KG_VERSION=v2`.
- `kg/learning.js`: reflections over statements + episodes; `conceptCleanup` attaches parents; new jobs `lifeAreaSummaries`, `inferRules`, `gapAnalysis`.
- `persona/cache.js`: in v3 also loads entities, episodes, edges and the life-area summaries (still one cache entry per `graphVersion`).
- `persona/contextBuilder.js`: `selectContext()` uses `v3/retrieve.js` in v3 mode; `selectFacts()` stays as the fallback.
- `conversation/planAct.js` (plan 31): "near the topic" uses `ontology.relatedness()`, regex bridges as backup.
- `conversation/perceive.js`: notes link to ontology concepts; their reasons become note-level why-chains.
- `conversation/judge.js`: value-level evidence through why-chains and the ontology, still their verbatim quotes.
- `kg/graph.js` + `routes/kg.js`: the "This is you" API returns life areas, entities, episodes, why-chains and typed edges.
- `jobs/handlers.js`: register the new jobs; `services/actor.js` + DB-spy tests: the new collections.
- `routes/me.js` (delete my data), `jobs/archive.js` (TTL on observer data): include the new collections.

**Scripts:**
- `scripts/kg/seed-ontology.js`: life areas, value tree, curated concepts with parents (LLM proposes, second pass verifies, writes `verified: true` after spot-check).
- `scripts/kg/migrate-v3.js`: v2 → v3 for existing users: link facts to concepts with parents, turn v2 story facts into episodes (one extraction call each), compute α/β from existing evidence. Dry-run by default.
- `scripts/eval/kg-eval.js`: the A9 checks.
- `scripts/seed/*`: personas get episodes, entities and why-chains (convert the 38 personas once, cached like `restyle-personas.js`).

**Client:**
- "This is you" (`pages/You.jsx`, `components/Graph3D.jsx`, `lib/graph.js`): life-area hubs with summaries; episodes as cards; why-chains (likes → reason → value) the user can edit; IS_A links shown lightly; "how sure" words.
- Match room / Replay: "why your agent said this" shows the path (own user only).
- Onboarding: the story interview screen (chat-like, one question at a time) and "your life right now".

## B5. Rollout and the deadline

Updated Oct 22. Plan 30: Nebius check Oct 26, the one push Oct 27, feature freeze Oct 28, submit Oct 29.
A full v3 is about two weeks of careful work. The team's status report counts 30 to 45 hours of must-do work left before the freeze (H1-live, H2, Cloudinary, Nebius, S7, the submission), so v3 itself doesn't fit, and its files overlap with the code H1 just changed.

**Before the hackathon (only these, all on the v2 graph, none behind `KG_VERSION`):**

| Phase | What | Why now |
|---|---|---|
| **KP1** | A6.9 how you text: the self-report card, the device flag, the weighted blend, separate bubbles, own-emoji only | Fixes two problems the team reported; small; visible in the demo |
| **KP2** | A6.10 one source of truth for profile basics | H1's basics can disagree with the gate today |
| **KP3** | A6.6's filter for small inbox questions | The H1 test chat filed three trivial ones |
| **K0a** (optional) | The offline ontology seed script and the spot-check file only | Nothing changes at runtime; saves time later |

**After the hackathon:**

| Phase | What |
|---|---|
| **K0** | Schema superset, ontology in the database, `ontology.js` |
| **K1** | Sources, v3 extraction, entities, episodes, time, α/β confidence |
| **K2** | Multi-hop retrieval, ontology "near", paths in Replay |
| **K3** | Why-chains, judge value evidence, life-area summaries, "This is you" v3 |
| **K4** | Adaptive story interview + gap analysis + inbox questions |
| **K5** | Learned source weights, uncertainty-driven questions, edit learning, "which sounds more like you" tests |

**How it fits with plan 31:** H1 is built. KP1 to KP3 go next to H1-live and H2. K0 onward start from the code as it is after the hackathon, behind `KG_VERSION`.

## B6. Acceptance checks

**Unit tests** (all existing tests stay green):
- ontology: ancestors, Wu-Palmer on a small fixture DAG, placement only to existing parents, cycles rejected
- extraction checks: non-verbatim items dropped, unknown predicates or edge types dropped, sensitive inference dropped
- entities: "didi" / "my sister" / a first name merge inside one user; nothing merges across users
- time: a newer current statement supersedes; a non-current clash becomes CONTRADICTS; the agent context only gets valid-now statements
- confidence: α/β updates; an "I wouldn't say that" lowers it; words not percentages in the API
- inference: inferred statements are weak, hedged, strictest disclosure, never sensitive
- retrieval: on a fixture graph, "Kedarkantha" reaches the Hampta episode in ≤ 3 hops with the right path; a private node is never returned; with no entry points it falls back to v2
- disclosure on paths: a path through a private node is dropped
- DB spy: agents, judges and the brief never read another user's `KgEntity`, `KgEpisode`, `KgSource` or edges
- `KG_VERSION=v2` gives today's context for the same seed
- delete my data removes every new collection's documents

**Eval** (`scripts/eval/kg-eval.js` + the existing evals): every A9 row reported, v2 vs v3.

**Live:** the 6-pair set with `KG_VERSION=v3` (and plan 31's `CONVO_MODE=human`): judge accuracy not lower, unsupported claims not higher, at least one natural multi-hop share per chat on pairs that share an area, tokens and latency reported, two transcripts read by Arya and the owner.

**Also:** `api-check`, client build, 375 px and 1440 px, `smoke:browsers` on the local production build, `check-indexes`, `storage-report`, `PROGRESS.md`, committed locally, **not pushed**.

## B7. Risks

- **Time.** Two weeks of work; handled by moving K0 to K5 after the hackathon.
- **The model actually available.** PROGRESS (Oct 21) records that the current NVIDIA key gets a 404 on `MODEL_MID`, which writes every reply, the brief and graph builds. Extraction and placement quality must be measured on the model that will really run (Nebius Token Factory), not on a stand-in.
- **Source of truth docs.** `CLAUDE.md` still names plan 15 as the KG source of truth. When K0 starts, update it to point to plan 32 (and plan 15 for what v3 keeps).
- **Ontology quality.** A wrong parent makes a wrong bridge. Mitigation: verified seed set, parents only from existing concepts, the regex backup, and the "near" threshold tuned on labels.
- **Extraction cost and errors.** One call per source, batched, and verbatim checks; onboarding cost target at most +50%.
- **Seed re-run time.** The current full re-seed takes ~28 minutes on NVIDIA; v3 adds extraction, so run it incrementally (`User.seedHash` exists) and overnight.
- **Nebius switch on Oct 26.** Re-check extraction and placement quality on Token Factory models, not only NVIDIA.
- **Production data.** Real users exist since Oct 18. `migrate-v3.js` runs dry first, and the standing rule applies: stop and ask before touching real users' data.

---

# Part C: Prompts for Claude Code

Save this file as `plan/32-knowledge-graph-v3.md`.
Run the prompts in order. Each ends with a STOP.
Before the hackathon: only prompt KP. K0 to K4 are for after it.

## Prompt KP: before the hackathon (on the v2 graph)

```
Read CLAUDE.md, plan/30-final-sprint.md (standing rules), plan/31-human-conversation.md, plan/PROGRESS.md (the SH section) and plan/32-knowledge-graph-v3.md sections A6.6, A6.9, A6.10 and B5.

Do KP1, KP2 and KP3 only (plan 32 B5, "Before the hackathon"). They work on the current v2 graph; do NOT start K0 to K5 and do NOT add KG_VERSION.

Hard constraints: keep every existing check and test green (npm test was 158/158 after H1), CONVO_MODE=sn and human both keep working, the DB-spy boundary holds, prompt text only in services/prompts/*.js, numbers only in services/kg/config.js, new screens in the current Round 7 design. Commit locally after each step, never push.

KP1, how you text (A6.9):
1. The "How do you usually text?" card (emoji, several short messages vs one, stickers/GIFs, length, lowercase): taps only, in onboarding next to the reply step and in "Teach your agent more", skippable. Save it on the user (and keep it when the graph is rebuilt).
2. VoiceSample.device (mobile | desktop) from the browser (touch + screen width). A desktop-keyboard hint on the reply step with the emoji picker shortcut.
3. computeVoiceProfile: the self-report sets the prior; desktop samples count less for emoji, length and bursts, fully for wording, language and humour. Tests with a desktop-only user who reports "a lot" of emoji and "several short messages".
4. Bubbles: burstiness from the self-report (and from real own-chat bursts), not from line breaks in one text box; when plan.burst is 2, the reply is two separate messages and the scheduler's existing per-message send is used. A test that a "several short messages" user gets two bubbles at roughly their rate in a seeded run.
5. Emoji: the agent picks only from the user's own top emoji and self-report, never an emoji that appears in a sample's incoming text (the H1 run produced 😞 and 🍍).
6. "How I text" chips in "This is you" show and correct these.

KP2, one source of truth for profile basics (A6.10): editing a basic on the profile updates the section-B answer, then the self facts, the gate and the public tag, in that order, in one job. The "show on my profile" switch only changes visibility. Test: after an edit, the answer, the fact, the gate and the tag all agree.

KP3, small inbox questions (A6.6): an "ask my human" item is filed only for an unknown about a life area, a value, a strong like or something very important, or one that came up in two or more chats. Small details are answered honestly in the chat and never filed. Tests with "which temple?" (not filed) and "do you want to live abroad?" (filed when unknown and important).

Then npm test, api-check, client build, 375 px and 1440 px, smoke:browsers on the local production build. Update plan/PROGRESS.md. STOP and show me the new card on a phone width and one seeded simulated chat showing separate bubbles.
```

## Prompt K0: decisions, ontology, schema (after the hackathon)

```
Read CLAUDE.md, plan/15-knowledge-graph-final.md, plan/30-final-sprint.md (standing rules), plan/31-human-conversation.md, plan/32-knowledge-graph-v3.md and BUG_BY_GEMINI.md section 9.

Plan 32 is approved by Arya. Do Phase K0 only (plan 32 B5).

Hard constraints for all of plan 32:
- KG_VERSION=v2|v3 (default v2 until K2 is green). v3 is a SUPERSET: never remove or rename a v2 field, collection or behaviour; KG_VERSION=v2 must give today's results (prove with tests).
- Nothing reads or walks another user's graph. The ontology holds no user data and is never queried for "who has this concept". Extend the DB-spy tests to every new collection.
- No new dependency without asking me first (prefer plain JS; graphology only if I approve).
- Every LLM output: zod schema, verbatim quote checks in code, retry once, fail gracefully. Prompt text only in services/prompts/*.js. Tuning numbers only in services/kg/config.js.
- Stay inside Atlas M0, one Render service, the jobs queue and one transaction per build. Stop and ask before touching real (non-seed) users' data.

K0 steps:
1. Record plan 32 in plan/PROGRESS.md, and update CLAUDE.md so the KG source of truth is plan 32 (plan 15 for what v3 keeps). Build on the code as it is now, including everything plan 31 H1 and KP added; don't redo them.
2. Schema superset: Concept (kind, broader, locatedIn, lifeArea, depth, related, verified), KgEdge (new types, evidence, validFrom/validTo, disclosure, endpoint kinds entity/episode), KgFact (new predicates as aliases-compatible, support, against, validFrom, validTo, inferred), new KgEntity, KgEpisode, KgSource models, indexes, caps in config. Run check-indexes.
3. services/kg/v3/ontology.js: in-memory DAG, ancestors, Wu-Palmer relatedness, cycle rejection, placement only under existing concepts. Unit tests on a fixture DAG first.
4. scripts/kg/seed-ontology.js: life areas, the value tree (plan 32 A2.1), and curated concepts with parents for this app's world (Indian cities and states, treks, foods, festivals, film and music genres, sports, college and work life). LLM proposes in batches, a second pass verifies every parent, results cached so re-runs are free. Attach the existing seed concepts (scripts/seed-concepts.js) under parents.
5. Print 100 random placements to a file for my spot-check and STOP. Do not mark them verified until I approve.

npm test, api-check green. Commit locally after each step ("feat(plan-32 K0): ..."). Never push.
```

## Prompt K1: the builder

```
Read plan/32-knowledge-graph-v3.md. K0 is approved. Do Phase K1 (plan 32 A2.2 to A2.5, A6.1 to A6.5, B4 builder parts), behind KG_VERSION=v3.

Steps:
1. KgSource: every input is saved raw first (onboarding answers, inbox answers, "your life right now", interview turns later, corrections, own chats with consent). Delete my data and archive jobs include it.
2. v3/extract.js + prompts/extractGraph.js: entities, episodes (with a 1 to 2 sentence tellable version in the user's own words), statements with qualifiers, reasons, relations, sensitivity, every item with a verbatim quote. Code checks: verbatim, allowed predicates and edge types only, no sensitive inference. Batched, mid tier, reasoning off.
3. v3/entities.js: entity resolution inside one user (aliases, role, one LLM tie-break when unsure).
4. v3/temporal.js and v3/confidence.js: SUPERSEDES vs CONTRADICTS; support/against counts with source weights from config; "how sure" words in the API.
5. v3/infer.js: the A2.5 rules, with provenance and strictest disclosure.
6. buildUserGraph.js: v3 path (sources → extraction → resolution → merge/time → one transaction), v2 path unchanged. Re-submit, tombstones, user edits and contradictions must keep working: run scripts/kg-review-check.js.
7. Jobs: lifeAreaSummaries (stub ok in K1), inferRules, and the parent attachment in conceptCleanup.
8. Seed personas: convert the 38 personas once (episodes, entities, why-chains), cached by hash like restyle-personas.js. Run the incremental seed.
9. scripts/eval/kg-eval.js: extraction precision, entity resolution and ontology placement rows from A9, with the hand-label files it needs (create empty label templates and tell me how many labels each needs).

Tests for every B6 unit item in K1's scope. npm test, api-check, onboard-sample, kg-review-check, check-indexes, storage-report. Commit locally per step, never push. STOP and report: storage per user, onboarding tokens v2 vs v3, extraction precision on whatever labels exist, and anything in plan 32 you think is wrong.
```

## Prompt K2: multi-hop retrieval

```
Read plan/32-knowledge-graph-v3.md. K1 is green. Do Phase K2 (plan 32 A3, A4, A7), behind KG_VERSION=v3.

Steps:
1. persona/cache.js: in v3 also load entities, episodes, edges and life-area summaries for MY user only (same graphVersion key).
2. v3/retrieve.js: entry points (their concepts and entities, my last message at a lower weight), the local graph (my nodes + touched ontology concepts and ancestors up to 3 levels), personalized PageRank with edge-type weights from config, ranking (score × confidence × importance × recency), sayable-and-valid-now filter, shortest-path reasons. Falls back to selectFacts() when nothing is reached. No model calls.
3. persona/contextBuilder.js selectContext(): v3 uses retrieve.js; prompt lines keep the [F1] format, add [E1] episodes with their tellable version and a short "why" hint. Grounding by ids is unchanged.
4. "Near the topic" for plan 31 (planAct.js): ontology relatedness with KG.NEAR_MIN, regex bridges as backup. Tune NEAR_MIN on the labelled pairs.
5. perceive.js: notes link to ontology concepts; their stated reasons become note-level why-chains (verbatim quotes).
6. Store the chosen path on each agent message's actPlan; show "why your agent said this" in Replay and the match room to that agent's own user only. Test that no other user ever receives it.
7. kg-eval.js: the multi-hop retrieval and "near the topic" rows (v2 vs v3).

npm test, api-check, agent-check, the DB-spy tests. Then show me one local simulated chat (simulate.js, a pair that shares an outdoors area) with each agent message's retrieved items and paths, and STOP. Don't run the 6-pair live check until I say go.
```

## Prompt K3: values, judge, "This is you"

```
Read plan/32-knowledge-graph-v3.md. K2 is green. Do Phase K3 (plan 32 A2.6, A5, the judge part of A7, the client part of B4).

1. Why-chains: extraction already gives reasons; add the SERVES chain to value concepts, and a "why" share hint in the reply context.
2. Life-area summaries job (prompts/lifeAreaSummary.js), citing node ids, strictest disclosure, rebuilt only when an area changes.
3. judge.js: value-level evidence through why-chains and the ontology, still only THEIR verbatim quotes, code decides. Re-run rejudge on saved chats before and after; if accuracy drops, STOP and show me.
4. "This is you" (pages/You.jsx, Graph3D.jsx, lib/graph.js, kg/graph.js, routes/kg.js): life-area hubs with summaries, episode cards, editable why-chains, light IS_A links, "how sure" words. Current design tokens. 375 px and 1440 px.
5. Then the live 6-pair check with KG_VERSION=v3 and CONVO_MODE=human vs v2: every A9 row and B6 live item in a table, plus two transcripts.

Commit locally per step, never push, update plan/PROGRESS.md. STOP after step 5 with the table.
```

## Prompt K4 (after the hackathon): the adaptive builder

```
Read plan/32-knowledge-graph-v3.md. Do Phase K4 (A6.6 to A6.8): v3/gaps.js gap analysis, the seed bank (v3/interviewSeeds.js), the adaptive interviewer (v3/interview.js, prompts/interviewer.js, POST /api/onboarding/interview: one question at a time, follow up or move on, max 10 turns, "I'd rather not" never asked again, fast tier), the interview screen in onboarding and "Teach your agent more", and at most one gap question a day in the inbox. Every answer goes through KgSource and the v3 extractor. Tests, kg-eval before and after, never push, STOP with screens and numbers.
```
