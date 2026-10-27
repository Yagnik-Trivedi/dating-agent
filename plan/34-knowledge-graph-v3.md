# Plan 34 — Knowledge graph v3, built on the real questionnaire

**Author:** Swayam (Oct 27, 2026)
**Questionnaire this is based on:** "Twine — Every question in the app", taken from the code at commit `c900deb` (Oct 27, 2026): sign up, the basics, photos, profile prompts P1–P30, 5 compulsory replies, "Your world right now" (W, any 3 of 12), lifestyle and values (11 B questions with importance, dealbreaker and "say more"), how you usually text, Teach your agent more (e1–e15, 7 stories, a1–a20), the 14 modules (L, F, O, E, S, H, T, D, K, FA, V, R, FU, X) and interests (24 suggestions, 3 levels).
**Rule for this plan:** no new onboarding questions. Everything below is built from answers the app already collects, from the model calls that already run, and from chats.

---

## How to use this file

Save it as `plan/34-knowledge-graph-v3.md`. Then give Claude Code the prompt in Part C, one phase at a time. Every phase ends with a STOP. **Phase 0 is analysis only and changes no code.**

---

# Part A — What we're building, in plain words

Every user has a private **map of themselves**: short facts in their own words, linked together. All users share one **dictionary of things** (foods, places, shows, activities), arranged as a tree. During a chat, the agent also keeps **notes on the match**, taken only from what they said. To find something to say, the agent walks from the match's words, through the dictionary, into the user's own map. It never reads anyone else's map.

## A1. What is missing today, and what we add

| # | Missing today | What we add | Filled from (no new questions) | Why |
|---|---|---|---|---|
| 1 | The dictionary (`Concept`) is flat: "Kedarkantha", "Hampta Pass" and "trekking" are unrelated | A "kind of" tree. The top is written by the team; everything below is placed automatically | Top: the 24 interest suggestions, the module areas and the tap options (O1 mountains/beach/city, E3 genres, F5 chai/coffee, T5 dogs/cats, H4 humour). Below: Phase-2 extraction places new concepts | Lets the agent connect *their* thing to *your* thing; makes it a real knowledge graph |
| 2 | Nothing stops repetition (eval transcripts repeat one fact up to 4 times per chat) | Facts already said in a conversation are not offered again as new shares | Code only | Repetition is a main reason the agent sounds robotic |
| 3 | Stories are one blob of text | Story parts: who was there (by role), where, the feeling, a 1–2 line tellable version | The existing extraction call, over story answers (L1, L3, L4, L5, O2_2, O5, F7, H3, S6, V1, V4, V7_1, FU1) and the 7 Teach-your-agent stories | The agent can find and tell the right story briefly |
| 4 | People in the user's life don't exist in the graph | Small people nodes, **by role only** ("my sister", "the college gang") | L3_1, O2_1, L7, H2, S1, FA4, plus roles mentioned in stories | "My sister's wedding is next week" can find the user's own sister story |
| 5 | Likes have no "why" | Reasons linked to a small fixed list of values (calm, freedom, fun, growth, connection, security, honesty, kindness, tradition) | V8 (why-chains), O6_3, E1_1, K3, K4_1, "because…" inside any answer | Value-level overlap is stronger compatibility evidence than shared hobbies; gives the agent deeper things to say |
| 6 | New answers overwrite old ones; no history | `validFrom` / `validTo`; a re-answer **supersedes** the old fact and keeps it as history | The "expires after 30 days and is asked again" questions (W1–W6, W10, W11, E2, L6, L8, S6, D7, K7) and edits | People change; the agent says what is true now and can say "was hooked on X last month" |
| 7 | Confidence is a fixed number that only goes up | Evidence counts: `support` and `against` | Chats, inbox answers, "I wouldn't say that", contradictions | The agent hedges when unsure and learns from corrections |
| 8 | Reply examples are picked by topic similarity only | Pick examples by the **chat's current mood** | Already collected: e1–e15 and X1–X12 carry a mood (`low_effort`, `tease`, `closing`, `flirty`, `venting`, `tired`, …) | The biggest single fix for "robotic": when the match goes dry or flirty, the agent copies the user's own reply in that mood |
| 9 | Conflict / support answers aren't used live | Behaviour rules the agent reads during the chat | B `conflict`, B `alone_time`, V2 + V2_1 ("what actually helps"), D2 (comfort on a bad day), X4 (venting reply) | Empathy and push-back that match the user, not a generic bot |
| 10 | Notes about the match are flat | Notes link to dictionary concepts and carry session + day; their stated reasons map to the same values | The existing perceive step | Overlaps found reliably; the day-3 agent remembers day 1; the judge compares values |
| 11 | Unknowns are lost | A **gap** record: what was asked, how often, which area | The existing "ask my human" step (KP3 held items) | The inbox asks the questions chats actually need; the agent stops repeating "not sure" |
| 12 | Locked / judge-only facts are kept out by labels only | A hard **fence**: the walk never passes through a node that isn't sayable now | Code only | Privacy holds even as the graph gets more connected |
| 13 | Inside jokes from a chat are forgotten | **Shared moments** saved on the conversation and reused as callbacks in later sessions | The chat itself | Humans call back to earlier jokes all the time |
| 14 | No notion of the user's favourite topics | **Top topics** (at most 5) | Interests at level "Obsessed", W4 ("obsessed with lately"), P12 "I geek out on", P22 "I won't shut up about", how much the user wrote | The agent leans into what the user loves talking about |
| 15 | R8 ("anything you'd hate an AI to bring up") is stored but not enforced as a rule | Boundaries: R8 + "I wouldn't say that" + hidden facts become a do-not-raise list, used as behaviour rules only (never as text in a prompt another user sees) | Already collected | Trust |

## A2. The user's map (shape)

* **Facts** (`KgFact`, `observerId: null`), as today, plus: `validFrom`, `validTo`, `support`, `against`, and `storyParts { who: [entityId], where: conceptId, feeling, tellable }` on story facts.
* **People** (`KgEntity`, new, small): `{ subjectId, role, label, aliases }`. A first name only if the user wrote it; never said to a match by default; anything about exes is `private`. Never matched across users.
* **Values**: shared value concepts (`Concept.kind: 'value'`).
* **Links** (`KgEdge`), all inside one user's map: existing `SUPPORTS`, `CONTRADICTS`, `DERIVED_FROM`, `BRANCH_OF`, `WHY`, `ASSOCIATED`; new `INVOLVES` (story → person) and `SUPERSEDES` (new fact → old fact).
* **The dictionary** (`Concept`): new `kind`, `broader: [conceptId]` (several parents allowed, no cycles), `lifeArea`, `depth`. Words only; never queried for "who likes X".
* **On the conversation**: `moments: [{ text, quote, messageId, session }]`.
* **On the user**: `topTopics: [conceptId]`.

## A3. How the agent finds things each turn (code only, no model call)

1. **Find what they mentioned:** match their message against dictionary names and aliases (Hinglish spellings included); embeddings only as a second try.
2. **Walk:** from those concepts, up the tree at most 2 levels, then down into the user's facts and stories, plus the existing branch links (`branchNeighbours`).
3. **Score:** the walk blended with today's similarity score, × confidence × recency, boosted for top topics.
4. **Filter:** the fence (§A1 #12), the session's depth tier (plan 33), valid now, not already said in this conversation.
5. **Hand over** the fact plus a short reason ("connects to their Kedarkantha trek").
6. Nothing reached (small talk): today's selection.

---

# Part B — Hard rules for every phase

* Read `CLAUDE.md`, `plan/PROGRESS.md`, `plan/33.1-handoff.md`, `plan/33-questions-brain-long-chats.md` and `plan/32-knowledge-graph-v3-2.md` first. Build on the code as it is at `c900deb` or later; don't redo what plan 33 built.
* **Superset only.** Never remove or rename a field, collection, predicate, edge type or API field. Old data must keep working.
* **Behind a switch.** Every runtime change (retrieval walk, mood exemplars, behaviour rules, supersede) sits behind an env flag in `config/env.js` (e.g. `KG_V3=off|on`, default `off`) until its phase is approved. `KG_V3=off` must give today's behaviour exactly: prove it with tests.
* **Nothing crosses between users.** The DB-access spy test must cover every new collection and field. The dictionary never answers "who has this concept".
* **No new onboarding questions.** No new screens in onboarding.
* No new dependency without asking. Prompt text only in `services/prompts/*.js`. Numbers only in `services/kg/config.js`. Every LLM output: zod schema, verbatim-quote check in code, retry once, fail gracefully.
* **No extra model calls per chat message.** Extraction additions go into the calls that already run (one per module build, one per story).
* **Real users:** 9 real accounts exist on Atlas. Any data migration runs as a dry run first, writes a report, and **stops for the owner's OK**. Never run a local worker against Atlas.
* Commit locally after each phase (`feat(plan-34 K<n>): …`). **Never push.**

---

# Part C — The prompts for Claude Code

## Prompt K0 — Impact and conflict analysis (no code changes)

```
Read CLAUDE.md, plan/PROGRESS.md, plan/33.1-handoff.md, plan/32-knowledge-graph-v3-2.md,
plan/33-questions-brain-long-chats.md, BUG_BY_GEMINI.md and plan/34-knowledge-graph-v3.md (this plan).

This phase is ANALYSIS ONLY. Do not change any code, schema or data.

The repo is now large and the knowledge graph is read in many places. Before anything is built, find
every place each change in plan 34 Part A could conflict with existing code, data or behaviour.

For EACH of the 15 changes in Part A §A1, report:
1. Every file and function that reads or writes what it touches (grep for the field, model and helper
   names; give call-site counts).
2. What could break or behave differently, and in which mode (CONVO_MODE=human and sn, CHAT_DEPTH
   full/demo/short).
3. Which existing tests encode the current behaviour and would need to change.
4. Whether existing data (seed and the 9 real accounts) needs a migration, and how risky it is.
5. Whether it overlaps something that already exists and should be EXTENDED instead of added
   (no parallel structures).
6. Your recommendation: build as written, build differently (say how), or drop.

Check these specific risks and answer each one explicitly:
- Fact identity: factKey() uses slot / conceptId. Do story parts, people, SUPERSEDES or history facts
  collide with it, with tombstones (KgTombstone), with planResubmit() deletes, or with userEdited facts?
- pruneToCap (MAX_SELF_FACTS 320): would superseded history facts count toward the cap and push out
  real facts? Note that module answers (source questionnaire_module) are not protected today.
- KgEdge readers that assume both ends are facts: graph.js (brainLinks), the persona cache's link map,
  the DELETE /kg/facts route, buildModule's delete-all-ASSOCIATED step. What breaks with an
  `entity` endpoint or new edge types?
- conceptCleanup merges unverified concepts by cosine >= T_HIGH. Could it merge a parent into its child
  ("trekking" into "Himalayan trek"), create a cycle, or leave `broader` pointing at a merged concept?
  The in-memory concept cache in canonicalize.js: what must reset when the tree changes?
- Confidence: who reads `confidence` today (decayed() in graph.js, selectFacts weights, pruneToCap
  rank, judge thresholds JUDGE_KEY_*, the client's CONF_WORD)? What changes if it becomes
  support / (support + against)?
- Retrieval: how would a walk fit next to selectFacts(), branchNeighbours(), the plan-33 session tier
  filter, isHedged / [not sure], askMyHuman topic resolution and the leak check (T_LEAK)? What must stay
  identical when KG_V3=off?
- Repetition: the engine already has usedFactIds (BUG_BY_GEMINI §4 says it's built before sentence
  drops). Reuse and fix it rather than adding a second list?
- Mood: perceive returns moods (chill, playful, excited, tired, busy, down, serious, flirty, curious,
  bored); voice samples carry different mood names (greeting, curious, opinion, plan, disagree, casual,
  apologetic, tease, excited, closing, long_reply, tired, low_effort, venting, flirty, busy, unsure,
  self_deprecating, story, big_question, thinking). Propose the mapping table and list the gaps.
- Behaviour rules from conflict / alone_time / V2_1 / D2: do they clash with mustDisagree, the stance
  check (STANCE_HOLD), MOOD_MATCH in planAct or the texture moves (think, not_sure)?
- Profile prompts P1–P30: are the user's OWN prompt answers in their graph today? If they become facts:
  P10 "Two truths and a lie" contains a deliberate lie and must never be extracted; P9, P15, P20 and P26
  may duplicate B or R answers; prompts are already public. How to dedupe?
- Interests (24 suggestions, Casual / Into it / Obsessed): where are they stored, and are they in the
  graph today? Can the level map to strength without breaking Profile.tags readers?
- Story aliases (C.sunday → W9, C.hill → T2, …, ALIASES in questionBank.js): could story parts or
  people be extracted twice from an old answer and its module twin?
- R8 ("anything you'd hate an AI to bring up") is private: confirm it never reaches a prompt as text,
  and how a do-not-raise rule can be built from it the way privateGuidance() works today.
- Judge: how would value-level positives fit evidence.js (tierOf / branchOf), the plan-33 SESSION_BAR
  and judgeDecision.js without changing today's verdicts when KG_V3=off?
- Privacy: list every new read path; confirm none reads another user's KgFact, KgEdge, KgEntity,
  VoiceProfile, VoiceSample or gap records. What must be added to the DB-spy whitelist test?
- Client: which fields do lib/graph.js, Graph3D.jsx and the Brain tab in You.jsx read from GET /kg/me?
  Is the planned API a strict superset?
- Cost and storage: extra tokens per module build from the larger extraction output; bytes per user
  for the new fields, edges, entities and history; does it still fit Atlas M0 (scripts/storage-report.js)?
- Known traps from 33.1-handoff: circular imports (judge.js <-> sessionJudge.js, scheduler.js <->
  sessionFlow.js), Windows CRLF, two workers on one queue.

Also list anything in plan 34 you think is wrong or unnecessary for this repo, and anything missing.

Write the result to plan/34-impact-report.md: one section per change, plus a summary table
(change · files touched · risk low/med/high · migration yes/no · recommendation), and a proposed
build order. Commit it locally. STOP and wait for the owner to approve or edit the plan.
```

## Prompt K1 — Schema superset (no behaviour change)

```
plan/34-impact-report.md is approved (apply the owner's edits to it first). Do Phase K1 only.

Add, as optional fields only (superset; nothing removed or renamed):
- KgFact: validFrom, validTo, support, against, storyParts { who, where, feeling, tellable }.
- KgEdge: types INVOLVES and SUPERSEDES; endpoint kind 'entity'.
- Concept: kind, broader [ObjectId], lifeArea, depth. Map the existing `type` to `kind`.
- New model KgEntity { subjectId, observerId, role, label, aliases, disclosure }.
- Conversation.moments [{ text, quote, messageId, session }].
- User.topTopics [ObjectId].
- Gap fields on the existing held "ask my human" items (extend InboxItem / KP3; no parallel collection
  unless the impact report said otherwise).
- KG_V3 flag in config/env.js (default off) and every new number in services/kg/config.js.

Update every reader the impact report flagged so the new edge types and endpoint kinds can't break it.
Extend the DB-spy test to KgEntity and the gap records. Include the new collections in "delete my data"
(services/account.js) and in the archive job.

npm test (all existing tests green, unchanged), api-check, check-indexes, storage-report.
Commit locally. STOP and report.
```

## Prompt K2 — The dictionary tree

```
K1 is approved. Do Phase K2.

1. services/kg/ontology.js: load the concept tree in memory; ancestors(); relatedness() from the shared
   parent's depth; reject cycles; place a concept only under an EXISTING concept.
2. The top of the tree, written in code (no model): the life areas used by the question bank's modules
   and core values (MODULES[].area, CORE_VALUES[].area), the 24 interest suggestions, and the tap options that are things (O1, E3, F5, T5, H4) placed
   under them. Values as kind 'value' with the fixed list in plan 34 §A1 #5.
3. scripts/kg/place-concepts.js: place every existing concept under the tree. The model proposes a
   parent from a short candidate list (by embedding); code accepts only an existing concept. Results
   cached so re-runs are free. Dry run by default.
4. conceptCleanup (learning.js): attach orphans; never merge a concept into its own ancestor or
   descendant; re-point `broader` when a concept is merged; reset the concept cache.
5. Unit tests: ancestors, relatedness on a fixture tree, cycle rejection, placement only under existing
   concepts, cleanup never merges parent and child.

Print 100 random placements to plan/34-placements-sample.md for the owner's spot-check.
Commit locally. STOP. Don't mark anything verified until the owner approves.
```

## Prompt K3 — Reading answers better (same calls, more output)

```
K2 is approved. Do Phase K3, behind KG_V3=on.

Extend the extraction prompts that already run (prompts/extractModuleFacts.js and
prompts/extractStoryFacts.js; one call each, as today) so each call also returns:
- story parts (who by role, where, feeling, a 1–2 line tellable version in the user's own words)
- people by role (never a name the user didn't write)
- reasons ("X because Y"), each mapped to one value from the fixed list
- a parent for each new concept, chosen only from the candidate list given in the prompt
Every item must quote the answer verbatim; code drops anything that doesn't.

Code rules:
- Never extract facts from P10 "Two truths and a lie".
- Old story answers and their module twins (ALIASES) are extracted once.
- People resolve inside one user only (role + aliases); nothing is ever matched across users.
- Map V8, O6_3, E1_1, K3 and K4_1 answers to values with WHY edges.
- Work out User.topTopics from interests at "Obsessed", W4, P12, P22 and answer length.
- Turn R8 + hidden facts into do-not-raise topics, stored privately, used only as behaviour rules.

Measure: tokens per module build before and after; extraction precision on 20 real answers the owner
picks (print them with what was extracted). npm test, api-check, onboard-sample on a local DB.
Commit locally. STOP and report.
```

## Prompt K4 — Time and confidence

```
K3 is approved. Do Phase K4, behind KG_V3=on.

1. Supersede instead of overwrite: when a question that "expires after 30 days" (or any answer) is
   re-answered, the old fact gets validTo and a SUPERSEDES edge to the new one. Work it into
   buildModule, buildUserGraph's planResubmit, the inbox re-check flow and reconfirm. Tombstones and
   userEdited facts behave exactly as today. History facts don't count toward MAX_SELF_FACTS (or have
   their own small cap, as the impact report decided).
2. support / against: priors per source in config.js; restated in a chat or inbox → support; "I
   wouldn't say that", a denying inbox answer or a contradiction → against. Keep a `confidence` value
   in sync for every existing reader. "How sure" stays words in the UI.
3. The agent context only gets facts valid now.

Tests: re-answer W4 → only the new fact is sayable, the old one is history; tombstoned facts never come
back; confidence goes down after "I wouldn't say that". KG_V3=off unchanged. Commit locally. STOP.
```

## Prompt K5 — Using it in chats

```
K4 is approved. Do Phase K5, behind KG_V3=on. No extra model call per message.

1. Retrieval walk in persona/contextBuilder.js (plan 34 §A3): alias match first (reuse the dictionary
   n-gram matcher askMyHuman already uses), walk up at most 2 levels then down into my facts, blend
   with today's score, boost top topics, then the fence, the session tier filter, valid-now and
   already-said filters. selectFacts() stays the fallback and stays identical when KG_V3=off.
2. The fence: no path through a node that isn't sayable now (private, locked if_asked not unlocked this
   turn, judge-only, do-not-raise). Derived items take the strictest disclosure.
3. Repetition: fix and reuse usedFactIds so a fact already shared isn't offered again as a new share
   (it may still answer a direct question).
4. Mood exemplars: selectExemplars() picks by the chat's mood first (the mapping table from K0), then
   by topic.
5. Behaviour rules: when the match is down or venting, the move follows the user's own answers (B
   conflict, alone_time, V2_1, D2, their X4 reply); when the match pushes back, B conflict decides
   whether to engage, soften or let it go. Must not break mustDisagree or the stance check.
6. Gaps: askMyHuman records each unknown as a gap (topic, area, times asked); after the first "not
   sure" on a topic in a chat, the agent moves to something it knows. The inbox asks the most-asked
   gap first, at most one a day.
7. Shared moments: perceive marks a callback-worthy moment (a joke both sides laughed at, a running
   tease); saved to Conversation.moments; plan 33's callback move may use one in a later session.

Tests: "just did Kedarkantha" reaches a fixture user's Hampta fact through the tree; a path through a
locked fact is dropped; in a seeded simulated chat no fact is shared twice as a new share; a dry
"lol ok" picks the user's X3 reply as the example; the DB spy shows no cross-user read.
npm test, api-check, agent-check. Commit locally. STOP and show the owner one local simulated chat
with each agent message's retrieved items and their reasons.
```

## Prompt K6 — The match side and the judge

```
K5 is approved. Do Phase K6, behind KG_V3=on.

1. Notes about the match (KgFact with observerId = me): link to dictionary concepts; store the session
   number and day; the match's stated reasons map to the same value list.
2. Judge: a value-level positive when the match's own words show the same value as one of my reasons
   (still their verbatim quote, still decided in code). Re-run scripts/eval/rejudge.js on saved chats
   before and after; if accuracy drops, STOP and show me.
3. "This is you": add story cards, people (by role), likes → reason → value, superseded history and
   "how sure" words, as a strict superset of GET /kg/me. 375 px and 1440 px.

npm test, api-check, client build, smoke:browsers on a local production build. Commit locally. STOP.
```

## Prompt K7 — Measure and report

```
Do Phase K7. Compare KG_V3=off vs on, on a local DB only (no demo chats on Atlas):
- retrieval: 40 owner-labelled (their message → the fact that should come up) pairs, recall@5
- repetition: a fact shared twice as a new share, per chat
- grounding: unsupported self-claims (scripts/eval)
- human-likeness: the real-vs-agent test (eval/labels/real-vs-agent.csv)
- judge accuracy on the saved chats
- tokens per onboarding / module build, retrieval time per turn (target < 20 ms), storage per user
Write plan/34-results.md and update plan/PROGRESS.md. Commit locally. Never push. STOP.
```
