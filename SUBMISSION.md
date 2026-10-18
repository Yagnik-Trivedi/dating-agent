# Devpost submission: Prelude

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

Prelude gives everyone an AI agent that knows them: from a short questionnaire, a few stories, and "how would you
reply?" prompts that capture how they actually text (Hinglish included). After two people like each other:

1. **Their agents check each other's public profile** for fakes and inconsistencies. A dealbreaker gate means clear clashes never match at all.
2. **The two agents have the first conversation**, each in its own person's voice. Neither agent ever invents a fact about its person: every claim cites that person's knowledge graph, checked in code. When an agent doesn't know something, it asks its human.
3. **Two independent judges**, one per side and private, list quoted evidence. **Code** turns that evidence into Compatible, Maybe or Not compatible.
4. **You take over in one tap.** Then a reveal shows how many messages were the agents'. A Not compatible ends with a kind wind-down in your voice.

You can read every line live, pause your agent, take over, or say "I wouldn't say that" to teach it. There's also an
optional live check: two random moves on camera, judged by a Nemotron vision model, shown as "Live-checked".

## How we built it

- **Stack:** React 19 + Vite, Express 5 + Socket.IO, MongoDB Atlas (M0) with a Mongo-backed job queue. Everything runs on free tiers: Render, Vercel, Atlas, plus a keep-alive bot.
- **Models:** every model call goes to **Nebius Token Factory** through one client, using NVIDIA Nemotron by tier:
  - **Super** for conversation turns, perception and extraction;
  - **Ultra** for the judges;
  - **Lightning** for short tasks;
  - a Nemotron **embedding** model for concepts;
  - a Nemotron **VL** model for the live check.
- **Knowledge graph:** a six-layer graph per user (public profile, gate, self graph on shared concepts, voice, notes about others, decisions) with confidence, verbatim evidence and privacy tiers. A DB-spy test proves no agent ever reads the other user's graph.
- **Evaluation:** we built an evaluation harness: 38 synthetic personas, 20 labelled pairs, metric scripts, ablations and a scale test.

## Challenges we ran into

- **Judges hedging:** the judges said "unsure" in most chats, so almost every pair came out Maybe. We moved the decision into code: the model lists quoted evidence, and rules decide.
- **Hidden dealbreakers:** these never surfaced because nobody asked. Agents now must ask directly about anything that matters a lot to their person before a chat can end.
- **Agents misdescribing their person** ("still figuring out what I'm looking for" when the answer was long-term). We now check stated answers against the person's real ones in code, in English and Indian code-switched languages.
- **Free-tier latency and rate limits:** these shaped a global limiter, retries with backoff, and an evaluation that can resume.

## Accomplishments that we're proud of

- **Verdict accuracy** doubled after moving the decision into code (4/17 → 8/17), with 5/7 compatible pairs found. Fakes were caught 2/2, and the gate held 1/1.
- **Voices sound like the person:** style distance 0.16 and language-mix distance 0.06 against each persona's real texting, including Hinglish and Devanagari.
- **It's cheap and scales:** ~101k tokens per full conversation, and ~5,900 users would fit in a free database.
- **Honest by design:** consent at sign-up, `authoredBy` on every message, the reveal, and no "verified" claims.

## What we learned

- **LLMs describe better than they decide.** Letting the model list evidence and letting code decide made the system more accurate and easier to explain.
- **What matters most is what nobody asks about.** The agenda has to force the important questions.
- **Prediction research is sobering**, so we aimed at filtering clear mismatches and fakes, not predicting love.

## What's next

- Real-user pilots with opt-in feedback on the verdicts.
- A judge-vs-human agreement study (the labelling set is ready).
- Photo-to-person matching for the live check.
- More languages.

## Testing instructions (Devpost private field: fill in at deploy)

- **Live app:** TODO(deploy): Vercel URL. The first load may take up to a minute while the free server wakes.
- **Judge logins:** `judge1@demo.local` and `judge2@demo.local`. Password: TODO, from the team (private field only).
- **In 2 minutes:**
  1. **Matches** → open a finished match → **Your agent's read**. Each point quotes their words; tap a "line" link to jump to it.
  2. Open the match that's **mid-conversation**. It resumes when you open it; watch a few live turns, then press **Pause** or **Take over**.
  3. **This is you** → the knowledge map, privacy per fact, and "How you text".
  4. Optional: **Settings → Live check** on a laptop or phone with a camera.
- New sign-ups get 2 live agent conversations per day, to protect our credits.

## Feedback for Nebius / NVIDIA

TODO(after plan 14): add our Token Factory experience (onboarding, catalog, latency per tier, docs). From development on NVIDIA's API with the same Nemotron models:

- **Reasoning output:** reasoning comes back in a separate `reasoning_content` field, which is great, but a small `max_tokens` silently returns an empty `content` when reasoning uses the budget. A clear error or a reserved answer budget would save debugging time. `chat_template_kwargs.enable_thinking=false` was essential for chat latency (1–5 s vs 10–40 s); it deserves a first-class parameter.
- **Catalog vs access:** some models listed in `GET /v1/models` returned 404 for our key (one Nano variant, Ultra at times). An `available: true/false` per key in the listing would help.
- **Latency:** this varied from 1 s to over 2 minutes for the same tiny request on the free tier, sometimes with 429s. A documented rate limit and a `Retry-After` on every 429 make agents much easier to build.
- **Embeddings:** the `dimensions` parameter was rejected (400), and `input_type` (query vs passage) mattered. Both are worth a sentence in the docs.
- **Vision:** the Nemotron VL model ID in some docs (Nano 12B v2 VL) wasn't available to us; Nemotron 3.5 Super VL was. A stable alias per family would help.
