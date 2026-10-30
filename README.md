# Twine

**Your AI agent has the first conversation for you, in your own words, and tells you, with quotes, whether it's worth your time.**

[![License: MIT](https://img.shields.io/badge/License-MIT-A04E2E.svg)](LICENSE) · **Live demo:** [twine-ai.vercel.app](https://twine-ai.vercel.app) · Judge logins are in the Devpost testing instructions.

Built for the Nebius x NVIDIA Global AI Hackathon (Best Apps & Agents). The repo is called `dating-agent`; the app is Twine.

> The API runs on Render's free tier, so the first request after a quiet spell can take up to a minute while the server wakes.

## The problem

Dating apps match people on preferences, not character. Most people find out two or three conversations in that a
match was never going to work. That's hours of small talk spent on people who were never a fit.

## How it works

```
1. Your agent learns you    2. Gate + trust check       3. Agents write the     4. Two independent      5. You take over
   questionnaire, stories,     dealbreakers filter the     first conversation      judges, with quotes     one tap; the reveal
   "how would you reply?"      deck; fakes are flagged     in each person's voice  Compatible · Maybe ·    shows which lines
   → your knowledge graph      before anyone says hello    you read every line     Not compatible          were your agent's
```

- **You stay in control:** watch live, pause your agent, or take over in one tap. Everyone agrees at sign-up that agents may handle early chats.
- **Your agent never invents facts about you.** Every claim about you cites a fact from your graph, checked in code. When it doesn't know, it asks you ("Ask my human").
- **Only you see your read**, and every point quotes the other person's own words.

## How we use NVIDIA Nemotron + Nebius Token Factory

Every LLM call goes through one client (`server/src/services/llm/client.js`) pointed at Token Factory's
OpenAI-compatible API. Model IDs come from `.env`, never from code, so switching providers is an `.env` change.

| Task | Tier → model | Why this tier |
|---|---|---|
| Agent replies, reading their message (perceive + notes), match brief, fact extraction from stories, trust check, reflections, voice corrections, notes compaction | **mid** → Nemotron 3 Super | Needs real language understanding in your voice, including Hinglish; reasoning is off for chat turns (2–5 s instead of 10–40 s). |
| Stance check, wind-down message, icebreakers, date-idea write-up | **mid** → Nemotron 3 Super | Short tasks, but measured on the free tier Super with reasoning off answered in 2–9 s while Lightning took 30–60 s, so they moved up a tier. `LLM_TASK_TIERS` moves any task back without a code change. |
| Judges (one per side, private) | **smart** → Nemotron 3 Ultra, falling back to Super | The one decision that matters most. It runs once per side per conversation, at temperature 0. |
| Concept matching, "asked about me?", leak check, exemplar choice | **embed** → Nemotron embedding model | One shared vector per *concept* (not per fact), so storage stays at ~88 KB per user. |
| Photo moderation | **vision** → Nemotron VL | Describes each new photo (a person? text, contact details, QR codes, explicit content); **code** decides ok/rejected. |

The exact model IDs per tier are set in `.env` (`MODEL_FAST`, `MODEL_MID`, `MODEL_SMART`, `MODEL_EMBED`, `MODEL_VISION`; see [`server/.env.example`](server/.env.example)). Every call records which model answered, and a judge records whether Ultra or the Super fallback decided.

- **Reasoning models:** `max_tokens` is generous (≥ 2048) so reasoning can't eat the answer. Reasoning text lives in a separate field and never reaches a user. Per tier, reasoning can be switched off with `chat_template_kwargs.enable_thinking=false` where speed matters.
- **Every output is validated:** JSON outputs go through zod, with one retry, then a graceful fallback. Quotes must be verbatim or they're dropped in code.
- **Budget guard:** a global requests-per-minute limiter, per-user and global daily caps, an all-time USD cap (`LLM_HARD_CAP_USD`) that fails closed, and a kill switch (`LLM_ENABLED=false`). Every call is logged (purpose, tier, tokens, latency, cost), and nothing about prompt contents is stored.
- **Why Token Factory:** one OpenAI-compatible API for chat, embeddings and vision, tiered models with clear prices, and fast iteration from free credits.

## Architecture

MongoDB · Express 5 · React 19 + Vite · Node 22, with Socket.IO for the live match room. A Mongo-backed job queue
(no Redis) runs onboarding builds, agent turns, judges and nightly maintenance; a restart resumes them.

- `server/src/services/`: `llm/` (client, budget), `kg/` (knowledge graph), `trust/`, `brief/`, `conversation/` (per-turn engine, judges), `agent/` (scheduling, pause, take over), `compat/` (settle, hand-off), `tavily/` (date ideas).
- `client/src/`: the Twine design (light theme), one screen per route, code-split.
- Every message stores `authoredBy: human | agent`, for the audit trail and the reveal at hand-off.

## Knowledge graph

Six layers per user:

1. **Public profile.**
2. **Gate:** basics, answers, accepted values and dealbreakers, read only by code as one indexed query.
3. **Self graph:** facts linked to shared concepts, with edges.
4. **Voice:** how you text, as distributions plus your real sample replies.
5. **Notes about others:** only from the transcript, each with a verbatim quote.
6. **Decisions:** your judge's verdict, yours only.

- **Every fact carries evidence:** a confidence, verbatim quotes and a disclosure tier (`public | if_asked | private`). Private facts are never sent to a model as something it may say.
- **Every self-claim cites a fact, checked in code.** A missing or contradicted citation triggers one regeneration. Stated answers ("I'm not looking for anything serious") are checked against yours, in code.
- **Information boundary:** no agent or judge ever reads the other user's graph or voice. The only cross-user paths are the transcript, the public profile, and the gate (a boolean). A DB-spy test enforces this.
- **Scale (no LLM, 2,000 users):** discover p95 **4.6 ms** (one indexed query + `$sample`), context build per message 1.7 ms when cached, ~88 KB per user → **~5,900 users fit in a free Atlas M0**.

## Evaluation

We ran the full pipeline on 20 hand-labelled seed pairs: trust check → brief → agent ↔ agent chat → two
independent judges. Full numbers are in [`server/eval/results/latest.md`](server/eval/results/latest.md), with every transcript
in [`server/eval/transcripts/`](server/eval/transcripts/).

| What | Result |
|---|---|
| Fakes caught | **2/2**, no genuine profile flagged |
| Dealbreaker gate | **1/1**: the clashing pair never became a chat |
| Verdict accuracy (17 non-fake pairs) | **8/17 (47%)** with the judge deciding in code (was 4/17); **5/7** compatible pairs found (was 0/7); **1** compatible ↔ incompatible swap at the calibrated threshold |
| Unsupported claims about the user | **21%** of 137 self-claims (offline judge); 28% vs 35% with the conversation rules on vs off |
| Private-fact leaks (probe) | 0/20 by keyword, 4/20 by an LLM judge |
| Voice fidelity | style distance **0.16**, language-mix distance **0.06** (0 = the persona's real texting) |
| Cost | ~101k tokens and ~17 messages per pair; fakes ~3k tokens |

**What this tells us.** The agent is good at what we trust it with: catching fakes and hard dealbreakers before
anyone spends time. The first run showed the judges hedging (one side said "unsure" in most chats). So now the model
only lists evidence, each quote tied to something that matters to you, and **code decides**:

- **No:** a stated dealbreaker, or a serious clash on something that matters a lot.
- **Yes:** two or more quote-checked positives on what matters to you, with no serious friction.
- **Maybe:** anything else.

Re-judging the same 17 saved chats doubled accuracy ([rejudge.md](server/eval/results/rejudge.md)). The remaining
misses were hidden conflicts nobody asked about. So the topics that matter most to you are now raised during the chat,
through a natural bridge from whatever you're talking about. On fresh chats for those pairs, the drinking conflict surfaced and was caught
([results-step4.md](server/eval/results-step4.md)).

## Safety and consent

- **Consent** is required at sign-up: "Early conversations with your matches may be handled by AI agents, including yours."
- **You're in control:** you can read every line, pause your agent, take over in one tap, or turn agents off entirely. "Talk anyway" reopens a match your own judge called Not compatible.
- **Honest if asked:** a sincere "are you a bot?" always gets an honest answer. At hand-off, the reveal says how many messages were the agents'.
- **Scam and fake detection:** rules plus an LLM consistency check on the public profile; scam scripts in chat stop the agents at once.
- **No inference of religion, caste, ethnicity or race** from names or photos. Profile photos stay blurred until both people say yes.
- **Photo checks:** every new photo gets one automatic check before anyone else sees it. Contact details, QR codes, mostly-text images and explicit content are rejected; it never estimates age, gender, race or attractiveness.
- **Delete my data** removes your profile, graph, voice and messages, and anonymises your side of any match.

## Honest limits

- **Predicting compatibility before two people meet is weak in the research** (e.g. Joel, Eastwick & Finkel, 2017). So Twine filters clear mismatches and fakes and saves you the first conversations; it doesn't claim to predict love.
- **Synthetic evaluation:** the evaluation uses 38 hand-written synthetic personas, not real users.
- **Languages:** English and the Indian code-switched mixes we tested (Hinglish, Devanagari Hindi, Gujarati-, Tamil- and Marathi-English).

## Setup

```bash
git clone https://github.com/Yagnik-Trivedi/dating-agent && cd dating-agent
cd server && npm install && cp .env.example .env   # fill in the keys (see comments in .env.example)
npm run dev-db                                     # local MongoDB replica set on :27999 (keep it running)
npm run seed                                       # 38 demo personas with full knowledge graphs (~30 min)
npm run dev                                        # API on :5000
cd ../client && npm install && npm run dev         # web app on http://localhost:5173
```

- Tests: `cd server && npm test` (spins up its own in-memory replica set).
- Simulate a pair: `node scripts/simulate.js seed01@demo.local seed04@demo.local`.
- Evaluation: `node scripts/eval.js --yes`, then the scripts in `server/scripts/eval/`.

## Deploy

Runs entirely on free tiers: Render (API), Vercel (web), MongoDB Atlas M0, and a keep-alive bot.
Step-by-step instructions are in [DEPLOY.md](DEPLOY.md).

## Team and license

Built by [Yagnik-Trivedi](https://github.com/Yagnik-Trivedi), [Viranshul-P](https://github.com/Viranshul-P), [Aryapatel-007](https://github.com/Aryapatel-007) and Swayam Prajapati. MIT, see [LICENSE](LICENSE).
