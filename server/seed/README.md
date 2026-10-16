# Seed data

- `personas.json`: 30 fictional, SFW demo personas (`seed01@demo.local` … `seed30@demo.local`) with full onboarding
  answers (sections A–E), so `npm run seed` builds a real knowledge graph for each. `designNotes` explains each persona's
  intent and is never shown in the app.
  - seed01–04 are hand-written; seed05–30 come from `npm run generate-personas` (tier mid, run once) and were reviewed
    and edited by hand. Regenerating overwrites the hand edits, so don't, unless you mean to.
  - What decides verdicts is fixed in `scripts/generate-personas.js` (values/goals answers, dealbreakers, interests, which
    tags a profile shows); the model only wrote the voice (bio, prompts, stories, texting samples, Big Five sketch).
  - Mix: 24 ordinary personas (3 of them with a mild tags-vs-prompt inconsistency: seed11, seed14, seed15), 2 likely
    fakes (seed27, seed28: abroad + investment talk + pushing to Telegram/WhatsApp, no photos), 1 very thin profile (seed29).
  - "Hidden" answers: seed18 (kids), seed20 (smoking), seed22 (looking for), seed24 (moving abroad), seed26 (drinking)
    don't show the conflicting answer in their profile tags, so the dealbreaker only surfaces in conversation.
- `pairs.json`: 20 hand-labelled pairs for `npm run eval` (7 compatible, 7 incompatible, 4 maybe, 2 fake), each with
  the reason it was labelled that way.
- `trust-cases.json`: crafted profiles for the plan-06 trust check (`node scripts/trust-check.js`).

## Logging in as a seed persona

All seed accounts share one password: the `SEED_PASSWORD` value in `server/.env` at the time `npm run seed` ran.
It is never committed. Without it, seed accounts get a random password and can't be logged into (they still chat
through their agents). Seed personas automatically like back any real user who likes them, 2–8 s later.
