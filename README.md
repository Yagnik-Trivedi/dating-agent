# Twine

**Skip the small talk, not the person.** Twine gives you an AI agent that has the first conversation with your
match in your own voice. Then it writes you a short letter, with quotes, on whether this one is worth your evening.

[![License: MIT](https://img.shields.io/badge/License-MIT-A04E2E.svg)](LICENSE) · **Live demo:** [twine-ai.vercel.app](https://twine-ai.vercel.app) · Judge logins are in the Devpost testing instructions.

Built for the **Nebius x NVIDIA Global AI Hackathon** (Best Apps & Agents) on **NVIDIA Nemotron** models served through
**Nebius Token Factory**. The repository is called `dating-agent`; the app is Twine.

> The API runs on a free server that naps when nobody is around. The first visit after a quiet spell can take up to a
> minute while it wakes up; after that it's quick.

---

## The problem

Dating apps match people on preferences, not character. Two people both like trekking and both want something
serious, so they match. Three conversations later, one of them mentions the smoking, the move abroad or the
"not sure about kids", and it's over. Neither of them did anything wrong. They just spent a week finding out what
could have been known on day one.

## The idea

Let the agents have that week.

After a mutual like, each person's agent opens the conversation and gets to know the other side, the way a good
friend would on your behalf: curious, warm, and honest about who you are. You can read every line as it happens.
When the chat winds down, each side gets a private verdict, **Compatible**, **Maybe** or **Not compatible**, and
every reason in it quotes the other person's own words.

- **Compatible:** you take over the chat, and Twine reveals exactly which lines were your agent's.
- **Maybe:** let them talk a bit longer, or step in yourself.
- **Not compatible:** your agent closes things kindly, in your voice. You spent zero evenings on it.

## How it works

```
 1. Your agent        2. The gate and       3. The agents         4. Two private        5. You take
    learns you           the trust check       talk                  judges                over
 ─────────────────    ─────────────────    ─────────────────    ─────────────────    ─────────────────
 questions, short     dealbreakers keep    each in its own      one per side, each   one tap; the
 stories and "how     clear clashes out    person's voice;      quote-checked;       reveal shows
 would you reply?"    of your deck; fake   you read along,      code turns the       which lines were
 → your knowledge     profiles are caught  pause, or take over  evidence into a      the agent's
   graph              before hello         at any moment        verdict
```

**What makes it work:**

- **It sounds like you.** Your agent learns how you actually text: message length, emoji, laughs, pet phrases and
  language mix, Hinglish included. It writes from real examples of your own replies, not from a generic chatbot voice.
- **It never makes things up about you.** Every claim about you must cite a fact from your knowledge graph, and code
  checks the citation before the message is sent. When your match asks something your agent doesn't know, it
  deflects naturally and drops the question in your **Ask me** inbox.
- **It keeps your secrets.** Every fact has a privacy level (`public`, `if_asked`, `private`). Private facts are never
  given to the model as something it may say, and every outgoing message passes a leak check.
- **It never peeks.** No agent or judge ever reads the other person's knowledge graph or texting style. They learn
  about each other only from the public profile and the conversation itself, just like two people would. A database
  spy test enforces this.
- **You're always in charge.** You can watch live, pause your agent, take over in one tap, or tap
  "I wouldn't say that" to teach it.

## Built on NVIDIA Nemotron and Nebius Token Factory

Every model call goes through a single client (`server/src/services/llm/client.js`) pointed at Token Factory's
OpenAI-compatible API. Model IDs live in `.env`, never in code, so changing a model is a configuration change.
Each task runs on the cheapest tier that does it well:

| Task | Tier → model | Why this tier |
|---|---|---|
| Agent replies, reading the other person's message, match brief, story fact extraction, trust check, reflections, voice corrections, note compaction | **mid** → Nemotron 3 Super | Needs real language understanding in your voice, including Hinglish. Reasoning is off for chat turns: 2–5 s instead of 10–40 s. |
| Stance check, wind-down message, icebreakers, date-idea write-up | **mid** → Nemotron 3 Super | Short tasks. In our measurements Super with reasoning off answered in 2–9 s while Lightning took 30–60 s, so they moved up a tier. `LLM_TASK_TIERS` moves any task back without a code change. |
| Judges (one per side, private) | **smart** → Nemotron 3 Ultra, falling back to Super | The decision that matters most. It runs once per side per conversation, at temperature 0. |
| Concept matching, "was I asked about this?", leak check, choosing voice examples | **embed** → Nemotron embedding model | One shared vector per *concept* (not per fact), which keeps storage at about 88 KB per user. |
| Photo moderation | **vision** → Nemotron VL | Describes each new photo (is it a person? any text, contact details, QR codes or explicit content?). Code makes the final call. |

The exact model IDs are set in `.env` (`MODEL_FAST`, `MODEL_MID`, `MODEL_SMART`, `MODEL_EMBED`, `MODEL_VISION`; see
[`server/.env.example`](server/.env.example)). Every call records which model answered, and every verdict records
whether Ultra or the Super fallback decided.

- **Reasoning models, handled.** `max_tokens` leaves room so reasoning can't crowd out the answer. Reasoning text
  stays in its own field and never reaches a user. Reasoning can be switched off per tier with
  `chat_template_kwargs.enable_thinking=false` where speed matters.
- **Every output is validated.** JSON goes through zod, with one retry and then a graceful fallback. Quotes must
  match the source word for word, or code drops them.
- **The budget can't run away.** A global requests-per-minute limiter, per-user and global daily caps, an all-time
  USD cap (`LLM_HARD_CAP_USD`) that fails closed, and a kill switch (`LLM_ENABLED=false`). Every call is logged with
  its purpose, tier, tokens, latency and cost, and no prompt text is stored.
- **Why Token Factory:** one OpenAI-compatible API for chat, embeddings and vision, tiered models with clear prices,
  and fast iteration.

## The knowledge graph

Everything Twine knows about you sits in six layers, each with a clear owner and clear rules about who may read it:

| Layer | What it holds | Who reads it |
|---|---|---|
| 1. Public profile | What anyone on the app can see | Everyone |
| 2. Gate | Basics, answers, what you accept, dealbreakers | Code only, as one indexed query that returns yes or no |
| 3. Self graph | Facts about you, linked to shared concepts | Your agent |
| 4. Voice | How you text, as distributions plus your real sample replies | Your agent |
| 5. Notes about others | What your agent learned in a chat, each note backed by a verbatim quote | Your agent and your judge |
| 6. Decisions | Your judge's verdict | You |

Every fact carries a confidence, its evidence and a privacy level. You can browse, edit, hide or correct all of it on
the **This is you** page.

**Scale (measured without the LLM, 2,000 users):** the discover query runs in **4.6 ms** at p95, building one
message's context takes 1.7 ms when cached, and each user takes about 88 KB, so **about 5,900 users fit in a free
MongoDB Atlas M0**.

## Evaluation

We ran the whole pipeline (trust check → brief → agent-to-agent chat → two independent judges) on 20 hand-labelled
pairs of synthetic personas. Full numbers are in [`server/eval/results/latest.md`](server/eval/results/latest.md), and
every transcript is in [`server/eval/transcripts/`](server/eval/transcripts/).

| What | Result |
|---|---|
| Fake profiles caught | **2/2**, with no genuine profile flagged |
| Dealbreaker gate | **1/1**: the clashing pair never became a chat |
| Verdict accuracy (17 non-fake pairs) | **8/17 (47%)** with code deciding from the judge's evidence (up from 4/17); **5/7** compatible pairs found (up from 0/7); **1** compatible ↔ incompatible swap |
| Unsupported claims about the user | **21%** of 137 self-claims (offline judge); 28% vs 35% with the conversation rules on vs off |
| Private-fact leaks (probe) | 0/20 by keyword, 4/20 by an LLM judge |
| Voice fidelity | style distance **0.16**, language-mix distance **0.06** (0 means identical to the persona's real texting) |
| Cost | about 101k tokens and 17 messages per pair; about 3k tokens to catch a fake |

**What we learned: models describe better than they decide.** In the first run the judges hedged and said "unsure"
in most chats. Now the model only lists evidence, each quote tied to something that matters to you, and
**code decides**:

- **No:** a stated dealbreaker, or a serious clash on something that matters a lot.
- **Yes:** two or more quote-checked positives on what matters to you, and no serious friction.
- **Maybe:** anything else.

Re-judging the same 17 saved chats this way doubled accuracy ([rejudge.md](server/eval/results/rejudge.md)). Most of
the remaining misses were conflicts nobody had brought up, so the topics that matter most to you are now raised during
the chat, through a natural bridge from whatever the two of you are talking about. On fresh chats for those pairs,
the hidden drinking conflict surfaced and was caught ([results-step4.md](server/eval/results-step4.md)).

## Safety and consent

- **Consent first.** Every user agrees at sign-up: "Early conversations with your matches may be handled by AI agents,
  including yours." No tick, no account.
- **Nothing is hidden.** Every message records whether a human or an agent wrote it, and the reveal at hand-off says
  exactly how many lines were the agents'. A sincere "am I talking to a bot?" always gets an honest answer.
- **You're in control.** Read every line, pause, take over in one tap, or turn agents off. "Talk anyway" reopens a
  match your own judge called Not compatible.
- **Scams are stopped.** Rules plus an LLM consistency check catch fake profiles, and a scam script in chat
  ("add me on telegram, I can help you invest") stops both agents at once.
- **No guessing at identity.** Twine never infers religion, caste, ethnicity or race from names or photos. Photos stay
  blurred until both people say yes.
- **Every photo is checked.** Each new photo gets one automatic check before anyone else sees it. Contact details,
  QR codes, mostly-text images and explicit content are rejected, and the check never estimates age, gender, race or
  attractiveness.
- **Leaving is clean.** "Delete my data" removes your profile, graph, voice and messages, and anonymises your side of
  every match.

## Honest limits

- **Nobody can predict love from a chat.** Research on predicting compatibility before two people meet is sobering
  (e.g. Joel, Eastwick & Finkel, 2017). Twine doesn't try. It filters clear mismatches and fakes, and saves you the
  first few conversations.
- **The evaluation is synthetic.** It uses 38 hand-written personas, not real users.
- **Languages:** English and the Indian code-switched mixes we tested (Hinglish, Devanagari Hindi, and Gujarati-,
  Tamil- and Marathi-English).

## Run it yourself

```bash
git clone https://github.com/Yagnik-Trivedi/dating-agent && cd dating-agent
cd server && npm install && cp .env.example .env   # fill in the keys (see the comments in .env.example)
npm run dev-db                                     # local MongoDB replica set on :27999 (keep it running)
npm run seed                                       # 38 demo personas with full knowledge graphs (~30 min)
npm run dev                                        # API on :5000
cd ../client && npm install && npm run dev         # web app on http://localhost:5173
```

- **Tests:** `cd server && npm test` (starts its own in-memory database).
- **Watch two agents talk:** `node scripts/simulate.js seed01@demo.local seed04@demo.local`.
- **Run the evaluation:** `node scripts/eval.js --yes`, then the scripts in `server/scripts/eval/`.

**Stack:** Node 22, Express 5, Socket.IO 4 and MongoDB (Mongoose 8) on the server, with a Mongo-backed job queue (no
Redis) that resumes work after a restart. React 19, Vite and Tailwind CSS v4 on the client.

## Deploy

Twine runs entirely on free tiers: Render for the API, Vercel for the web app, MongoDB Atlas M0 for data, and a small
keep-alive bot so the demo stays awake. Step-by-step instructions are in [DEPLOY.md](DEPLOY.md).

## Team

Built by **Yagnik Trivedi**, **Viranshul Panchal**, **Arya Patel** and **Swayam Prajapati**.

Released under the [MIT License](LICENSE).
