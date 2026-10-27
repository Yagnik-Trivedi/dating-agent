# 34: Natural flow (casual start, real topics, a lead that moves, feelings, nothing ignored, vibe-based endings)

> Requested by Arya, 2026-10-27. Based on the code at `c900deb` (Twine), plans 31 and 33, and the research report "How humans actually talk when getting to know a potential partner".
> Merged with the team's prompt `CLAUDE-CODE-PROMPT-twine-natural-conversation.md`: its useful rules are folded in below (greeting variety, the question window, listening goals, threads, a shared lead with measured variety, tapback reactions, coverage fallbacks, an off-limits list, the dealbreaker split, pre-close and honest excuses, the 3-pair check).
> Everything sits behind `FLOW=natural|plan33` (default `natural`). `plan33` must give today's behaviour exactly, so the demo can go back in one line.
> Today is the planned push day and Oct 28 is the freeze. Build it, run the checks, and push only if they pass and the owner says so.

---

## 0. What Arya wants, and what the code does today

| Arya wants | Today in the code |
|---|---|
| Start casually: "hi", "hey how's it going", like real chats | The first message is a brief "opener" that reacts to something on their profile (`prompts/matchBrief.js`, `engine.js` opening). The fallback opener is "your profile made me smile 😄". |
| Not questions and answers; two people talking about each other, then chatting about a topic that came up | Each message is one move (reply / react / ask one question / share). Nothing lets both agents chat about a topic itself. Nothing limits generic get-to-know questions. |
| One person leads for a while, then the lead moves to the other, naturally and at random, never visibly taking turns | Nothing tracks who is leading. The only related rule: stay with them while they tell a story or vent. |
| Real reactions: liking or not liking what the other said, with feeling | `plan.reactions` gives "into it / not into it" for concepts in their message. No strength, surprise, amusement, empathy, teasing protest. No tapback reactions on messages. |
| No message is ever ignored; a topic the user doesn't want gets a polite decline and a topic change (or an ending) | The reply isn't checked to cover everything in their turn. Private topics are "deflected lightly". A dealbreaker hint jumps straight to a closing line. |
| Endings are smooth, with a genuine excuse, never a blunt "bye" | Session pauses use an excuse ("sleep, work, food"). The final message after a "no" (`prompts/windDown.js`) says "we're not quite on the same page". |
| Liked the vibe → a warm, proper ending. Didn't → a short, less careful one | The ending is the same whatever the interest. |

---

# Part A: The design

## A1. A casual start

**How real chats start:** a greeting, "how are you", a bit about the day. The specific stuff comes a few messages later.

- **A soft phase** per side, internal only, never visible in the text: `greeting → warmup → flow → winding_down`.
- **Greeting (the first 1 to 2 messages per side):** a short hello in the user's own voice and language mix ("heyy", "hii! how's your day going?"). The reply mirrors it and gives it back ("heyy good good, just got back from work 😅 wbu?"). Only small talk about the day or mood. No profile questions, no matching questions.
- **Greetings vary.** A small pool of greeting shapes is built from the user's own samples (their opening words, laugh form, case, emoji), sampled with the seed. No fixed template line.
- **Small talk stays grounded.** "Just back from work" needs a job or current-life fact; otherwise it stays generic ("pretty chill day tbh").
- **Warmup (the next 2 to 4 messages):** light small talk. The brief's profile opener (already grounded and validated) becomes the **first hook** here, phrased casually ("btw your pottery pic is so cool, how long have you been doing it?"). Other openers stay as hooks for later lulls.
- **A like comment** (the user's own words, written when they liked the profile) stays the first message, as today. The reply to it is casual.
- **A later session** opens casually too: "heyy", plus the callback from last time (exists).

## A2. Talking, not interviewing

A session moves through phases, and nothing forces them: warm-up → getting to know each other (mostly by sharing) → topic riffs → wind-down.

**Questions are rare:**
- **In one message:** at most 1 question, and only if the message also gives something (a reaction, an opinion, a share). A bare question alone is allowed only in the greeting and warmup ("wbu?").
- **Across the chat:** in any 6 messages in a row, each side asks at most 2 questions. Never two question-messages in a row from the same side, unless the other side asked something.
- **Generic get-to-know questions** ("what do you do for fun", "what are your hobbies", "where are you from", "what kind of music", "tell me about yourself", "favourite X", "what are you looking for") are caught by a code detector: at most 1 per agent per session, never in the greeting or warmup.
- **Follow-ups on what they just said are fine**, and they're most of the questions that get asked.

**Share before you ask.** If the agent wants to know something, it first gives its own side from facts ("i'm such a mountains person tbh, beaches make me lazy 😂"). The other person often answers without being asked. These statement-invites are the main way to learn things.

**Matching info is learned by listening:**
- The agenda becomes **listening goals**. `perceive.js` marks a goal as heard when they mention it naturally (exists as agenda hits with verbatim quotes).
- At most 1 direct matching question per chat, only when a bridge makes it flow (plan 31, `MAX_MATCHING_QUESTIONS = 1`, unchanged).
- A goal that stays unknown is a "worth asking yourself" for the judge (plan 31), **never a reason to ask more**.

**Lulls are filled with something to react to,** not an interview question: a share, an opinion, a playful take, a light hypothetical ("ok random but would you rather..."), a hook from the brief, from facts or the current topic.

**Topics that pop up get riffed on:**
- The conversation keeps a **current thread**: `{ topic, startedBy, depth, energy, sharedConcepts }`. Topic seeds come from the chat itself: something one side mentioned, a concept the speaker's own facts share with what they said, a story that connects.
- A live thread lasts a while (sampled 4 to 10 messages): opinions, jokes, banter, "same!!", small debates (the stance rule still applies), mini-stories, hypotheticals.
- The topic changes only when the thread has run out (short replies, low energy, depth reached), through a natural bridge ("speaking of food...", "omg that reminds me..."). Never a cold jump to something unrelated.
- **In a riff, general statements about the topic need no fact** (what the film is about, that exam season is stressful). **Anything personal** (has seen it, loves it, went there) still needs a fact, or an honest "haven't seen it yet, is it good?". Grounding stays as strict as today.

## A3. A lead that moves

**How real people do it:** one person carries the conversation for a while (telling, sharing, steering their topic), the other follows (reacting, short follow-ups). Then the lead passes, without a pattern.

**One lead value per conversation**, `lead: userId | null` plus `leadSince`, computed in code from the transcript (who brought the current topic, who's telling, whose messages are longer and carry new material). Both agents' planners see the same value. It works when the other side is a human, because it only reads the transcript.

**Leader:** longer messages, share / tell / opinion, brings sub-topics, may ask the one allowed question.
**Follower:** shorter messages, reactions ("wait what", "haha nooo", "and then??"), follow-ups about the leader's thing, small related shares ("same, i'm terrible at that too").
**Nobody:** light banter, both short.

**When the lead passes** (seeded randomness, probabilities in `kg/config.js`):
- The follower connects something of their own that's bigger than a reaction ("omg okay but this one time...") and becomes the leader.
- The leader runs out: a short message, no new material, or the stint length is reached. The stint length is sampled from 2 to 8 messages.
- The leader hands over ("anyway enough about me, how was your weekend?"). Rare.

**It must never look like turns:**
- Stint lengths per side vary (standard deviation at least 1.2 messages in simulations).
- No conversation switches the lead every message.
- The same person may lead two topics in a row.

The judge may use engagement (who led and how the other reacted) as evidence, but never mentions "lead" to users.

## A4. Reactions with feeling

**The read lists what in their message deserves a reaction:** an opinion, a joke, news, a compliment, a confession, a tease, a plan, a complaint, something they love or hate.

**Code works out the user's feeling** about each, from the user's graph and the interest meter:
- **love:** "WAIT you do pottery?? that's so cool"
- **like:** "oh nice", "ooh love that"
- **meh:** "haha fair", "hmm okay"
- **dislike:** an honest, kind "not my thing": "ehh horror isn't really my thing 😅 but i respect it", or a playful protest if that's the user's style: "nooo not biryani slander 😤"
- **amused:** a laugh in the user's own form, only if it was actually funny
- **surprised:** "wait what", "no wayy"
- **impressed:** "okay that's actually impressive"
- **relate:** "omg same, that happened to me too" (only from a fact)
- **empathetic:** they're down; kind, no jokes, no topic change
- **shy or teasing back** at a compliment, depending on how the user takes compliments (module H7 and reply samples)
- **disagree:** friendly, holding the view if the user's opinion is strong (the existing stance rule)

**How it shows:**
- The reaction comes first in the message.
- Its strength shows the way the user texts (emoji, caps, stretched words, laughs), only if they text like that.
- Feelings feed the interest meter (exists): that's how the agent comes to like or not like the other person over time.

### A4.1 Tapback reactions (like Instagram and WhatsApp)

- `Message.reactions: [{ by: userId, emoji, at }]`, one per user per message, from a small set: ❤️ 😂 😮 😢 👍 🔥 🙄.
- A socket event `message:reaction`; shown under the bubble in the match room and replay; labelled "reacted by Meera's agent" for screen readers.
- An agent may tapback **instead of** or **in addition to** a reply, on about 15 to 25% of messages, sampled from the user's emoji rate: mostly ❤️ or 😂 on things the user loves or finds funny, 😢 when they're down, 🙄 only in playful teasing if that's the user's style. Never a negative one.
- **A tapback alone never replaces an answer** to a question or news (A5).
- Humans can tapback too, after Take over (long-press or hover → picker).
- This part is optional: build it only after A1 to A6 are green.

## A5. Nothing is ignored

**The read lists everything in their turn that needs a response,** each with an id: questions, news, a story, a feeling, a compliment, a joke, a request. Their whole turn counts (all bubbles since my last message), not only the last bubble.

**The reply says what it covered:** `covers: [ids]`. Code checks that every item is covered:
- **questions:** answered from facts, or honestly "haven't thought about it / not sure", or the existing ask-my-human path
- **statements:** at least a reaction, in the text or as a tapback
- uncovered → the one regeneration, with "also respond to: ..."
- still uncovered → for a statement, a tapback on that bubble; for a question, the existing constrained retry focused on that one question. Never a canned template line.

**Bursts:** their 2 to 3 bubbles are one turn, but each meaningful one is addressed. One answer can bundle them ("haha same, and no i've never been to goa").

**Topics the user doesn't want to discuss** (private facts, sensitive categories, plan 31's humans-only list, and the user's "Topics my agent leaves for me" (`settings.leaveForMe`, exists), now with free text plus presets: politics, religion, exes, salary) are **declined and redirected, never ignored:**
- one short, kind line in the user's voice ("haha i'd rather not get into that one rn 😅"), then a pivot back to the current thread or something light
- matched with the existing concept and embedding similarity
- the private content never leaks (the existing rule)

**A dealbreaker that surfaces in the chat** is never ignored and never argued:
- **A hard gate dealbreaker the gate missed** (they say they smoke regularly, and that's the user's dealbreaker): reply to what they said, then end in the cool style (A6). The existing rule stays: one vague hint reopens the topic, a clear second one ends it.
- **Anything else:** acknowledge it lightly ("ah okay fair") and carry on; the judge records the friction.

**Messages sent after "talk tomorrow" or during a gap** are answered when the next session opens (exists as `callbackReply`; add a test).

## A6. Smooth, vibe-based endings

**Two kinds:** a **pause** (the end of a session: "talk later") and a **final end** (low interest, a dealbreaker, or after the judge's "no").

**Every ending:**
- **A pre-close first:** one message before closing, the closer signals it ("okay i should probably sleep soon 😅"), finishes the current thread and answers anything open (A5).
- **A real excuse that invents nothing:**
  - the local time of day in the user's time zone: late → sleep, morning → getting ready or work, evening → dinner
  - a fact the user really has: a job → "early start tomorrow", a gym habit → "heading to the gym", a current fact → "need to study for the mid-sems"
  - otherwise generic: "got some stuff to finish up"
  - never invented people, places or events ("mom's calling" is out unless a fact supports it)
- Never a bare "bye", never mid-sentence.

**The vibe decides how proper it is,** from the closer's interest, the warmth of the session and how their judge is leaning:

| Vibe | Example | What it has |
|---|---|---|
| **Warm** (interest ≥ `END_WARM`) | "this was so fun!! okay i need to sleep, early day tmrw 😴 but you still owe me that vada pav spot, talk tomorrow?" | appreciation, a callback to something from the chat, a future hook; may be 2 bubbles |
| **Neutral** | "haha okay i should head off, nice chatting! take care 🙂" | a short reason, polite, no future hook |
| **Cool** (interest ≤ `END_COOL`, or a dealbreaker) | "gotta run, good luck with everything!" | brief and kind, no "talk later", no hook. Never rude. |

**The other agent answers a close** in its own style, matching the vibe it read (a warm close gets a warm reply). After a final cool close, at most a one-line "you too! 🙂".

**The final message after a "no"** (`windDown`) uses the cool style instead of "not on the same page", with no promise to talk later. The "Not compatible" report still explains the reason privately to the user; the match never sees it, and the app shows them the match has closed.

**Sessions stay** (plan 33): a warm close at night is a session end, and the chat resumes later with a callback.

---

# Part B: Fitting it into this repo

- `kg/config.js`: `FLOW`, phase lengths, `QUESTION_WINDOW` (6) and `QUESTION_WINDOW_MAX` (2), `GETTOKNOW_PER_SESSION` (1), `THREAD_MESSAGES` [4, 10], `LEAD_STINT` [2, 8], lead-switch probabilities, `TAPBACK_RATE` [0.15, 0.25], `END_WARM` 0.65, `END_COOL` 0.4, `DEFAULT_TZ` (Asia/Kolkata; per-user when the profile has one).
- `prompts/perceive.js` + `conversation/perceive.js`: new read fields with zod defaults: `items` (id, bubble, kind, text), `reactTo` (text, kind), `topicSeeds`, `theyLead`.
- `models/Conversation.js`: `thread` and `lead` / `leadSince` (shared, derived from the transcript), phase per side in `agentState`.
- `conversation/planAct.js` (human mode, `FLOW=natural`): phases, the question rules and window, the get-to-know detector, listening goals, lull fillers, threads and bridges, the lead and its switching, feelings, tapback choice, the ending vibe and the excuse source.
- `conversation/engine.js`: the greeting first message, openers as hooks, `covers` checked with the fallbacks, the new draft problems (an uncovered item, a question breaking the per-message or window rule, a get-to-know question over the cap, a personal claim in a riff with no fact, a skipped hard topic, an ending with no pre-close, a bare "bye", an invented excuse, a "talk later" on a final end), the decline path, the dealbreaker split.
- `prompts/agentReply.js` + `agentTurn.js`: the natural-flow block, the phase and lead lines, reaction lines, the decline line, the riff rule, the ending line with vibe and excuse, `covers` and `tapback` in the output JSON.
- `brief/buildBrief.js` + `prompts/matchBrief.js`: openers become hooks.
- `conversation/sessions.js`: pause endings with the vibe and a pre-close; casual session openers.
- `compat/index.js` + `prompts/windDown.js`: the cool-style final message.
- `models/Message.js`, `sockets/`, `routes/matches.js`, client match room and replay: tapbacks (A4.1, optional).
- `models/User.js` (`settings.leaveForMe` free text + presets) and `client/src/pages/Settings.jsx`: "Topics my agent leaves for me".
- `scripts/eval/lib/convoMetrics.js` + `simulate.js`: the A7 metrics; each printed message labelled with phase, lead, move, feeling and tapback.

## A7. Measuring it

| What | Target |
|---|---|
| First 2 messages per side are greetings or small talk | 100% |
| Agent messages with a question | ≤ 30% |
| Messages with more than 1 question | 0 |
| Questions per side in any 6 messages | ≤ 2 |
| Generic get-to-know questions | ≤ 1 per agent per session, 0 in greeting and warmup |
| Lead switches per 20 messages | ≥ 2; stint standard deviation ≥ 1.2; never a switch every message |
| At least one thread of 4+ messages per session | yes |
| Their questions answered or declined | 100% |
| Ignored bubbles | 0 |
| Off-limits topics declined and redirected (not skipped) | 100% |
| Every ending has a pre-close and a real excuse; style matches the vibe | 100% |
| Invented facts or excuses | 0 |
| Tokens per pair | ≤ plan 33 + 15% |
| Judge accuracy | not lower than plan 33 |
| Arya reads two transcripts | "sounds like two people texting" |

---

# Part C: The prompt for Claude Code

Save this file as `plan/34-natural-flow.md`.

```
You're in the dating-agent repo (product: Twine).

Standing rules:
- Pull first: run git status. If there are local changes, stop and report them. Then git pull --rebase origin main; if it conflicts, stop and report.
- Read CLAUDE.md, plan/30-final-sprint.md (standing rules), plan/31-human-conversation.md, plan/33-questions-brain-long-chats.md, plan/33.1-handoff.md, plan/PROGRESS.md and plan/34-natural-flow.md.
- Never print, log or commit any secret value from .env.
- Plan 34 is approved by Arya. Add it to plan 30's order and PROGRESS (before S7).
- Build on the CONVO_MODE=human path (planAct.js planHuman, prompts/agentReply.js humanLines, engine.js) behind FLOW=natural|plan33 (default natural). FLOW=plan33 and CONVO_MODE=sn must reproduce today's plans and prompts exactly: prove it with a test that compares plans and prompt text for the same seed.
- Still one model call per agent turn (the new read fields, covers and tapback come from the same JSON), plus the stance check only on mustDisagree, plus at most 1 regeneration. No new model calls.
- Keep plan 31 (needToAsk, at most one plain matching question per chat, mood matching) and plan 33 (sessions, the bar, the user's own fillers, hedges). Keep grounding, leak, style, stance, ask my human, the bot answer, private / if_asked disclosure and the DB-spy boundary. Prompt text only in services/prompts/*.js, numbers only in services/kg/config.js, every new LLM field with a zod schema and a safe default.
- Commit locally after each step. Never push or deploy until I say "push" (auto-deploy is on: a push is a deploy).
- Where plan 34 leaves room, choose the most natural-sounding option and list the decision in your report.

What to build (plan 34 Part A; all of A1 to A6 are required, A4.1 tapbacks only once the rest is green):
1. A1, a casual start: soft phases greeting → warmup → flow → winding_down (never visible); greetings varied from the user's own samples (no fixed template); small talk grounded; brief openers become hooks used in the warmup and at lulls; a like comment stays the first message; later sessions open casually with the callback.
2. A2, talking not interviewing: at most 1 question per message and only with something else in it (bare questions only in greeting/warmup); at most 2 questions per side in any 6 messages; never two question-messages in a row unless they asked; the get-to-know detector and cap; share before you ask; listening goals (unknown is "worth asking yourself", never a reason to ask more); lulls filled with shares, opinions, playful takes or light hypotheticals; the current thread (4 to 10 messages, changed only through a bridge); general statements in a riff need no fact, personal claims still do. Remove the human-mode stall guard that forces a question.
3. A3, the lead: one shared lead per conversation computed from the transcript, leader and follower behaviour, switching (follower connects something bigger, leader runs out, stint 2 to 8 sampled, rare explicit hand-over), never strict alternation, the same person may lead twice, works with a human on the other side.
4. A4, feelings: love, like, meh, dislike, amused, surprised, impressed, relate, empathetic, shy/teasing back, disagree; the reaction first; strength shown only in the user's own ways; feelings feed the interest meter.
5. A5, nothing ignored: the read lists items in their whole turn; the reply returns covers; uncovered → the one regeneration → a tapback for a statement or the constrained retry for a question (never a canned line); bursts bundled; off-limits topics (private, sensitive, humans-only, settings.leaveForMe with free text and presets) declined kindly and redirected; the dealbreaker split (a hard gate dealbreaker the gate missed → reply, then a cool ending, keeping "first vague hint reopens, second ends"; anything else → acknowledge lightly, carry on, the judge records it); messages sent during a gap answered when the next session opens (test it).
6. A6, endings: a pre-close; an excuse from the time of day in the user's time zone, a real fact, or generic, never invented people, places or events; warm / neutral / cool from interest, warmth and the judge's leaning; the other agent answers a close in a matching style; windDown in the cool style with no promise to talk later; the private "Not compatible" report unchanged.
7. A4.1, tapbacks (only after 1 to 6 are green): Message.reactions, the socket event, the bubble UI in the match room and replay with screen-reader labels, agents at 15 to 25% from the user's emoji rate, never negative, never replacing an answer; humans can tapback after Take over.

Steps (commit locally after each, "feat(plan-34): ..."):
1. Config, the read (items, reactTo, topicSeeds, theyLead) and the Conversation fields.
2. planAct, with unit tests first: phase transitions, the question rules and window, the get-to-know cap, thread length and bridges, lead switching (stint standard deviation ≥ 1.2 over seeded 40-message runs, never a switch every message, the same person leading twice), feelings, the ending vibe and excuse source.
3. Engine: the greeting, hooks, covers and the fallbacks, the new draft problems, the decline path, the dealbreaker split, endings; windDown.
4. Prompts.
5. Metrics (plan 34 A7) and simulate.js labels (phase, lead, move, feeling, tapback).
6. npm test, api-check, agent-check, client build. Then ONE local simulated pair with CHAT_DEPTH=demo, every message labelled. STOP and show me the transcript.
7. After my "go": simulate.js on 3 pairs, 2 runs each: one designed compatible (Meera × Ishaan), one mismatched, one with a planted off-limits topic and a dealbreaker revealed in chat. Report the A7 table per run, tokens and calls per pair, and two full transcripts (the compatible one should end warm, the mismatched one cool or neutral).
8. Tapbacks (A4.1) if time allows, then 375 px and 1440 px and smoke:browsers on the local production build.

Report: files changed per step, the decisions you made, the A7 table, the transcripts, the local commits, test / lint / build results, and anything in plan 34 you think is wrong or risky for the freeze.
```
