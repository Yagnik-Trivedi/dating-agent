# 31: Human conversation (step SH)

> Requested by Arya, 2026-10-21. This is the final version.
> It replaces `plan/31-human-conversation-1.md` and `plan/31-human-conversation-2.md`. Delete both when this file is added.
> Version 1 made the agents ask the same matching questions in a longer way (stories, hints). That was wrong.
> This version keeps version 2's idea and fixes one gap found in the code (section B2, first point).
> It builds on plan 30 step SN, which is in the code, and on the agreed fixes in `BUG_BY_GEMINI.md` (repo root).
> Part A is the design. Part B maps it onto this repo. Part C has the prompts for Claude Code.
> Everything sits behind one env flag (`CONVO_MODE=human|sn`), so the demo can fall back to SN in one line.

---

## 0. The rule this plan is built on

**The agent's job in the chat is to see if the two people get along.**
**It is not to fill in a form.**

So most of the time, the agent does not ask matching questions at all.

Why it doesn't need to:
- Every dealbreaker was already checked by the gate in code, before the match existed.
- Kids, what they're looking for, smoking, drinking, diet and religion can be shown on the profile as "basics", like on Hinge. When they're shown, the user can already see them, and so can the agent.
- Anything that doesn't matter much to the user doesn't need an answer before a first date.
- Big personal topics (where this is going, past relationships, money, health) are for the two humans, after the handoff.

So:
- If the match's profile says "wants kids", the agent never asks about kids. Not directly, not in a long way, not through a story.
- If something very important is truly unknown, the agent asks it at most once, plainly, in one short line, and only when the chat is already near it.
- If it never comes up, the report says "worth asking yourself". That is fine. It is not a failure.

What's left for the chat is simple talk: their day, what they said, small reactions, a bit about yourself, in the same mood they're in.

## 0.1 The problems that must never happen

**P1. The agent can't chat casually.**
It must always be able to make simple, light talk, and say honestly when it doesn't know something.

**P2. The agent asks matching questions it doesn't need to ask.**
Never ask what the profile, the gate or the chat already answered.
Never ask what doesn't matter much.
Never wrap a matching question in a story, a hint or a setup. If it has to be asked, ask it simply, once.

**P3. The agents talk in a fixed pattern (answer, ask, answer, ask).**
Questions are rare. Most messages are replies and reactions.

**P4. The agent jumps in while the other person is talking about something.**
When they're telling something or venting, the agent stays on their thing.

**P5. The agent ignores the mood.**
It matches their energy: short when they're short, playful when they're playful, gentle when they're down, quick when they're busy.

**P6. Every chat becomes complicated or a story.**
Most messages are short and simple. Stories only when the other person tells one first, or asks.

---

# Part A: The design

## A1. How a real early chat sounds

> B: heyy how's your day going
> A: tiring lol, back to back classes. yours?
> B: same honestly, just got home
> A: ugh. at least it's friday
> B: true 😂 any plans for the weekend?
> A: probably just sleeping tbh. maybe a movie
> B: what kind of movies are you into?
> A: thrillers mostly. you?

Nobody asked about kids.
Nobody told a story.
And it already shows a lot: both reply quickly, both are tired, the humour fits, they ask each other back.
That is what the judge should look at.

What it should NOT sound like:

> Robot (today): "Hi! Do you want kids?"
> Robot (plan 31 version 1): "Spent my whole Sunday at my niece's birthday, seven five-year-olds and a bouncy castle..." (a setup to get to kids)

Both are the same question, and both are pointless when the profile already says the answer.

## A2. "Basics" on the profile

Today, only the seed personas have kids, smoking, drinking, diet, looking for and religion on their profile.
Real users answer these in onboarding (section B), but the answers only go into the private gate.
So for real users, nothing is on the profile, and the agent has no way to know without asking.

The fix:
- Fill the public profile basics from the user's **own** section-B answers, whenever the gate is rebuilt (after onboarding, a profile edit or a B change).
- Each basic has a "show on my profile" switch in the profile editor.
- **Owner decision needed (recommended defaults):** shown by default: looking for, kids, smoking, drinking, diet. Hidden by default: religion.
- A hidden basic never leaves the user's account: not in the public profile, not to any model, not to the other user. The gate still uses it, as today (boolean only).
- If a user changes a switch or an answer, the next match brief sees the new public profile. Briefs already built are not changed.

This is how Hinge and similar apps work, and the profile card already has the icons and labels (`ProfileParts.jsx`).

## A3. Before the chat: "Do I even need to ask this?"

This runs once, when the match brief is built.
It is code only, no model call.
It goes through my agenda (my own important topics) and removes almost everything.

For each agenda item, in order:

1. **Settled by the gate?** My dealbreaker on a gate attribute: the match exists, so they passed. Mark it `known (gate)`. Never ask.
2. **Shown on their profile?** Their public basics answer it. Mark it `known (profile)`. Never ask.
3. **Low importance to me?** Not a dealbreaker and not "very important". Remove it. Never ask.
4. **A humans-only topic?** Where this is going, past relationships, money, health, family plans, anything in my "topics my agent leaves for me", anything private or if_asked in my graph, and any basic they chose to hide. Mark it `for you`. Never ask.
5. **Whatever is left** is `may ask once`. In practice 0 to 2 items: something very important to me that isn't a profile basic (for example where you'll live, how involved families are).

During the chat:

6. **Did they already say it?** Mark it `known (chat)`. Never ask again.

Interests ("I love trekking") are not questions to tick off.
They are things the agent can talk about or share when they fit.

**Example.**
Arya's important topics: kids (very important), smoking (dealbreaker), diet (nice to have), where you'll live (very important).
Her profile shows: wants kids, doesn't smoke.
- kids: on her profile → known, never asked
- smoking: gate-checked → known, never asked
- diet: nice to have → removed
- where you'll live: not a profile basic, very important → may ask once

So in the whole chat, there's at most one thing the agent might ask, and only if the chat gets near it.

## A4. Every turn: read the mood

The read that already happens every turn adds a few simple things:

- **mood:** `chill`, `playful`, `excited`, `tired`, `busy`, `down`, `serious`, `flirty`, `curious`, `bored`
- **energy:** `low`, `medium`, `high`
- **what they're doing:**
  - `chatting` (normal back and forth)
  - `asking` (a question to me)
  - `telling` (in the middle of telling me something)
  - `venting` (a bad day, a complaint)
  - `sharing_news` (good news)
  - `winding_down` (tired, short, closing)
- **their length and style:** words, emoji, lowercase (code already measures some of this)

## A5. Every turn: reply in the same mood

**Matching the mood:**

| Their mood | What the agent does |
|---|---|
| chill | short, easy reply, maybe one light question back |
| playful | play along, tease a little if the user does |
| excited | be happy for them, ask one thing about it |
| tired or busy | very short and warm, no new topics, fine to wrap up |
| down or venting | stay on it, be kind, no jokes, no topic changes |
| serious | answer properly, no jokes |
| flirty | light and warm, only as far as the user's voice goes |
| bored or low energy | don't push questions; one easy thing, or close nicely |

**Matching the length:**
The reply is about as long as their message.
A 4-word message gets a short reply, not a paragraph.

**Simple moves.** One per message:

| Move | Example | When |
|---|---|---|
| reply | "tiring lol, back to back classes" | they asked me something |
| react | "haha no way", "ugh that's the worst" | most of the time |
| ask about their thing | "wait what happened?" | curious about what they just said |
| share a little | "same, I just got home too" | something of mine connects |
| stay with them | "that sounds awful, are you okay?" | they're telling or venting |
| close | "okay I'm sleepy, talk tomorrow? 😊" | tired, winding down, or a good moment after the minimum length |

**Question rules:**
- At most one question per message.
- Most messages have no question.
- Never two of my messages in a row ending with a question, unless they asked me something.
- A question is about what they just said, not a new topic.

**When they're telling or venting:** only react or ask about their thing. No new topics, no "may ask once" item, no story of mine over theirs.

**Stories:** not by default. One short thing from the graph only if they told a story first and it truly connects, or if they ask. One or two sentences.

**Small talk is always allowed.**
Their day, the weekend, the weather, food, the app, what they said.
It claims nothing about the user, so it needs no fact.
Anything said about the user must still come from the graph (this rule stays).
If the agent doesn't know, it says so simply: "honestly no idea lol, you?"

## A6. The "may ask once" item

Only if all of these are true:
- still unknown (not on the profile, the gate or in the chat)
- the chat is warm (they've asked back or laughed at least once, interest not low)
- they're `chatting` (not telling, venting or winding down)
- what was just said is near the topic (the existing bridge words, or the read says so)
- no matching question was asked yet in this chat

Then: one plain, short, casual line in the user's voice ("btw where do you see yourself living in a few years?"). No setup, no story, no hint first. Never repeated. If they dodge it, it goes to "worth asking yourself".

At most one matching question per chat, across all items.

## A7. Ending

- The chat can end naturally after the minimum length. "May ask once" items that never came up don't block the end.
- End on a good moment, or when they're tired or bored. Warm and short: "this was fun, talk later?"
- Never arrange a meeting (this rule stays).

## A8. What the judge does with this

- Profile-known items are known. If their shown basic clashes with something very important to me (not a dealbreaker, since the gate handles those), the judge can list it as a friction, with "from their profile" as the source.
- Gate-checked items are settled. Never "you never found out".
- Never-discussed items go to "worth asking yourself", never against the match.
- The judge mainly looks at how the chat went: effort, asking back, laughing, matching each other, enjoying it.

## A9. Small knowledge graph additions

Only what helps simple talk:

1. **"Your life right now"** (3 optional prompts at onboarding): "What's keeping you busy this week?", "Something you're looking forward to?", "Last thing you did for fun?". These become current facts that expire after 30 days, so the agent has true, simple things to say ("exams this week, dying lol").
2. **"Topics my agent leaves for me"** in Settings (kids, religion, past relationships, money, family plans). Always `for you`.
3. **Mood replies** (optional, in "10 more replies"), so the agent learns mood matching in the user's own voice:
   - "ugh today was so long"
   - "I GOT INTO THE PROGRAM!!"
   - "lol ok"
   - "honestly my manager yelled at me today"
   - "you're kinda cute you know 😏"
   - "sorry, super busy today"

## A10. Measuring it

For testing only. Numbers never drive the chat.

- matching questions per chat: 0 or 1
- questions about something shown on their profile or settled by the gate: 0
- matching questions wrapped in a setup or a story: 0
- question rate: at most 0.35 of agent messages
- back-to-back questions from one agent when they didn't ask: 0
- unbridgedQuestionRate (from the audit): falls compared to SN
- length match: the agent's length vs theirs, per turn
- mood match: an offline LLM check on saved chats (eval only)
- agent stories without them telling one first: 0
- topic changes while they were telling or venting: 0
- judge accuracy and "Maybe" rate not worse; if worse, fix the judge, never go back to asking more
- Arya and the owner read two transcripts and say they sound like two normal people texting

---

# Part B: Fitting it into this repo

## B1. What already exists and stays

- One model call per turn (read and reply merged), `AGENT_TURN_MODE=merged`.
- Grounding, leak check, style checks, ask my human, the honest bot answer, the DB-spy boundary.
- Voice: lengths, emoji, laughs, language mix, real samples as examples.
- Interest meter and boredom ending.
- SN's bridge words and the answer / follow-up / share / react moves (simplified below).
- The brief already reads the match's public profile, including `tags` (`trust/checkProfile.js` `publicProfile`), and is on the DB-spy whitelist for that.
- The profile card already shows kids, looking for, smoking and drinking icons when `tags` has them (`client/src/components/ProfileParts.jsx`).

## B2. What's wrong today, against section 0.1

- **P2, the gap:** onboarding saves only `tags.interests` (`client/src/pages/Onboarding.jsx`). Kids, looking for, smoking, drinking, diet and religion reach the public profile only for seed personas, so for real users the agent can't know them without asking.
- **P2:** `buildBrief.js` puts my dealbreakers first in the agenda at priority 1, though the gate already checked them, and keeps medium-importance items. Nothing removes what's on their profile.
- **P2:** `judge.js` counts every dealbreaker the chat didn't discuss as a friction ("You never found out where they stand on..."). With fewer questions, every chat would be penalised.
- **P2/P6:** SN raises agenda topics at a "lull" with "speaking of..." / "random but..." lines.
- **P3:** the ask chance never drops below 45% (`ASK_BACK_FLOOR`), and nothing stops back-to-back questions.
- **P4/P5:** the read has a `mood` field, but nothing uses it to shape the reply, and nothing detects telling or venting.
- **P6:** `STORY_RATE` 0.2 and lull stories make the agent tell stories unprompted.
- **P1:** the prompt never says small talk is fine without a fact.
- **Audit bugs** (`BUG_BY_GEMINI.md` section 2, still in the code): judge accounts hit the daily chat cap; merged-mode question detection only checks for "?"; a bare question can be sent after its lead-in is dropped; `heardAttrs` lags a turn; stories, facts and topic tries are counted before sentences are dropped. The audit's fix 2a mentions `openMustAsk`, which SN already removed; A3 step 1 covers what 2a wanted.

## B3. The changes, file by file

**`server/src/services/match/gate.js` (`buildGate`), `models/Profile.js`, `routes/profile.js`** (A2)
- When the gate is rebuilt, also fill `Profile.tags` basics from my own B answers, through one small mapping table (B option value → tag value; for example kids `have_already` → `has_kids` or the closest existing label; extend `ProfileParts.jsx` labels if needed).
- New `Profile.tagsHidden: [String]` with the owner's defaults. Hidden basics are removed from `tags` before any public read (extend `PUBLIC_PROFILE` / the public projection, and `publicProfile()`).
- Don't overwrite a basic the user edited by hand in the profile editor.
- The gate keeps working from the B answers, exactly as today.

**`server/src/services/brief/buildBrief.js`** (A3)
- New pure `needToAsk(agenda, { theirTags, gateDealbreakers, leaveForMe, myPrivateTopics })`, run at the end of `buildAgenda` (and `addClarify`):
  - gate-checked dealbreakers (from MY `profile.gate.dealbreakers`, the same source `judge.js` uses) → `status: 'answered', settledBy: 'gate'`, kept in the agenda array outside the size cap, because `judge.js` reads answered items
  - shown on their profile → `status: 'answered', settledBy: 'profile'`, `profileValue`, and `differs` (my answer vs theirs, in code)
  - not a dealbreaker and importance below `KG.ASK_MIN_IMPORTANCE` (0.9) → removed
  - humans-only → `status: 'for_you'`
  - the rest → `askOnce: true`
- A `dealbreaker_hint` reopen in `conversation/perceive.js` must still work: it sets the item back to open, and it may then be followed up once.
- Interest items stay as talk material (`kind: 'interest'`), never `askOnce`.

**`server/src/services/prompts/perceive.js` and `conversation/perceive.js`** (A4)
- `mood` gets the list in A4 (keep old values as aliases), plus `energy` and `doing`, each with a zod default.
- An `askOnce` item becomes `known (chat)` when they state it (existing `agendaHits`, verbatim quote).

**`server/src/services/conversation/planAct.js`** (A5, A6)
- Behind `CONVO_MODE=human`; `sn` keeps today's code path exactly.
- Moves: `reply | react | ask_theirs | share | stay | close`.
- Use the previous turn's read for mood and `doing`, plus code heuristics for this turn (very short → low energy; "ugh", "so tired", "worst day" → down or tired; "!!" or caps → excited; "so basically..." or a long message with no question → telling).
- Target length: the voice's sampled length pulled toward their last message length (`KG.LENGTH_PULL` 0.6).
- Ask chance: no floor. Lower when they're tired, busy, venting, telling or bored. Zero if my last message asked and they didn't ask me anything.
- `topic`: only an `askOnce` item, only if every condition in A6 holds and `state.askedMatching` is false.
- No lull topics. `STORY_RATE` 0 in human mode; a story only after they told one and a listed story fact connects.

**`server/src/services/prompts/agentReply.js`** (and `agentTurn.js`, which reuses it)
- In human mode, replace SN's "how a good chat feels" block with:
  - "This is a simple, casual chat. Most messages are a short reply or reaction."
  - "Match their mood and energy. If they're short, be short. If they're tired, be gentle and brief. If they're playful, play along."
  - "Small talk is good. You don't need a fact to react, agree, or talk about the day, the weekend, food or what they said."
  - "Don't tell stories unless they told one first. Don't set up questions with stories or hints."
  - "Not every message needs a question."
- The move line (one short sentence per move).
- For an `askOnce` topic: "If it fits right now, ask this plainly in one short casual line: <question>. No setup. If it doesn't fit, don't ask it."
- Never show `known`, `for_you` or removed items to the model.
- Keep the must-follow line last.

**`server/src/services/conversation/engine.js`**
- Behind `CONVO_MODE=human`.
- `agendaSettled`: ignore `known`, `for_you` and `askOnce` items; a natural end is allowed after `NATURAL_END_FROM`.
- `askedMatching: true` once a matching question was sent (`attributesIn(sentText, { questions: true })`).
- New draft problems (they share the one regeneration):
  - a question about an attribute that is `known` or `for_you`, or a second matching question
  - a new topic while they're `telling` or `venting`
  - a story fact cited when they didn't tell one and didn't ask
  - two of my messages in a row ending with a question when they didn't ask me anything
  - much longer than their message (more than `KG.MAX_LENGTH_RATIO` × theirs + a few words) when their energy is low
- Fallback lines become simple reactions in the user's voice ("haha", "ugh same", "oh nice").

**`server/src/services/conversation/judge.js` and `judgeDecision.js`** (A8)
- `settledAttrs` includes `settledBy: 'gate'` and `'profile'` items, so they're never "undiscussed".
- Profile items with `differs: true` on something very important (not a dealbreaker) can be a friction, source "their profile".
- Never-discussed `askOnce` items go to "worth asking yourself" and never lower the verdict.

**`server/src/services/kg/config.js`**
- `CONVO_MODE`, `ASK_MIN_IMPORTANCE: 0.9`, `LENGTH_PULL: 0.6`, `MAX_LENGTH_RATIO: 2`, `MAX_MATCHING_QUESTIONS: 1`, `HUMANS_ONLY` (attribute and topic names as the code uses them).

**`server/scripts/eval/metrics.js`**
- The A10 metrics, including the audit's `unbridgedQuestionRate` (`BUG_BY_GEMINI.md` section 4), and SN vs human on the same pairs. Run it on the saved `eval/raw-*.json` first for a baseline.

**H2: `kg/questions.js`, `kg/buildUserGraph.js`, `models/User.js`, client**
- Section N "Your life right now" → current facts, `validUntil` 30 days.
- The 6 mood replies (A9) added to "10 more replies".
- `User.settings.leaveForMe` + a Settings screen "Topics my agent leaves for me".
- The "show on my profile" switches for basics in the profile editor (if not done in H1).

## B4. Timing

Today is Oct 21. Nebius check Oct 26, the one push Oct 27, feature freeze Oct 28, submit Oct 29.

| Phase | What | When |
|---|---|---|
| H1 | Audit fixes, profile basics, "do I need to ask", mood read and matching, simple moves, judge changes, metrics, tests | Oct 21 to 23 |
| H1-live | 6-pair run, SN vs human | Oct 23 to 24 |
| H2 | "Your life right now", mood replies, "leave for me" | Oct 24 to 25 |

If H1 isn't green by Oct 24 evening, set `CONVO_MODE=sn` and ship SN (the audit fixes and profile basics can still ship).

## B5. Cost

- Still one model call per turn. The read adds two small fields.
- Chats may get cheaper: shorter messages, fewer regenerations, more natural ends.

## B6. Acceptance checks

**Unit tests** (all existing tests stay green):
- Profile basics: filled from B answers on gate rebuild; a hidden basic never appears in the public profile or the brief; a hand edit isn't overwritten; the gate is unchanged.
- `needToAsk`: a gate dealbreaker → known (gate); kids shown on their profile → known (profile), never asked; kids hidden → for_you; a "nice to have" item → removed; a "leave for me" topic → for_you; only a very important non-basic item → askOnce.
- `planAct`: no topic while telling or venting; at most one matching question per chat; no question after my own question if they didn't ask; length pulled toward theirs; no unprompted story; `CONVO_MODE=sn` gives today's exact plan for the same seed.
- `engine` validators: each new draft problem triggers the regeneration.
- `judge`: profile-known and gate-settled items are never undiscussed; a never-discussed askOnce item doesn't lower the verdict.
- Audit fixes: one test each (`BUG_BY_GEMINI.md` section 2).
- The DB-spy test still passes.

**Live, 6-pair set (c1 c2 i1 i2 m1 m2), SN vs human, same pairs and seeds:**
- matching questions per chat: 0 or 1
- questions about profile-known or gate-settled things: 0
- question rate at most 0.35; no back-to-back questions without being asked
- unprompted agent stories: 0
- topic changes while they were telling or venting: 0
- judge accuracy not lower than SN; fallbacks at most 7%; unsupported self-claims not higher
- tokens per chat reported
- two transcripts read by Arya and the owner as normal texting

**Also:** `api-check`, client build, 375 px and 1440 px, `smoke:browsers` on the local production build, `PROGRESS.md`, committed locally, **not pushed**.

## B7. After the hackathon

- An adaptive story interview at onboarding (version 1, A2 stage 3), for more true things to say.
- Learn from "I wouldn't say that" edits (short descriptions of what was wrong, reused in similar moments).
- "Which sounds more like you?" tests between agent versions.
- A "matrimonial" pace setting, where practical topics come earlier.
- The concept hierarchy from `BUG_BY_GEMINI.md` section 9 (trek → outdoors) for better "near the topic" checks.

---

# Part C: Prompts for Claude Code

This file is already in the repo as `plan/31-human-conversation.md`.
Run the prompts one at a time. Each one ends with a STOP.

## Prompt H1: the conversation side

```
Read CLAUDE.md, plan/30-final-sprint.md (SN and the standing rules), plan/31-human-conversation.md and BUG_BY_GEMINI.md.

Plan 31 is approved by Arya as step SH of plan 30, before S4. First housekeeping: delete plan/31-human-conversation-1.md and plan/31-human-conversation-2.md (plan/31-human-conversation.md replaces both), add SH to plan 30's order and to plan/PROGRESS.md, and commit.

Then do Phase H1: plan 31 B3 for gate/profile, brief, perceive, planAct, agentReply/agentTurn, engine, judge, config and metrics, with the B6 unit tests. Don't touch onboarding screens or Settings yet (H2).

The core rule (plan 31 section 0): the agent's job is to see if two people get along, not to fill in a form. It must not ask anything the gate, their public profile or the chat already answered, must not ask anything that isn't very important to the user, never wraps a question in a story or a setup, and asks at most one matching question per chat, plainly, only if it fits. Everything else is simple, mood-matched talk. Every problem in section 0.1 needs a test that would fail if it came back.

Hard constraints:
- Everything conversational sits behind CONVO_MODE=human|sn (default human). CONVO_MODE=sn must reproduce today's behaviour exactly; prove it with a test that compares plans for the same seed. The audit fixes and profile basics apply in both modes.
- Still ONE model call per agent turn in merged mode.
- This plan REMOVES logic more than it adds it. Don't add closeness stages, probes, story machinery or extra model calls.
- Keep every existing safety check: grounding, leak, style, stance, ask my human, the bot answer, the DB-spy boundary. The brief may read the other user's public Profile (it already does); nothing else may. A hidden basic must never reach the public profile, a prompt or the other user.
- Every new LLM field gets a zod schema with a safe default. Prompt text lives only in services/prompts/*.js. Tuning numbers live in services/kg/config.js.

Steps:
0. The confirmed audit bugs (BUG_BY_GEMINI.md section 2). Its line numbers are stale: find the code by function name and check each bug still exists. One test each.
   1. pipeline/index.js overDailyChats(): judge accounts (isJudge) skip the daily cap, like seeds.
   2b. Merged mode: perception.isQuestion uses the existing isQuestion() from persona/contextBuilder.js over all their messages in the turn (today it only checks for "?").
   2c. AGENT_REGEN=lean: "only questions survived" counts as nothing surviving, in the lean early break and in survivors(), so the constrained regeneration runs instead of sending a bare question.
   3. heardAttrs is computed before planAct (attributesIn is pure), so the agent never asks what they answered in the message it's replying to.
   4. toldStoryIds, usedFactIds and topicTries count only what was actually sent (covers() in persona/checks.js; attributesIn on the sent text).
   Fix 2a is covered by step 2 below (SN already removed openMustAsk). Do NOT implement anything in the audit's "checked and rejected" list (section 5).
1. Profile basics (plan 31 A2, B3): fill Profile.tags basics from the user's own B answers in buildGate, with a mapping table, Profile.tagsHidden, hidden basics stripped from every public read, hand edits kept. BEFORE building this step, STOP and ask me to confirm which basics are shown by default (recommended: looking for, kids, smoking, drinking, diet shown; religion hidden), because it changes what other users can see. Re-seed or backfill so existing users get their basics.
2. buildBrief.js: needToAsk() exactly as A3 and B3, unit tests first. Keep answered items in the agenda array outside the size cap; a dealbreaker_hint reopen still works.
3. perceive: mood list, energy and doing (A4), with defaults; askOnce items become known when they state them (verbatim quote).
4. planAct: the simple moves, mood and length matching, the question rules, at most one matching question per chat, no lull topics, no unprompted stories (A5, A6).
5. agentReply/agentTurn: the human-mode block, the move line, the plain askOnce line; never show known, for_you or removed items to the model.
6. engine: agendaSettled ignores known, for_you and askOnce items; askedMatching; the new draft problems; simple reaction fallbacks.
7. judge: gate- and profile-settled items are never undiscussed; profile clashes on very important items can be a friction with source "their profile"; never-discussed askOnce items go to "worth asking yourself" only.
8. metrics.js: the A10 metrics, including unbridgedQuestionRate (audit section 4), with a baseline on the saved eval/raw-*.json first.
9. npm test, api-check, client build. Then show me one simulated chat (simulate.js, one pair, local) with each agent message labelled by its move and the mood it read, and STOP. Do not run the 6-pair live check until I say go (it uses LLM credits).

Commit locally after each step ("feat(plan-31 H1): …"). Never push. Update plan/PROGRESS.md.
When you finish, report: which test covers each problem in section 0.1, how many agenda items per seed persona end up askOnce (expect 0 to 2), the token change per turn, and anything in plan 31 you think is wrong.
```

## Prompt H1-live: the measurement

```
Run the live 6-pair check from plan/31-human-conversation.md B6, once with CONVO_MODE=sn and once with CONVO_MODE=human, same pairs and seeds, low concurrency (rate limits). With 6 pairs, one pair is about 17 points: don't read a one-pair change as a signal.
Report every B6 number in a table (SN vs human), the judge "unsure" rate, unbridgedQuestionRate, tokens per chat, and paste two full human-mode transcripts (one compatible pair, one incompatible), each agent message labelled with its move and the mood it read.
If any "target 0" metric is above 0, find the cause, fix it, re-run only the affected pairs, and report again.
If judge accuracy drops below SN, do not make the agents ask more. Propose a judge-side fix and STOP for approval.
Commit locally, never push, update plan/PROGRESS.md.
```

## Prompt H2: the small additions

```
Read plan/31-human-conversation.md. H1 is done and green. Do plan 31 A9 and the H2 part of B3, committing locally after each:
1. Section N "Your life right now": 3 optional prompts after the replies in onboarding, skippable → current facts with validUntil 30 days.
2. The 6 mood replies from A9 added to "10 more replies" (the core stays 5 replies).
3. User.settings.leaveForMe + a Settings screen "Topics my agent leaves for me"; needToAsk treats these as for_you. Add a test.
4. If not done in H1: "show on my profile" switches for each basic in the profile editor.
Build in the current design (Round 7 tokens and components). Check 375 px and 1440 px, run smoke:browsers against the local production build, npm test, api-check. Never push. Update plan/PROGRESS.md. STOP and show me the screens.
```
