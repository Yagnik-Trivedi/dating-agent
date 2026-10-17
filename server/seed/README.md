# Seed data

- `personas.json`: 38 fictional, SFW demo personas (`seed01@demo.local` … `seed38@demo.local`) with full onboarding
  answers (sections I, A–E), so `npm run seed` builds a real knowledge graph for each. `designNotes` explains each
  persona's intent and is never shown in the app.
  - seed01–04 are hand-written; seed05–30 come from `npm run generate-personas` (tier mid, run once) and were reviewed
    and edited by hand; seed31–38 were hand-written in plan 11A to fill the city and language quotas. Regenerating
    overwrites the hand edits, so don't, unless you mean to.
  - **Quotas** (`persona-quotas.json`, checked in code by `node scripts/seed/check-personas.js`, which exits non-zero on
    a miss): languages (Hinglish ≥ 6, Hindi in Devanagari ≥ 2, Gujarati-English ≥ 2, Tamil- or Marathi-English ≥ 2,
    code-switching ≥ 4), texting styles (terse ≥ 4, emoji-heavy ≥ 4, long ≥ 4, formal ≥ 3), the 5 demo cities
    (Ahmedabad, Mumbai, Bengaluru, Pune, Delhi) with ≥ 5 personas each and ≥ 3 seeds visible through the gate to a
    typical new woman and new man, and every labelled pair in one city and on the right side of the gate.
  - **Voice changes:** `node scripts/seed/restyle-personas.js --yes` rewrites a persona's texting voice from a spec in
    `restyle-specs.json` (cached in `.restyle-cache/`). On NVIDIA's Super model it mostly returned the input unchanged,
    so most plan 11A voices were written by hand; only seed25 came from the script.
  - Mix: 32 ordinary personas (3 of them with a mild tags-vs-prompt inconsistency: seed11, seed14, seed15), 2 likely
    fakes (seed27, seed28: abroad + investment talk + pushing to Telegram/WhatsApp, no photos), 1 very thin profile
    (seed29), plus the same-sex personas seed07–10 and seed27.
  - **Conflicts that surface only in chat** are important answers, not dealbreakers (a dealbreaker never reaches a chat
    under the gate): seed19 smoking, seed21 looking for, seed23 location, seed25 drinking. The one `gated` pair (i1,
    seed17's kids dealbreaker vs seed18) must never become a match.
- `pairs.json`: 20 hand-labelled pairs for the eval (7 compatible, 6 incompatible, 1 gated, 4 maybe, 2 fake), each
  with the reason it was labelled that way.
- `trust-cases.json`: crafted profiles for the plan-06 trust check (`node scripts/trust-check.js`).

## Logging in as a seed persona

All seed accounts share one password: the `SEED_PASSWORD` value in `server/.env` at the time `npm run seed` ran.
It is never committed. Without it, seed accounts get a random password and can't be logged into (they still chat
through their agents). Seed personas automatically like back any real user who likes them, 2–8 s later.
