# 30 — Final sprint (Oct 18 → submit Oct 29)

> **This is the only plan with open work.** It merges the old plans 21 (speed) and 22 (dating-app core) and everything found after the first deploy (Oct 18). Finished plans are in `plan/archive/`. Reference docs: `15-knowledge-graph-final.md`, `18-architecture-decisions.md`. Ops: `12` (deploy), `14` (Nebius), `13` (submission).
> **Order:** S0 → S1 → **S6 (design foundation; the design has arrived)** → S2 → S3 → **SN (natural conversation, added 2026-10-19)** → **SH (human conversation, `plan/31-human-conversation.md`, added 2026-10-21)** → **KP (plan 32)** → **S33 (questions, brain map, long chats: `plan/33-questions-brain-long-chats.md`, Arya 2026-10-23; C1 → Q1 → Q2 → P, each ends with a STOP)** → S4 → S5 → S7. New screens in S2–S5 are built directly in the new design, never in the old one. Stop for the owner's "go" only where marked **STOP**.
> **Git and deploys (owner, 2026-10-18):** deploy credits on the free tiers are limited. **Commit locally after each step, but never push and never deploy** until the owner says so; there's one final push + deploy in S7. Test everything locally against a production build.
> **Dates:** S0–S1 by Oct 19 · S6 by Oct 20 · S2–S3 by Oct 23 · S4–S5 by Oct 25 · Nebius check Oct 26 · final push + deploy + full QA Oct 27 · **feature freeze Oct 28** · submit Oct 29. Whatever isn't done by Oct 28 is cut, not rushed.

## Owner decisions (2026-10-18)
1. ~~**Live check is part of onboarding** and required before you appear in Discover or your agent can chat.~~ **Superseded 2026-10-19: the live check was removed completely** (see SU). "Skip for now" lets you browse only. Seed and judge accounts are exempt and labelled "Demo profile"; they never get a fake `liveChecked`.
2. **Scam self-check at onboarding:**
   - High risk → the profile is held out of Discover, with the reason shown and "fix and resubmit".
   - Medium risk → no hold; it's passed to the other side's trust check as one input.
   - Never an automatic ban. An admin route can release a hold.
3. **Onboarding becomes a ~5-minute core** plus optional "Teach your agent more" steps.
4. **Agent messages are labelled for both people** ("Written by Meera's agent"), not just the sender.
5. **No fine-tuning for the hackathon.**
   - Token Factory doesn't fine-tune Nemotron, and there's no fitting data.
   - It goes in the README as roadmap: distil the agent-reply model into a smaller, faster one once there are real, consented chats.
6. **The new UI (Round 7, "Tandem") has arrived** in `Frontend-Design/07-tandem-step1/` (a gitignored local folder):
   - `README.md`, previews, `tandem-step1.html` and source.
   - It covers 4 screens: Discover, the match room, "This is you" (3D + 2D fallback) and the Compatible letter.
   - Every other screen is derived from its tokens and components.
   - Keep the product name **Prelude**; "Tandem" is only the design's working name.
7. **No social feed or posts.** A real dating app here = photos + prompts + likes + chat.
8. **(2026-10-19) Agent chats must flow like a real conversation.** They mustn't read as agents ticking off the points we want to check. Agenda topics come up in the flow of the chat, never forced. This replaces S1's "agenda-driven, dealbreaker topics first". See SN.
9. **(2026-10-19) Remove the live check completely**, and fix the phone UI the owner found (see SU).

## Standing rules
- **Secrets:** never print, echo, log or commit secrets. Confirm no `.env` is tracked before every push.
- **Information boundary:** the DB-spy test must keep passing. Photos, prompts and like comments are public profile data. Moderation results, the gate, preferences and `User.liveCheck` never cross users.
- **Seed data:** never photos of real people. Illustrated avatars plus place/object photos, labelled "Demo profile".
- **Claims:** "Live-checked" only, never "verified". No percentage anywhere.
- **Dependencies:** approved:
  - `react-easy-crop`
  - Playwright browsers (local dev only)
  - for the design: `three`, plus React-19-compatible `@react-three/fiber` (v9) and `@react-three/drei` (v10); the design source used v8/v9 on React 18, so don't downgrade React
  - `@fontsource-variable/figtree` and `@fontsource-variable/newsreader`
  - for the UI references (S6.6): `animejs` (v4), and the shadcn setup `clsx` + `tailwind-merge` + `class-variance-authority`, plus the Radix/Motion packages the chosen Kokonut UI pieces pull in
  - bklit ui's visx packages only within the S6.6 size budget
  Ask before any other.
- **Stop and ask** before deleting real (non-seed) data, or before changing how agent messages are sent or shown beyond this plan.
- **After every step:**
  - `npm test`, `api-check` and the client build green
  - check 375 px and 1440 px
  - run `npm run smoke:browsers` against the **local production build** (built client + local server)
  - update `PROGRESS.md`
  - **commit locally (no push)**

---

## S0 — Browser bug + quick fixes (first)
**Symptom:** works in Chrome; other browsers stay on "Waking up the server…" and then show "Try again".
**Cause:** `WakeUp.jsx` treats every failed `/health` fetch as "asleep", so a CORS block or JS error looks the same as a sleeping server. It also gives up after ~30 s, while a Render cold start can take 50–60 s.

1. **Reproduce:**
   - Install Playwright's firefox and webkit locally (not in the repo).
   - Load the deployed site in chromium, firefox and webkit: once while the server is awake, once right after a cold start.
   - Capture console errors and failed requests for `/health`, `/api` and the socket.
   - Report the real cause in `PROGRESS.md`.
2. **Fix `WakeUp.jsx`:**
   - Replace `AbortSignal.timeout` with `AbortController` + `setTimeout`.
   - Keep retrying for up to 120 s.
   - Show "waking" only for timeouts and 502/503/504.
   - A blocked request shows "Your browser blocked the connection" plus the error name.
3. **Server CORS:**
   - `/health*` answers any origin.
   - `/api` and Socket.IO accept `CLIENT_URL` plus a regex for this project's Vercel preview URLs.
   - Log each rejected origin once.
4. **Build:**
   - Check `VITE_API_URL` is https with no trailing slash.
   - The Vite build target covers Safari 15+ and Firefox ESR.
5. **Signup in one call:**
   - `POST /api/auth/signup` creates the User **and** the Profile (name, date of birth → age, gender, interestedIn, city) atomically.
   - Today it's two calls, and a failed second call leaves an account with no gender or age.
   - Validate 18+ from the date of birth on the server.
6. **Cities:**
   - Replace the hard-coded 5 with a searchable list of ~100 Indian cities, each with lat/lng (a static JSON file), so the existing `geo` + `radiusKm` gate works.
   - Add "Other" with free text, which matches on city name only.
7. **Copy:**
   - Remove "Placeholder photo · …" from the landing page.
   - Change the login subtitle to "Welcome back."
   - Map validation errors to plain sentences ("Please enter your email"), never raw zod text.
8. **`npm run smoke:browsers [--url <base>]`** (default: the local production build):
   - Opens the URL in chromium, firefox and webkit.
   - Logs in with a seed account and opens Discover.
   - Fails on any console error, or a wake overlay still showing after 120 s.
9. **No deploy.**
   - Run smoke:browsers against the local production build, and once read-only against the **current** deployed site to confirm the diagnosis.
   - Report all 3 engines.
   - If `CLIENT_URL` on Render must change, tell the owner the value; it's set at the final deploy (S7).

## S1 — Speed
**Causes found in the code:**
- **Onboarding build (15–20 min):**
  - concepts are resolved one at a time (an embedding call, plus sometimes an LLM tie-break, each)
  - each story takes 2 mid-tier calls in a row, at concurrency 2
  - language tags, contradictions and style all run on the mid tier
  - timeouts are 120 s × 3 retries
  - the user waits for all of it
- **Agent chat:**
  - **`MAX_AGENT_REPLIES_PER_MINUTE = 2`** puts a ~8.5-min floor on a 17-message chat
  - typing delays of up to 20 s
  - a 4 s debounce on every agent turn
  - the delay runs after the LLM work instead of overlapping it
  - ~17 messages per chat
  - NVIDIA's free tier also returns 429s (see plan 10's notes)

**Step 0, measure (STOP):**
- From the deployed DB's `Usage` records, take one onboarding build and one agent chat.
- Write `eval/results/speed-before.md`: calls per purpose, p50/p95 latency, retries/timeouts/429s, total wall time.
- Confirm the deployed provider and model IDs (no keys).
- **STOP:** show the owner, along with your plan if the numbers point to other causes.

**Targets:**
| What | Target |
|---|---|
| Onboarding submit → app usable | ≤ 5 s |
| Full graph ready | p50 ≤ 2 min, p95 ≤ 4 min |
| Match → first agent message | ≤ 20 s |
| Whole agent chat | p50 ≤ 4 min, 12–14 messages |

**A — two-phase onboarding:**
- **Phase 1, no LLM:**
  - Deterministic questionnaire facts, voice metrics (`computeVoiceProfile` + the language heuristic) and the gate.
  - Commit, then set `onboarding.status = 'done'` and `graphStatus = 'building'`.
  - "This is you" shows "Your agent is still reading your stories". Agent chats for new matches wait until `graphStatus = 'ready'`.
- **Phase 2, a background job:**
  - Stories in parallel (concurrency 4). Merge extract + support check into one call per story if quality holds; quotes are still checked in code.
  - Concepts:
    1. Normalise and dedupe the texts.
    2. Exact/alias lookup first.
    3. **One batched embedding call.**
    4. Resolve in parallel.
    5. Send all ambiguous-band tie-breaks in **one** LLM call.
  - Tags, contradictions and style move to the **fast** tier, in parallel where independent.
  - Onboarding calls: 45 s timeout, 1 retry. Non-essential failures use the code fallbacks.
  - Keep the single swap transaction.
- **Progress:** socket `onboarding:progress { step, done, total }` drives a real progress bar.

**B — agent chat:**
- `AGENT_MAX_REPLIES_PER_MINUTE` env (default 12); the per-conversation cap remains the loop guard.
- `AGENT_PACING=fast|normal` for everyone (default fast: 0.8–3 s); `DEMO_PACING` becomes an alias.
- No debounce on agent→agent turns, only after a human message.
- Start the other side's `composeTurn` as soon as a message is sent, and wait `max(0, pace − computeTime)`.
- Perceive on the fast tier if the metrics hold. Reuse the incoming embedding; batch the leak-check embedding.
- 12–14 messages per chat, agenda-driven, dealbreaker topics first. All numbers in `kg/config.js`.
- After a match: "Your agents are talking, about 3 min. Keep browsing; we'll let you know." A toast on any page when it ends.

**Acceptance:**
- [ ] `speed-after.md` and a before/after table in `PROGRESS.md`.
- [ ] Targets met locally on the same provider and models as production, or the gap explained with numbers. They're re-measured on the deployed site in S7.
- [ ] 6-pair quality re-check no worse:
  - fallback rate ≤ 7%
  - unsupported claims not higher
  - style distance not higher
  - judge accuracy not lower
- [ ] Killing the server mid-build leaves the phase-1 graph usable, and the job resumes.

## S2 — New onboarding (short core + live check + scam self-check)
1. **Core, ~5 minutes, in this order:**
   1. Basics (already from signup) + job, education, languages, height (optional).
   2. **Photos** (S3.1; at least 2).
   3. **3 prompts** (S3.2).
   4. Lifestyle and values: each with an answer, an importance pick (nothing pre-selected), "In a partner I'd accept", and dealbreakers.
   5. **5 "How would you reply?"** messages (not 15).
   6. **Live check** (plan 19 flow, now a step; "Skip for now" = browse only).
   7. Submit → phase 1 graph (S1) → Discover.
2. **"Teach your agent more"** (optional, from "This is you" and a gentle card in Discover):
   - stories (the old ≥ 4, incl. the opinion prompt)
   - 10 more reply samples
   - the 20 personality statements
   - Each completed block re-runs phase 2 for that block only.
   - The agent's quality hints say what's missing ("Your agent doesn't know your stories yet").
3. **Gating** (`Profile.status: active | held | browse_only`, used in the discover gate query and match creation):
   - **browse_only:** no live check yet. Can browse and like; isn't shown to others and can't start agent chats. Likes are kept and delivered once the person becomes active.
   - **held:** high-risk self-check. Shows "Your profile needs a fix" with the reasons and "fix and resubmit".
4. **Scam self-check at submit:**
   - Run the plan 06 `checkProfile` rules + LLM consistency check on the user's **own** public profile, plus photo moderation results (contact details or QR codes in photos are a strong signal).
   - **High** → held. **Medium** → note stored for the other side's trust check. **Low** → active.
   - Admin: `POST /api/admin/profiles/:id/release`.
5. **Agent quality with a shorter onboarding:**
   - With only 5 reply samples, the voice profile marks `confidence: low`.
   - The agent leans on the "ask my human" inbox earlier.
   - The "Teach your agent more" card is shown until there are ≥ 10 samples.
6. **Migration:** existing users keep their graphs. Seed personas keep their full data.

**Acceptance:**
- [ ] A new user reaches Discover in ≤ 6 min, including the live check (timed in the PROGRESS notes).
- [ ] browse_only, held and active each behave as above, with tests.
- [ ] A seed "fake" profile (f1/f2 style) submitted as a new user gets held.
- [ ] A normal profile doesn't.

## S3 — Real dating-app core (P0)
1. **Photos**
   - 2–6 per profile; the first is required. Upload, reorder (drag), delete.
   - The client crops to 4:5 and resizes to 1080 px, JPEG/WebP, ≤ 300 KB.
   - **Cloudinary free plan:**
     - The server signs uploads with `node:crypto` (no SDK); the client uploads directly to Cloudinary.
     - Store `{ publicId, url, w, h, order, moderation, createdAt }`.
     - Env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. If they're missing, use a local stub and tell the owner.
   - **Moderation:** one `MODEL_VISION` call per photo, JSON output, decision in code.
     - Reject: nudity or sexual content, violence, mostly-text images, contact details, QR codes or social handles.
     - Photo 1 must show a person.
     - Never estimate age, gender, race or attractiveness.
     - If the model is down, the photo stays "pending" (visible only to its owner) and a job retries it.
   - **Migration:** `Profile.photos` goes from `[String]` to subdocuments. Seed photos are converted.
2. **Prompts + profile:**
   - 3 prompts, picked from ~30 questions, answers ≤ 150 characters.
   - Basics, lifestyle tags, interests, the Live-checked badge, a completeness meter.
   - **Profile view** `/u/:id`: Hinge-style, photos interleaved with prompts.
   - Prompts and basics are editable later; edits update the graph incrementally (phase 2 for that block).
3. **Discover:**
   - First photo full-bleed, tap through photos, scroll for the full profile. Like / Pass.
   - **Preferences sheet:** age range, show me, city/distance. These already exist in `Profile`/`gate`; expose them in the UI.
4. **Like a photo or prompt with an optional comment** (≤ 150 characters):
   - `Like` gets `target: { kind: photo|prompt|profile, id }` and `comment`.
   - On a match, the comment is the first message **and** context for both agents (the other agent opens by replying to it).
5. **Likes you:** everyone who liked you, with what they liked and their comment. Free, no blur. Like back / Pass.
6. **Match choice:**
   - "Let our agents break the ice (~3 min)" or "Chat myself now".
   - The default comes from agent mode (Auto → agents, Off → chat now).
   - If either person picks "Chat myself now", it's a normal human chat. Their agents may stay in shadow mode.
7. **Human chat:**
   - Text + photos (same upload and moderation path), emoji, typing indicator, "Seen" read receipts, timestamps, unread badges.
   - `Message.attachments: [{ kind: 'image', url, w, h }]`.
8. **Safety:**
   - Unmatch, block, report. Report reasons: fake profile, scam, harassment, inappropriate photos, underage, other.
   - A block hides both users from each other everywhere and stops any agent chat immediately.
   - Reports appear in an admin route.
9. **Agent message labels for both sides:**
   - Every agent-written message shows "Written by <name>'s agent" to **both** people, in the match room, human chat, replay and notifications.
   - Update the landing and consent copy to match. Keep "I wouldn't say that" for the owner of the agent.

**Acceptance:**
- [ ] With agent mode **Off**, a new user can do the whole flow with no agent involved: sign up, add photos and prompts, set preferences, like a prompt with a comment, match, and chat with photos.
- [ ] With **Auto**, the match offers the agents. They open from the like comment, labels show on both sides, and the S1 time targets hold.
- [ ] Moderation rejects a phone-number photo, a QR-code photo and a mostly-text image, and accepts normal photos. Use safe test images only; no explicit content in the repo.
- [ ] Block and report work both ways. Blocked users never reappear.

## SN — Natural conversation (owner, 2026-10-19; before S4)
**Problem (owner):** the agent chats read like an interview. The agents tick off the points we want to check, instead of talking.
**Causes in the code:**
- `planAct` picks an agenda topic on a timer: every other turn after 1 warm-up turn, and every turn in the last 4 messages.
- `openMustAsk` forces a direct question on every dealbreaker and very important answer before the chat may end, although the gate already checked the dealbreakers.
- `ASK_BACK_FLOOR` 0.7 ends most messages with a question.
- The final instruction is always "react briefly, then ask…".
- The fallbacks are form questions ("do you smoke, by the way?").

**Build:**
1. **Topics in the flow:** an agenda topic comes up only when
   - a **bridge** exists: what was just said connects to it (code word lists per attribute; topic words for interests), or
   - at a **lull**: a short reply with no question, a thread that has run for a few turns, or low interest.

   Also:
   - Never in the first `WARMUP_TURNS`, and never closer together than `TOPIC_GAP_TURNS`.
   - No timer, and no forced topic near the end.
   - Each topic gets one try at a lull and at most `TOPIC_TRIES` in all.
2. **Gate-checked dealbreakers** come up only through a bridge, never cold. `openMustAsk` is removed; a natural end needs only the settled agenda and `NATURAL_END_FROM`.
3. **Message moves**, each with its own prompt line:
   - answer (they asked me)
   - follow-up (go deeper on their thread)
   - share (something of mine that connects, from listed facts, no question)
   - react (no question)
   - topic (bridge or lull)

   Question rate:
   - Floor 0.45 instead of 0.7.
   - Lower right after they answered my question, and when they asked me something.
   - A stall guard: if neither of us asked last time and their reply is short, ask.
4. **Prompt:** a "how a good chat feels" block (follow their thread, share before you ask, pick up details, no interview). A bridge or lull topic is a soft suggestion the model may skip if it would sound abrupt. No "ask them directly".
5. **Fallbacks:** follow-up questions on their message only; no topic templates.
6. **Metrics** (`scripts/eval/metrics.js`): question rate, back-to-back questions, agenda topics by how they came up (bridge / lull), cold topic jumps.

All numbers live in `kg/config.js`.

**Acceptance:**
- [ ] `npm test` green, with new planAct tests: warm-up, no timer, bridge, lull, gap, gate-checked dealbreaker only via a bridge, question-rate band, stall guard.
- [ ] `api-check` and the client build green.
- [ ] Live, on the 6-pair set (c1 c2 i1 i2 m1 m2), vs S1:
  - question rate ≤ 0.55 and fewer back-to-back questions
  - no agenda topic without a bridge or a lull
  - judge accuracy not lower (5/6), fallbacks ≤ 7%, unsupported claims not higher
  - two transcripts read by the owner as natural
- **Trade-off:** fewer forced topics → the judges see less evidence. If accuracy drops, the fix is in the judge (e.g. "not discussed" → the report's "ask yourself"), not in forcing topics again.

## SH — Human conversation (Arya, 2026-10-21; after SN, before S4)
The agent's job in the chat is to see if two people get along, not to fill in a form. Full design, repo mapping and prompts: **`plan/31-human-conversation.md`** (phases H1 → H1-live → H2; `CONVO_MODE=human|sn`, so the demo can fall back to SN in one env line). If H1 isn't green by Oct 24 evening, ship `CONVO_MODE=sn`.

## S33 — Questions, brain map, long chats (Arya, 2026-10-23; after KP, before S4)
Chats were too short (14 messages) and two shared likes made a "yes". Full design, repo mapping and prompts: **`plan/33-questions-brain-long-chats.md`** (phases C1 → Q1 → Q2 → P, each ends with a STOP). `CHAT_DEPTH=full|demo|short`: `short` brings back today's chat length and judge rule in one env line.

## SU — Live check removed + phone UI fixes (owner, 2026-10-19) ✅
- **Live check removed:** server route / service / model / prompt / test / script, `LIVE_CHECK_*` env, the trust bonus; client page, onboarding step (6 steps now), badges, Settings row, landing claim, MediaPipe. New accounts start `active`; `activateWaiting()` activates any `browse_only` account once at boot and delivers its kept likes. `MODEL_VISION` stays for photo moderation.
- **Last lines hidden on phones:** the old `.onb-foot { position: fixed }` (prelude-app.css) covered the onboarding content: old onboarding CSS deleted. The "agent paused" banner no longer pushes 100dvh screens off the bottom (`.app-frame`).
- **Orange boundaries:** `--sand` is a neutral hairline (#E5E0D9), fields `--line-input` (#CDC6BD), neutral focus ring; the old double orange outline on inputs removed.
- **Back:** log in / join have a back control (previous page, or the landing page).
- **Onboarding Continue:** `OnbShell missing={ text, target }` says what's missing next to Continue; a tap scrolls to it and highlights it.

## S4 — Accounts and trust basics
1. **Email via Resend** (free plan; env `RESEND_API_KEY`, `EMAIL_FROM`; the owner creates the account). If the key is missing, the features hide themselves cleanly.
   - **Email verification:** a 6-digit code after signup. Unverified accounts can finish onboarding but stay `browse_only` until verified.
   - **Forgot password:** an emailed one-time link, valid 30 min. The token is stored only as a hash, single use, rate-limited.
2. **Rate limits:** signup per IP, likes per day (e.g. 100), reports per day.

## S5 — P1 (only if S0–S4 are done)
1. **Notifications centre + toasts:** like, match, agents finished, message, agent question. In-app over the socket.
2. **Photo → interest suggestions:**
   - From the user's own photos ("3 photos look like trekking. Add 'Trekking'?").
   - A suggestion becomes a fact only when the user taps Add (`source: 'photo_suggestion'`, public).
   - Never infer sensitive attributes.
3. **Eval follow-ups** from plan 11, only if there's time:
   - observer-note precision was 0.27
   - persona fidelity: c5 Karthik's agent contradicted his "wants kids"

## S6 — Design foundation (do this right after S1)
- **Source:** `Frontend-Design/07-tandem-step1/`. Read `README.md`, open `tandem-step1.html`, and read `source/src` (`styles.css`, `ui.jsx`, `lib/*`, `screens/*`, `Graph3D.jsx`).
- **The look:**
  - white / off-white / cream / beige, one clay accent (`#A2613F`, AA-checked)
  - earthy statuses (olive, ochre, grey, brick)
  - Newsreader headlines, Figtree UI text, Noto Sans Devanagari for Hindi
  - minimal; no neon, no 3D objects except the graph
1. **Tokens:** the design's CSS variables become the client's tokens (CSS variables + the Tailwind v4 theme). Remove the old Prelude/Lamplight tokens, fonts and the dark theme, unless the owner asks to keep a dark mode.
2. **Components:** port the design's components (buttons, chips, cards, avatars, the Live-checked badge, chat bubbles incl. the agent label, status chips, sheets, toasts) into `client/src/components`, replacing the old ones. One component set, no duplicates.
3. **The 4 designed screens on real data:**
   - Discover
   - the match room: "Written by …'s agent" visible to both people (this lands the server side of S3.9 too), Take over, "I wouldn't say that", the noticing panel, the "keep browsing" banner
   - "This is you": the 3D graph, lazy-loaded, ≤ 300 nodes, 60 fps on a mid-range Android, a 2D radial fallback under reduced motion or on weak devices, search, hub chips, a bottom sheet with edit, delete and the privacy toggle
   - the Compatible letter (then Maybe and Not compatible in the same style)
4. **Every other existing screen** is restyled with the same tokens and components: landing, auth, onboarding, live check, matches, chat replay, inbox, settings, wake-up, flagged.
6. **UI references (owner, 2026-10-18).** These are for patterns and motion, not a look to copy. The Round 7 tokens stay the visual source of truth, and no library's default colours or fonts are used.
   - **motion.dev (Motion, already installed):**
     - shared-element transitions (`layoutId`): Discover card → profile, match → match room
     - `AnimatePresence` for sheets, toasts and the verdict letter
     - drag gestures with springs for Discover Like/Pass
     - `useScroll` for the landing story
     - `useReducedMotion` everywhere
   - **anime.js v4:** only for SVG line drawing and text effects Motion doesn't do well:
     - the landing's "two dots connect" line
     - the 2D graph fallback's edges drawing in
     - the verdict letter's underline/seal
     Import only the modules used (`animate`, `svg.createDrawable`, `stagger`), lazily.
   - **Kokonut UI** (shadcn registry; React 19 + Tailwind v4 + Motion; MIT):
     - Pick at most ~8 pieces and restyle them to the tokens: a toast/notification stack, the chat composer, smooth tabs, an agent "thinking" loader, a photo upload dropzone, an animated like button.
     - Add them with `npx shadcn@latest add @kokonutui/<name>`. That needs a minimal shadcn setup (`components.json`, an `@/` alias, `cn()`).
   - **bklit ui** (shadcn registry charts on visx; MIT): only where real data needs a chart:
     - the interest meter across the conversation (a live line) in "What my agent is noticing"
     - the "How I text" bars on "This is you"
     - the admin usage page
     Lazy-loaded. If it adds more than ~60 KB gzipped to those routes, draw a small SVG by hand instead.
   - **Manus (manus.im):** the pattern for showing an agent at work. It's also a reference for restraint: lots of white space, one serif headline, few colours.
     - A calm step list that ticks live ("Reading their profile → Checking for fakes → Opening with your comment → Talking").
     - A replay timeline with a scrubber.
     - Use them in the match room (an agent status strip) and in Chat replay (scrub through the chat, with evidence moments as markers on the timeline).
   - **Budget:**
     - route-level code splitting
     - initial JS ≤ 300 KB gzipped
     - each library only on the routes that use it
     - reduced-motion fallbacks
     - 60 fps on a mid-range Android
7. **Rules:**
   - Keep every API call, route and behaviour.
   - Illustrated demo people only.
   - Check 375 px and 1440 px against the previews.
   - Run smoke:browsers.
   - Commit locally per screen.

## S7 — Ship
0. **Oct 27, the one push + deploy** (only after the owner's OK):
   - Review all local commits.
   - Set any env values the owner has to change (`CLIENT_URL`, `CLOUDINARY_*`, `RESEND_*`, model IDs).
   - Push `main`, then confirm Render and Vercel built.
   - Run `smoke:browsers --url https://dating-agent-flame.vercel.app`.
   - Re-measure speed on the deployed site.
1. **Oct 26, Nebius check (plan 14, run locally against Token Factory):**
   - Confirm the deployed provider is Token Factory, with Nemotron models for fast/mid/smart/embed/vision.
   - Re-run speed-after, judge-check and `live-check:vision` on it.
   - If no Nemotron VL is listed, set `LIVE_CHECK_ENABLED=false` and make photo moderation use a code-only fallback (pending + manual review).
2. **Oct 27, full QA:**
   - smoke:browsers on all 3 engines, plus a manual pass on a real phone.
   - Seed and judge accounts in every state: Compatible, Maybe, Not compatible, flagged, held, mid-conversation.
   - Fix blockers only.
3. **Oct 28:** feature freeze. Update the README (features, speed numbers, Nemotron + Token Factory usage, limits, fine-tuning roadmap) and `SUBMISSION.md`.
4. **Oct 29:** the owner submits on Devpost (the video is by humans).

## Owner to-dos
- **Cloudinary** free account → `CLOUDINARY_*` in server `.env` and on Render.
- **Resend** free account → `RESEND_API_KEY`, `EMAIL_FROM`.
- Set `CLIENT_URL` on Render if S0 says so.
- **Nebius** account + credits by Oct 26.
- ✅ Round 7 design is in `Frontend-Design/07-tandem-step1/`.
- Say "push" when you're ready for the single deploy.
- Never paste keys into chat.
