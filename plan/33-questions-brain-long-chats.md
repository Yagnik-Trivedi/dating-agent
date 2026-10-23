# 33: The question bank, a brain-like graph, and long chats with a high bar

> Requested by Arya, 2026-10-23.
> Based on the two research reports (modeling a specific person; how humans talk when getting to know someone), plans 31 and 32, and the code at `bc06f3a`.
> It builds on what's built: plan 31 H1 (needToAsk, mood, simple moves, `CONVO_MODE=human`) and plan 32 KP (how you text, profile basics, inbox filter).
> Part A is the design. Part B maps it onto this repo. Part C has the prompts for Claude Code.

---

## 0. What's wrong today, and what this plan changes

**1. The chats are too short.**
`kg/config.js`: `MAX_TURNS: 14`, `NATURAL_END_FROM: 12`.
So every chat stops at 14 messages, 7 per agent.
Nobody knows anybody after 7 messages.

**2. A shared like is enough for a match.**
`conversation/judgeDecision.js` says "yes" with `JUDGE_YES_POSITIVES: 2`.
A "key" positive includes any like the user holds strongly.
So "you love coffee? me too" plus "trekking? same" is a match.
That's two hobbies, not compatibility.

**3. The questions give the agent nothing to chat about.**
Today's onboarding has 20 agree/disagree statements ("Am the life of the party"), 11 form questions (kids, smoking...), 7 optional stories and 5 reply samples.
Agree/disagree scales narrow a person down (first report).
Form answers are for filtering, not for talking.
So the agent runs out of real things to say, and falls back on asking.

**4. The chats don't sound like people.**
Real texting has "haha", "hmm", "idk", "i think", "wait actually", half-formed opinions and small stories.
The agent writes clean, finished sentences, and is always sure.

**What this plan changes:**
- A new question bank: about 160 questions plus about 100 follow-ups, in 16 modules, written to give the agent **things to casually talk about**, not answers to tick off.
- A **brain map**: every answer goes onto a branch (life area → topic → specific → story, opinion, reason), with links between branches.
- **Long chats in sessions**, like texting over a few days: up to 5 sessions, about 100 messages in all, deeper each session.
- **A much higher bar** for a match: evidence across many branches and at real depth, good chemistry in the chat itself, and at least 3 sessions.
- **Natural texture**: the user's own "haha", "hmm", "idk", "i think", real uncertainty, thinking out loud.

---

# Part A: The design

## A1. How many questions, and why

**The research says:**
- Agents built from a 2-hour interview predicted people far better than profiles or short descriptions. With 80% of the interview cut (about 24 minutes left), they kept most of the accuracy (Stanford, 1,052 people).
- Known, an interview-first dating app, reports most members spend about 26 minutes on its voice call.
- Gains level off once there's enough real evidence in a life area (Stanford 2026 revision).
- Agree/disagree scales and fixed lists narrow a person down; stories, daily life and their own words don't (first report).

**The decision:**
- **Required before the agent can chat: about 20 minutes.** The core (basics, photos, prompts, values, how you text, 5 replies) plus one module, "Your world right now". About 45 inputs.
- **Optional, but needed for long chats: 15 more modules**, 3 to 6 minutes each, done any time, in any order. About 120 more questions and their follow-ups.
- **A "brain strength" meter** shows which branches are filled. Long chats need talk material, so the agent starts talking only with the core + "Your world right now", and the app nudges toward **at least 4 more modules** (about 35 to 45 minutes in all). That matches the research's sweet spot.
- **The drip:** after onboarding, at most one question a day from an empty branch, in the inbox.

The team's earlier complaint (too many questions, boring) is handled by making everything past the 20-minute core optional, quick to answer (taps, one line, voice welcome), and visibly useful ("your agent can now talk about food").

## A2. How every question is written

1. **It gives the agent something to say.** A good question leaves behind a small, true thing the agent can bring up casually: "best thing I ate this week", "a song on repeat", "a travel disaster", "a hot take about my city".
2. **It's casual.** Written the way a friend would ask. No "rate yourself", no forms.
3. **It invites stories and opinions, not labels.** "Tell me about the last time..." beats "How do you handle...?"
4. **"I don't know" is a real answer.** Many questions have "can't decide", "depends" or "honestly no idea". These are saved as real uncertainty, so the agent can say "hmm idk, I keep going back and forth on that" truthfully.
5. **Follow-ups branch.** Answers open sub-questions ("Best trip?" → "Who were you with?" → "One moment you still think about?"). These make the branches deeper.
6. **Each question knows its branch** (where it goes in the brain map) and **who uses it**: the agent's small talk, the judge, or both.
7. **Private by default where it should be.** Family, love and boundary answers are for the judge and for answering if asked; the agent never raises them (plan 31's humans-only rule).

**Question types:**
- **tap:** quick chips (one or several)
- **pick:** this-or-that, always with "can't decide" or "depends"
- **line:** one short line
- **story:** a few sentences, typed or spoken
- **reply:** "your match says this, reply exactly like you'd text"
- **why:** an automatic follow-up on a strong answer ("what does it give you?", then "why does that matter?")

## A3. The brain map

Every answer becomes nodes on branches, like this:

```
You
├── Food & drink
│   ├── coffee ─ "filter coffee, strong, no sugar"
│   │   └── favourite place ─ "the tiny place near college"
│   ├── can cook ─ "rajma chawal, my mom's recipe"   (why: "reminds me of home")
│   └── hot take ─ "biryani is overrated" (strength: medium)
├── Outdoors & travel
│   ├── trekking ─ "obsessed"
│   │   ├── Hampta Pass ─ story: "stuck at camp in the rain, best maggi ever"
│   │   └── why ─ "clears my head" → value: calm
│   └── next trip ─ "Spiti, to see a sky with no city lights"
├── Right now (expires in 30 days)
│   ├── busy with ─ "mid-sems, CFD is killing me"
│   └── on repeat ─ "Prateek Kuhad"
├── Opinions
│   └── astrology ─ "idk, I read my horoscope but don't believe it?" (uncertain)
...
```

**Node kinds:** topic, specific, story, opinion (with strength), reason (why), feeling, uncertainty ("torn between", "changed my mind about"), current state (expires).

**Links:**
- **branch** (a child under its parent): coffee → favourite place
- **why** (a reason chain): trekking → clears my head → calm
- **associated** (the same thing on two branches): coffee is under food *and* under "morning routine"; Hampta Pass is under outdoors *and* under "friends" (who you went with)
- **supports** (a story shows a fact), **contradicts**, **supersedes** (as today, and as plan 32 designs)

This is the brain-like part: many branches, deep chains, and cross-links, so one thing they say can lead to several connected things the user really has.

**How it relates to plan 32:** plan 32 (after the hackathon) adds a shared ontology so "Kedarkantha" connects to "Hampta Pass" automatically. This plan's branches work now, on the current graph, and plan 32 later turns the branch paths into ontology links.

## A4. The question bank

Notation: `id · type · question`, then follow-ups as `↳`. **[A]** = agent talk material, **[J]** = judge, **[A·J]** = both, **[for you]** = never raised by the agent, only answered if asked. **(cur)** = a current fact that expires after 30 days.

### Core (required, about 10 minutes)

Kept from today: basics, photos (optional while testing), 3 profile prompts, "How do you usually text?" (KP1), 5 reply samples.

**Values and life (the gate needs these; reworded, each with an optional "say more")**

The option values stay exactly as today, so the gate, profile basics and needToAsk keep working.

- `kids` · tap · Kids someday? (yes / no / open / have already) ↳ line, optional: "What does that look like for you?" [J]
- `religion` · tap · How much does religion or spirituality show up in your life? ↳ "What does that look like day to day?" [J, for you]
- `location` · tap · Where do you see yourself living in a few years? ↳ "What's pulling you there?" [A·J]
- `smoking` · tap · Smoking? [J]
- `drinking` · tap · Drinking? ↳ "What's a good night out for you?" [A·J]
- `family` · tap · How involved is your family in your big decisions? ↳ "Tell me a bit about that." [J, for you]
- `career` · tap · Work right now is... (career-first / balanced / life-first) ↳ "What are you working toward?" [A·J]
- `looking_for` · tap · What are you looking for? ↳ "What would a good relationship feel like day to day?" [J]
- `diet` · tap · Diet? ↳ "A food you could eat every day?" [A]
- `conflict` · tap · When you disagree with someone close, you usually... ↳ story: "Tell me about the last time." [J]
- `alone_time` · tap · After a busy week you need... (lots of alone time / some / not much) [A·J]

**Removed from the core:** the 20 agree/disagree personality statements. Personality now comes from situation picks spread across modules (marked **(trait)**). The old statements stay readable in the data for existing users.

### Module W: Your world right now (required, about 8 minutes)

The agent's small-talk fuel. Most of it expires and gets re-asked.

- `W1` · line · What's keeping you busy this week? (cur) [A] ↳ pick: good busy or bad busy?
- `W2` · line · Something you're looking forward to? (cur) [A] ↳ line: "When is it?"
- `W3` · line · Last thing you did just for fun? (cur) [A] ↳ pick: "Would you do it again?"
- `W4` · line · What are you a little obsessed with lately? A show, a song, a food, a hobby... (cur) [A] ↳ line: "How did you get into it?"
- `W5` · line · Something mildly annoying you right now? (cur) [A]
- `W6` · line · Best thing you ate this week? (cur) [A] ↳ line: "Where?"
- `W7` · pick · Morning person or night owl? (or "depends on the day") [A] (trait)
- `W8` · story · Walk me through a normal weekday, roughly. [A·J] ↳ line: "Best part of it?"
- `W9` · line · What do your weekends usually look like? [A]
- `W10` · line · Song or artist on repeat right now? (cur) [A]
- `W11` · line · The last photo on your phone that isn't a screenshot. What is it? (cur) [A]
- `W12` · line · Where in your city do you end up most often? [A] ↳ line: "What's there?"

### Module L: Your story (about 6 minutes)

From the life-story interview (McAdams).

- `L1` · story · If your life so far were a book, what would the chapters be called? [A·J] ↳ "Which chapter are you in now?" ↳ "What ended the last one?"
- `L2` · line · Where did you grow up, and what was it like? [A] ↳ "Something only people from there would get?"
- `L3` · story · A moment you felt most like yourself? [A·J] ↳ "Who was there?"
- `L4` · story · A stretch that changed you. Not the worst, just one that mattered. [J] (sensitive-checked)
- `L5` · story · Something you changed your mind about? [A·J] (gives "I used to think...")
- `L6` · line · A decision you're kind of stuck on right now? [A] (cur, uncertainty)
- `L7` · line · Someone who shaped how you see things? (a role is fine) [J] ↳ "What did they teach you?"
- `L8` · line · Proudest small win lately? (cur) [A]

### Module F: Food & drink (about 4 minutes)

- `F1` · line · Food you could eat every day? [A]
- `F2` · pick · Street food or a nice restaurant? (can't decide) [A]
- `F3` · line · A food opinion people argue with you about? [A] ↳ tap: "How strongly do you hold it?"
- `F4` · line · Can you cook? Your one reliable dish? [A] ↳ "Who taught you?"
- `F5` · tap · Chai or coffee? (chai / coffee / both / neither) [A] ↳ line: "How do you take it?" ↳ line: "Favourite place for it?"
- `F6` · line · Best place to eat in your city? [A]
- `F7` · story · A food you'll never eat again, and the story? [A]
- `F8` · line · Midnight snack of choice? [A]

### Module O: Outdoors, travel & places (about 5 minutes)

- `O1` · tap · Mountains, beach, city, or stay home? (several ok) [A]
- `O2` · line · Best trip you've taken? [A·J] ↳ "Who were you with?" ↳ story: "One moment from it you still think about?"
- `O3` · line · Next place you really want to go, and why? [A]
- `O4` · pick · Planned trip or spontaneous? (depends) [A·J] (trait)
- `O5` · story · A travel disaster story? [A]
- `O6` · line · Something outdoors you love doing? [A] ↳ tap: "How often?" ↳ line: "Favourite spot?" ↳ why
- `O7` · line · A place in your city you'd take someone to show it off? [A]

### Module E: Films, shows, music, books, games (about 5 minutes)

- `E1` · line · A film or show you've rewatched more than twice? [A] ↳ "Why that one?"
- `E2` · line · Watching or reading anything right now? (cur) [A]
- `E3` · tap · Genres you go for (thriller, comedy, romance, horror, documentary, anime, sci-fi, drama, other) [A]
- `E4` · line · Music for a long drive? [A]
- `E5` · line · A song that takes you straight back to a memory? [A] ↳ "What memory?"
- `E6` · line · A book, game or podcast you'd recommend to anyone? [A]
- `E7` · line · Something everyone loves that you think is overrated? [A]
- `E8` · line · A concert or live event you'd go to again? [A]

### Module S: Friends & people (about 4 minutes)

- `S1` · line · Describe your friend group in a few words. [A] ↳ "What do you usually do together?"
- `S2` · pick · At a party you're usually... in the middle / with a few people / near the food / leaving early [A·J] (trait)
- `S3` · line · What do your friends come to you for? [A·J]
- `S4` · line · The friend who knows you best: what would they say about you? (a role is fine) [A·J]
- `S5` · pick · Plans: you make them / you join them / depends [J] (trait)
- `S6` · story · Funniest thing that happened with friends recently? (cur) [A]
- `S7` · pick · After a lot of people, you recharge... alone / with one close person / with more people [J] (trait)

### Module H: Humour & fun (about 4 minutes)

- `H1` · line · Last thing that made you laugh out loud? [A]
- `H2` · line · Funniest person you know, and why? (a role is fine) [A]
- `H3` · story · A story you always end up telling at parties? [A]
- `H4` · tap · Your humour (sarcastic, silly, dry, dark-ish, wholesome, puns, memes) [A·J]
- `H5` · line · Something you're weirdly good at? [A]
- `H6` · line · A harmless lie you told as a kid? [A]
- `H7` · reply · Your match: "you're definitely the type who's late everywhere 😏" [A] (how you take a tease)

### Module T: Hot takes & opinions (about 4 minutes)

The source of real "i think", "hmm" and "idk".

- `T1` · pick · Pineapple on pizza? (yes / no / never tried / don't care) [A]
- `T2` · line · A small hill you'd die on? [A] ↳ tap: "How strongly?"
- `T3` · line · Something you'll argue about with friends? [A] ↳ tap: "How strongly?"
- `T4` · pick · Texting or calls? (depends) [A]
- `T5` · pick · Dogs or cats? (both / neither) [A]
- `T6` · line · An unpopular opinion about your city? [A]
- `T7` · line · Something you used to hate but now like? [A] (gives "I used to...")
- `T8` · pick · Your opinions are usually... very sure / depends / I change my mind a lot [A] (sets how often the agent hedges)
- `T9` · line · Something you honestly can't decide about? [A] (uncertainty)
- `T10` · pick · Astrology? (into it / for fun / no / idk) [A]

### Module D: Daily life & little things (about 4 minutes)

- `D1` · line · First thing you do in the morning? [A]
- `D2` · line · Your comfort thing on a bad day? [A·J]
- `D3` · line · Small pet peeves? [A]
- `D4` · line · Something in your room that says a lot about you? [A]
- `D5` · pick · Messy or tidy, honestly? [A·J] (trait)
- `D6` · line · The app you open way too much? [A]
- `D7` · line · A habit you're trying to build? (cur) [A] ↳ "How's it going?"
- `D8` · pick · Early to everything, on time, or slightly late? [A·J] (trait)

### Module K: Work, study & ambition (about 4 minutes)

- `K1` · line · What do you actually do all day? [A]
- `K2` · line · Best and worst part of it? [A]
- `K3` · line · Why this path? [A·J] ↳ pick: "Would you pick it again?"
- `K4` · line · Something you're working toward this year? [A·J] ↳ why
- `K5` · pick · Work talk after hours: love it / a bit / please no [A]
- `K6` · line · Dream job if money didn't matter? [A]
- `K7` · line · Something new you learned recently? (cur) [A]

### Module FA: Family & home (about 3 minutes, [for you] by default)

- `FA1` · line · Who's at home? [J]
- `FA2` · line · Something your family does that you love? [J]
- `FA3` · line · A festival or family tradition you love? [A·J] ↳ "What happens?" (the festival itself is fine small talk)
- `FA4` · line · The sibling or cousin you're closest to? (a role is fine) [J]
- `FA5` · pick · How often do you talk to family? (daily / weekly / less) [J]
- `FA6` · line · A family food you'd miss? [A]

### Module V: How you handle things (about 5 minutes)

Values in action, for the judge mostly.

- `V1` · story · The last real disagreement with someone close. What happened? [J]
- `V2` · line · When you're stressed, what do you do? [A·J] ↳ "What actually helps?"
- `V3` · line · When someone lets you down, what do you do first? [J]
- `V4` · story · A time you stood up for something, even when it was awkward? [J]
- `V5` · line · What does a good apology look like to you? [J]
- `V6` · pick · Big decisions: gut / pros and cons / ask people [A·J] (trait)
- `V7` · line · A value you won't bend on? [J] ↳ story: "A time it mattered?"
- `V8` · why · For your 3 strongest likes: "What does it give you?" ↳ "Why does that matter?" [A·J]

### Module R: Love & dating (about 5 minutes, [for you])

For the judge and for pace; the agent never raises these.

- `R1` · line · What does a good relationship feel like day to day? [J]
- `R2` · line · Green flags you notice early? [J]
- `R3` · line · Something you used to put up with that you wouldn't now? [J]
- `R4` · line · When you're into someone, what do you start doing differently? [J]
- `R5` · tap · What makes you feel cared for? (time, words, help, small gifts, touch, not sure) [J]
- `R6` · line · A moment you realized you really liked someone. What did they do? [J]
- `R7` · line · What would you want a match to know early? [J]
- `R8` · line · Anything you'd hate an AI to bring up for you? [J] (boundary)

### Module FU: The future, as scenes (about 3 minutes)

- `FU1` · story · Picture a normal Sunday ten years from now. Who's there? [J]
- `FU2` · line · Where could you see yourself living, and where never? [A·J]
- `FU3` · line · Something you want to have done by 35? [A·J]
- `FU4` · line · When you're around kids, what usually happens? [J]
- `FU5` · pick · Plan the future or take it as it comes? (depends) [A·J] (trait)

### Module X: How you talk (reply like you'd text, about 6 minutes)

The 15 existing replies stay. These 12 are added, so the agent learns your real "haha", "hmm", "idk" and "i think":

- `X1` · reply · "ugh today was so long" (tired)
- `X2` · reply · "I GOT INTO THE PROGRAM!!" (excited)
- `X3` · reply · "lol ok" (low effort)
- `X4` · reply · "my manager yelled at me today" (venting)
- `X5` · reply · "you're kinda cute you know 😏" (flirty)
- `X6` · reply · "sorry, super busy today" (busy)
- `X7` · reply · "so what's your 5 year plan?" (the honest "hmm idk")
- `X8` · reply · "do you believe in astrology?" (the "i think...")
- `X9` · reply · "what's something you're bad at?" (self-deprecating)
- `X10` · reply · "ok so the weirdest thing happened on my way home" (a story starting)
- `X11` · reply · "so do you want kids someday?" (a big question too early)
- `X12` · reply · "what do you think about long distance?" (thinking out loud)

### Totals

| Part | Questions | Follow-ups | Time |
|---|---|---|---|
| Core (kept + reworded) | about 30 inputs | 11 optional "say more" | ~10 min |
| W: your world right now (required) | 12 | 8 | ~8 min |
| 14 optional modules | 105 | about 40 + "why" chains | 3 to 6 min each |
| X: how you talk | 12 new (+15 existing) | | ~6 min |
| **All** | **about 160** | **about 60 to 100** | **~20 min required, ~60 to 75 min for everything** |

Mapping of today's story questions (so nothing is lost): `sunday` → W9, `hill` → T2, `argue` → T3, `weirdly_good` → H5, `laugh` → H1, `place` → O3, `friends_rely` → S3. Old answers keep their ids and count toward the new modules.

## A5. Long chats, in sessions

**How real people do it:** a few days of texting, each sitting a bit deeper than the last (social penetration theory), with callbacks to what was said before.

**The design:**
- A **session** is one sitting: 16 to 24 messages (8 to 12 per agent). It ends naturally ("ok I need to sleep, talk tomorrow?").
- Up to **5 sessions**, about 100 messages in all.
- **Gap between sessions:** configurable. Real use: a few hours to a day. Demo and seed accounts: about a minute.
- Each session **unlocks deeper branches** for retrieval and sharing. It doesn't force topics; things still only come up in the flow (plan 31):
  - Session 1: right now, daily life, food, films and music, light opinions
  - Session 2: stories, friends, humour, travel, work
  - Session 3: life story, how you handle things, hot takes with real disagreement
  - Session 4: the future as scenes, values, why-chains
  - Session 5: wrap-up, open threads, the one plain matching question if still needed
- **Each session opens with a callback**: "how did the exam go?", "did you end up watching it?". These come from open threads and current facts from the last session.
- **Memory across sessions:** the last 20 messages stay raw. Earlier sessions become a short summary (one cheap call at the end of each session) plus a list of open threads and topics already covered, so nothing gets asked twice.
- **Ending early is still allowed:** a dealbreaker conflict ends it at once; low interest on both sides for two sessions ends it as "not a match".

## A6. Natural texture: "haha", "hmm", "idk", "i think"

- **The user's own fillers.** The voice profile gets a filler list with rates, from their real replies and the X module: haha / lol / hmm / idk / i think / tbh / lowkey / wait / acha / arre / ngl... The agent uses **their** forms, at about **their** rate. Never a filler they never use.
- **Real uncertainty.** A node marked uncertain ("can't decide", "idk", "changed my mind") or an opinion of low strength is said with a hedge: "hmm I think...", "idk honestly, I keep going back and forth". Strong opinions are said plainly.
- **Two new moves** (added to plan 31's moves):
  - `think`: thinking out loud before answering ("hmm good question... I think the mountains? but beaches are also so nice")
  - `not_sure`: an honest "idk / never really thought about it", then something real
- **Small imperfections, if the user does them:** lowercase, a self-correction ("*Pune"), a message split in two (KP1's bursts).
- **Laughing only when something is funny.** No "haha" on every message.
- **The code checks the rate:** fillers per message stay near the user's own rate (a soft check, not a regeneration).

## A7. The bar for a match

**Yes needs all of these:**
1. **Enough conversation:** at least 3 sessions and at least 50 messages.
2. **Enough evidence, across branches:** at least 8 verified positives (their exact words, as today), from at least 5 different branches.
3. **At real depth:** of those, at least 3 at "personal" depth (stories, people, how they spend their life) and at least 2 at "deep" depth (values in action, how they handle things, the future, why-chains).
4. **Surface likes barely count:** shared likes like coffee, films or food count as at most 3 positives in total. Coffee alone can never make a match.
5. **Chemistry in the chat itself (measured in code):**
   - both sides ask each other things
   - laughter both ways at least twice
   - their messages don't shrink over the sessions
   - interest at least 0.6 at the end of each of the last 2 sessions
6. **No serious friction**, and at most 2 notable ones, each actually talked about.
7. **Consistency:** nothing they said contradicts something they said earlier.
8. **Code confidence at least 0.8** (today 0.65).

**No** stays quick: a dealbreaker conflict, a serious friction on something core, or low interest for two sessions in a row.

**Otherwise:** the next session. After the last session without a yes or a no, it's **Maybe**, with the list of what's still unknown ("worth asking yourself", as today).

**Each depth tier is defined by the branch:**
- surface: food, films and music, hot takes, little things, right now
- personal: stories, friends, travel, work, daily life, humour
- deep: how you handle things, life story, the future, love (judge only), why-chains

**When the judge runs:** a short evidence pass at the end of each session (one call per side), adding to an evidence ledger. The decision is made in code, as today. The final verdict call happens once.

## A8. Cost and time (honest)

- Today: about 62.5k tokens and about 5 minutes per pair, for 14 messages.
- With sessions, about 50 to 100 messages: about **250k to 450k tokens per pair**, with the memory summaries keeping each turn's prompt about the same size as today. That's 4 to 7 times today.
- **Model time:** about 20 to 40 minutes per pair, spread across sessions.
- **Budget controls:** `JUDGE_LIVE_CHATS_PER_DAY` (exists), `LLM_HARD_CAP_USD` (exists), a new `CHAT_DEPTH=full|demo`:
  - `full`: the A5 and A7 numbers
  - `demo`: 3 sessions of 16 messages, a yes allowed from message 40, for seed and judge accounts, so the demo video stays watchable
- Prices on Nebius Token Factory must be checked before the Oct 26 switch (`LLM_PRICE_*` are still 0 in `.env.example`).

## A9. Measuring it

| What | Target |
|---|---|
| Messages per chat, sessions per chat | median ≥ 50 messages, ≥ 3 sessions on compatible pairs |
| Yes decisions with a surface-only reason | 0 |
| Yes decisions with ≥ 2 deep positives | 100% |
| Harmful yes on the labelled pairs (`seed/pairs.json`) | 0 |
| Judge accuracy on the 20 pairs | not lower than today |
| Repetition: the same topic or question in two sessions | ≤ 1 per chat |
| Fillers per message vs the user's real rate | within ±50% |
| Hedged statements on uncertain or weak nodes | ≥ 80% |
| Question rate per session (plan 31) | ≤ 0.35 |
| Tokens and minutes per pair | reported, `full` and `demo` |
| Two transcripts read by Arya and the owner | "sounds like two people texting over a few days" |

---

# Part B: Fitting it into this repo

## B1. What stays

- Plan 31 H1: needToAsk, mood, simple moves, the one plain matching question, `CONVO_MODE=human|sn`.
- Plan 32 KP: how you text, profile basics, the inbox filter.
- Grounding by fact ids, the leak check, disclosure tiers, the DB spy, one model call per turn.
- The B option values (gate, basics and needToAsk depend on them).
- Old answer ids (A, C, E sections) stay readable; existing users don't lose anything.

## B2. Files

**Questions and answers**
- `server/src/services/kg/questions.js`: restructured into `CORE` + `MODULES` (W, L, F, O, E, S, H, T, D, K, FA, V, R, FU, X). Each question: `{ id, module, branch, type, text, options?, subs?: [{ if, id, type, text }], uses: 'agent'|'judge'|'both', disclosure, current?, trait? }`. The old A/C/E ids are kept as aliases (A4's mapping).
- `server/src/services/kg/answers.js`: zod for `answers.M[moduleId][qid]` and sub-answers; "can't decide" / "idk" options are valid values.
- `server/src/routes/onboarding.js`: `GET /onboarding/modules` (questions + my progress per module), `POST /onboarding/module/:id` (saves one module and builds **only that module**, instead of re-running the whole build), the core stays `POST /onboarding/submit`.

**The brain map (on the current graph, no plan 32 needed)**
- `server/src/models/KgFact.js`: `branch: [String]` (the path, for example `['food', 'coffee', 'favourite place']`), `qid`, `uncertain: Boolean`, `depthTier: 'surface'|'personal'|'deep'`, `currentUntil` (for current facts). All new, nothing removed.
- `server/src/models/KgEdge.js`: new types `BRANCH_OF` (child → parent) and `ASSOCIATED` (same concept on two branches), plus `WHY` (a reason chain).
- `server/src/services/kg/questionnaireFacts.js`: taps and picks → facts with branch and depth tier; "can't decide" → an uncertain fact; trait picks → trait scores (replacing the Likert source when present).
- `server/src/services/kg/buildUserGraph.js` + `extractFacts.js` + `prompts/extractStoryFacts.js`: line and story answers → facts placed under the question's branch, with `BRANCH_OF` edges; "why" answers → `WHY` edges; the same concept on two branches → `ASSOCIATED`. Verbatim quote checks stay. A per-module build.
- `server/src/services/kg/learning.js`: current facts past `currentUntil` → re-ask in the drip (the reconfirm job exists); the daily drip from empty branches (KP3's filter applies).
- `server/src/services/kg/voiceProfile.js`: a `fillers` distribution (form → rate) from replies; hedging rate from T8 and the X replies.
- `server/src/services/kg/graph.js` + `routes/kg.js`: the "This is you" API returns branches, children and cross-links.

**Retrieval**
- `server/src/services/persona/contextBuilder.js`: branch-aware selection. When the chat touches a branch, offer its children (a specific, a story, a reason) and one `ASSOCIATED` hop. Weight branches by the session's unlocked depth (A5). Mark uncertain or weak facts so the prompt hedges them.

**Long chats**
- `server/src/models/Conversation.js`: `sessions: [{ n, startedAt, endedAt, summary, threads, topicsCovered, interestEnd }]`, `sessionIndex`.
- `server/src/services/conversation/engine.js`: session boundaries, the transcript as last 20 raw + earlier session summaries + threads, the session-opening callback.
- `server/src/services/conversation/planAct.js` (human mode): session length, end-of-session close move, the `think` and `not_sure` moves, the hedge flag, filler rate.
- `server/src/services/prompts/agentReply.js`: the texture lines (their fillers, hedge uncertain things, think out loud when it fits); the session-opening line; never reuse a filler they don't use.
- `server/src/services/prompts/sessionSummary.js` (new, mid tier, reasoning off): the end-of-session summary and threads.
- `server/src/services/agent/scheduler.js` + `pipeline/index.js`: schedule the next session after `SESSION_GAP_MS` (`CHAT_DEPTH` decides), the per-session evidence pass, then continue / end / decide.
- `server/src/services/conversation/judge.js` + `prompts/judge.js`: evidence tagged with branch and depth tier; an evidence ledger per conversation.
- `server/src/services/conversation/judgeDecision.js`: the A7 bar. The old rule stays reachable through `CHAT_DEPTH=short` for comparison.
- `server/src/services/kg/config.js`: `CHAT_DEPTH`, `SESSIONS_MAX` 5, `SESSION_MESSAGES` [16, 24], `SESSION_GAP_MS`, `MIN_SESSIONS_FOR_YES` 3, `MIN_MESSAGES_FOR_YES` 50, `JUDGE_YES_POSITIVES` 8, `JUDGE_MIN_BRANCHES` 5, `JUDGE_MIN_PERSONAL` 3, `JUDGE_MIN_DEEP` 2, `JUDGE_MAX_SURFACE` 3, `JUDGE_YES_MIN` 0.8, `CHEMISTRY_*`, `MAX_TURNS` becomes the per-session limit in `full`/`demo` and keeps today's meaning in `short`.

**Client**
- `pages/Onboarding.jsx`: the reworded values with "say more"; module W as a required step (taps, one-liners, voice welcome); the 20 personality statements removed from the core.
- A generic `ModuleRunner` component: renders any module from the data (tap, pick, line, story, reply, why), with branching follow-ups, skip any question, save as you go.
- "Teach your agent more" (`TeachCards.jsx`, `Teach`): becomes the module list with a brain-strength meter and "your agent can now talk about..." after each module.
- "This is you" (`You.jsx`, `Graph3D.jsx`, `lib/graph.js`): the brain map: branches, children, stories, why-chains, cross-links, uncertain nodes shown as "not sure".
- Match room: "Session 2 of up to 5 · your agents are still getting to know each other", and the session gap shown honestly ("they'll pick it up in a bit").

**Seed data and eval**
- `scripts/seed/expand-personas.js` (new): for each of the 38 personas, answers to W and at least 6 modules in that persona's voice, cached by hash (like `restyle-personas.js`), plus their X replies. Personas need this, or the long chats run out of material.
- `scripts/eval/metrics.js` + `lib/convoMetrics.js`: the A9 rows.
- `scripts/eval.js`: runs `CHAT_DEPTH=demo` by default (cost), `full` on a 6-pair subset.

## B3. Timeline

Today is Oct 23. Nebius check Oct 26, the push Oct 27, freeze Oct 28, submit Oct 29. The Nebius switch, Cloudinary and S7 are still must-dos.

| Phase | What | Days | Order |
|---|---|---|---|
| **C1** | Sessions, memory, the A7 bar, texture (fillers, hedges, think / not sure) | ~1.5 | first: it fixes "6 chats and coffee" directly |
| **Q1** | Question bank data, answers, the brain map in the graph, per-module builds, voice fillers | ~1 | second |
| **Q2** | Onboarding (reworded core + W), the module runner, "Teach your agent more", brain map view, match room sessions | ~1.5 | third |
| **P** | Expand the 38 personas, re-seed, live check on 6 pairs (`demo` and `full`) | ~0.5 + LLM time | last |

That's about 4.5 days of Claude Code work against about 4 days before the freeze, next to the must-dos. So:
- **C1 is the priority.** On its own it fixes the two main complaints (too short, coffee = match), using today's questions.
- **Q1 and Q2 can be split**: modules W, T, X and V first (the ones that give the most talk material and texture), the rest after the hackathon if time runs out.
- **Fallbacks:** `CHAT_DEPTH=short` brings back today's chat length and judge rule; the module runner only adds optional screens, so the core onboarding is safe even if Q2 is half done.

## B4. Acceptance checks

**Unit tests** (all existing tests stay green):
- questions: every question has a branch, a type and a use; old A/C/E ids still load; "idk" answers are valid
- facts: taps and picks land on the right branch and depth tier; "can't decide" gives an uncertain fact; current facts get `currentUntil`; `BRANCH_OF`, `WHY` and `ASSOCIATED` edges are made; a per-module build doesn't touch other modules' facts
- voice: fillers and their rates from replies; T8 sets the hedge rate
- retrieval: touching "coffee" offers its children and one associated hop; locked deeper branches aren't offered in session 1; uncertain facts are marked
- sessions: a session ends between 16 and 24 messages with a close move; the next one opens with a callback; earlier sessions reach the prompt only as summaries; nothing from `topicsCovered` is asked again
- judge bar: two shared likes → not yes; 8 positives on 2 branches → not yes; surface positives capped at 3; yes impossible before 3 sessions and 50 messages; a dealbreaker conflict → no at once; two low-interest sessions → no; `CHAT_DEPTH=short` reproduces today's decision
- texture: a user who never writes "lol" never gets "lol"; uncertain facts are hedged
- the DB spy and the leak check still pass; [for you] answers never reach a share move

**Live:** 6 pairs with `CHAT_DEPTH=demo` and 2 with `full`: every A9 row, tokens and minutes per pair, two full transcripts with each message labelled by session, move and filler use.

**Also:** `api-check`, client build, 375 px and 1440 px, `smoke:browsers` on the local production build, `PROGRESS.md`, committed locally, **not pushed** until the owner says so.

---

# Part C: Prompts for Claude Code

Save this file as `plan/33-questions-brain-long-chats.md`.
Run the prompts in order. Each ends with a STOP.

## Prompt C1: long chats, the high bar, natural texture

```
Read CLAUDE.md, plan/30-final-sprint.md (standing rules), plan/31-human-conversation.md, plan/32-knowledge-graph-v3-2.md, plan/33-questions-brain-long-chats.md and plan/PROGRESS.md.

Plan 33 is approved by Arya. Add it to plan 30's order and PROGRESS (after KP, before S4). Do Phase C1 only (plan 33 A5, A6, A7, A8 and the "Long chats" part of B2), on today's questions.

The problems to fix (plan 33 section 0): chats stop at 14 messages, two shared likes like coffee make a "yes", and the agent never sounds unsure or casual. Agents must keep talking, over several sessions, until the evidence is really strong.

Hard constraints:
- CHAT_DEPTH=full|demo|short. short must reproduce today's chat length and today's judgeDecision exactly (prove with tests on the existing judge fixtures). Default: full for real users, demo for seed and judge accounts.
- Plan 31's rules stay: needToAsk, at most one plain matching question per chat, mood and length matching, CONVO_MODE=human|sn.
- Still one model call per agent turn. New calls only: one session summary per session, one judge evidence pass per side per session, the final verdict.
- Keep grounding, leak, style, stance, ask my human, the bot answer and the DB-spy boundary. Prompt text only in services/prompts/*.js, numbers only in services/kg/config.js.
- Budget: respect LLM_HARD_CAP_USD and JUDGE_LIVE_CHATS_PER_DAY; log tokens per session.

Steps (commit locally after each, "feat(plan-33 C1): ..."):
1. Conversation.sessions + sessionIndex; config numbers from B2.
2. engine + planAct: session length, the close move at the end of a session, the next session after SESSION_GAP_MS (scheduler + pipeline), the opening callback from open threads and current facts.
3. Memory: the last 20 messages raw + earlier sessions as summaries + threads + topicsCovered (prompts/sessionSummary.js); nothing in topicsCovered is asked again.
4. Texture: fillers distribution in the voice profile (from the user's replies), the think and not_sure moves, the hedge flag for uncertain or weak facts (strength below 0.5 for now), the prompt lines, a soft filler-rate check. A user never gets a filler they don't use.
5. Judge: evidence tagged with branch and depth tier (map today's facts: likes/opinions → surface; stories, people, work, travel → personal; values, conflict, B values, goals → deep), a ledger per conversation, the evidence pass at each session end, the A7 bar in judgeDecision, "no" still immediate on a dealbreaker conflict.
6. Match room: "Session N of up to 5" and an honest gap message.
7. Metrics: the A9 rows that C1 can measure.
8. npm test, api-check, client build. Then ONE local simulated pair with CHAT_DEPTH=demo (simulate.js), printed with each message labelled by session, move and fillers, plus tokens per session. STOP. Don't run more live pairs until I say go.

Never push. Update PROGRESS. Report which test covers each item in A7, tokens and minutes per pair, and anything in plan 33 you think is wrong.
```

## Prompt Q1: the question bank and the brain map

```
Read plan/33-questions-brain-long-chats.md. C1 is green. Do Phase Q1 (A1 to A4, the "Questions and answers" and "The brain map" parts of B2), server side only.

1. questions.js: CORE + MODULES exactly as A4 (every question, follow-up, type, branch, use, disclosure, current and trait flags), with today's A/C/E ids kept as aliases (A4's mapping). Keep every B option value unchanged.
2. answers.js: zod for answers.M and sub-answers; idk / can't decide are valid.
3. KgFact (branch, qid, uncertain, depthTier, currentUntil) and KgEdge (BRANCH_OF, ASSOCIATED, WHY): superset only.
4. questionnaireFacts + buildUserGraph + extractFacts: answers land on their branch with the right depth tier; can't decide → uncertain; trait picks → trait scores; line and story answers extracted with verbatim checks under their branch; WHY and ASSOCIATED edges. A per-module build (POST /onboarding/module/:id) that touches only that module's facts.
5. voiceProfile: fillers and hedge rate from the X replies and T8.
6. contextBuilder: branch-aware selection (children, one associated hop, session-unlocked depth, hedge marks). Update C1's depth-tier mapping to use depthTier when present.
7. learning: the daily drip from empty branches (KP3 filter), current facts re-asked after currentUntil.
8. GET /onboarding/modules, POST /onboarding/module/:id, and the "This is you" API with branches.
9. scripts/seed/expand-personas.js: W + at least 6 modules + the X replies for each of the 38 personas, in their voice, cached by hash. Don't run the full re-seed yet: run it on 3 personas and show me 2 of them.

Tests for every Q1 item in B4. npm test, api-check, onboard-sample, kg-review-check, check-indexes, storage-report. Commit locally per step, never push. STOP with the 2 expanded personas and storage per user.
```

## Prompt Q2: the screens

```
Read plan/33-questions-brain-long-chats.md. Q1 is green. Do Phase Q2 (the Client part of B2), in the current Round 7 design:
1. Onboarding core: the reworded values with optional "say more", module W as a required step, the 20 personality statements removed from the core (still readable for existing users).
2. ModuleRunner: renders any module from GET /onboarding/modules (tap, pick, line, story, reply, why), branching follow-ups, skip any question, save as you go, voice input where the browser supports it.
3. "Teach your agent more": the module list with a brain-strength meter and "your agent can now talk about ..." after each module.
4. "This is you": the brain map (branches, children, stories, why-chains, cross-links, uncertain nodes as "not sure"), editable as today.
5. The match room session indicator from C1, if not already done.
Check 375 px and 1440 px, smoke:browsers on the local production build, npm test, api-check. Commit locally per step, never push. STOP and show me the screens at phone width.
```

## Prompt P: personas and the live check

```
Read plan/33-questions-brain-long-chats.md. C1, Q1 and Q2 are green. Run scripts/seed/expand-personas.js for all 38 personas, then the incremental seed. Then the live check from B4: 6 pairs with CHAT_DEPTH=demo and 2 with full, low concurrency. Report every A9 row in a table, tokens and minutes per pair, and two full transcripts (one compatible, one not) labelled by session, move and fillers. If a "yes" has a surface-only reason or fewer than 2 deep positives, find the cause and fix it before reporting. Never push. Update PROGRESS. STOP.
```
