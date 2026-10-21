# 31: Human conversation (step SH)

> Requested by Arya on 2026-10-21.
> It builds on plan 30 step SN (bridges, lulls, message moves), which is already in the code.
> It is based on two research reports: "Modeling a specific person without narrowing them" and "How humans actually talk when getting to know a potential partner".
> Part A is the design, made without looking at the code.
> Part B maps it onto this repo, file by file.
> Part C has the prompts for Claude Code.
> All of it sits behind one env flag (`CONVO_MODE=human|sn`), so the demo can fall back to SN in one line if anything breaks before submission.

---

## 0. The five problems that must never happen

These are the highest priority.
Every design choice below exists to stop one of them.
Each one has a test and a metric in section B6.

**P1. The agent cannot talk outside the knowledge graph.**
The graph only holds answers to fixed questions.
So the agent has nothing to chat about, and casual talk sounds fake.
Never again: the agent must always have something real and true to say, or say honestly that it doesn't know.

**P2. The agent asks sensitive matching questions directly and early.**
Example: "would you like to have kids?" in the first messages.
Real people sense whether the connection is strong enough, feel embarrassment, and think about how they will look.
Never again: a sensitive topic is never raised cold, never before both sides have opened up, and never without testing the waters first.

**P3. The agents talk in a fixed pattern.**
Answer, ask, answer, ask.
Never again: questions are one option among many, and no agent fires questions back to back.

**P4. The agent jumps in while the other person is leading.**
When someone is telling a story, venting or sharing news, a human listens, reacts and holds their own question for later.
Never again: while the other side holds the floor, the agent only listens, reacts and asks about *their* story.

**P5. The agent has no feelings about the other person.**
It doesn't like or dislike, isn't curious or bored, never feels awkward.
It only aims at "match or discard".
Never again: the agent has an inner state that changes with the conversation, and that state visibly shapes what it says.

---

# Part A: The design

## A1. The core idea

Right now the agent has a brain (the knowledge graph) but no social mind.
It does this: look at the graph, find an open topic, ask about it.

A human does this instead:
1. Notices what the other person is doing right now (telling a story, joking, asking, venting).
2. Feels something about it (amused, curious, bored, a bit awkward).
3. Decides what is appropriate now, and how it would look.
4. Only then speaks.

So the design keeps the knowledge graph as the brain, and adds three things around it:
- **A richer brain:** the graph also holds stories, current life, opinions, the person's own words, and their pace.
- **A social mind:** an inner state that updates every turn, plus a private "think" step before speaking.
- **Social rules from research:** when to listen, when a topic is reachable, how deep to go, when to stop.

The research behind this, in one line each:
- Liking comes from responsiveness, not from collecting information (Huang et al. 2017; Reis and Shaver 1988).
- Disclosure grows in layers, and both sides take turns going deeper (Altman and Taylor 1973; Sprecher et al. 2013).
- Early heavy disclosure or questions feel "too much, too soon" (Wortman et al. 1976).
- People test the waters before risky topics, with hints, jokes or a general question (Baxter and Wilmot 1984).
- Topics move stepwise; sudden switches are rare and marked (Jefferson 1984).
- Listeners give continuers during a story, then a matching reaction, then maybe a second story (Schegloff 1982; Stivers 2008).
- Selective interest attracts; liking everyone doesn't (Eastwick et al. 2007).
- Almost no conversation ends when both people want it to, so end on a high (Mastroianni et al. 2021).

## A2. Building the person (the knowledge graph builder)

The fix for P1 starts here.
A fixed questionnaire decides in advance which parts of a person matter.
So the graph must be built from **open material**: stories, current life, the person's own words.

The flow has five stages.
Only stage 1 is required.
Stages 2 to 4 are short, optional, and each one makes the agent visibly better.

### Stage 1: Core (about 5 minutes, required)

Keep what the gate and the judge need:
- basics, photos, 3 prompts
- the values and lifestyle answers (kids, religion, location, smoking, drinking, family, career, looking for, diet, conflict, alone time)
- 5 "how would you reply?" messages

These answers are used for **filtering and judging only**.
They are never a script for the conversation.

### Stage 2: "Your life right now" (about 2 minutes, strongly suggested)

This is the single cheapest fix for casual talk.
People mostly chat about what is happening now, not about their values.

Three short prompts, any language, one or two lines each:
1. "What's taking up most of your time this week?"
2. "Something you're looking forward to soon?"
3. "The last thing you did just for fun?"

Each answer becomes a **current** fact with an expiry date (it goes stale).
The agent can now say "ugh, exam week" or "finally going home for Diwali" truthfully.
When a current fact expires, the inbox asks "still busy with exams?" (the reconfirm job already does a version of this).

### Stage 3: The story interview (adaptive, 5 to 10 minutes, optional)

An interviewer agent chats with the user like a curious friend.
It does not walk through a list.
It starts from a **seed**, then decides after every answer: follow up, or move on.

Rules for the interviewer:
- One question at a time, short, casual, in the user's language.
- Prefer "tell me about a time..." over "what is your...".
- If the answer is rich (a scene, a feeling, a person), follow up on it once or twice.
- If the answer is short or closed, move to a new seed.
- If the user says they'd rather not answer, move on and never come back to it.
- Stop after about 8 to 10 turns, or earlier if the user wants.
- Keep short running notes of what it has learned, so it doesn't ask the same thing twice.
- Pick the next seed from the area the graph knows least about.

**The seed bank.**
These are seeds, not a checklist.
Each group says what it reveals, and where the agent uses it later.

*A. Life story (McAdams). Reveals identity and emotional tone. Used for: second stories, sharing moves.*
- "If your life so far were a book, what would the chapters be called?"
  - Follow-up: "Which chapter are you in now?"
- "Tell me about a moment you felt most like yourself."
  - Follow-up: "Who was there?"
- "Tell me about a stretch that changed you. Not the worst, just one that mattered."
- "Was there a time you changed your mind about something big?"

*B. Daily life (Spradley's grand tour). Reveals routine and energy. Used for: small talk, current-life chat.*
- "Walk me through a normal weekday, from waking up to sleeping."
  - Follow-up: "What's the best part of that day?"
- "Describe a really good Saturday. And a really boring one."
- "What did you do last Friday night? Be honest."
- "What's something you do every week that you'd hate to give up?"

*C. Your own words. Reveals vocabulary and slang. Used for: the voice, so the agent sounds like them.*
- "How would you describe your friend group to someone new?"
- "What's a phrase your friends would say is very 'you'?"
- "What do you call [the thing they just mentioned] with your friends?"

*D. People in your life (Kelly's triads, with laddering). Reveals what they actually judge people on. Used for: the judge, and what the agent reacts warmly to.*
- "Think of your best friend, someone you find exhausting, and a coworker or classmate. How are two of them alike and different from the third?"
- "Think of three couples you know. Which one would you want yours to look like?"
- Laddering follow-ups on any answer:
  - Up: "Why does that matter to you?"
  - Down: "Can you give me an example?"
  - Contrast: "What's the opposite of that, for you?"

*E. Humour. Reveals humour style. Used for: tease and react moves.*
- "What's the last thing that made you laugh so hard you couldn't breathe?"
- "Who's the funniest person you know? What makes them funny?"
- "A story you always end up telling at parties?"

*F. Values in action (stories, not labels). Reveals conflict and repair style. Used for: the judge, disagreement moves.*
- "Tell me about the last real disagreement you had with someone close. What happened?"
- "Tell me about a time you stood up for something, even when it was awkward."

*G. Relationships, as lessons. Reveals needs and patterns. Used for: the judge only; the agent never brings these up.*
- "What did your best relationship or friendship teach you?"
- "What's something you used to put up with that you wouldn't now?"
- "When you're really into someone, what do you start doing differently?"

*H. Boundaries and pace. Reveals what must stay private or wait. Used for: topic readiness (A3.5).*
- "What's something you only tell people after you trust them?"
- "What would you want a match to know early, so it's not a surprise later?"
- "Is there anything you'd hate an AI to bring up for you?"

*I. The future, as scenes (no yes/no/maybe). Reveals kids, location and lifestyle with nuance. Used for: the judge, and probes.*
- "Picture a normal Sunday ten years from now. Who's there? What are you doing?"
- "When you're around kids, what usually happens? Tell me about the last time."
- "Where could you see yourself living, and where could you never?"

*J. Dealbreakers, through stories. Reveals real dealbreakers, not stated ones. Used for: the judge.*
- "Tell me about a date or a conversation where you knew in ten minutes it wouldn't work. What gave it away?"
- "Tell me about a moment you realised you really liked someone. What did they do?"

**How the bank grows** (post-hackathon, see H3):
- Good follow-ups the interviewer invents are saved, and the best ones become new seeds.
- When an agent in a real chat had no fact for a topic, that topic becomes a seed for that user.
- The user's own words become seeds ("tell me about a day with your climbing crew").

### Stage 4: Texting scenarios (voice plus pace)

The user writes the actual reply they would send.
These teach style and, just as important, **pace**.

Keep the existing ones, and add these behaviour-revealing ones:
1. "We've been chatting for 5 minutes and your match asks: 'so do you want kids someday?'" (how they handle a question that comes too early)
2. "Your match: 'ok so the weirdest thing happened on my way home...'" (how they react to a story starting)
3. "Your match: 'honestly today was terrible, my manager yelled at me in front of everyone'" (how they comfort)
4. "Your match: 'you're definitely the type who's late everywhere 😏'" (how they take a tease; already e13)
5. "Your match: 'I GOT INTO THE PROGRAM!!'" (how they celebrate; e9 is close)
6. "Your match sends a meme you don't get." (how they handle confusion)

Scenario 1 is the key one for P2.
A user who replies "haha that's a big question for minute five 😅" has told the agent exactly how they want early sensitive questions handled.

### Stage 5: Keep learning (already partly built)

- **Ask my human:** questions the agent couldn't answer go to the inbox; answers become facts. (built)
- **"I wouldn't say that":** the user corrects an agent line; the correction becomes a rule. (built)
- **Own chats after handoff:** with consent, the user's real messages become voice samples. (built)
- **Topics my agent leaves for me:** a short multi-select (kids, religion, past relationships, money, family plans) that the agent will never raise, only answer if asked. (new, cheap, gives the user control)

### What the graph holds after this

| Layer | Example | Where the agent uses it |
|---|---|---|
| Gate answers | smoking: never (dealbreaker) | filtering, judge |
| Facts and values | likes trekking; values honesty | share moves, reactions |
| Stories | "my dad recorded his pocket for two minutes" | second stories, small talk |
| Current life (expires) | "exam week, CFD mid-sem" | small talk, openers, "how's your week" answers |
| Own words | calls friends "the gang" | voice |
| Pace and boundaries | "deflects early big questions with a joke"; leave kids for me | topic readiness |
| Voice | lowercase, "haha", 8 to 14 words, Hinglish 20% | every message |

## A3. One agent turn: perceive, feel, think, then speak

### A3.1 The pipeline

1. **Perceive:** read their latest message(s).
2. **Update the inner state** from what was read.
3. **Decide what's allowed** (code): which moves fit this moment, which topics are reachable.
4. **Think** (private, never sent): what are they doing, how do I feel, what do I want, what would look bad.
5. **Speak:** pick one allowed move and write it in the user's voice, from the graph.
6. **Check** (code): grounding, style, and the five "never" rules. One regeneration at most.

Steps 1, 4 and 5 happen in **one model call**.
The output is ordered `read → think → message`, so the model reasons before it writes, at no extra call.

### A3.2 What the read must notice

Besides what is read today (concepts, claims, question, humour, warmth, mood, notes, agenda hits), add:

- **their mode:** what they are doing right now.
  - `story` (telling something that happened)
  - `venting` (a bad day, a complaint)
  - `good_news`
  - `joking`
  - `asking` (a question to me)
  - `answering` (replying to my question)
  - `opinion`
  - `small_talk`
  - `winding_down` (short, tired, closing)
- **story open:** they started a story and it isn't finished, or they're clearly mid-telling.
- **depth:** how personal their message is.
  - `surface` (weekend, weather, the app)
  - `preference` (likes, opinions on light things)
  - `personal` (feelings, family, plans, worries)
  - `vulnerable` (fears, hurts, something private)
- **threads:** short labels for things they mentioned that I could follow up later ("Hampi trip", "flatmate moved out").
- **bridges:** which of my open topics their message naturally leads to, by meaning (a nephew leads to kids; "my parents keep asking when I'll settle" leads to looking for and family).
- **signals:**
  - `askedBack` (they asked me something back)
  - `laughed`
  - `callback` (they referred to something said earlier)
  - `deflected` (dodged my question or changed the subject after it)
  - `formalShift` (suddenly more formal or distant)

### A3.3 The inner state

Each side keeps this across the conversation.
Every field changes only from **evidence in the chat**, never from a timer.

- **interest:** how much I'm enjoying this. Up with shared likes, humour, them asking back. Down with low effort, dislikes, repetition. (exists)
- **closeness:** how far the two of us have opened up, as one of three stages:
  - `strangers` at the start
  - `warming` once both of us shared at least `preference` depth, and they showed warmth at least once (laughed, asked back, a callback)
  - `opening_up` once both of us shared at least `personal` depth, warmth continues, and nobody deflected recently
  - It can also go **down**: a deflection or a formal shift drops it one stage. That is social penetration's "depenetration".
- **awkward:** set for my next two turns after they deflect, dodge or go formal. While awkward: lighter, shorter, no new topic, no probe, maybe a small joke at my own expense.
- **open threads:** their threads I haven't followed up yet. Source for follow-ups and callbacks.
- **held questions:** things I wanted to say or ask but the moment was wrong (they were mid-story). Brought back later as a callback: "wait, you never told me how the Hampi thing ended".
- **disclosure ledger:** the deepest level each side has shared. Rule: I never go more than one level deeper than they have.
- **probes:** for each sensitive topic, `untested`, `probed_warm` or `probed_cold`.
- **liking:** a short note of what specifically I like about them (from shared moments). Allows one selective-warmth line late in the chat ("ok you're actually fun to talk to"), never blanket praise.

### A3.4 Moves: what kind of message this is

The agent picks one move per message.
Code decides which moves are **allowed** right now; the model picks among them in its think step.

| Move | What it looks like | When it's allowed |
|---|---|---|
| `continue` | "wait what", "no way 😂 then??", "arre phir?" | they're mid-story |
| `affiliate` | "that's genuinely scary", "ugh, I'd have been so annoyed" | end of a story, venting |
| `celebrate` | "WAIT. tell me everything" | good news (active-constructive responding) |
| `answer` | answers their question, from the graph, or "honestly not sure" | they asked me |
| `follow_up` | one curious question about *their* thread | not mid-story (unless it's about the story) |
| `share` | something of mine that connects, no question | most times |
| `second_story` | "that reminds me of when I..." (shorter than theirs) | after their story was reacted to |
| `react` | a short reaction, that's the whole message | most times |
| `tease` | playful poke with a play marker (😏, haha) | they're joking, my voice teases, closeness at least `warming` |
| `small_talk` | light, no claim needed ("this heat is unreal") | early, or a lull, or the graph has nothing |
| `callback` | refers back to an earlier detail or a held question | at a lull |
| `probe` | a soft test of a sensitive topic (see A3.5) | readiness says `probe` |
| `topic` | a new direction, through a bridge or at a lull | readiness allows it |
| `close` | end on a high, mention picking it up later, no meeting plans | a peak moment after the minimum length, or boredom |

**Hard rules per their mode:**
- `story` and story open: only `continue` or `affiliate` (plus `answer` if they asked me something directly). No new topic, no agenda, no question that isn't about their story.
- `venting`: only `affiliate`, `follow_up` on their thread, or `react`. No tease, no topic.
- `good_news`: `celebrate` first.
- `asking`: `answer` first. Bouncing the question back is optional, not automatic.
- `winding_down`: `react`, `callback` or `close`. No new topic.

**Question rules:**
- At most one question per message (exists).
- No question in `continue` (except "and then?"), `affiliate`, `react`, `share`, `second_story`, `probe`, `celebrate` (except "tell me everything?").
- If my last two messages both ended in a question, this one doesn't, unless they asked me something.

### A3.5 Is it okay to raise this topic now?

This replaces "ask about the next agenda item".
It follows the research checklist, decided in code from the inner state.

**Topic classes** (from Baxter and Wilmot's taboo topics and social penetration):

| Class | Topics | What it needs |
|---|---|---|
| light | diet, alone time, career, interests | warm-up done, not mid-story, flows from the chat |
| personal | location, family involvement, drinking, smoking, conflict style | closeness at least `warming`, a bridge or a lull, not awkward |
| deep | kids, religion, what you're looking for | closeness `opening_up`, a bridge (never at a lull), and a warm probe first |
| humans only | where this is going, past relationships, money, health, anything the user listed in "leave for me" | the agent never raises it; it only answers if asked, from the graph, or says it'd rather talk about that later |

**The readiness check**, in order, for each open topic:
1. Is it reachable? Does a bridge exist in what was just said?
2. Has there been reciprocity? Have both sides shared at a similar depth?
3. Is there warmth? Recent laughter, asking back, longer replies, callbacks?
4. Is the other person leading right now? (story, venting) Then wait.
5. Has the water been tested? (deep topics only)
6. What would it cost if it lands badly? (higher class means more softening)
7. Is it needed? A dealbreaker the gate already checked doesn't need asking at all.

**Result, one of four:**
- `not_yet`: the topic isn't shown to the model at all.
- `probe`: the model may test the waters, without a question.
- `may_ask_if_flows`: the model may ask lightly, if it fits what was just said.
- `humans_only`: never raised by the agent. The judge lists it under "ask yourself".

**How a probe works** (Baxter and Wilmot's "secret tests"):
- The agent shares something of its own, or a third-party story, near the topic, without asking. Example: "spent all of Sunday at my niece's birthday, seven five-year-olds and a bouncy castle".
- The next read checks the reaction:
  - warm and engaged ("aw are you good with kids?") means `probed_warm`, and the topic becomes askable when it flows
  - flat or deflecting ("nice") means `probed_cold`: the topic stays closed in this chat and goes to "ask yourself"

### A3.6 Story listening (the fix for P4)

When their mode is `story`:
1. During the story: `continue` only. Short, in their energy, in the user's language ("wait WHAT", "no way", "sach mein? phir?").
2. When it ends: `affiliate` with the feeling of the story ("that's equal parts scary and wholesome").
3. Then, if it fits: `second_story`, shorter than theirs.
4. Anything the agent wanted to ask in the meantime goes to **held questions**, and comes back at a later lull as a callback.

When the agent itself tells a story (post-hackathon, H3), it can split it into a preface, the body and the punchline across 2 to 3 messages, and wait for continuers.

### A3.7 Small talk (the fix for P1 inside a chat)

The agent may always make light small talk that claims nothing about the user:
- the weekend, the week, the city, the weather, the app, food in general
- reactions and questions about what they said

It may only state things about the user that are in the graph.
Current-life facts (stage 2) give it true, fresh material ("exam week here too, CFD is killing me").
When it truly knows nothing, it says so honestly and naturally ("honestly never thought about it, what about you?"), and the question goes to the inbox (built).

### A3.8 The arc of an early chat

From social penetration theory, uncertainty reduction and speed-date data.
This is a tendency, not a schedule: topics come up when they become reachable.

1. Opening: something specific from their profile.
2. Light shared ground: the week, work or studies at surface level, current life.
3. Stories: travel, funny things, hobbies, with real reactions.
4. Opinions and preferences: food, places, light views.
5. Background: hometown, family in general, how they got here.
6. Feelings: what they love, what stresses them.
7. The future in general: plans, places.
8. Deeper and practical topics: only through bridges and probes, often left for the humans.
9. Close on a high: "this was fun, continue tomorrow?"

**Example: how kids should come up (or not).**

Robot, today:
> A: Hi! Do you want kids?

Human, with this design, over several turns:
> A: Spent my whole Sunday at my niece's birthday. Seven five-year-olds and a bouncy castle. *(probe, no question)*
> B: Oh no 😂 how did you survive *(warm: `probed_warm`)*
> A: Honestly I kind of loved it. Exhausted though.
> B: That's sweet. I'm the uncle who gets them hyper and leaves.
> A: Classic 😂 do you see yourself doing the full-time version someday, or happy being the fun uncle? *(`may_ask_if_flows`, light framing, easy way out)*

If B had replied "haha nice" instead, the topic would stay closed, and the judge would list "do they want kids?" under "ask yourself".

**Example: listening.**

> B: so I got stranded in Hampi when my bus broke down *(story open)*
> A: oh no. at night?? *(continue)*
> B: 11pm, middle of nowhere, phone at 4%
> A: stop. what did you do *(continue)*
> B: a guy on a scooter took me to his family's place, his mom fed me dinner
> A: that's honestly amazing. equal parts scary and wholesome *(affiliate)*
> A: reminds me of when I missed the last train in Kerala and a tea stall guy let me sleep in his shop *(second story)*

The agent's held question ("what do you do for work?") waits for a lull.

### A3.9 Signals to read in text

| Feeling | Signs in their messages |
|---|---|
| Interest | longer replies over time, asking back, follow-ups, new topics, callbacks, moving toward my style |
| Comfort | slang, self-correction, sharing feelings not just facts, teasing |
| Boredom | shorter replies, no questions back, "haha nice", sudden topic changes, shallower topics |
| Discomfort | joking deflection, topic change right after my question, sudden formality, hedges |
| Attraction | specific compliments, shared laughter, soft "we should..." lines, "I don't usually..." |

These are noisy, especially in text (most research is on speech).
So no single signal decides anything; the state changes on a pattern.

## A4. Measuring "human"

Numbers are for testing only.
They never drive the conversation.

- question rate per agent, and back-to-back questions
- story interruptions: turns where they were mid-story and the agent didn't `continue` or `affiliate` (target 0)
- deep topics raised without a warm probe, or before `opening_up` (target 0)
- depth jumps: the agent went more than one level deeper than them (target 0)
- the message number where the first personal and first deep topic appeared
- move variety per chat
- callbacks and held questions brought back
- chats that close on a high
- the owner reads two transcripts and says whether they read like two people
- offline only: an LLM judge picks "which of these two chats reads more like two real people" (new vs SN)
- judge accuracy and "Maybe" rate must not get worse; if it does, the fix goes into the judge, never back into forcing topics

---

# Part B: Fitting it into this repo

## B1. What already exists and stays

| Need | Already in the code |
|---|---|
| One model call per turn (read + reply) | `prompts/agentTurn.js`, `AGENT_TURN_MODE=merged` |
| Moves (answer, follow-up, share, react, topic) | `conversation/planAct.js` (plan 30 SN) |
| Topics only through a bridge or a lull | `planAct.js` `BRIDGES`, `bridgesTo`, lull logic |
| Gate-checked dealbreakers never asked cold | `planAct.js`, `engine.js` `agendaSettled` |
| Interest meter and boredom ending | `conversation/interest.js` |
| Grounding: every self-claim cites a fact | `persona/checks.js` `groundingCheck` |
| Honest "not sure" + ask my human | `persona/askedAboutMe.js`, `agent/askMyHuman.js` |
| Voice distributions, exemplars, language mix | `kg/voiceProfile.js`, `persona/contextBuilder.js` |
| "I wouldn't say that" corrections | `kg/ownVoice.js` |
| Current facts with reconfirm | `KgFact.isCurrent`, `kg/learning.js` `reconfirm` |
| Stories extracted with verbatim quotes | `kg/extractFacts.js`, `prompts/extractStoryFacts.js` |
| Judge with "ask yourself" | `conversation/judge.js`, `judgeDecision.js` |
| Metrics from saved chats | `scripts/eval/metrics.js` |

## B2. The gaps, per problem

**P1 (bounded graph):**
- Stories are optional now (plan 30 S2), so most users have only gate answers, interests and 5 replies. The graph is thinner than before.
- No "current life" input at onboarding.
- The 7 story prompts in "Teach your agent more" are fixed, not adaptive.
- The prompt never says small talk is allowed.

**P2 (sensitive topics too early):**
- Bridges are regex word lists. "My parents keep asking when I'll settle" doesn't bridge to looking for.
- No closeness, no reciprocity, no probe. Once a bridge fires, kids can be asked at turn 3.
- No topic classes; kids and diet are treated alike.
- `agendaSettled` still blocks the natural end on important topics, which pushes agents toward them near the end.

**P3 (fixed pattern):**
- SN lowered the question rate (75% to 57% in the scripted chat), but there's no rule against back-to-back questions.
- No `continue`, `affiliate`, `celebrate`, `second_story`, `callback`, `tease`, `small_talk` or `probe` moves.

**P4 (jumping in):**
- Nothing detects that they are mid-story or venting.
- In merged mode, `planAct` runs before the read, so it only sees code heuristics for this turn.

**P5 (no feelings):**
- Only `interest` exists. No closeness, awkwardness, curiosity, held questions or selective liking.
- No private "think" step: the model writes the message directly under constraints.

## B3. The changes, file by file

### Server: conversation

**`server/src/services/prompts/perceive.js`** (also used inside the merged call)
- Add to the read output: `theirMode`, `storyOpen`, `depth`, `threads` (max 3 short labels), `bridges` (agenda ids), `signals` { `askedBack`, `laughed`, `callback`, `deflected`, `formalShift` }.
- Explain each field in one line, like the existing ones.

**`server/src/services/conversation/perceive.js`**
- Extend `perceiveSchema` with zod for the new fields; every field has a safe `.catch()` default so a bad read never breaks a turn.
- Return them in `perception`.
- Semantic bridges from the read are added to the regex bridges (union), never replacing them, so nothing that works today stops working.

**`server/src/services/prompts/agentTurn.js` and `prompts/agentReply.js`**
- Output order becomes `{ "read": …, "think": …, "messages": …, "claims": …, "aboutThem": …, "unknownAboutMe": …, "end": … }`.
- `think` (private, max about 40 words in all): `theyAre`, `iFeel`, `want`, `move` (one of the allowed moves), `worry` (what would look bad right now), `holdForLater` (a question to save, or null), `myDepth` (the depth of my own message).
- Replace the single "Shape:" line with: the list of **allowed moves** for this turn, each with its one-line description from A3.4, and "pick one in think.move".
- Topic lines show readiness: `probe` gets the probe instruction ("share something of yours near this topic, or mention someone else's experience; no question"); `may_ask_if_flows` gets the light-ask instruction; `not_yet` and `humans_only` topics are not shown at all.
- Add a "small talk is fine" line and a "continuers in your own language" line to HOW A GOOD CHAT FEELS.
- Add one line: "If they are telling a story, your only job is to keep them telling it."
- Keep the must-follow line last (v1 lesson).

**`server/src/services/conversation/state.js`** (new, pure functions, unit-tested)
- `updateSocialState(state, perception, myLast)` returns the new `closeness`, `awkwardTurns`, `openThreads`, `ledger` { `mine`, `theirs` }, `probes`, `liking`, `lastQuestions` (my last two messages asked or not).
- Rules exactly as in A3.3. No timers.

**`server/src/services/conversation/readiness.js`** (new, pure)
- `TOPIC_CLASS` table: attribute to class, as in A3.5. Interests and clarify topics are `light`.
- `humans_only`: the class, plus the user's "leave for me" list (`User.settings.leaveForMe`), plus any `if_asked` or `private` topic.
- `readiness(item, state, perception, { bridged })` returns `not_yet | probe | may_ask_if_flows | humans_only`, following the 7 questions in A3.5.

**`server/src/services/conversation/planAct.js`**
- Keep the seeded sampling for length, burst, emoji, laugh and language (voice fidelity).
- Replace "pick the move" with `allowedMoves(...)` from A3.4 (mode rules, question rules, closeness for tease).
- Use the **previous** turn's read (stored in state) plus code heuristics for this turn (`storyOpenHeuristic`: an "ok so / so basically / long story / you won't believe" opening, a long message ending without a question, or an unfinished thought).
- `topic` only from items whose readiness is `probe` or `may_ask_if_flows`.
- The move is chosen by the model in `think.move`; code validates it.

**`server/src/services/conversation/engine.js`**
- Behind `CONVO_MODE=human` (default `human`; `sn` keeps today's behaviour exactly).
- After the merged read: `updateSocialState`, then compute readiness for the plan.
- `agendaSettled`: ignore `humans_only` items, deep items not reached, and `probed_cold` items. These go to the judge as "not discussed".
- Validate the draft (new problems in `draftProblems`, they share the single regeneration):
  - `think.move` not in the allowed set
  - the model's own read says `storyOpen`, and the draft has a question not about their story, or a new topic
  - a question on an attribute (`attributesIn(..., { questions: true })`) whose readiness isn't `may_ask_if_flows`
  - `think.myDepth` more than one level above `ledger.theirs`
  - my last two messages ended in a question, they didn't ask me anything, and this one does too
- Save `think` and the social state on the message's `actPlan` (for replay and metrics).
- Push `think.holdForLater` into `heldQuestions`; offer the oldest one at the next lull as a `callback`.
- Fallback lines stay follow-ups on their message; add continuers for story mode ("wait, then what?").
- Closing: when allowed to end and the last read had laughter or warmth, end with a warm "continue later" line (never a meeting plan).

**`server/src/services/kg/config.js`**
- `CONVO_MODE` default, `AWKWARD_TURNS: 2`, `HELD_QUESTIONS_MAX: 3`, `MAX_BACK_TO_BACK_QUESTIONS: 2`. These are tuning knobs, measured in B6, not rules about people.

**`server/src/services/conversation/judge.js`**
- Topics that were `humans_only`, `probed_cold` or never reached are listed as "not discussed" and go to "ask yourself", never counted against the match.
- No change to "code decides".

### Server: knowledge graph builder

**`server/src/services/kg/questions.js`**
- Add section `N` ("Your life right now"): the 3 prompts from A2 stage 2, each optional.
- Add the 6 scenario replies from A2 stage 4 to section E (behind the existing core list, so the core stays 5).

**`server/src/services/kg/buildUserGraph.js`**
- Section N answers go through `extractFacts` with `isCurrent: true` and `validUntil` 30 days ahead.

**`server/src/services/kg/interviewSeeds.js`** (new)
- The seed bank from A2 stage 3, grouped, each seed tagged with the area it fills.

**`server/src/services/prompts/interviewer.js`** (new) and **`server/src/routes/onboarding.js`**
- `POST /api/onboarding/interview` with `{ answer }` returns `{ question, done }`.
- One fast-tier call per turn: decide follow-up or new seed (least-covered area), write the next question in the user's language, update short running notes.
- Every user answer is stored and extracted like a story answer (existing `extractStoryFacts`, verbatim quotes checked in code).
- Max 10 turns. "I'd rather not" moves on and the seed is never asked again.

**`server/src/models/User.js`**
- `settings.leaveForMe: [String]` (kids, religion, past_relationships, money, family_plans).

### Client

- **Onboarding:** a "Your life right now" step after the replies (skippable), and the story interview replaces the fixed story list in "Teach your agent more" (`pages/Onboarding.jsx`, `components/TeachCards.jsx`).
- **Settings:** "Topics my agent leaves for me" (`pages/Settings.jsx`).
- **Replay and match room:** "What your agent was thinking" from `actPlan.think`, shown **only to that agent's own user**. Check that the messages API never sends `actPlan.think` to the other person (same redaction as `authoredBy`). This is also strong demo material.

### Eval

**`server/scripts/eval/metrics.js`**
- Add every metric in A4 that can be computed from saved messages and their `actPlan`.
- Add a section comparing `CONVO_MODE=sn` and `human` on the same 6 pairs.

## B4. Fitting the deadline

Today is Oct 21.
Plan 30 dates: Nebius check Oct 26, the one push Oct 27, feature freeze Oct 28, submit Oct 29.

| Phase | What | When | Why this order |
|---|---|---|---|
| **H1** | The conversation side: read fields, social state, readiness, allowed moves, think, validators, judge "not discussed", metrics, tests | Oct 21 to 24 | It fixes P2 to P5 directly, and it's what judges see in the demo |
| **H2** | The graph side: "Your life right now", the 6 scenario replies, "leave for me", the story interview, the "agent was thinking" view | Oct 24 to 25 | It fixes P1; the first three are small, the interview is the biggest piece |
| Nebius check | Re-measure on Token Factory (plan 14) | Oct 26 | The new read and think fields change token counts |
| **H3** | Everything in B7 | After the hackathon | Needs real users or more time |

If H1 isn't green by Oct 24 evening, set `CONVO_MODE=sn` and ship SN.
If the story interview isn't green by Oct 25, ship H2 without it (the fixed story prompts stay).

## B5. Cost and speed

- Still **one model call per turn** in merged mode. No new call is added to the chat.
- The read and think fields add output tokens: estimate +150 to +250 per turn (about +15% per chat on today's ~63k). Measure it in B6.
- The story interview adds one fast-tier call per interview turn, only at onboarding, only for users who choose it.
- If the merged JSON breaks more often with the bigger schema, the existing fallback to two calls still works.

## B6. Acceptance checks

**Unit tests** (`npm test`, all existing tests still green):
- `state.js`: closeness goes up only with reciprocal depth plus warmth; a deflection drops it a stage and sets awkward for 2 turns; held questions are capped; the ledger tracks the deepest level per side.
- `readiness.js`: a deep topic is `not_yet` at `strangers` even with a bridge; `probe` at `opening_up` with a bridge; `may_ask_if_flows` only after `probed_warm`; `probed_cold` stays closed; a "leave for me" topic is always `humans_only`; a gate-checked dealbreaker is never asked cold.
- `planAct.js`: story open allows only `continue`/`affiliate`/`answer`; venting forbids tease and topic; good news starts with `celebrate`; no third question in a row; tease needs `warming`.
- `engine` validators: each of the five new problems triggers the regeneration; `CONVO_MODE=sn` reproduces today's plan exactly (same seed, same plan).
- `agendaSettled` ignores `humans_only` and `probed_cold` items.
- The messages API never returns another user's `actPlan.think` (extend the DB-spy or API test).

**Live, the 6-pair set (c1 c2 i1 i2 m1 m2), SN vs human:**
- story interruptions: 0
- deep topics without a warm probe or before `opening_up`: 0
- depth jumps: 0
- question rate at most 0.45, and no three questions in a row from one agent
- at least 4 different moves per agent per chat
- judge accuracy not lower than SN (5/6), fallbacks at most 7%, unsupported self-claims not higher
- tokens per chat reported, at most +25% over SN
- two transcripts read by Arya and the owner as natural

**Also:** `api-check` green, client build green, 375 px and 1440 px checked, `smoke:browsers` against the local production build, `PROGRESS.md` updated, committed locally, **not pushed**.

## B7. After the hackathon (H3, from the first report)

- **Learn from edits (CIPHER):** every "I wouldn't say that" and every edit in shadow mode becomes a short description of what was wrong ("teases instead of complimenting directly"), stored with its context and retrieved for similar moments.
- **Calibration loop:** test chats where the user accepts, edits or rejects lines before going live.
- **"Which sounds more like you?"** pairwise tests between agent versions, instead of a fixed acceptance threshold.
- **Uncertainty-driven questions:** sample the agent's answer to a probe scenario several times; ask the user where the answers disagree.
- **Evidence-based confidence:** each fact keeps its quotes and a count of how often it predicted the user correctly, instead of fixed confidence numbers.
- **Facts with time:** "wanted to move to Berlin (2024), settled in Ahmedabad (2026)", both kept with dates.
- **Agent storytelling across messages:** preface, body, punchline, waiting for continuers.
- **A cultural frame:** a user setting for "matrimonial" pace, where practical topics (family, career, location) come earlier, still warmly.
- **A small per-user model** once there are real, consented chats (plan 30 already lists this as roadmap).

---

# Part C: Prompts for Claude Code

Save this file as `plan/31-human-conversation.md` in the repo first.
Run the prompts one at a time, in order.
Each one ends with a STOP.

## Prompt H1: the conversation side

```
Read CLAUDE.md, plan/30-final-sprint.md (especially SN and the standing rules) and plan/31-human-conversation.md.

Plan 31 is approved by Arya as step SH of plan 30, to run before S4. Do Phase H1 only (plan 31, B3 "Server: conversation", the judge change, the metrics, and the B6 unit tests). Do not touch onboarding or the client yet.

The five problems in plan 31 section 0 are the top priority. Every change must make one of them impossible, and every one needs a test that would fail if it came back.

Hard constraints:
- Everything new sits behind CONVO_MODE=human|sn (default human). CONVO_MODE=sn must reproduce today's behaviour exactly; prove it with a test that compares plans for the same seed.
- Still ONE model call per agent turn in merged mode. The read, think and messages come from the same JSON, in the order read, think, messages.
- No new hard-coded timers. The social state changes only from what is read in the chat. Tuning knobs go in services/kg/config.js.
- Keep every existing safety check: grounding, leak, style, stance, ask my human, the bot answer, the DB-spy boundary.
- think is private. It is stored on the message's actPlan and must never reach the other user through any API or socket event. Add a test.
- Every new LLM field gets a zod schema with a safe default, so a bad read never breaks a turn.
- Prompt text lives only in services/prompts/*.js.

Steps:
0. First, fix these confirmed bugs from the Oct 20 audit (BUG_BY_GEMINI.md, if you have it locally). Plan 31's state builds on the same counters, so they must be correct first. Each gets a test. Line numbers in that file are stale: find the code by function name, and check each bug still exists before fixing it.
   a. Count only what was actually sent (engine.js save()): toldStoryIds, usedFactIds and topicTries are set from the plan or the draft before sentences are dropped. Keep only claims covered by surviving sentences (covers() exists in persona/checks.js); mark a story told only if one of its sentences survived; count a topic try only if the sent text raised it (attributesIn on the sent text, or word overlap for non-attribute topics). Plan 31's probes and held questions must follow the same rule.
   b. heardAttrs lags a turn: it is computed from theirMsgs only in save(), after planAct. Compute it before planAct (attributesIn is pure) and pass it in, so the agent never raises a topic they answered in the message it is replying to.
   c. Orphaned question: with AGENT_REGEN=lean, if the bridge sentence is dropped by grounding, a bare "do you smoke?" can be sent alone. Treat "only questions survived" as nothing surviving (a substantive sentence = not a question and at least 2 content words), in both the lean early break and survivors(), so the constrained regeneration runs instead.
   d. Merged-mode isQuestion: if perception.isQuestion is still only text.includes('?'), use the existing isQuestion() from persona/contextBuilder.js over all of their messages in the turn.
   e. Gate-settled dealbreakers: if the two users matched, every dealbreaker on a gate attribute is already settled in code (services/match/gate.js). Today buildAgenda still puts them in the agenda as open, and judge.js counts every unanswered dealbreaker as an "undiscussed" severity-2 friction ("You never found out where they stand on..."). With plan 31 these topics are rarely raised, so every chat would be penalised for something the gate already checked. Fix in buildBrief.js: build the set from MY profile.gate.dealbreakers (the same source judge.js uses), keep those items IN the agenda (outside the AGENDA_SIZE cap) with status 'answered' and settledBy 'gate'. A dealbreaker_hint reopen in perceive.js must still set them back to open and be followed up. This touches only my own profile, so the information boundary is unchanged.
   Do NOT implement anything listed under "Gemini claims checked and rejected" in that file (no HACKATHON_MODE bypass, no JUDGE_KEY_IMPORTANCE or T_LEAK changes, no cross-user graph traversal, no yes + unsure = Compatible).
1. Add the new read fields (plan 31 A3.2) to prompts/perceive.js and conversation/perceive.js.
2. Add conversation/state.js and conversation/readiness.js as pure functions (A3.3, A3.5), with unit tests first.
3. Change planAct.js to compute allowed moves (A3.4) and topic readiness, using the previous turn's read plus the story heuristic for this turn.
4. Change prompts/agentTurn.js and prompts/agentReply.js: the think block, allowed moves, readiness-aware topic lines, small talk, continuers, the story rule.
5. Change engine.js: social state updates, the five new draft problems (sharing the one regeneration), held questions and callbacks, agendaSettled ignoring humans_only / not reached / probed_cold, closing on a high.
6. judge.js: not-discussed topics go to "ask yourself", never against the match. Gate-settled items (step 0e) stay answered and are never listed as undiscussed.
7. scripts/eval/metrics.js: the A4 metrics, plus an SN vs human comparison. Also add unbridgedQuestionRate: agent messages that have a question but no substantive non-question sentence, or whose non-question sentences are not related (embedding cosine below a threshold) to the other side's messages since my last turn. Calibrate the threshold by hand-labelling about 30 turns from the saved eval/raw-*.json, and run it on those saved chats first as a baseline.
8. npm test, api-check, client build. Then show me the plan you will use for the live 6-pair run, and STOP. Do not run the live pairs until I say go (they use LLM credits).

Commit locally after each step with messages like "feat(plan-31 H1): …". Never push. Update plan/PROGRESS.md.
When you finish, report: which tests cover each of the five problems, the token change per turn on one local simulated chat, and anything in plan 31 you think is wrong or risky for the Oct 26 Nebius check.
```

## Prompt H1-live: the measurement

```
Run the live 6-pair check from plan/31-human-conversation.md B6, once with CONVO_MODE=sn and once with CONVO_MODE=human, at low concurrency (NVIDIA rate limits).
Use the same pairs and seeds for both modes. With 6 pairs, one pair is about 17 points, so don't read a one-pair change as a signal.
Report every B6 number in a table (SN vs human), plus unbridgedQuestionRate and the judge "unsure" rate, tokens per chat, and paste two full human-mode transcripts (one compatible pair, one incompatible) with each agent message labelled by its move.
If any "target 0" metric is above 0, find the cause, fix it, re-run only the affected pairs, and report again.
If judge accuracy drops below SN, do not force topics back. Propose a judge-side fix and STOP for approval.
Commit locally, never push, update plan/PROGRESS.md.
```

## Prompt H2: the knowledge graph side

```
Read plan/31-human-conversation.md. H1 is done and green. Do Phase H2 (B3 "Server: knowledge graph builder" and "Client"), in this order, committing locally after each:
1. Section N "Your life right now" (3 optional prompts) → current facts with validUntil 30 days, shown in the onboarding flow after the replies, skippable.
2. The 6 scenario replies from A2 stage 4, added to "10 more replies" (the core stays 5 replies).
3. User.settings.leaveForMe + the Settings UI; readiness.js treats these topics as humans_only. Add a test.
4. "What your agent was thinking" in the match room and Replay, from actPlan.think, visible only to that agent's own user. Re-run the redaction test.
5. Last, only if 1 to 4 are green: the adaptive story interview (A2 stage 3): services/kg/interviewSeeds.js, prompts/interviewer.js, POST /api/onboarding/interview, replacing the fixed story list in Teach your agent more. Fast tier, max 10 turns, "I'd rather not" moves on for good, answers extracted with the existing extractStoryFacts and verbatim checks.

Build every new screen in the current design (Round 7 tokens and components). Check 375 px and 1440 px, run smoke:browsers against the local production build, npm test, api-check. Never push. Update plan/PROGRESS.md.
STOP after step 4 and show me the screens before starting step 5.
```
