# 05 — Onboarding + personal knowledge graph

> **Prompt for Claude Code:** Read `CLAUDE.md` and `plan/04-backend-core.md` (for the `KgFact` model), then implement the onboarding questionnaire content, the facts extraction pipeline, and the style profile. The UI for the questionnaire is in plan 10. Here you define the question set as shared JSON and build the server side. Run the acceptance checks.

## Goal

Turn a new user's answers into a personal knowledge graph (`KgFact` documents with `observerId: null`) plus a style profile. The agent uses these to talk *as* the user and to judge compatibility *for* the user.

## 1. Question set: `server/src/services/kg/questions.js` (also served at `GET /api/onboarding/questions`)

### Section A — Personality (Mini-IPIP, 20 items, public domain)
Answers use a 1–5 Likert scale (1 = very inaccurate, 5 = very accurate). **R** = reverse-scored (score = 6 − answer). Each trait score is the mean of its 4 items, normalized to 0..1.

| # | Item | Trait | R |
|---|---|---|---|
| 1 | Am the life of the party. | Extraversion | |
| 2 | Sympathize with others' feelings. | Agreeableness | |
| 3 | Get chores done right away. | Conscientiousness | |
| 4 | Have frequent mood swings. | Neuroticism | |
| 5 | Have a vivid imagination. | Openness | |
| 6 | Don't talk a lot. | Extraversion | R |
| 7 | Am not interested in other people's problems. | Agreeableness | R |
| 8 | Often forget to put things back in their proper place. | Conscientiousness | R |
| 9 | Am relaxed most of the time. | Neuroticism | R |
| 10 | Am not interested in abstract ideas. | Openness | R |
| 11 | Talk to a lot of different people at parties. | Extraversion | |
| 12 | Feel others' emotions. | Agreeableness | |
| 13 | Like order. | Conscientiousness | |
| 14 | Get upset easily. | Neuroticism | |
| 15 | Have difficulty understanding abstract ideas. | Openness | R |
| 16 | Keep in the background. | Extraversion | R |
| 17 | Am not really interested in others. | Agreeableness | R |
| 18 | Make a mess of things. | Conscientiousness | R |
| 19 | Seldom feel blue. | Neuroticism | R |
| 20 | Do not have a good imagination. | Openness | R |

Compute this deterministically in code; no LLM. Store 5 `trait` facts (`object` = trait name, `value` = 0..1, `confidence` 0.8, `source: 'questionnaire'`, `disclosure: 'private'`). The agent uses traits to *shape tone*, never states them.

### Section B — Values, life goals, dealbreakers
For each item, the user picks an answer **and** an importance: `nice-to-have | important | dealbreaker`.

1. Do you want children someday? (yes / no / open / have already)
2. How important is religion or spirituality in your own life? (central / somewhat / not really)
3. Where do you see yourself living in 3–5 years? (this city / another Indian city / abroad / flexible)
4. Smoking? (never / socially / regularly). Drinking? (never / socially / regularly)
5. How involved should families be in your relationship decisions? (closely / somewhat / not much)
6. Career ambition right now? (career-first / balanced / life-first)
7. What are you looking for? (long-term / open to long-term / short-term / figuring it out)
8. Diet? (veg / non-veg / vegan / jain / eggetarian / no preference)
9. How do you handle conflict? (talk it out immediately / need space first / avoid it)
10. How much alone time do you need? (lots / some / little)

Map them to facts: predicate `values`, `goal`, `lifestyle` or `dealbreaker`, with `weight` = nice-to-have 0.3, important 0.7, dealbreaker 1.0. Also create a `dealbreaker` fact for anything marked dealbreaker (e.g. object "partner must not smoke").

### Section C — Story prompts (free text, 1–4 sentences each)
1. Describe a perfect Sunday.
2. A hill you'd die on (a small or silly opinion).
3. Something you're weirdly good at.
4. The last thing that made you laugh out loud.
5. A place you want to go and why.
6. What do your close friends rely on you for?

### Section D — Interests
A free-text list plus picker chips (music, trekking, cricket, cooking, gaming, reading, startups, films, travel, fitness, art, dance, photography…). Store the intensity the user selects (casual / into it / obsessed → 0.3 / 0.6 / 0.9).

### Section E — Style samples ("how would you reply?")
The user answers 8 incoming messages exactly as they'd text:
1. "hey! your profile made me smile 😄"
2. "so what do you do when you're not working?"
3. "pineapple on pizza — yes or no?"
4. "I'm thinking of trying a trek this weekend, ever done one?"
5. "sorry for the late reply, crazy day"
6. "what's your idea of a good first date?"
7. "haha you seem fun"
8. "do you prefer texting or calls?"

### Section F — Privacy review
After extraction, show the generated facts so the user can set `disclosure` per fact and delete any. The UI for this is in plan 10. Defaults: traits `private`; dealbreakers `if_asked`; everything else `public`.

## 2. Extraction pipeline: `services/kg/buildUserGraph.js`

Runs async after `POST /onboarding/submit`. Set `onboarding.status = 'processing'`, then `'done'` or `'failed'`.

1. **Deterministic facts:** traits (A), values, goals and dealbreakers (B), interests (D).
2. **LLM extraction from stories (C)** using tier `mid`, prompt `prompts/extractStoryFacts.js`. Output schema:
   ```json
   { "facts": [ { "predicate": "likes|dislikes|values|story|background|goal", "object": "short phrase", "weight": 0.0-1.0, "quote": "exact words from the answer" } ] }
   ```
   Rules in the prompt:
   - Only facts explicitly supported by the text, each with a quote.
   - At most 8 per answer.
   - **Also keep each story itself** as one `story` fact (object = a 1-line summary; evidence quote = the full answer). The agent uses these as real anecdotes.
3. **Style profile** (`services/kg/styleProfile.js`):
   - **Computed in code from Section E:**
     - average and median message length (words)
     - emoji rate per message
     - lowercase-start ratio
     - exclamation and question rates
     - "haha/lol/lmao" usage
     - Hinglish ratio: share of tokens in a small Hinglish word list ("yaar", "kya", "hai", "nahi", "acha", "bhai", "matlab", "bas", …)
     - typical punctuation at the end of a message
   - **LLM description:** tier `mid`, prompt `prompts/describeStyle.js`. Output `{ "description": "5 short lines on tone, humor type, formality, warmth, quirks", "doList": [..], "dontList": [..] }`.
   - Save both to `user.styleProfile`.
4. **Embed** every fact's `predicate + ' ' + object` via `embed()` and store it in `embedding`.
5. Emit `onboarding:done` to `user:<id>`.

**Idempotency:** re-submitting deletes the user's previous self-reported facts (`observerId: null`, `source` in questionnaire/inferred) and rebuilds them. Never delete `user_answer` facts.

## 3. Graph endpoint: `GET /api/kg/me`

Returns `{ nodes, links }` for react-force-graph:
- one center node for the user
- one node per fact (label = object; group = predicate; size ∝ weight)
- links from center → fact, labelled with the predicate

Include `confidence`, `disclosure` and `source` on each node.

## 4. "Ask my human" answers become facts

`POST /api/inbox/:id/answer` (route from plan 04; logic here): run `extractStoryFacts` on the answer (tier `mid`), then save the results with `source: 'user_answer'`, `confidence: 0.9`, `disclosure: 'public'`, and embeddings.

## Acceptance checks

- [ ] `GET /api/onboarding/questions` returns all sections.
- [ ] Add a script `scripts/onboard-sample.js` that submits a realistic sample answer set for a test user and waits for `done`. Running it creates ~40–70 facts, 5 trait facts with correct reverse scoring (write a unit check for the trait math), a populated `styleProfile`, and embeddings.
- [ ] Every LLM-extracted fact has an evidence quote that appears verbatim in the answer. Assert this in code and drop facts that fail.
- [ ] `GET /api/kg/me` returns a valid nodes/links graph.
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-05): onboarding questionnaire, knowledge graph, style profile`
