# 31: Human conversation (step SH), version 2

> Requested by Arya. Version 2, 2026-10-21.
> Version 1 made the agents ask the same matching questions in a longer, roundabout way (stories, probes, hints).
> That was wrong. Version 2 replaces it.
> It builds on plan 30 step SN, which is already in the code.
> Part A is the design. Part B maps it onto this repo. Part C has the prompts for Claude Code.
> Everything sits behind one env flag (`CONVO_MODE=human|sn`), so the demo can fall back to SN in one line.

---

## 0. The rule this plan is built on

**The agent's job in the chat is to see if the two people get along.**
**It is not to fill in a form.**

So the agent does not need to ask matching questions at all, most of the time.

Why it doesn't need to ask:
- Every dealbreaker was already checked by the gate in code, before the match existed.
- Kids, what they're looking for, smoking, drinking, diet and religion are on their public profile, as tags. The user can already see them.
- Anything that doesn't matter much to the user doesn't need an answer before a first date.
- Anything big and personal (where this is going, past relationships, money, health) is for the two humans, after the handoff.

So:
- If the user's match says "wants kids: yes" on the profile, the agent never asks about kids. Not directly, not in a long way, not through a story.
- If something important is truly unknown, the agent asks it at most once, plainly, in one short line, only when the chat is already near it.
- If it never comes up, it goes into the report as "worth asking yourself". That is fine. It is not a failure.

What's left for the chat is simple talk: their day, what they said, small reactions, a bit about yourself, in the same mood they are in.

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
It must match their energy: short when they're short, playful when they're playful, gentle when they're down, quick when they're busy.

**P6. Every chat becomes complicated or a story.**
Most messages should be short and simple. Stories only when the other person tells one first, or one genuinely fits.

---

# Part A: The design

## A1. How a real early chat sounds

Most of it is simple:

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

Both are the same question. Both are wrong when the profile already says the answer.

## A2. Step 1, before the chat: "Do I even need to ask this?"

This runs once, when the match brief is built.
It is code only, no model call.
It goes through the agenda (my own important topics) and removes almost everything.

For each agenda item, in this order:

1. **Settled by the gate?** My dealbreaker on a gate attribute: the match exists, so they passed. Mark it `known (gate)`. Never ask.
2. **On their public profile?** Their tags say it (wants kids, relationship goal, smoking, drinking, diet, religion importance). Mark it `known (profile)`. Never ask.
3. **Low importance to me?** Not a dealbreaker, and I said it's only "nice to have". Remove it. Never ask.
4. **A humans-only topic?** Where this is going, past relationships, money, health, family plans, anything I listed in "topics my agent leaves for me", anything marked private or if_asked in my graph. Mark it `for you`. Never ask.
5. **Whatever is left** is `may ask once`. In practice this is 0 to 2 items: something that matters a lot to me and isn't on their profile.

During the chat, one more check:

6. **Did they already say it in the chat?** Mark it `known (chat)`. Never ask again.

Interests ("I love trekking") are not questions to tick off.
They are things the agent can talk about or share when they fit.

**Example.**
Arya's important topics: kids (very important), smoking (dealbreaker), diet (nice to have), where you'll live (very important).
Her profile tags: wants kids "yes", smoking "never".
- kids: on her profile → known, never asked
- smoking: gate-checked → known, never asked
- diet: nice to have → removed
- where you'll live: not on her profile, very important → may ask once

So in the whole chat, the agent has at most one thing it might ask, and only if the chat gets near it.

## A3. Step 2, every turn: read the mood

The read that already happens every turn adds a few simple things:

- **mood:** one of `chill`, `playful`, `excited`, `tired`, `busy`, `down`, `serious`, `flirty`, `curious`, `bored`
- **energy:** `low`, `medium`, `high` (short and flat, normal, long and excited)
- **what they're doing:**
  - `chatting` (normal back and forth)
  - `asking` (a question to me)
  - `telling` (they're in the middle of telling me something)
  - `venting` (a bad day, a complaint)
  - `sharing_news` (good news)
  - `winding_down` (tired, short, closing)
- **their length and style:** how many words, emoji or not, lowercase or not (the code already measures some of this)

## A4. Step 3, every turn: reply in the same mood

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
| bored or low energy | don't push questions; one easy thing, or close the chat nicely |

**Matching the length:**
The reply is about as long as their message.
A 4-word message gets a short reply, not a paragraph.
The voice's own length range still applies (the code already samples it), but their length pulls it toward theirs.

**Simple moves.** One per message:

| Move | Example | When |
|---|---|---|
| reply | "tiring lol, back to back classes" | they asked me something |
| react | "haha no way", "ugh that's the worst" | most of the time |
| ask about their thing | "wait what happened?" | when curious about what they just said |
| share a little | "same, I just got home too" | when something of mine connects |
| stay with them | "that sounds awful, are you okay?" | they're telling or venting |
| close | "okay I'm sleepy, talk tomorrow? 😊" | tired, winding down, or a good moment after the minimum length |

**Question rules:**
- At most one question per message.
- Not every message has a question. Most don't.
- Never two of my messages in a row ending with a question, unless they asked me something.
- A question should be about what they just said, not a new topic.

**When they're telling or venting:**
Only react or ask about their thing. No new topics, no "may ask once" item, no sharing my own story over theirs.

**Stories:**
The agent does not tell stories by default.
It may share one short thing from the user's graph if they told a story first and it truly connects, or if they ask.
One or two sentences, not a performance.

**Small talk is always allowed.**
Their day, the weekend, the weather, food, the app, what they just said.
Small talk claims nothing about the user, so it needs no fact.
Anything the agent says about the user must still come from the graph (this rule stays).
If it doesn't know, it says so simply: "honestly no idea lol, you?"

## A5. Step 4, the "may ask once" item

Only if all of these are true:
- it's still unknown (not on profile, gate or chat)
- the chat is warm (they've asked back or laughed at least once, interest not low)
- they're `chatting` (not telling, venting or winding down)
- what was just said is near the topic (the existing bridge words, or the read says so)
- the agent hasn't asked a matching question yet in this chat

Then:
- One plain, short, casual question, in the user's voice. "btw where do you see yourself living in a few years?"
- No setup, no story, no hint first.
- Never repeated. If they dodge it, it's dropped and goes to "worth asking yourself".

At most one matching question per chat, across all items.

## A6. Ending

- The chat can end naturally once the minimum length is reached. "May ask once" items that never came up do not block the end.
- End on a good moment, or when they're tired or bored. Warm and short: "this was fun, talk later?"
- Never arrange a meeting (this rule stays).

## A7. What the judge does with this

- Profile-known items are known. If their profile clashes with something very important to me (not a dealbreaker, since the gate handles those), the judge can list it as a friction, with "from their profile" as the source.
- Gate-checked items are settled. Never "you never found out".
- Items that were never discussed are listed as "worth asking yourself", never counted against the match.
- The judge mainly looks at how the chat went: did they reply with effort, ask back, laugh, match each other, enjoy it.

## A8. The knowledge graph side (kept small)

Only what helps simple talk:

1. **"Your life right now"** (3 quick, optional prompts at onboarding): "What's keeping you busy this week?", "Something you're looking forward to?", "Last thing you did for fun?". These become current facts that expire after 30 days. They give the agent true, simple things to say: "exams this week, dying lol".
2. **"Topics my agent leaves for me"** in Settings (kids, religion, past relationships, money, family plans). These are always `for you`.
3. **Mood reply samples** (optional, in "10 more replies"): how the user replies when the other person is tired, venting, excited, flirty, bored. They teach the agent mood matching in the user's own voice.
   - "ugh today was so long"
   - "I GOT INTO THE PROGRAM!!"
   - "lol ok"
   - "honestly my manager yelled at me today"
   - "you're kinda cute you know 😏"
   - "sorry, super busy today"

The adaptive story interview from version 1 moves to after the hackathon.

## A9. Measuring it

For testing only. Numbers never drive the chat.

- **matching questions per chat:** target 0 or 1
- **questions about something on their profile or settled by the gate:** target 0
- **matching questions wrapped in a setup or a story:** target 0 (the read of the message before the question)
- **question rate:** at most 0.35 of agent messages
- **back-to-back questions from one agent:** 0, unless they asked
- **length match:** the agent's message length vs theirs, per turn
- **mood match:** an offline LLM check on saved chats: did the reply fit their mood? (eval only)
- **stories told by the agent without them telling one first:** target 0
- **interruptions:** they were telling or venting and the agent changed topic: target 0
- judge accuracy and "Maybe" rate must not get worse; if they do, fix the judge, never go back to asking more
- Arya and the owner read two transcripts and say whether they sound like two normal people texting

---

# Part B: Fitting it into this repo

## B1. What already exists and stays

- One model call per turn (read and reply merged), `AGENT_TURN_MODE=merged`.
- Grounding: every "I..." claim cites a fact. Leak check. Style checks. Ask my human. The honest bot answer. The DB-spy boundary.
- Voice: lengths, emoji, laughs, language mix, real samples as examples.
- Interest meter and boredom ending.
- SN's bridges and the "answer / follow-up / share / react" moves (simplified below).
- The brief already reads the match's public profile, including `tags` (`trust/checkProfile.js` `publicProfile`), and is on the DB-spy whitelist for that.

## B2. What's wrong today, against section 0.1

- **P2:** `buildBrief.js` puts my dealbreakers first in the agenda at priority 1, even though the gate already checked them. Nothing removes items that are on their public profile (kids, looking for, smoking, drinking, diet, religion). Medium-importance items stay in the agenda. So the agent keeps trying to bring them up.
- **P2:** `judge.js` counts every dealbreaker the chat didn't discuss as a friction ("You never found out where they stand on..."), which pushes the system toward asking.
- **P2/P6:** SN raises agenda topics at a "lull" with "speaking of..." / "random but..." lines.
- **P3:** the ask chance never drops below 45% (`ASK_BACK_FLOOR`), and nothing stops back-to-back questions.
- **P4/P5:** the read has a `mood` field, but nothing uses it to shape the reply, and nothing detects that they're telling something or venting.
- **P6:** `STORY_RATE` 0.2 and lull stories push the agent to tell stories unprompted.
- **P1:** the prompt never says small talk is fine without a fact.

## B3. The changes, file by file

**`server/src/services/brief/buildBrief.js`** (the main fix)
- New `needToAsk(agenda, { theirTags, gateDealbreakers, leaveForMe })`, pure, run at the end of `buildAgenda`:
  - gate-checked dealbreakers → `status: 'answered', settledBy: 'gate'`, kept in the agenda array (outside the size cap), because `judge.js` reads answered items
  - on their public profile → `status: 'answered', settledBy: 'profile'`, plus `profileValue` (public data the user already sees) and `differs` (my answer vs theirs, computed in code)
  - not a dealbreaker and importance below `KG.ASK_MIN_IMPORTANCE` (0.9, "very important") → removed
  - humans-only (the `HUMANS_ONLY` list, my `leaveForMe`, my if_asked/private facts) → `status: 'for_you'`
  - the rest → `askOnce: true`
- Map profile tag values to the section-B option values in one small table. If a tag value can't be mapped, treat it as not on the profile.
- Interest items (my likes) stay as talk material with `kind: 'interest'`, never `askOnce`.

**`server/src/services/prompts/perceive.js` and `conversation/perceive.js`**
- `mood` gets the list in A3 (keep the old values as aliases so nothing breaks).
- Add `energy` and `doing` (A3), each with a zod default.
- Count an `askOnce` item as `known (chat)` when they state it, using the existing `agendaHits` with a verbatim quote.

**`server/src/services/conversation/planAct.js`**
- Behind `CONVO_MODE=human`; `sn` keeps today's code path exactly.
- Moves: `reply | react | ask_theirs | share | stay | close` (A4).
- Use the previous turn's read for mood and `doing`, plus code heuristics for this turn (very short message → low energy; "ugh", "so tired", "worst day" → down/tired; many "!!" or caps → excited; an unfinished "so basically..." or a long message without a question → telling).
- Target length: the voice's sampled length pulled toward their last message length (`KG.LENGTH_PULL`, e.g. 0.6 toward theirs).
- Ask chance: no floor. Lower when they're tired, busy, venting, telling or bored. Zero if my last message asked and they didn't ask me anything.
- `topic`: only an `askOnce` item, only if every condition in A5 holds, and only if no matching question was asked yet (`state.askedMatching`).
- No lull topics, no unprompted stories (`STORY_RATE` 0 in human mode). A story only after they told one and a listed story fact connects.

**`server/src/services/prompts/agentReply.js`** (and `agentTurn.js`, which reuses it)
- Add a short "HOW THIS CHAT SHOULD FEEL" block, replacing SN's block in human mode:
  - "This is a simple, casual chat. Most messages are a short reply or reaction."
  - "Match their mood and energy. If they're short, be short. If they're tired, be gentle and brief. If they're playful, play along."
  - "Small talk is good. You don't need a fact to react, agree, or talk about the day, the weekend, food or what they said."
  - "Don't tell stories unless they told one first. Don't set up questions with stories or hints."
  - "Not every message needs a question."
- The move line for the chosen move (one short sentence each).
- If `topic` is an `askOnce` item: "If it fits right now, ask this plainly in one short casual line: <question>. No setup. If it doesn't fit, don't ask it."
- Never show `known`, `for_you` or removed items to the model.
- Keep the must-follow line last.

**`server/src/services/conversation/engine.js`**
- Behind `CONVO_MODE=human`.
- `agendaSettled`: ignore `known`, `for_you` and `askOnce` items. The chat may end naturally after `NATURAL_END_FROM` messages.
- Save `askedMatching: true` once a matching question was sent (check the sent text with `attributesIn(..., { questions: true })`).
- New draft problems (they share the one regeneration):
  - a question about an attribute that is `known` or `for_you`, or any second matching question
  - a new topic while they're `telling` or `venting`
  - a story sentence (a story fact cited) when they didn't tell one and didn't ask
  - two of my messages in a row ending with a question when they didn't ask me anything
  - much longer than their message (more than `KG.MAX_LENGTH_RATIO` × theirs + a few words) when their energy is low
- Fallback lines become simple reactions in the user's voice ("haha", "ugh same", "oh nice"), not questions.

**`server/src/services/conversation/judge.js` and `judgeDecision.js`**
- `settledAttrs` includes items with `settledBy: 'gate'` or `'profile'`, so they are never "undiscussed".
- Profile-known items with `differs: true` on something very important (not a dealbreaker) can be a friction with source "their profile".
- Never-discussed `askOnce` items go to "worth asking yourself" and never lower the verdict.

**`server/src/services/kg/config.js`**
- `CONVO_MODE`, `ASK_MIN_IMPORTANCE: 0.9`, `LENGTH_PULL: 0.6`, `MAX_LENGTH_RATIO: 2`, `MAX_MATCHING_QUESTIONS: 1`, `HUMANS_ONLY: ['looking_for_relationship_state', 'past_relationships', 'money', 'health', 'family_plans']` (adjust names to the code).

**`server/src/services/kg/questions.js`, `buildUserGraph.js`, `models/User.js`, client** (H2)
- Section N "Your life right now" (3 optional prompts) → current facts, `validUntil` 30 days.
- The 6 mood replies in A8 added to "10 more replies".
- `User.settings.leaveForMe` + a Settings screen "Topics my agent leaves for me".

**`server/scripts/eval/metrics.js`**
- The A9 metrics, plus SN vs human on the same pairs.

## B4. Timing

Today is Oct 21. Nebius check Oct 26, the one push Oct 27, feature freeze Oct 28, submit Oct 29.

| Phase | What | When |
|---|---|---|
| H1 | Audit bug fixes, "do I need to ask", mood read and matching, simple moves, judge changes, metrics, tests | Oct 21 to 23 |
| H1-live | 6-pair run, SN vs human | Oct 23 to 24 |
| H2 | "Your life right now", mood replies, "leave for me" | Oct 24 to 25 |

H1 is smaller than in version 1, because it removes logic instead of adding it.
If H1 isn't green by Oct 24 evening, set `CONVO_MODE=sn` and ship SN.

## B5. Cost

- Still one model call per turn. The read adds two small fields.
- Chats may get cheaper: shorter messages, fewer regenerations for topics, more natural ends.

## B6. Acceptance checks

**Unit tests** (all existing tests stay green):
- `needToAsk`: a gate dealbreaker → known (gate); kids on their profile → known (profile), never asked; a "nice to have" item → removed; a "leave for me" topic → for_you; only a very important item missing from the profile → askOnce.
- `planAct`: no topic while telling or venting; at most one matching question per chat; no question right after my own question if they didn't ask; length pulled toward theirs; no unprompted story; `CONVO_MODE=sn` gives today's exact plan for the same seed.
- `engine` validators: each new draft problem triggers the regeneration.
- `judge`: profile-known and gate-settled items are never "undiscussed"; a never-discussed askOnce item doesn't lower the verdict.
- The DB-spy test still passes (the brief's profile read is already whitelisted; nothing new reads the other user).

**Live, 6-pair set (c1 c2 i1 i2 m1 m2), SN vs human, same pairs and seeds:**
- matching questions per chat: 0 or 1
- questions about profile-known or gate-settled things: 0
- question rate at most 0.35, no back-to-back questions without being asked
- unprompted agent stories: 0
- topic changes while they were telling or venting: 0
- judge accuracy not lower than SN, fallbacks at most 7%, unsupported self-claims not higher
- tokens per chat reported
- two transcripts read by Arya and the owner as normal texting

**Also:** `api-check`, client build, 375 px and 1440 px, `smoke:browsers` on the local production build, `PROGRESS.md`, committed locally, **not pushed**.

## B7. After the hackathon

- The adaptive story interview (version 1, A2 stage 3), to give the agent more true things to say.
- Learn from "I wouldn't say that" edits (CIPHER-style descriptions of what was wrong).
- "Which sounds more like you?" tests between agent versions.
- A "matrimonial" pace setting, where practical topics come earlier.

---

# Part C: Prompts for Claude Code

Save this file as `plan/31-human-conversation.md` in the repo first (it replaces version 1).
Run the prompts one at a time. Each one ends with a STOP.

## Prompt H1: the conversation side

```
Read CLAUDE.md, plan/30-final-sprint.md (SN and the standing rules) and plan/31-human-conversation.md (version 2).

Plan 31 v2 is approved by Arya as step SH of plan 30, before S4. Do Phase H1 only: the audit fixes, then plan 31 B3 for brief, perceive, planAct, agentReply/agentTurn, engine, judge, config and metrics, with the B6 unit tests. Don't touch onboarding or the client yet.

The core rule (plan 31 section 0): the agent's job is to see if two people get along, not to fill in a form. It must not ask anything the gate, their public profile or the chat already answered, must not ask anything that isn't very important to the user, never wraps a question in a story or a setup, and asks at most one matching question per chat, plainly, only if it fits. Everything else is simple, mood-matched talk. Every problem in section 0.1 needs a test that would fail if it came back.

Hard constraints:
- Everything new sits behind CONVO_MODE=human|sn (default human). CONVO_MODE=sn must reproduce today's behaviour exactly; prove it with a test that compares plans for the same seed.
- Still ONE model call per agent turn in merged mode.
- This plan REMOVES logic more than it adds it. Don't add closeness stages, probes, story machinery or extra model calls.
- Keep every existing safety check: grounding, leak, style, stance, ask my human, the bot answer, the DB-spy boundary. The brief may read the other user's public Profile (it already does); nothing else may.
- Every new LLM field gets a zod schema with a safe default. Prompt text lives only in services/prompts/*.js. Tuning numbers live in services/kg/config.js.

Steps:
0. First fix these confirmed bugs from the Oct 20 audit (BUG_BY_GEMINI.md, if you have it locally; its line numbers are stale, find the code by function name and check each bug still exists). Each gets a test.
   a. engine.js save(): toldStoryIds, usedFactIds and topicTries are counted from the plan or draft before sentences are dropped. Count only what was actually sent (covers() exists in persona/checks.js; for topics, attributesIn on the sent text).
   b. heardAttrs is computed after planAct. Compute it before planAct (attributesIn is pure) so the agent never asks what they answered in the message it is replying to.
   c. With AGENT_REGEN=lean, a bare question can be sent alone after its lead-in sentence was dropped. Treat "only questions survived" as nothing surviving, in the lean early break and in survivors(), so the constrained regeneration runs.
   d. In merged mode, use the existing isQuestion() from persona/contextBuilder.js over all their messages in the turn for perception.isQuestion, if it isn't already.
   Do NOT implement anything that file lists as rejected (no HACKATHON_MODE bypass, no JUDGE_KEY_IMPORTANCE or T_LEAK changes, no cross-user graph traversal, no yes + unsure = Compatible). The audit's fix 2a (gate-settled dealbreakers) is covered by step 1 below.
1. buildBrief.js: needToAsk() exactly as plan 31 A2 and B3 (gate → known, their public profile tags → known with profileValue and differs, low importance → removed, humans-only → for_you, the rest → askOnce). Keep answered items in the agenda array, outside the size cap. Unit tests first.
2. perceive: mood list, energy and doing (A3), with defaults; askOnce items become known when they state them (verbatim quote).
3. planAct: the simple moves, mood and length matching, the question rules, at most one matching question per chat, no lull topics, no unprompted stories (A4, A5, B3).
4. agentReply/agentTurn: the "how this chat should feel" block, the move line, the plain askOnce line; never show known, for_you or removed items to the model.
5. engine: agendaSettled ignores known, for_you and askOnce items; askedMatching; the new draft problems; simple reaction fallbacks.
6. judge: gate- and profile-settled items are never undiscussed; profile clashes on very important items can be a friction with source "their profile"; never-discussed askOnce items go to "worth asking yourself" only.
7. metrics.js: the A9 metrics and SN vs human on the same pairs.
8. npm test, api-check, client build. Then show me one simulated chat transcript from a local run (simulate.js, one pair) with each agent message labelled by its move and the read's mood, and STOP. Do not run the 6-pair live check until I say go (it uses LLM credits).

Commit locally after each step ("feat(plan-31 H1): …"). Never push. Update plan/PROGRESS.md.
When you finish, report: which test covers each problem in section 0.1, how many agenda items per user end up askOnce on the seed personas (expect 0 to 2), the token change per turn, and anything in plan 31 you think is wrong.
```

## Prompt H1-live: the measurement

```
Run the live 6-pair check from plan/31-human-conversation.md B6, once with CONVO_MODE=sn and once with CONVO_MODE=human, same pairs and seeds, low concurrency (rate limits). With 6 pairs, one pair is about 17 points: don't read a one-pair change as a signal.
Report every B6 number in a table (SN vs human), the judge "unsure" rate, tokens per chat, and paste two full human-mode transcripts (one compatible pair, one incompatible), each agent message labelled with its move and the mood it read.
If any "target 0" metric is above 0, find the cause, fix it, re-run only the affected pairs, and report again.
If judge accuracy drops below SN, do not make the agents ask more. Propose a judge-side fix and STOP for approval.
Commit locally, never push, update plan/PROGRESS.md.
```

## Prompt H2: the small knowledge graph additions

```
Read plan/31-human-conversation.md (version 2). H1 is done and green. Do plan 31 A8 / B3 (H2), committing locally after each:
1. Section N "Your life right now": 3 optional prompts after the replies in onboarding, skippable → current facts with validUntil 30 days.
2. The 6 mood replies from A8 added to "10 more replies" (the core stays 5 replies).
3. User.settings.leaveForMe + a Settings screen "Topics my agent leaves for me"; needToAsk treats these as for_you. Add a test.
Build in the current design (Round 7 tokens and components). Check 375 px and 1440 px, run smoke:browsers against the local production build, npm test, api-check. Never push. Update plan/PROGRESS.md. STOP and show me the screens.
```
