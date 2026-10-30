> **Archived (2026-10-30).** Internal team notes; links below are relative to the repo root. Current docs: [README](../../README.md), [DEPLOY](../../DEPLOY.md).

# Prelude: the whole project, explained

This guide is for anyone who wants to understand the project end to end: what it does, how it's built, why it's built that way, what happened so far and what's still open. It's written for someone new to the codebase. It assumes basic web-development knowledge (React, Node, MongoDB), but nothing about this project.

*Written 2026-10-19; updated the same day after the live check was removed (§16). For the latest status, check [`plan/PROGRESS.md`](plan/PROGRESS.md) (the team's status board) and the Status section of [`CLAUDE.md`](CLAUDE.md).*

---

## Contents

1. [What Prelude is](#1-what-prelude-is)
2. [Where to find what (the documents)](#2-where-to-find-what)
3. [The product, step by step](#3-the-product-step-by-step)
4. [Rules the product never breaks](#4-rules-the-product-never-breaks)
5. [Tech stack and hosting (all free)](#5-tech-stack-and-hosting)
6. [How the AI models are used](#6-how-the-ai-models-are-used)
7. [Architecture](#7-architecture)
8. [The knowledge graph](#8-the-knowledge-graph)
9. [The conversation engine (one agent message, in detail)](#9-the-conversation-engine)
10. [Judges and the verdict](#10-judges-and-the-verdict)
11. [Trust and safety](#11-trust-and-safety)
12. [Data model](#12-data-model)
13. [API overview](#13-api-overview)
14. [Evaluation: how we measure quality](#14-evaluation)
15. [History: what happened so far](#15-history)
16. [The three problems raised on Oct 19, and what was done](#16-the-three-problems-raised-on-oct-19)
17. [Current status and what's left](#17-current-status-and-whats-left)
18. [Running it locally](#18-running-it-locally)
19. [Glossary](#19-glossary)

---

## 1. What Prelude is

**Prelude** is a dating web app with a built-in AI agent. The repository is called `dating-agent`; the product is called Prelude.

**The problem it solves:** dating apps match people on preferences (age, city, "likes travel"), not character. People usually find out two or three conversations in that a match was never going to work. That's hours of small talk with people who were never a fit.

**The idea:** after two people match, each person's AI agent holds the early conversation for them:

1. **Checks the match's profile** for fakes and inconsistencies.
2. **Reads the match's profile** to understand them before saying anything.
3. **Chats in the user's own voice,** using only facts from the user's personal knowledge graph. It never invents anything about the user.
4. **Gives a verdict with evidence:** **Compatible / Maybe / Not compatible**, quoting the other person's own words.

- **Compatible:** both people take over the chat themselves.
- **Not compatible:** the agent politely winds the chat down, and the user never spent time on it.

**Context:** this is the team's entry for the **Nebius x NVIDIA Global AI Hackathon** (Devpost, track *Best Apps & Agents*).

| Date | What |
|---|---|
| Oct 26 | Switch the AI provider back to Nebius Token Factory |
| Oct 27 | The one push + deploy, then full QA |
| Oct 28 | Feature freeze |
| Oct 29 | Target submission |
| **Oct 30, 10:00 AM PDT (10:30 PM IST)** | Hard deadline |
| Through Dec 15 | The demo must stay live (end of judging) |

**Hackathon requirements the code must meet:**
- Runtime calls to **Nebius Token Factory** using at least one **NVIDIA Nemotron** model.
- A public GitHub repo with an **MIT licence**.
- A README explaining which model does what and why.
- A working demo URL.

---

## 2. Where to find what

| File / folder | What it is |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | The project's rulebook: product rules, stack, conventions and a detailed per-plan status log. Claude Code (the AI coding assistant used to build this) reads it first in every session. |
| [`plan/PROGRESS.md`](plan/PROGRESS.md) | The status board: what's done, what's next, results of every step, what's blocked on a human. |
| [`plan/30-final-sprint.md`](plan/30-final-sprint.md) | **The only plan with open work.** Steps S0–S7 plus SN, with acceptance checks. |
| [`plan/15-knowledge-graph-final.md`](plan/15-knowledge-graph-final.md) | The source of truth for everything the app knows about a user. |
| [`plan/18-architecture-decisions.md`](plan/18-architecture-decisions.md) | Why the big architectural choices were made. |
| [`plan/14-switch-to-nebius.md`](plan/14-switch-to-nebius.md) | The checklist for switching the AI provider back to Nebius. |
| [`plan/12-deploy-free-and-keepalive.md`](plan/12-deploy-free-and-keepalive.md), [`DEPLOY.md`](DEPLOY.md) | How it's deployed on free tiers and kept awake. |
| [`plan/13-submission.md`](plan/13-submission.md), `SUBMISSION.md` | Devpost submission material. |
| [`plan/archive/`](plan/archive/) | Finished build plans (02–11, 16, 17, 19…), kept for history. |
| [`README.md`](README.md) | The public-facing description (setup, model usage, evaluation numbers). |
| `server/eval/` | Evaluation results and transcripts. |

**How the work is organised:** the project was built plan by plan. Each plan file is a numbered build prompt with acceptance checks at the end. After each plan, the checks are run, results go into `PROGRESS.md` and the Status section of `CLAUDE.md`, and the work is committed. Since Oct 18 the rule is **commit locally after each step, and push or deploy only when the owner says "push"**, because the free-tier hosts have limited deploy credits.

---

## 3. The product, step by step

This is what a user experiences, and what happens behind the scenes at each step.

### 3.1 Sign up
- One call (`POST /api/auth/signup`) creates the account **and** the profile. The basics are name, email, password, date of birth (the server checks 18+), gender, who you're interested in, and city (a searchable list of ~100 Indian cities with coordinates, or "Other").
- **Consent is required:** *"Early conversations with your matches may be handled by AI agents, including yours."* Signup is blocked without it, and `consentAgent: true` + `consentAt` are stored.

### 3.2 Onboarding (~5-minute core, rebuilt in plan 30 step S2)
1. **Basics:** job, workplace, education, languages, height, optional interests.
2. **Photos:** 2–6, cropped to 4:5 in the browser and resized to 1080 px. Each one goes through AI moderation (§11).
3. **3 prompts:** picked from 30 questions, answers ≤ 150 characters (Hinge-style).
4. **Lifestyle and values:** 11 questions (kids, religion, where you'll live, smoking, drinking, family involvement, career, what you're looking for, diet, conflict style, alone time). Each has:
   - an answer
   - **how much it matters** (never pre-selected)
   - **what you'd accept in a partner**
   - an optional **dealbreaker** tick
5. **5 "How would you reply?" messages:** fake messages from a match that you answer exactly as you'd text. This is how the agent learns your **voice**.
6. **Submit:** a quick first version of your knowledge graph is built instantly. The slow AI part runs in the background while you continue.
7. **Done:** "Teach your agent more" offers optional extras (stories, 10 more reply samples, 20 personality statements). Each one makes the agent better.

### 3.3 Discover and likes
- Discover shows profiles one at a time, first photo full-bleed. You can tap through the photos and scroll for the full profile.
- You only see people who pass **the gate** in both directions (§8.4): city / distance, age range, gender preferences, and each side's dealbreakers. The order is random; nothing ranks people.
- **Like a photo or a prompt, with an optional comment** (≤ 150 characters), or Pass. A **preferences** sheet sets age range, show me, and city / distance.
- **Likes you** lists everyone who liked you, what they liked and their comment, with Like back / Pass.

### 3.4 A match
When both people like each other, a match is created. Each person picks:
- **"Let our agents break the ice (~3 min)"**, or
- **"Chat myself now"**: a normal human chat, no agents.

The default comes from your agent mode (Auto → agents, Off → chat myself). If either person picks "Chat myself now", it's a human chat.

### 3.5 Behind the scenes after a match (the pipeline)
The match moves through these statuses:

```
matched → trust_check → briefing → agent_chatting → evaluating → compatible / maybe / incompatible → handed_off or closed
                │                       │
                └→ flagged_fake         └→ scheduled (daily credit guard: starts tomorrow)
```

1. **Gate re-check** (code only, true/false). If it fails, the match closes with no detail and no AI call.
2. **Trust check** (§11): rules plus an AI consistency check of the other person's public profile. A likely fake → `flagged_fake`. The match closes for the fake side, and only the viewer sees the reasons.
3. **Brief** (§9.1): each agent reads the other person's **public** profile and prepares up to 3 openers plus a private list of topics it'd like to learn about (the **agenda**).
4. **Agent chat** (§9): the agents talk, about 12–14 messages, in each person's voice. You can watch live, pause your agent, or **take over in one tap**. If the match started with a like comment, it's the first message, and the other agent opens by replying to it.
5. **Judges** (§10): one private judge per side reads the transcript and decides yes / unsure / no, with quotes.
6. **Verdict:** the match takes the lower of the two sides.
   - **Compatible** (both yes): the chat is handed off to the humans, with a **reveal** ("the first 14 messages were handled by your agents"), date ideas and icebreakers.
   - **Maybe:** "Let them talk a bit longer" (up to 8 more messages), or decide yourself.
   - **Not compatible:** the agent of the person who said no sends **one** kind wind-down message in that person's voice, and the match closes. "Talk anyway" lets the person who said no reopen it.

### 3.6 Human chat
Text and photos (moderated the same way as profile photos), typing indicator, "Seen" read receipts, timestamps and unread badges. **Every agent-written message is labelled "Written by <name>'s agent", for both people.**

### 3.7 Other screens
- **This is you:** your knowledge graph as a map. You can edit or delete facts, change who can see each fact, resolve contradictions ("Which is right?"), and correct "How I text".
- **Inbox ("ask my human"):** questions your agent couldn't answer about you. Your answers become new facts.
- **Replay:** scrub through a past agent chat with its evidence moments.
- **Settings:** agent mode (off / shadow / auto), "Learn from my chats", delete my data.

---

## 4. Rules the product never breaks

These are non-negotiable (from `CLAUDE.md`):

- **Consent at signup.** No account without the AI-agent consent tick.
- **Every message stores `authoredBy: 'human' | 'agent'`.** It's used for the audit log, the agent labels and the reveal.
- **The user stays in control.**
  - Agent modes are `off`, `shadow` (agent replies, you watch, you can take over) and `auto`.
  - **Take over** is one tap and immediately stops the agent for that match.
- **The agent never invents facts about its user.**
  - Everything it says about you must come from your knowledge graph.
  - If it doesn't know, it deflects naturally and files an "ask my human" question.
- **Disclosure tiers:** each fact is `public`, `if_asked` or `private`. Private facts are never sent to the model as something it may say.
- **No inference of caste, religion, ethnicity or race** from names or photos. Religion is used only if the user states it as their own preference or dealbreaker.
- **SFW demo and seed content.** Seed people are illustrated avatars, never real photos.
- **The other side can be a human or an agent.** The engine works the same either way; a human's messages are just transcript lines.
- **Honesty:** a sincere "are you a bot?" always gets an honest answer.

---

## 5. Tech stack and hosting

**Stack:**

| Part | Tools |
|---|---|
| Server | Node 22, Express 5, Socket.IO 4, Mongoose 8, zod (validation), jsonwebtoken + bcryptjs (auth), `openai` SDK (pointed at the AI provider), `@tavily/core` (web search). Plain JavaScript, ESM modules. |
| Client | React 19 + Vite, Tailwind CSS v4, React Router, axios, socket.io-client, Motion (animations), react-easy-crop (photo crop), three.js (the 3D graph on "This is you"). |
| Auth | JWT in the `Authorization: Bearer` header (stored in localStorage). Socket.IO uses the same token. Frontend and backend are on different domains, so no cookies. |

**Everything must be free.** No paid service and nothing that needs a credit card:

| Need | Service | Limit to respect |
|---|---|---|
| AI models | Nebius Token Factory promo credits ($25 + $25) | Finite credits: every call is logged, budgets are enforced, and the cheapest tier that works is used |
| Database | MongoDB Atlas **M0** | 512 MB, max 3 search indexes |
| Frontend | Vercel Hobby (`dating-agent-flame.vercel.app`) | Static SPA |
| Backend | Render **Free**, exactly **one** service (`dating-agent-api.onrender.com`) | Sleeps after 15 min idle; 750 h/month covers exactly one service |
| Keep-alive | cron-job.org + GitHub Actions schedule + server self-ping | Stops Render from sleeping |
| Web search | Tavily free tier (1,000 credits) | Results cached; used for date ideas |
| Photos | Cloudinary free plan (local stub until keys are added) | |
| Email (S4) | Resend free plan | |
| Avatars | DiceBear | No real people in seed data |

**Temporary AI provider:** Nebius Token Factory needs a payment card to activate, so **development and the current deployment run on NVIDIA's free API** (`integrate.api.nvidia.com`, same Nemotron models).
- The env var names stay the same (`NEBIUS_BASE_URL`, `NEBIUS_API_KEY`), so switching back is an `.env` change only, with no code change (checklist in `plan/14`, target Oct 26).
- NVIDIA's free tier allows only ~40 requests/min, often answers "429 Too Many Requests", and is sometimes slow. Many measured numbers in this project are worse than they'd be on Token Factory for that reason.

---

## 6. How the AI models are used

**Every AI call goes through one file:** `server/src/services/llm/client.js`. Nothing else imports the `openai` SDK.

**Model tiers** (IDs come from `.env`, never from code):

| Tier (env var) | Model family | Used for |
|---|---|---|
| **mid** (`MODEL_MID`) | Nemotron 3 Super | Agent replies (the main chat turns), reading the other person's messages, the match brief, fact extraction from stories, the trust check, reflections. Reasoning switched **off** for chat turns: 2–5 s instead of 10–40 s. |
| **smart** (`MODEL_SMART`) | Nemotron 3 Ultra (falls back to Super) | The judges only: the one decision that matters most, once per side per conversation, temperature 0. On the NVIDIA key, Ultra returns 404, so the mid tier judges for now. |
| **fast** (`MODEL_FAST`) | Nemotron 3.5 Lightning | Short, frequent jobs: stance check, wind-down message, icebreakers, date-idea write-ups. Measured slower than Super on NVIDIA, so several jobs were moved to mid there (configurable). |
| **embed** (`MODEL_EMBED`) | Nemotron embedding model | Matching texts to shared concepts, "did they ask about me?", leak checks, choosing example messages. |
| **vision** (`MODEL_VISION`) | Nemotron VL | Photo moderation. **Code** makes the final decision. |

**Safety rails on every call:**
- **Reasoning models:** a generous `max_tokens` (≥ 2048), so the model's reasoning can't eat the answer. Reasoning text comes back in a separate field and never reaches a user.
- **JSON outputs are validated with zod,** with one retry, then a graceful fallback (log it and keep the app running). Quotes must be verbatim or they're dropped in code.
- **Spending protection:**
  - a global requests-per-minute limiter (`LLM_MAX_RPM`)
  - per-user daily caps
  - an all-time dollar cap (`LLM_HARD_CAP_USD`) that fails closed
  - a kill switch (`LLM_ENABLED=false`)
- **Every call is logged** in the `Usage` collection: purpose, tier, tokens, latency, cost. Message contents are never logged in production.

---

## 7. Architecture

```
 Browser (React SPA on Vercel)
   │  REST (axios, JWT)            Socket.IO (live chat, typing, status, kg:update)
   ▼                                ▼
 Express 5 API + Socket.IO server (one Render free service)
   │
   ├─ routes/         auth, me, profile, photos, onboarding, kg, discover, matches, inbox, admin
   ├─ services/
   │   ├─ llm/          the one AI client, budgets, usage log, embedding cache
   │   ├─ kg/           knowledge graph: build, facts, concepts, voice, gate data, config.js (ALL thresholds)
   │   ├─ trust/        scam rules + profile consistency check
   │   ├─ brief/        match brief: openers + agenda
   │   ├─ conversation/ the per-turn engine: perceive, interest, planAct, generate, judge
   │   ├─ persona/      what the agent knows about its own user: cache, context, checks (style/grounding/leak)
   │   ├─ agent/        scheduling, pacing, locks, pause / take over
   │   ├─ compat/       settle the verdict, hand-off, wind-down, notes compaction
   │   ├─ match/gate.js the pre-chat gate (code only)
   │   ├─ pipeline/     the match pipeline (gate → trust → brief → chat)
      │   ├─ tavily/       date ideas
   │   └─ jobs/         the Mongo job queue + every job type
   └─ models/         Mongoose models (§12)
   ▼
 MongoDB Atlas M0
```

**The job queue** (`services/jobs/`) replaces Redis. Slow work runs as **jobs** stored in Mongo, picked up by a worker inside the same server process. If the server restarts mid-job, the job is picked up again once its lock expires.
- Each job type has its own concurrency limit (in `kg/config.js`).
- No job ever scans all users.

**Job types:**

| Job | What it does |
|---|---|
| `buildUserGraph` | The background (phase 2) knowledge-graph build after onboarding |
| `matchCreated` | Starts the pipeline for a new match |
| `awaitGraph` | Holds a match until both graphs are ready (max 10 min) |
| `startChat` | Starts a match that the daily credit guard pushed to the next day |
| `agentTurn` | One agent message |
| `profileCheck` | The trust check's AI part, plus your own scam self-check |
| `moderatePhoto` | Photo moderation; retried while the vision model is down |
| `evaluate`, `judge` | One judge per side; the second one settles the match |
| `compactNotes` | Shrinks notes on closed matches |
| `seedLikeBack` | Seed personas liking new users back |
| `agentSweep` | Restarts stalled chats |
| `archiveNotes`, `rebuildVoice`, `reflect`, `reconfirm`, `conceptCleanup` | Maintenance |

**Sockets:** each user joins a `user:<id>` room. New messages go there, because how a message is labelled depends on who's viewing. Match rooms carry typing indicators. Events include `message:new`, `match:status`, `report:ready`, `kg:update`, `like:new` and `onboarding:progress`.

---

## 8. The knowledge graph

Everything the app knows about a person. The source of truth is [`plan/15-knowledge-graph-final.md`](plan/15-knowledge-graph-final.md).

### 8.1 Six layers per user

| # | Layer | Stored in | Who can read it |
|---|---|---|---|
| 1 | **Public profile:** name, age, city, photos, prompts, bio, tags | `Profile` | Everyone (the other agent reads it only in the trust check and the brief) |
| 2 | **Gate:** basics, values answers, accepted answers, dealbreakers | `Profile.gate` | **Code only**, as one database query. Never an AI model, never another user |
| 3 | **Self graph:** facts about you, linked to shared concepts, with edges between facts | `KgFact` (`observerId: null`), `KgEdge`, `Concept` | Only your own agent |
| 4 | **Voice:** how you text | `VoiceProfile`, `VoiceSample` | Only your own agent |
| 5 | **Notes about others:** what your agent learned about a match, each with a verbatim quote from the chat | `KgFact` (`observerId: you`), `ChatEvent` | Only you and your agent |
| 6 | **Decisions:** your judge's verdict | `MatchDecision` | Only you |

### 8.2 Facts
A fact is a small statement like "likes: trekking", "smoking: never" or "story: my dad recorded his pocket for two minutes". Each fact has:
- a **predicate** (likes, dislikes, opinion, goal, values, lifestyle, story…) and an **object**
- **confidence**, **importance** and **strength**
- **evidence:** verbatim quotes of where it came from
- a **disclosure tier** (`public` / `if_asked` / `private`)
- a link to a shared **concept** when one fits

**Where facts come from:** onboarding answers (turned into facts in code), story answers (extracted by AI, quotes checked in code), inbox answers, corrections you make, and, if you allow it, your own messages after a hand-off.

### 8.3 Concepts and embeddings
- **Concepts are shared across users:** "trekking", "hiking in the Sahyadris" and "treks" all resolve to one concept. Only concepts get an embedding vector (not every fact), which keeps storage small: ~88 KB per user, so ~5,900 users fit in the free 512 MB database.
- **Resolving a text to a concept:**
  1. Exact or alias lookup.
  2. Embedding similarity: ≥ 0.70 = match.
  3. 0.40–0.70 = an AI tie-break.
  4. Below 0.40 = a new concept.
- These thresholds were calibrated for NVIDIA's embedding model.
- Vectors are stored compactly (int8) and only loaded when needed.

### 8.4 The gate
- **One indexed MongoDB query** builds your Discover deck: everyone who passes your gate **and** whose gate you pass.
  - Same city (or within your distance).
  - Age range both ways.
  - Gender preferences both ways.
  - Each side's dealbreakers: if you marked "smoking" as a dealbreaker and accept only "never", you won't see anyone who answered "regularly".
- **Re-checked at match creation,** in code, as true / false.
- **Nothing ranks or compares two people's graphs.** Shared interests are discovered live, in the chat.

### 8.5 Voice ("How I text")
Stored as distributions, not averages:
- word counts, emoji use, laughs ("haha" vs "lol"), message endings
- pet phrases, never-say words
- how often you ask back
- **language mix:** English / Hinglish / Gujarati etc., the code-switch rate, and whether you mirror the other person's language

Your real reply samples are used as examples ("write like this"). With only 5 samples from the short onboarding, the voice is marked **low confidence**, and the agent keeps replies short and plain.

### 8.6 The information boundary
- **Another user's agent or judge never reads your facts, edges, voice or samples.** The only cross-user paths:
  - your public profile (in the trust check and the brief)
  - the chat transcript itself
  - the gate (a true / false answer)
- **A "DB spy" test** tags every database read with who's reading, and fails if an agent touches the other user's private data.

---

## 9. The conversation engine

The heart of the product: how an agent writes **one** message. The code is in `server/src/services/conversation/` and `services/persona/`; every threshold is in `services/kg/config.js`.

### 9.1 Before the chat: the brief
When the pipeline reaches `briefing`, each side's agent gets:
- **A summary** of the other person's **public** profile.
- **Up to 3 openers:** a first message reacting to something in their profile. Anything said about *me* must cite one of my facts, checked in code.
- **An agenda:** topics *I'd* like to learn about them, taken from **my own** graph:
  - my values answers that matter to me
  - my dealbreakers
  - my top interests
  - gentle "clarify" topics from the trust check

  The brief stores nothing about the other person.

### 9.2 One agent turn (`engine.js → composeTurn`)
1. **Load my persona** (facts + voice; cached per conversation) and the transcript.
2. **Special case, a bot question:** a sincere "are you a bot / AI?" gets a fixed, honest answer ("yes, i use the app's AI assistant for the first few chats 🙂").
3. **Read their message ("perceive + observe"):**
   - What concepts did they mention?
   - Did they ask me something?
   - Was it low effort, funny, a disagreement with one of my strong opinions, a hint of a dealbreaker?
   - New notes about them are saved, each with a quote.
   - By default (`AGENT_TURN_MODE=merged`) this read happens **inside the same AI call** that writes the reply, so one turn costs one model call.
4. **Interest meter:** goes up with shared likes and humour, down with low effort and dislikes. Bored for 3 turns → the agent ends the chat.
5. **The act plan (`planAct.js`):** a deterministic plan for this message, sampled from my voice with a per-conversation seeded random generator (so runs can be replayed exactly):
   - length (from my real message lengths)
   - burst (1 or 2 messages)
   - emoji, laugh
   - language (from my mix)
   - whether to disagree (I hold strong opinions; I concede weak ones)
   - the **move** and whether to **ask a question** (rewritten on Oct 19, §16)
   - whether to bring up a **topic** (rewritten on Oct 19, §16)
   - whether to **end** (dealbreaker hint, boredom, max messages, or a natural end once my important topics are settled)
6. **Choose context:** the facts most relevant to their message (plus all my facts on the topic if they asked me about it), my stories, my notes about them, and example messages in my voice.
7. **Generate:** one call to the mid tier. The model returns:
   - `messages`
   - `claims`: every statement about me, **with the fact ids that support it**
   - `aboutThem`: every statement about them, with its source
   - `unknownAboutMe`: a question it couldn't answer
   - `end`
8. **Checks in code** (no extra AI call, except the stance check):
   - **Style:** too long, more than one question, never-say words, wrong language, echoing their words, making real-world plans (the agent never arranges to meet), contact details or money talk.
   - **Grounding:**
     - every "I…" claim must cite a real, listed fact
     - no claim may contradict a fact (e.g. claiming "not looking for anything serious" when my answer is long-term is caught in code)
     - statements about them must come from their messages or profile
   - **Leak check:** keywords + embeddings against my **private** facts, on every outgoing message.
   - **Stance check** (an AI call, only when I must disagree): did the draft cave in?
9. **At most one regeneration** if a check fails. Otherwise the failing sentences are dropped. If nothing usable is left, there's one short "constrained" retry, then a fixed follow-up question as a last resort.
10. **"Ask my human":** if they asked something about me that my graph doesn't cover, an inbox question is filed, even if the reply sounded confident. At most 3 new per match.
11. **Save the turn state** (turn count, interest, topics touched, whether I asked a question…). The scheduler adds human-like pacing (typing indicator, 0.8–3 s in fast mode), takes a per-match lock, and sends the message.

**Cost:** after the S1 speed work, ~63k tokens per pair of agents, about 16 s of model time per message. A whole chat takes ~4–5 min, mostly slowed down by NVIDIA's 429s.

---

## 10. Judges and the verdict

- **One independent judge per side,** run once per conversation. Each judge sees the transcript (lines labelled by speaker) and **its own user's** graph, never the other person's.
- **The model lists evidence; code decides.** This was changed on Oct 18 because the judges kept hedging. Each piece of evidence must be a **verbatim quote of the other person's own words** (not my agent's lines, not their questions), tied to something that matters to me. Code checks each quote and maps it to a real message.
- **Decision in code** (`judgeDecision.js`):
  - **No:** a stated dealbreaker conflict, or a serious clash on something that matters a lot.
  - **Yes:** at least 2 quote-checked positives on my key facts, with no serious friction.
  - **Unsure (Maybe):** anything else.
- **Match verdict** = the lower of the two sides. Hand-off only on a mutual yes.
- **The report** shows dimensions with confidence words, the quotes ("receipts"), "ask yourself" questions, and, after Continue, date ideas (my shared interests + my city, via Tavily, cached) and icebreakers.

---

## 11. Trust and safety

| Feature | How it works |
|---|---|
| **Trust check on a match** | Scam rules (contact details, "investment opportunity", "add me on telegram"…) plus an AI consistency check of the other person's public profile: contradictions with verbatim quotes, severity 0–3. A likely fake → `flagged_fake`: agents off, the match closes for the fake side, reasons only to the viewer. Results are cached per profile. |
| **Scam self-check at onboarding** (S2) | The same check on **your own** profile, plus photo results. High risk → **held** (out of Discover, with the reasons and "fix and resubmit"). Medium → passed on as a note to other people's trust checks. Never an automatic ban; an admin route releases a hold. |
| **Scam text in chat** | A scam script mid-chat ("add me on telegram, I can help you invest") flags the match and stops the agents at once. |
| **Live check** | **Removed on 2026-10-19** (owner's decision). It was plan 19: 2 random head moves on camera, one Nemotron vision call, decided in code. New accounts are now active right away. |
| **Profile status** | `active` / `held` (the scam self-check found high risk). `browse_only` (can browse and like, invisible to others, likes delivered once active) is no longer set by anything; accounts that were waiting on the live check were activated once at server start. Seed and judge accounts are labelled "Demo profile". |
| **Photo moderation** | One vision call per photo, decision in code. Rejects nudity, violence, mostly-text images, contact details, QR codes and social handles; photo 1 must show a person. Never estimates age, gender, race or attractiveness. If the model is down, the photo stays "pending" (only you see it) and a job retries. |
| **Block / unmatch / report** | A block hides both people from each other everywhere and stops any agent at once. Report reasons: fake, scam, harassment, inappropriate photos, underage, other. Reports appear in an admin list. |
| **Delete my data** | Removes profile, graph, voice and messages; your side of any match is anonymised. Messages are kept only in handed-off chats, for the other person. |

---

## 12. Data model

All MongoDB collections (`server/src/models/`):

| Model | What it holds |
|---|---|
| `User` | Account, consent, settings (agent mode, learn from chats), onboarding answers and status, `liveCheck` result (private) |
| `Profile` | Public profile, photos (+ private `photoUploads`), prompts, preferences, `gate`, `status` (active / held; browse_only unused) |
| `KgFact` | Facts about yourself (`observerId: null`) and notes about others (`observerId: me`) |
| `KgEdge` | Links between facts (SUPPORTS, CONTRADICTS…) |
| `KgTombstone` | Facts you deleted, so a rebuild doesn't bring them back |
| `Concept` | Shared concepts with one embedding each |
| `VoiceProfile`, `VoiceSample` | How you text (distributions) and your real sample replies |
| `Like`, `Block`, `Report` | Likes (with target + comment), blocks, reports |
| `Match` | The pair, status, per-user state (agent active, last read, name), brief, trust result |
| `Conversation` | One agent chat: seed, per-side temperature, per-side agent state (turn, interest, topics…) |
| `Message` | Text / photo, `authoredBy`, the act plan and check results behind agent messages |
| `ChatEvent` | Moments in a chat (shared interest, disagreement, boredom, dealbreaker hint…) with quotes |
| `MatchDecision` | One judge's verdict for one side, with evidence |
| `InboxItem` | "Ask my human" questions |
| `ProfileCheck` | Cached trust-check results per profile version |
| `Job` | The job queue |
| `Usage` | One row per AI call: purpose, tier, tokens, latency, cost |
| `EmbCache`, `SearchCache` | Embedding cache and Tavily search cache (TTL) |

---

## 13. API overview

All routes are under `/api`, return `{ error: { code, message } }` on failure, and (except auth) need the JWT.

| Area | Routes |
|---|---|
| Auth | `POST /signup`, `POST /login` |
| Me | `GET /me`, `PUT /me/settings`, `DELETE /me` |
| Profile + photos | `GET/PUT /profile`, `GET /profiles/:userId`, `GET/POST /photos`, `POST /photos/ticket`, `PUT /photos/order`, `DELETE /photos/:id` |
| Onboarding | `GET /onboarding/questions`, `GET /onboarding/status`, `POST /onboarding/submit`, `POST /onboarding/more` |
| Knowledge graph | `GET /kg/me`, `PATCH/DELETE /kg/facts/:id`, `GET /kg/contradictions`, `POST /kg/contradictions/:id/resolve`, `POST /kg/voice/corrections` |
| Discover + likes | `GET /discover`, `POST /likes`, `GET /likes/incoming` |
| Matches | `GET /matches`, `GET /matches/:id`, `GET/POST /matches/:id/messages`, `POST /matches/:id/choice`, `/takeover`, `/pause`, `/resume`, `/decision`, `/extend`, `/unmatch`, `GET /matches/:id/report`, `/kg`, `/date-ideas`, `GET /conversations/:id/replay`, `POST /messages/:id/wouldnt-say` |
| Safety | `POST /users/:id/block`, `POST /users/:id/report` |
| Inbox | `GET /inbox`, `POST /inbox/:id/answer` |
| Admin | `GET /reports`, `POST /reports/:id/close`, `POST /profiles/:id/release`, `GET /usage`, `GET /jobs` |
| Health | `GET /health` (open to any origin; used by keep-alive and the wake-up screen) |

---

## 14. Evaluation

**Seed data:** 38 hand-written, synthetic personas (`server/seed/personas.json`), covering several cities, language mixes (English, Hinglish, Devanagari Hindi, Gujarati-, Tamil- and Marathi-English) and deliberate fakes. Plus 20 hand-labelled pairs (`seed/pairs.json`) with the expected verdict for each.

**Tools** (in `server/scripts/`):

| Script | What it does |
|---|---|
| `simulate.js <a> <b>` | One agent↔agent chat, no pacing |
| `eval.js` | Runs the labelled pairs through the whole pipeline |
| `eval/metrics.js` | Style and language fidelity, question rate, topics, fallbacks, observer accuracy, from saved chats |
| `eval/rejudge.js` | Re-judges saved chats (no new chats) |
| `eval/leak-probe.js` | Private-fact leak probes |
| `eval/scale-test.js` | 2,000 users, no AI |
| `speed-check.js`, `speed-report.js` | Timings |

**Main results so far** (from the README and `server/eval/results/`):

| What | Result |
|---|---|
| Fakes caught | 2/2, no genuine profile flagged |
| Dealbreaker gate | 1/1: the clashing pair never became a chat |
| Verdict accuracy (17 non-fake pairs) | 8/17 after the "code decides" judge fix (was 4/17). On the 6-pair quick set in S1: 5/6 |
| Unsupported claims about the user | ~21–26% of self-claims (an AI judge, offline only) |
| Voice fidelity | style distance 0.16, language-mix distance 0.06 (0 = identical to the persona's real texting) |
| Scale (no AI) | discover p95 4.6 ms, ~88 KB per user |
| Cost | ~63k tokens per chat after S1 (was ~101k; ~266k in v1) |

**Honest limits:**
- Predicting compatibility before two people meet is weak in the research, so the product's real strengths are catching fakes and hard mismatches and saving people the first conversations.
- All evaluation is on synthetic personas.

---

## 15. History

The project went from scaffold to a deployed dating app in about six days (~230 commits, Oct 14–19, 2026), built plan by plan with Claude Code.

### Phase 1: the first version (plans 02–10, Oct 14–16)

| Plan | What was built |
|---|---|
| 02 | Scaffold: Node 22+/Express 5/Mongoose 8, React 19 + Vite 8 |
| 03 | The AI client: tiers, retries, budget caps, kill switch, usage log. **Finding:** the Nemotron models return reasoning in a separate field. |
| 04 | Backend core: auth, profiles, discover, likes, matches, messages, sockets, a 19-step end-to-end API check |
| 05 | Onboarding questionnaire + first knowledge graph (facts, traits, style) |
| 06 | Trust check (rules + AI consistency check, 6 crafted test cases) |
| 07 | Match brief (summary, openers, agenda) |
| 08 | Agent conversation (v1) |
| 09 | Compatibility verdict + hand-off + date ideas |
| 10 | First frontend |

v1 worked but was expensive (~266k tokens per chat) and slow. The knowledge graph was redesigned.

### Phase 2: knowledge graph v2 rebuild (plans 15–17, then 05–11 rewritten, Oct 16–18)

- **Plan 15** defined the final six-layer knowledge graph, and **plan 16** the execution order. Key decisions ("Checkpoint A"):
  - wipe and re-seed instead of migrating
  - the gate replaces AI-based clash finding
  - grounding by fact citations checked in code, at no extra AI call
  - one judge per side, with quote validators
- **Plan 17:** the Mongo job queue, compact vectors, the indexed gate query.
- **05 v2–11 v2:**
  - concept-level embeddings (storage per user down from ~496 KB to ~88 KB)
  - voice distributions + language mixes
  - the per-turn persona engine (tokens per chat ~266k → ~76k)
  - independent judges with "code decides"
  - the "Prelude" design
  - 38 personas
  - the 20-pair evaluation
- **Plan 19:** the live check (removed again on Oct 19).
- **Plan 12:** deployed on **Oct 18** (Render + Vercel + Atlas).

**Lessons recorded along the way:**
- NVIDIA's embedding model needs lower similarity thresholds than planned.
- With reasoning on, chat replies took 10–40 s, so it's off for chat.
- A topic named only in the system prompt was ignored by the model, so must-follow instructions go last.
- The judges hedged until code took the decision.

### Phase 3: final sprint (plan 30, Oct 18 onwards)

After the first deploy, plan 30 merged everything still open:

| Step | What | Status |
|---|---|---|
| **S0** | Browser bug: the site hung on "Waking up the server…" outside Chrome. Fixed the wake-up screen (real timeouts, 120 s retry, an honest "your browser blocked the connection" message), CORS, signup in one call, ~100 cities, copy fixes, a 3-browser smoke test (`npm run smoke:browsers`) | ✅ |
| **S1** | Speed:<br>- two-phase onboarding: app usable 92 s → **0.2 s**; full graph 92 s → **14.5 s**<br>- agent pacing and one AI call per turn: a whole chat 23 min → **~4.7 min**, 18 → 13 messages<br>- first-message target (≤ 20 s) missed because of NVIDIA 429s | ✅ |
| **S6** | New design ("Round 7"; product name stays Prelude): tokens, components, every screen restyled | 🔄 mostly (old CSS cleanup + motion left) |
| **S2** | New onboarding: ~5-minute core, scam self-check, active / held (the live check step it added was removed on Oct 19) | ✅ |
| **S3** | Real dating-app core: photos + moderation, prompts, profile view and editor, likes with comments, Likes you, match choice, human chat with photos and "Seen", block / report / unmatch, agent labels for both people | ✅ |
| **SN** | Natural conversation (added Oct 19, §16) | 🔄 code done and deployed; live 6-pair test pending |
| **UI fixes** | Live check removed; phone layout, borders, back buttons, onboarding hints (Oct 19, §16) | ✅ |
| **S4** | Accounts: email verification + forgot password (Resend), rate limits | ⬜ next |
| **S5** | Nice-to-haves: notifications, photo → interest suggestions, eval follow-ups | ⬜ only if time |
| **S7** | Ship: Nebius check (Oct 26), the one push + deploy (Oct 27), QA, README / submission | ⬜ |

S0–S3 were pushed on Oct 19 at the owner's request (Vercel paused, Render auto-deploy off).

---

## 16. The three problems raised on Oct 19

After trying the deployed site, the team raised three problems. This section records the diagnosis and what was done.

### Problem 1: "The conversations don't feel human; the agent just talks to satisfy the points in the knowledge graph"

**Diagnosis (it was by design, not a model quirk).** The engine was built to collect answers for the judges:
- **Topics on a timer:** after 1 warm-up turn, every other message was forced onto the next agenda topic, and every one of the last 4 messages.
- **Forced direct questions:** dealbreakers and very important answers had to be asked about directly before a chat could end. That's redundant, because the gate had already checked the dealbreakers.
- **A question in almost every message:** the question floor was 0.7, and the final instruction was always "react briefly, then ask…".
- **Fallbacks were form questions:** "do you smoke, by the way?".
- **Strict grounding** drops any unsupported "I…" sentence, so the safest message is always a question.
- **Both agents did this,** so you got two interviewers.

**Fix: step SN** (commit `ef33278`, local, not pushed). In `planAct.js`, `engine.js`, `prompts/agentReply.js` and `kg/config.js`:
- **Topics only come up in the flow:**
  - through a **bridge** (what was just said leads there: a bar → drinking, a nephew → kids, moving abroad → where you'll live)
  - or at a **lull** (a short reply with no question, a thread that's had its run, or boredom)
  - not in the first 2 turns, never back to back, no timer, no forcing near the end
- **Gate-checked dealbreakers** only come up if the chat leads there.
- **Each message has a move:** answer their question, a curious follow-up on their thread, share something of your own (no question), or just react. After they answer your question, the agent usually shares or reacts instead of asking again. A stall guard asks if nobody asked and the reply was short.
- **The prompt** now says it's a getting-to-know-you chat, not an interview: follow their thread, share before you ask, pick up details. A topic is a suggestion the model may skip if it would sound abrupt.
- **Fallbacks** are follow-ups ("oh nice, how did that start?").
- **New metrics:** topics by bridge / lull / cold, and back-to-back questions.

**Measured on the plans, the same scripted chat:**

| | Before | After |
|---|---|---|
| Messages ending in a question | 75% | 57% |
| Messages spent on agenda topics | 3.5 of 6 | 2.0 of 6 |
| Smoking dealbreaker asked cold | yes | never |

**Checks:** `npm test` 128/128, `api-check` passes, client build green.

**Still to do:**
- a live run of the 6 test pairs (needs `server/.env` on the dev machine)
- check judge accuracy holds; fewer forced topics may mean more "Maybe", and the fix for that belongs in the judge, not in forcing topics again

### Problem 2: "Too many onboarding questions; it gets boring"

**Before:** 3 basics, 20 personality statements, 11 values questions with 4 controls each, at least 4 typed stories, at least 3 interests and **15** typed replies. Roughly 80–100 inputs before seeing anything.

**Done in S2:**
- a ~5-minute core with **5** replies instead of 15
- stories and the 20 personality statements moved to optional "Teach your agent more"
- the values questions are skippable

**Possible next trim:** show "what I'd accept" only when dealbreaker is ticked, since it does nothing otherwise. Also, nobody has timed a real run against the 6-minute target yet.

### Problem 3: "The live check shouldn't be optional; no account without it. There are UI problems"

**First answer (S2):** the live check became an onboarding step, with "Skip for now" = browse only.

**Final decision (owner, later on Oct 19): remove the live check completely.** Done:
- **Server:** its route, service, model, prompt, test and script are gone, plus `LIVE_CHECK_*` env and the trust check's small bonus. New accounts start **active**. At server start, any account still waiting in `browse_only` is activated once, and its kept likes are delivered.
- **Client:** the page, the onboarding step (onboarding is now 6 steps), the "Live-checked" badges, the Settings row, the landing-page claim, and the MediaPipe library and model files are gone.
- `MODEL_VISION` stays: photo moderation still uses it.

**UI problems reported with it, and the fixes** (checked with a headless Chrome at 390 px and 1440 px):

| Problem | Cause | Fix |
|---|---|---|
| On phones, the last lines are hidden under the box at the bottom | An old rule from the previous design, `.onb-foot { position: fixed }`, pinned the onboarding footer over the content. Also, the "agent paused" banner pushed full-height screens down, so the tab bar and last lines fell off the bottom. | Deleted the old onboarding CSS. With the banner shown, the screen takes only the height that's left. |
| The orange boundary on all boxes | Every box, chip and input used a tan border (`--sand` #D9CBB3), and every focused field got an orange ring, twice: the new design's plus an old `outline` rule. | Neutral grey hairlines; input fields a shade darker; a neutral focus ring. Orange stays only on primary buttons and selected states. |
| Can't go back from the sign-in page | The log in / join pages had no back control (only the logo). | A back arrow on phones and a "Back" button on desktop: to the previous page, or to the landing page on a fresh visit. |
| Onboarding doesn't continue and doesn't say why | Continue was just greyed out; only one step showed a reason, at the very bottom. | Every step says what's missing next to Continue (e.g. "Add what you do to continue", "Pick 3 prompts (1 so far)"). Tapping Continue scrolls to that spot and highlights it. |

---

## 17. Current status and what's left

**State on Oct 19 (evening):** SN and the UI fixes above are pushed and deployed. **Auto-deploy is on** for Render and Vercel, so every push to `main` goes live.

**Next steps in order:**
1. **SN live test:** 6 test pairs, metrics, two transcripts for the owner.
2. **S4:** email verification + password reset, which hide themselves without a Resend key, plus rate limits.
3. **S6 leftovers:** old CSS cleanup, motion.
4. **S5** only if time allows.
5. **Oct 26:** switch to Nebius Token Factory (an `.env` change only) and re-measure.
6. **Oct 27:** the one push + deploy, smoke test on 3 browsers, full QA with seed and judge accounts in every state.
7. **Oct 28:** feature freeze; README and SUBMISSION updates. The README's evaluation paragraph still says the agent "must now ask directly" about important topics; SN changed that.
8. **Oct 29:** submit on Devpost (the video is made by humans).

**Waiting on humans:**
- **Nebius account + credits** by Oct 26.
- **Cloudinary** keys (photos use a local stub until then) and **Resend** keys (email features stay hidden until then).
- `server/.env` on the dev machine, for live AI runs.
- `CLIENT_URL` on Render at deploy: `https://dating-agent-flame.vercel.app,https://dating-agent-chandal-chowkdi.vercel.app`.

**Main risks:**
- NVIDIA free-tier 429s make everything slower and flakier until the Nebius switch.
- Judges cluster on "Maybe".
- Synthetic-only evaluation.
- Limited free-tier deploy credits (hence one deploy).

---

## 18. Running it locally

```bash
git clone https://github.com/Yagnik-Trivedi/dating-agent && cd dating-agent
cd server && npm install && cp .env.example .env     # fill in keys from the team (never commit .env)
npm run dev-db        # local MongoDB replica set on :27999 (keep running; never in production)
npm run seed          # 38 demo personas with full graphs (~30 min on NVIDIA)
npm run dev           # API on :5000
cd ../client && npm install && npm run dev           # web app on http://localhost:5173
```

- **Database:** use `MONGODB_URI=mongodb://127.0.0.1:27999/dating_agent?replicaSet=testset` for the local dev DB. Transactions need a replica set, which is why there's `dev-db`.
- **Client env:** the client needs `VITE_API_URL` (e.g. `http://localhost:5000`); the build refuses a missing or malformed value.

**Checks:**

| Command | What it checks |
|---|---|
| `cd server && npm test` | Unit and integration tests (own in-memory DB; no keys needed: CI uses a dummy env with `LLM_ENABLED=false`) |
| `npm run api-check` | End-to-end API + sockets against a running server |
| `npm run smoke:browsers` | Chromium / Firefox / WebKit against the local production build |
| `node scripts/smoke.js` | AI provider reachable, lists model IDs |
| `node scripts/simulate.js seed01@demo.local seed04@demo.local` | One agent↔agent chat |
| `node scripts/eval.js`, then `node scripts/eval/metrics.js` | The evaluation |

**Golden rules for contributors:**
- Never print, log or commit secrets.
- Every env var is validated at boot (`config/env.js`); keep `.env.example` current.
- Every AI JSON output is validated with zod.
- Prompts live in `services/prompts/`.
- Thresholds live in `services/kg/config.js`.
- Commit locally after each step; push only on the owner's word.

---

## 19. Glossary

| Term | Meaning |
|---|---|
| **Agent** | The AI that chats on a user's behalf, in their voice, from their knowledge graph |
| **Agent mode** | `off` (no agent), `shadow` (agent replies, you watch and can take over), `auto` |
| **Take over** | One tap that stops your agent for that match; you type yourself |
| **Knowledge graph (KG)** | Everything the app knows about a user: facts, concepts, edges, voice, notes, decisions |
| **Fact** | One statement about a user ("likes: trekking"), with evidence, confidence and a disclosure tier |
| **Concept** | A shared meaning that many users' facts link to ("trekking"), with one embedding |
| **Disclosure tier** | `public` (may be said), `if_asked` (only if asked), `private` (never said) |
| **Gate** | The code-only filter on basics, answers and dealbreakers, applied both ways; it builds the Discover deck |
| **Dealbreaker** | An answer you won't accept in a partner; enforced by the gate |
| **Trust check** | The scam / fake / inconsistency check on a profile |
| **Brief** | Each agent's preparation before a chat: a profile summary, openers, an agenda |
| **Agenda** | Topics *my* agent would like to learn about, from *my* graph |
| **Act plan** | The per-message plan sampled in code: length, move, question, topic, language, end |
| **Move** | The shape of one message: answer, follow-up, share, react, topic |
| **Bridge / lull** | The two natural ways a topic comes up since SN: the chat leads there / the chat slows down |
| **Grounding** | Every claim about the user must cite a fact, checked in code |
| **Leak check** | Checks that no outgoing message reveals a private fact |
| **Ask my human** | An inbox question filed when someone asks about you and your graph has no answer |
| **Judge** | The private evaluator per side, which lists quote-backed evidence; code decides yes / unsure / no |
| **Reveal** | At hand-off, the note on how many messages the agents wrote |
| **Wind-down** | The one polite closing message sent when a match is Not compatible |
| **held / active** | Profile status: held by the scam self-check / visible (browse_only is no longer used) |
| **Seed personas** | 38 synthetic demo users used for the demo and the evaluation |
| **Token Factory** | Nebius's OpenAI-compatible AI API, required by the hackathon |
| **Tier** | fast / mid / smart / embed / vision: which model handles a task |
| **Job** | A unit of background work in the Mongo job queue |
