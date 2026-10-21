# Gemini's audit report, Claude's check against the code, and the agreed fixes

Reference notes. Covers the whole review from 2026-10-20: Gemini's "Engineering Report: Prelude" (and the
24-page Gemini chat it came from), Claude's review of it against the real code, and four rounds of back-and-forth.
**Nothing here is implemented yet.** Line numbers are from the working tree on 2026-10-20.

Context: Gemini wrote its report from `KG.md`, `DA.md` and the bundled UI HTML, not from the code. Several claims were
wrong once checked against `server/src`. Everything below marked **confirmed** was read in the code.

---

## 1. Final patch list (agreed order)

| # | Change | Where | Status |
|---|---|---|---|
| 1 | Judge accounts skip the daily chat cap (`isJudge`) + a test; raise the env cap to 4–5 for judges who sign up themselves | `services/pipeline/index.js` | confirmed bug |
| 2b | `isQuestion` in merged mode, using the existing `contextBuilder.isQuestion` over their whole turn | `services/conversation/engine.js` | confirmed bug |
| 2c | Orphaned question → constrained regeneration; a steering turn needs a substantive sentence | `engine.js` (+ helper) | confirmed bug |
| 3 | Compute `heardAttrs` before `planAct` | `engine.js` | confirmed bug |
| 4 | Count only what was actually sent: `toldStoryIds`, `usedFactIds`, `topicTries` | `engine.js` | confirmed bug |
| 2a | Gate-settled agenda items (from `profile.gate.dealbreakers`, kept in the agenda as `answered`; `openMustAsk` skips them only while still answered) | `services/brief/buildBrief.js`, `services/conversation/planAct.js` | design change, measure |
| M | New metric `unbridgedQuestionRate`; run on the saved `eval/raw-*.json` first for a baseline | `scripts/eval/metrics.js` | new |

Then: eval before/after on the **same pairs and seeds**, run 2a twice, don't read a ±1-pair change as signal
(17 non-fake pairs → one pair ≈ 6 points).

Later, only after the numbers: concept taxonomy (IS_A edges) for bridging; evidence-weighted claims (section 6).

**Open decisions for the owner:** (a) does this go before or after plan 30 S4 (email verification)? It fits S5's
"eval follow-ups". (b) OK for an eval run to decide whether 2a ships?

---

## 2. Confirmed bugs and fixes

### 1. Judge accounts hit the daily chat cap
- **Where:** `services/pipeline/index.js` `overDailyChats()` (~line 114) filters only `isSeed: { $ne: true }`.
  `scripts/seed/judges.js:32` creates judges with `isJudge: true, isSeed: false`, so pre-baked judge accounts are capped
  at `JUDGE_LIVE_CHATS_PER_DAY` (default 2) and the 3rd match becomes "your agent will start this chat tomorrow".
- **Fix:**
  ```js
  for (const u of await User.find(
    { _id: { $in: match.users }, isSeed: { $ne: true }, isJudge: { $ne: true } }, { _id: 1 }).lean()) {
  ```
  Plus a test (judge account starts a 3rd chat the same day). For Devpost judges who sign up with their own email: set
  `JUDGE_LIVE_CHATS_PER_DAY` to 4–5 in Render's env (no code change).
- **Rejected:** Gemini's `HACKATHON_MODE=true` global bypass and raising the cap to 15. Any visitor could burn credits
  (~101k tokens per chat pair); `LLM_HARD_CAP_USD` is a backstop, not a plan.

### 2b. Merged mode never halves the ask-back floor
- **Where:** `planAct.js:64` halves `ASK_BACK_FLOOR` when `perception.isQuestion`. In the default
  `AGENT_TURN_MODE=merged`, `engine.js` (~line 118) builds perception as only `{ language, aboutMeQuestion }`, so
  `isQuestion` is always undefined and the floor stays 0.7 even when they just asked us something → both agents keep
  asking questions (ping-pong).
- **Fix:** reuse the existing detector over every message in their turn (bursts included):
  ```js
  import { isQuestion } from '../persona/contextBuilder.js';
  perception = { …, isQuestion: isQuestion(theirMsgs.map((m) => m.text).join('\n')) };
  ```
  A false positive only halves the floor for one turn, so a broad detector is fine here.
- **Rejected:** Claude's first version `/\?\s*$/.test(lastText)` (misses "…? 😄" and the first bubble of a burst);
  Gemini's new regex (`how|when|where|kya` flags "when I was in Manali"; a third detector is unnecessary).
- Related, minor: in merged mode `interest` is also updated after `planAct`, so it lags one turn.

### 2c. Orphaned question after the bridge sentence is dropped
- **Where:** `engine.js` `AGENT_REGEN=lean` early break (~line 183): if ≥ 3 words survive the grounding drops, no
  regeneration. "By the way, do you smoke?" is 5 words, so it is sent alone after its bridge sentence was dropped.
- **Fix:** treat "only questions survived" as nothing surviving, so the existing constrained regeneration (short
  reaction to their last message) runs:
  ```js
  const isQ = (s) => s.trim().endsWith('?') || INTERROGATIVE.test(s);
  const substantive = (s) => !isQ(s) && contentWords(s).length >= 2;
  const orphaned = (kept, dropped) => dropped.length > 0 && kept.length > 0 && !kept.some(substantive);
  // in the lean early-break condition: && !orphaned(keptSentences, c.grounding.drop)
  // in survivors(): if (orphaned(keptSentences, [...drop])) messages = []
  ```
  Also: on a steering turn (`plan.topic.kind === 'agenda'`), a draft with no substantive sentence is a hard style
  problem (uses the one allowed regeneration). Measure how often first.
- Note: `sentencesOf` already drops emoji-only pieces, so "do you smoke? 👀" → `["do you smoke?"]`; the content-based
  test covers "do you smoke? 😄 lol".
- **Rejected:** Gemini's "never drop the first sentence" (would send unsupported claims about the user) and "zero
  citations = unbridged" (reactions are deliberately citation-free: `REACTION`/`HONEST` in `groundingCheck`).

### 3. Re-asking what they just answered (`heardAttrs` lags a turn)
- **Where:** `engine.js:272` computes `heardAttrs` from `theirMsgs` only in `save()`, after `planAct` ran. In **both**
  modes, `openMustAsk` and the near-end rule can pick the attribute answered in the very message being replied to.
  In merged mode the agenda `status` update also lags a turn (split mode updates it before `freshAgenda` is read).
- **Fix:** `attributesIn` is pure; compute `heardAttrs` from `theirMsgs` before `planAct` and pass it in via `state`.

### 4. Things counted as said when they weren't sent
- **`toldStoryIds`** (`engine.js:263`): `told = plan.topic?.kind === 'story' ? [plan.topic.id] : []`. A story is marked
  told when *planned*; if its sentence is dropped or the turn falls back, it can't be told again in this chat.
- **`usedFactIds`** (`engine.js:262`): built from `best.draft.claims` before sentence drops, so a message can list facts
  whose sentences were cut.
- **`topicTries`** (`engine.js:268`): incremented whenever `plan.topic` is an agenda item, even if the sent text never
  raised it. Two dropped tries use up `STEER_TRIES`. (Dealbreakers and priority ≥ 0.9 items are unaffected:
  `openMustAsk` and the near-end rule ignore tries; only mid-priority retries are lost.)
- **Fix:** keep only claims covered by surviving sentences (`covers(c.text, s)` exists); mark a story told only if
  its id is among them; count a try only if `attributesIn(sentText)` contains the item's attribute (or, for
  non-attribute topics, the sent text overlaps its words).
- Not a bug: `askedAttrs` (`engine.js:271`) is already built from the final sent `messages`.

---

## 3. The root cause of the "interrogation" (fix 2a)

`services/match/gate.js:56`: *"My dealbreakers vs their values (no answer = mismatch)."* If two people matched, every
dealbreaker on a gate attribute (smoking, drinking, kids…) is **already settled in code** with an accepted answer.
Yet `buildAgenda` (`buildBrief.js:37`) puts those dealbreakers first at priority 1, and `openMustAsk`
(`planAct.js:11`) forces a direct question on each before a natural end. With 14-message chats (~7 turns per agent),
that's ~3 turns of "do you smoke?" whose answer the code already knows. Situational wording only polishes a needless
question.

**Fix (uses only MY profile, so the information boundary is untouched):**
```js
// buildBrief.js: buildAgenda({ self, clarify, gateSettled = new Set() })
//   gateSettled = my profile.gate.dealbreakers that are GATE_ATTRIBUTES (the match exists ⇒ they passed)
if (f.isDealbreaker) add(TOPICS[f.attribute] ?? f.attribute, WHY.dealbreaker, 1, {
  dealbreaker: true, attribute: f.attribute,
  ...(gateSettled.has(f.attribute) && { status: 'answered', settledBy: 'gate' }) });
// final map: status: a.status ?? 'open', settledBy: a.settledBy   (today it hard-codes 'open')

// planAct.js openMustAsk: skip only while still settled (a dealbreaker_hint reopen must still be followed up)
agenda.filter((a) => !(a.settledBy === 'gate' && a.status === 'answered') && (a.dealbreaker || a.priority >= KG.ASK_EXPLICIT_PRIORITY) && …)
```

**Invariants (each found in review):**
- Keep gate-settled items **in** the agenda array (appended, outside the `AGENDA_SIZE` cap). `judge.js:158–160` builds
  `settledAttrs` from agenda items with `status === 'answered'` and turns every other dealbreaker into a severity-2
  "You never found out where they stand on …" friction. Cutting the items would penalize every chat.
- Build `gateSettled` from `profile.gate.dealbreakers` — the same source `judge.js` uses for `dealbreakers` — not from
  `isDealbreaker` facts, so the two sets can't drift.
- `services/conversation/perceive.js:131–133` reopens an item on the first `dealbreaker_hint` (status `open`, `topicTries` reset). The
  `openMustAsk` filter must not block that, hence "only while `status === 'answered'`".
- Upside: `engine.js:60` `agendaSettled` needs dealbreakers `answered`, so gate-settled items let chats end naturally
  from message 12. The room's agenda panel can show "Smoking: settled before you matched".

**Risk to measure:** today "nah I don't smoke" in their words is a verified key positive on a dealbreaker fact
(`judgeDecision.js:19` counts dealbreakers as key). After 2a those positives disappear → possibly more "unsure", our
weakest outcome. No pre-emptive judge change; measure with `rejudge`/eval, and only then revisit `JUDGE_YES_POSITIVES`.

**Then, only if still needed (2d, config only):** `STEER_AFTER_TURNS` 1 → 2, a new `KG.STEER_EVERY` (every third turn
instead of every other), `ASK_BACK_FLOOR` 0.7 → ~0.5. Measured ask-back rate in S1 evals was 0.58.

---

## 4. The new metric (M)

**unbridgedQuestionRate** = agent messages where
`hasQuestion && (!hasSubstantive || sim(nonQuestionText, theirTurn) < T)` ÷ agent messages.

- `hasSubstantive`: a non-question sentence with ≥ 2 content words.
- `sim`: embedding cosine of the agent message's **non-question sentences only** vs the other side's messages since
  the agent's last turn. (Embedding the whole message would let the steered question drag the score down; exact word
  overlap misses "toes" ↔ "feet".)
- Calibrate `T` by hand-labelling ~30 turns from `eval/raw-s1-*.json`. Embeddings are cached, so re-runs are cheap.
- Rejected variants: requiring zero `[F#]`/`[N#]` citations (stored messages don't contain the tags; reactions are
  citation-free); all-AND (misses "i love filter coffee! do you want kids?" after a trekking story).

Report next to: `steered` (already in `metrics.js:94`), verdict accuracy, harmful swaps, judge-yes rate, fallback rate.

---

## 5. Gemini claims checked and rejected (do not implement)

| Gemini claim | Why not |
|---|---|
| Nebius URL `https://api.studio.nebius.ai/v1/` | Old AI Studio URL. Plan 14 has `https://api.tokenfactory.nebius.com/v1/`. |
| Live check: selfie mirroring breaks turn_left/right | Already handled: `liveCheck/decide.js:11` `EXPECTED_FACING` uses `image_left`/`image_right` and the prompt says camera point of view. |
| Live check: pass if the vision model fails/times out | Security hole (anyone who makes the model time out gets "Live-checked") and breaks "code decides, model required". Keep browse-only + "try again later". |
| Live check: raise frame cap 120 → 350 KB, lower `upDeg` 15 → 9, `turnDeg` 20 → 14 | Unverified guesses; client already re-encodes at 0.8/0.65/0.5 quality. Only change with a failing real capture in hand. |
| Show photos before moderation (optimistic) | Unmoderated photos in public on a dating app; S2/S3 deliberately keep them pending. |
| Settle yes + unsure as Compatible | Breaks "handoff only on mutual yes". At most show "Maybe, leaning yes". |
| `JUDGE_KEY_IMPORTANCE` 0.6 → 0.3 | Importance is 0.3/0.6/0.9, so 0.3 makes everything key → yes-happy judge, more harmful swaps. `JUDGE_YES_MIN` was calibrated on re-judged chats; change only via `rejudge`. |
| Accuracy is "47% (8/17)" | `eval/results/latest.md`: 4/17 = 24%. |
| `T_LEAK` 0.62 → 0.53 | The 4/20 leaks were caught by the LLM judge, not the embedding check, and are borderline. Lowering blindly rejects normal replies. Re-run `leak-probe` first. |
| Multi-hop matching across two users' graphs (its tutorial) | Violates the core rule: nothing ranks or compares two users' graphs; the other side's graph is never read. |
| "$3,000 Best Use of Tavily" bonus | Nothing in the repo backs it (only a Builders Program credit line in plan 01). Check Devpost before building for it. |
| Graphology + PageRank over the user's facts | Mostly cosmetic for ≤ 150 facts. Only if cheap and visible in the graph view. |
| Its code snippets (`verificationStatus`, predicates, `[cite: N]`) | Written against an imagined schema; don't paste. |

---

## 6. Design notes

### The mentor's "it's not really a knowledge graph"
Partly fair: KG.md says multi-hop isn't needed, and concepts have no hierarchy (Hampta Pass ↔ Kedarkantha only meet via
embeddings). Answer it two ways:
1. **Own the design** in README and video: a per-user graph by choice, because matching never reads the other person's
   graph (public profile, gate boolean and transcript only; enforced by the DB-spy test).
2. **Add the useful graph part:** a small concept taxonomy (IS_A edges, e.g. trek → outdoors) used for "bridge" topic
   choice in `planAct`. Real 2-hop use, inside one user's graph, and it helps the conversation flow.

### "Lie & Bluff Catcher" → evidence-weighted claims
Rejected as designed: trivia quizzes ("name a horror classic") and `flagged_lie` on a profile are a false-positive
machine, look bad in a demo, and the probe has no sensible answerer (the match's agent would answer from our own graph).
Reframe using existing machinery:
- a strong claim with no supporting story (no SUPPORTS edge) gets lower confidence;
- the agent hedges on it ("I'm into horror, mostly the classics" instead of "obsessed");
- an "ask my human" card: "Tell your agent about a horror movie you loved."

### Interrogation: what Gemini got right
The diagnosis (steering every other turn, `ASK_BACK_FLOOR` 0.7, dealbreakers first, dropped bridge sentences) matches
the code and the leak-probe transcript ("haha not sure what I love doing off profile 🎉 do you smoke?"). The root cause
it missed is the gate (section 3). Fine-tuning Nemotron is not the fix.

---

## 7. Checked and not bugs (from the review rounds)

- **Merged mode misses `dealbreaker_hint`:** handled. After the merged read, `engine.js` sets
  `plan.end = 'dealbreaker_hint'` and `if (plan.end === 'dealbreaker_hint' && !draft.end)` forces the regeneration into
  a closing line.
- **`heardAttrs` blocks the reopen after a hint:** no. The reopen works through `steerable` (`status !== 'answered'`,
  dealbreaker rank 0), `agendaSettled` blocks the natural end, the near-end rule picks open important items, and the
  hint becomes `dealbreakerRisk` for the judge (a second hint ends the chat).
- **Short answers ("nah never") not linked to the question:** handled. My question already puts the attribute in
  `askedAttrs`; the perceive prompt includes `myLast` (`prompts/perceive.js:42`, also in merged mode); the judge gets the
  speaker-labelled transcript (`prompts/judge.js:61`).
- **Skipped section-B item → invented stance:** handled. `topicOf` → `knowsTopic` false → `plan.unknownTopic`
  (`prompts/agentReply.js:19/40`: say you're not sure, never invent) → inbox item; an invented "I don't smoke" is an
  unsupported claim in `groundingCheck` (dropped/regenerated).
- **Persona cache stale after voice/reflection jobs:** no. `rebuildVoice` (`learning.js:63`), `reflect` (`:84`), the
  inbox answer (`routes/inbox.js:38`), every `routes/kg.js` write and `ownVoice.js:47` bump `graphVersion`. The only
  unbumped write is an `own_chat` sample after handoff, picked up at the next `rebuildVoice`.
- **`_kg.mjs` reads `g.edges` while the API returns `links`:** real but trivial (dev script only).

## 8. Real but optional / post-hackathon

- **`selectFacts` on "hahaha true":** the top-3-by-cosine facts are noise for ultra-short turns. They're only offered,
  not required. Cheap fix if a transcript shows it: when the incoming text has < 2 content words, embed it with their
  previous substantive message.
- **`own_chat` voice samples include "ok"/"👍":** real data about how they text; keep in distributions, maybe exclude
  < 2-word samples from exemplar selection. Only runs after handoff, invisible to the demo.
- **Perceive prompt lists answered agenda items too:** harmless; could filter to save tokens.
- **`normalise()` singularising Indian words / names ending in "s":** Gemini's claim, not verified.

---

## 9. Long-term KG architecture (deadline set aside)

Gemini asked: ignoring Oct 30, what is the best long-term language, graph library and database for the KG, even if it
means a Python microservice or leaving plain MongoDB documents? It offered three options: (A) Python FastAPI service
with NetworkX/rustworkx, (B) Neo4j AuraDB / FalkorDB, (C) Node.js + graphology + a concept hierarchy.

**Decision: (C) without the decoration.** Stay on one Node service + MongoDB, make the concept hierarchy a first-class
part of the data, use Python only for offline jobs.

### Why not the cross-user framing
Gemini's Option B example query walks from one user's graph into another's:
```
(u:User)-[:LIKES]->(c:Concept)-[:IS_A]->(cat:Category)<-[:IS_A]-(c2:Concept)<-[:LIKES]-(other:User)
```
Prelude forbids that by design (matching never reads or compares two users' graphs; DB-spy test). The real need is
narrower: when *they say* "Kedarkantha" in the chat, *my* agent recognises it's close to *my* "Hampta Pass". That is a
lookup in one user's graph plus a shared concept hierarchy; the other person only contributes transcript text. So the
hierarchy goes in the shared `Concept` layer, never in a cross-user traversal.

### The data shape decides the database
- Many small, disconnected per-user graphs (≤ 150 facts each, `MAX_SELF_FACTS`) plus their edges.
- One shared concept dictionary: hundreds to a few thousand nodes.
- Queries: load my facts (one indexed query, cached by `graphVersion`), resolve a phrase to a concept, walk 1–3 hops
  in ~150 nodes or up a shallow concept tree.

Neo4j's strengths (index-free adjacency, deep traversals in one big connected graph) don't apply: there is no big
connected graph, on purpose. At this size any traversal is microseconds in JavaScript. MongoDB already has
`$graphLookup` for recursive hierarchy walks, and the concept tree fits in memory anyway.

### Option A (Python microservice): rejected as a live service
- Breaks a hard project rule: exactly one free Render service, never a second.
- Splits data access across two runtimes: the DB-spy test and `asActor` tags would have to be rebuilt across a network
  hop. The information boundary is the main selling point, so this is the riskiest possible change.
- NetworkX on 150 nodes doesn't justify a service.
- **Where Python fits:** offline work — building the concept hierarchy, threshold calibration, eval scripts, graph ML
  later if ever. Run as scripts or a GitHub Action that writes to Mongo.

### Option B (Neo4j / FalkorDB): rejected
- Two databases: today `buildUserGraph` writes facts, edges, voice and `graphVersion` in one Mongo transaction. Two
  stores can't commit together → cleanup jobs for half-finished writes.
- Would need replacements for the jobs queue, TTL archiving of closed matches' notes, the gate query, compact vectors.
- Free tier risk: check AuraDB Free's current node/relationship limits and pause-on-idle rule. The demo must stay live
  until Dec 15; a database that pauses itself is a risk. M0 currently fits ~5,900 users.

### What makes it a "real" knowledge graph: the ontology, not the storage
The mentor's critique is fair, but the missing piece is the schema: concepts have no `broader`/`IS_A` relations, so all
meaning comes from embeddings. Flat concepts moved to Neo4j would still be a flat graph.

**Long-term build plan:**
1. **`Concept.broader: [ObjectId]`** — a DAG, not a tree ("Hampta Pass" is both a trek and a Himachal place). Add a
   `kind` (`activity`, `place`, `genre`, `food`, …). Seed from Wikidata/WordNet where they fit; the LLM proposes new
   links, accepted only after a check (same tie-break pattern as `canonicalize.js`). Nightly `conceptCleanup` also
   attaches new concepts to parents.
2. **Hierarchy in memory** (a few thousand nodes), refreshed when it changes. "Is their concept close to one of mine?"
   = walk up both ancestor chains: no embedding guess, and explainable ("both are Himalayan treks").
3. **Use it where it matters:**
   - bridge topics in `planAct` (pick a story/fact of mine that shares an ancestor with what they just said);
   - overlap evidence for the judge, in my own words;
   - evidence-weighted claims (section 6);
   - the graph view: IS_A edges visible next to "What I'm into" and "How I text".
4. **graphology only if an algorithm genuinely needs it.** PageRank over 150 facts is decoration.
5. **Atlas Vector Search** (allowed on M0, max 3 search indexes) instead of in-app cosine for concept resolution, if the
   concept count grows.

### When this answer would change
If the product adds cross-user features (friends-of-friends, "people who like X", community clusters) or trains graph ML
across users (link prediction), a graph database or a Python ML service makes sense. Both conflict with Prelude's
privacy design, so that's a product decision first, not a database decision.

### Answering "will judges see it as a real KG?"
Show the graph working, don't change the database:
- a demo moment where the agent connects their "Kedarkantha" to her own Hampta Pass trip and says why;
- IS_A edges visible in the graph view;
- a README section: per-user graph + shared ontology in MongoDB, and why (privacy boundary, one free service,
  transactional writes).
