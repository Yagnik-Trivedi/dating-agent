# Devpost submission: Twine

Paste each section into the Devpost form. **Never put the judge password in this file** (the repo is public). It goes
only into Devpost's private "Testing instructions" field.

**Track:** Best Apps & Agents
**Existing project?** No. Built during the submission period.
**Built with:** nvidia-nemotron, nebius-token-factory, tavily, mongodb, express, react, node.js, socket.io, vite, tailwindcss

## Inspiration

Dating apps match people on preferences, not character. We kept seeing the same story: a promising match, three
conversations of small talk, and then the realisation it was never going to work. We wanted the boring, revealing
first conversation to happen without costing anyone their evening, and without anyone pretending to be someone else.

## What it does

Twine gives everyone an AI agent that knows them: from a short questionnaire, a few stories, and "how would you
reply?" prompts that capture how they actually text (Hinglish included). After two people like each other:

1. **Their agents check each other's public profile** for fakes and inconsistencies. A dealbreaker gate means clear clashes never match at all.
2. **The two agents have the first conversation**, each in its own person's voice. Neither agent ever invents a fact about its person: every claim cites that person's knowledge graph, checked in code. When an agent doesn't know something, it asks its human.
3. **Two independent judges**, one per side and private, list quoted evidence. **Code** turns that evidence into Compatible, Maybe or Not compatible.
4. **You take over in one tap.** Then a reveal shows how many messages were the agents'. A Not compatible ends with a kind wind-down in your voice.

You can read every line live, pause your agent, take over, or say "I wouldn't say that" to teach it. Every new photo
is checked by a Nemotron vision model before anyone else sees it.

## How we built it

- **Stack:** React 19 + Vite, Express 5 + Socket.IO, MongoDB Atlas (M0) with a Mongo-backed job queue. Everything runs on free tiers: Render, Vercel, Atlas, plus a keep-alive bot.
- **Models:** every model call goes to **Nebius Token Factory** through one client, using NVIDIA Nemotron by tier:
  - **Super** for conversation turns, perception, extraction and the short tasks (wind-down, icebreakers, date ideas);
  - **Ultra** for the judges;
  - Qwen3 Embedding 8B on Token Factory for concept vectors;
  - a Nemotron **VL** model for photo moderation.
- **Knowledge graph:** a six-layer graph per user (public profile, gate, self graph on shared concepts, voice, notes about others, decisions) with confidence, verbatim evidence and privacy tiers. A DB-spy test proves no agent ever reads the other user's graph.
- **Evaluation:** we built an evaluation harness: 38 synthetic personas, 20 labelled pairs, metric scripts, ablations and a scale test.

## Challenges we ran into

- **Judges hedging:** the judges said "unsure" in most chats, so almost every pair came out Maybe. We moved the decision into code: the model lists quoted evidence, and rules decide.
- **Hidden dealbreakers:** these never surfaced because nobody asked. The topics that matter most to each person are now raised during the chat, through a natural bridge from whatever they're talking about.
- **Agents misdescribing their person** ("still figuring out what I'm looking for" when the answer was long-term). We now check stated answers against the person's real ones in code, in English and Indian code-switched languages.
- **Free-tier latency and rate limits:** these shaped a global limiter, retries with backoff, and an evaluation that can resume.

## Accomplishments that we're proud of

- **Verdict accuracy** doubled after moving the decision into code (4/17 → 8/17), with 5/7 compatible pairs found. Fakes were caught 2/2, and the gate held 1/1.
- **Voices sound like the person:** style distance 0.16 and language-mix distance 0.06 against each persona's real texting, including Hinglish and Devanagari.
- **It's cheap and scales:** ~101k tokens per full conversation, and ~5,900 users would fit in a free database.
- **Honest by design:** consent at sign-up, `authoredBy` on every message, the reveal, and no "verified" claims.

## What we learned

- **LLMs describe better than they decide.** Letting the model list evidence and letting code decide made the system more accurate and easier to explain.
- **What matters most is what nobody asks about.** The agent has to bring the important topics up, naturally, before the chat ends.
- **Prediction research is sobering**, so we aimed at filtering clear mismatches and fakes, not predicting love.

## What's next

- Real-user pilots with opt-in feedback on the verdicts.
- A judge-vs-human agreement study (the labelling set is ready).
- More languages.

## Testing instructions (paste into Devpost's private field)

- **Live app:** https://twine-ai.vercel.app. The first load can take up to a minute while the free server wakes up.
- **Two judge accounts**, both fully onboarded, each with a knowledge graph built from their own answers:
  - `judge1@demo.local`: **Naina**, 30, Delhi
  - `judge2@demo.local`: **Rehan**, 26, Pune

  Password: [add the judge password here, in Devpost's private field only]
- **What to try (about 3 minutes):**
  1. **Matches** → open a match marked **Compatible** → read **your letter**. Every reason quotes the other person's own words; tap one to jump to that line in the chat. Naina and Rehan are matched with each other, so you can log in as both and compare the two private letters about the same chat.
  2. Open the match marked **Maybe** to see how the agent explains what it still doesn't know, and try **Let them talk a bit longer**.
  3. **This is you** → the knowledge graph behind the agent: facts with privacy levels, the **Brain** map, and **How you text**.
  4. **Ask me** → questions the agent couldn't answer from the graph, so it asked its human instead of inventing an answer.
- New accounts get 2 live agent conversations per day, to protect our model credits.

## Feedback for Nebius / NVIDIA

From building with the same Nemotron models on NVIDIA's API and on Token Factory:

- **Reasoning output:** reasoning comes back in a separate `reasoning_content` field, which is great, but a small `max_tokens` silently returns an empty `content` when reasoning uses the budget. A clear error or a reserved answer budget would save debugging time. `chat_template_kwargs.enable_thinking=false` was essential for chat latency (1–5 s vs 10–40 s); it deserves a first-class parameter.
- **Catalog vs access:** some models listed in `GET /v1/models` returned 404 for our key (one Nano variant, Ultra at times). An `available: true/false` per key in the listing would help.
- **Latency:** this varied from 1 s to over 2 minutes for the same tiny request on the free tier, sometimes with 429s. A documented rate limit and a `Retry-After` on every 429 make agents much easier to build.
- **Embeddings:** the `dimensions` parameter was rejected (400), and `input_type` (query vs passage) mattered. Both are worth a sentence in the docs.
- **Vision:** the Nemotron VL model ID in some docs (Nano 12B v2 VL) wasn't available to us; Nemotron 3.5 Super VL was. A stable alias per family would help.
