# Progress tracker

The team's single status board. Claude Code updates it after every plan-30 step. **Commit locally after each step (CLAUDE.md); never push or deploy until the owner says "push"** (plan 30, S7). `CLAUDE.md` → Status has the detailed acceptance results for each finished plan.

- **Last updated:** 2026-10-19, by Claude Code (SN natural conversation: code done, live check pending `server/.env`; next S4)
- **Main-line branch:** `main` (pushed through `18c9e3d` and **deployed** 2026-10-19 by the owner. **Auto-deploy is ON**: Render deploys every push to `main` (On Commit); Vercel builds every push that touches `client/`. A push now = a deploy.)
- **Live site (read-only until S7):** https://dating-agent-flame.vercel.app · API https://dating-agent-api.onrender.com

Status key: ✅ Done · 🔄 In progress · ⏸ Waiting for the owner (STOP) · ⬜ Not started · ✂️ Cut · 🚫 Not for Claude Code · 📦 Archived · 📖 Reference

## Plan 30: final sprint (the only plan with open work)

Order: **S0 → S1 → S6 → S2 → S3 → SN → SH → S4 → S5 → S7**. Dates: S0–S1 by Oct 19 · S6 by Oct 20 · S2–S3 by Oct 23 · S4–S5 by Oct 25 · Nebius check Oct 26 · push + deploy + QA Oct 27 · freeze Oct 28 · submit Oct 29.

| Step | What | Status | Commit | Notes / next step |
|---|---|---|---|---|
| S0 | Browser bug (wake-up screen, CORS) + quick fixes (one-call signup, cities, copy, `smoke:browsers`) | ✅ | (this commit) | Results below. Render `CLIENT_URL` value for S7 noted. |
| S1 | Speed (two-phase onboarding, agent pacing) | ✅ | (this commit) | Results below; first-message target missed on 429s (explained). |
| S6 | New design (Round 7 Step 2, `Frontend-Design/07-prelude-step2/`; name stays Prelude) | 🔄 mostly done | local commits `2386bbf`…`ece864a` | Every screen ported on real data except the profile editor (comes with S3). Left: delete the old CSS/components once S3's profile screens land; S6.6 shared-element motion. |
| S2 | New onboarding (short core, live check as a step, scam self-check, gating) | ✅ | `9438cd3`…`ec3421d` | Results below. Photos (S3.1) built here because step 2 needs them. |
| S3 | Dating-app core (photos + moderation, prompts, likes with comments, Likes you, human chat, safety, agent labels) | ✅ | `f800607`…`458820d` | Results below. **No `CLOUDINARY_*` keys in `.env`: the local stub is used** (files in `server/uploads/`, local only). |
| SN | Natural conversation (owner, 2026-10-19): topics come up in the flow, not on a timer | 🔄 code done | (this commit) | Results below. **Left: the live 6-pair check needs `server/.env` on this machine.** |
| SU | Live check removed + phone UI fixes (owner, 2026-10-19) | ✅ | (this commit) | Results below. Pushed + deployed with the owner's OK. |
| SH | Human conversation (Arya, 2026-10-21; `plan/31-human-conversation.md`): no needless matching questions, mood-matched simple talk, profile basics | 🔄 H1 | — | H1 → H1-live (STOP before the live 6-pair run) → H2. Fallback: `CONVO_MODE=sn`. |
| S4 | Accounts (email verification, forgot password via Resend; rate limits) | ⬜ | — | Hidden if `RESEND_API_KEY` missing. |
| S5 | P1: notifications, photo → interest suggestions, eval follow-ups | ⬜ | — | Only if S0–S4 are done. |
| S7 | Ship: Nebius check (Oct 26), **the one push + deploy** (owner's OK), QA, README/SUBMISSION | ⬜ | — | **STOP before the push.** |

Pushed and deployed 2026-10-19: `ef33278` (SN) and `18c9e3d` (PROJECT-GUIDE.md), on Render (auto + manual deploy) and Vercel (Ready).

## SH results: human conversation, phase H1 (2026-10-21) 🔄 H1 code done, ⏸ live 6-pair check waits for the owner's "go"

**Plan:** `plan/31-human-conversation.md` (Arya). The agent's job is to see if two people get along, not to fill in a form. `CONVO_MODE=human|sn` (default human); `sn` replays plan 30 SN exactly.

**Built (one local commit per step):**
- **Step 0, audit bugs** (`BUG_BY_GEMINI.md` §2): judge accounts skip the daily chat cap; merged mode detects their question with the shared `isQuestion` over the whole turn; a bare question left after its lead-in was dropped counts as nothing left (constrained regeneration); `heardAttrs` is computed before `planAct`; used facts, told stories and topic tries count only what was sent.
- **Step 1, profile basics** (owner's defaults, 2026-10-21): `buildGate` fills looking for, kids, smoking, drinking and diet on the public profile from the user's own B answers; religion is hidden by default. A hidden basic is removed from `Profile.tags`, so no public read, prompt or other user sees it; the gate still uses it. Hand-set basics (`tagsEdited`) are never overwritten; `PUT /profile` updates `tags` field by field. **Existing users: run `node scripts/backfill-basics.js` (no LLM); seeds: `npm run seed`.** Not run against Atlas.
- **Step 2, `needToAsk`** (brief, human mode): gate-checked → known (gate); shown on their profile → known (profile, with `differs`); below "very important" → removed; humans-only, leave-for-me, private, hidden or an unshown basic → for you; the rest → ask once. Seed personas: **35 of 38 end with 0 ask-once items, 2 with 1, 1 with 2.**
- **Step 3, the read:** mood (plan 31 list, old values as aliases), energy, doing (telling / venting / sharing news / winding down); an ask-once item they state becomes known (chat); a dealbreaker hint reopens a gate-settled item for one follow-up.
- **Step 4, `planAct` human:** moves reply / react / ask_theirs / share / stay / close; mood from the read + code heuristics + last read; length pulled toward theirs; no question floor; never my second question in a row unless they asked; the one matching question only when warm, chatting and near it; no lull topics; stories only after they told one.
- **Step 5, prompt:** "HOW THIS CHAT GOES" block, mood and move lines, a plain ask-once line; known / for-you items never reach a model. SN prompts byte-identical on 200 plans.
- **Step 6, engine:** new draft problems (unplanned matching question, new topic or my story while they tell or vent, unprompted story, two questions in a row, too long at low energy) share the one regeneration, and their sentences are dropped if it fails; fallbacks are short reactions.
- **Step 7, judge:** gate- and profile-settled items are never "undiscussed"; a profile basic that differs on something very important is a friction "from their profile"; never-discussed ask-once items go to `MatchDecision.worthAsking` + the summary, never into the verdict.
- **Step 8, metrics:** `scripts/eval/lib/convoMetrics.js` (A10 + `unbridgedQuestionRate`), `scripts/eval/convo-metrics.js` (saved transcripts), `metrics.js` (live runs, with the agenda and act plans).

**Baseline from saved transcripts** (`eval/results/convo-metrics.md`; S1 runs, before SN; no saved SN transcripts exist yet):

| run | matching ?s per chat (max) | question rate | back-to-back | unbridged (lexical) |
|---|---|---|---|---|
| s1-merged-lean (5 chats) | 3.6 (5) | 0.58 | 7 | 0.36 |
| full B5 (17 chats) | 2.3 (8) | 0.58 | 36 | 0.33 |

**Checks:** `npm test` **158/158** (122 before; the new tests are in `auditFixes`, `basics`, `needToAsk`, `perceive`, `humanPlan`, `humanPrompt`, `humanEngine`, `judgeHuman`, `convoMetrics`, `creditGuard`). `api-check` all passed (local dev-db, AI off). Client build green. Simulated chat: see below. Not run: `smoke:browsers` and 375 / 1440 px (the only client change is three profile labels).

## SU results: live check removed + phone UI fixes (2026-10-19) ✅

**Owner's report:**
- remove the live check completely
- on phones the last lines are hidden under the box at the bottom
- the orange boundary on all boxes
- can't go back from the sign-in page
- onboarding won't continue and doesn't say why

**Causes found:** headless Chrome at 390 px, local stack with AI off, element geometry measured.
- An old `.onb-foot { position: fixed }` from the previous design (`styles/prelude-app.css`) pinned the new onboarding footer over the content. The content area ran 64→844 px under a footer at 755→844.
- The "agent paused" banner sat above 100dvh screens, so the page was 63 px taller than the phone and the tab bar was pushed off.
- Every box used the tan `--sand` (#D9CBB3), and focused inputs got two orange rings (the design's, plus an old `outline` rule winning over `.input input { outline: 0 }`).
- The auth shell never received a `back`.
- Onboarding steps used `nextDisabled` with no reason shown (only step 4 had one, at the bottom).

**Fixes:** see plan 30 SU.
- Live check removed end to end. `activateWaiting()` at boot activated 3 local test accounts on the first run.
- Old onboarding CSS and live-check CSS deleted; `.app-frame` for the banner.
- Neutral borders and focus.
- Back on log in / join.
- `OnbShell missing`, with per-step messages and a scroll + highlight on tap.

**Checks:**
- `npm test` 122/122 (the 6 live-check tests were deleted with it).
- `api-check` all passed ("new accounts are active").
- Client build green; oxlint shows no new warnings.
- Before/after screenshots at 390 px (signup, onboarding top/bottom/after Continue, Discover, Matches, You, Settings, Profile, Inbox) and 1440 px (log in, onboarding hint): the onboarding bottom is fully visible, the tab bar shows with the banner, the hints and highlight work, the back buttons show. No console errors.
- Not run: `smoke:browsers` (needs a seeded DB and an LLM key on this machine).

## SN results: natural conversation (2026-10-19) 🔄 code done, live check pending

**Owner's problem:** agent chats read like an interview, with agents ticking off the points we want to check.

**Causes found:**
- `planAct` raised an agenda topic every other turn after 1 warm-up turn, and on every one of the last 4 messages.
- `openMustAsk` forced a direct question on each dealbreaker and very important answer, although the gate already checked the dealbreakers.
- `ASK_BACK_FLOOR` was 0.7.
- The final instruction was always "react briefly, then ask…", and the fallbacks were form questions ("do you smoke, by the way?").

**Built (`conversation/planAct.js`, `conversation/engine.js`, `prompts/agentReply.js`, `kg/config.js`):**
- **Topics in the flow:** an agenda topic comes up only through a **bridge** or at a **lull**.
  - A bridge: what was just said leads to it (`BRIDGES` word lists per attribute; topic words for interests and clarify topics; `bridgesTo()`).
  - A lull: a short reply with no question, a thread `THREAD_TURNS` old, or low interest.
  - Never in the first `WARMUP_TURNS` (2), never closer than `TOPIC_GAP_TURNS` (2), no timer, no near-end forcing.
  - A tried topic comes back only through a bridge, up to `TOPIC_TRIES`.
  - The prompt presents a topic as a suggestion the model may skip if it would sound abrupt.
- **Gate-checked dealbreakers** come up only through a bridge. `openMustAsk` is removed, and they no longer block a natural end.
- **Message moves** (`plan.move`), each with its own prompt line: answer, follow-up on their thread, share (no question), react (no question), topic.
- **Question rate:**
  - Floor 0.45; ×0.6 right after they answered my question, and ×0.6 when they asked me.
  - Stall guard: nobody asked last time and their reply is short → ask.
  - A topic message may always ask.
- **Prompt:** a "HOW A GOOD CHAT FEELS" block (follow their thread, share before you ask, pick up details, no interview).
- **Fallbacks:** follow-up questions only; the topic templates are gone.
- **Metrics:** `scripts/eval/metrics.js` now reports agenda topics by bridge / lull / cold, and back-to-back questions.

**Checks:**
- `npm test` 128/128. The new planAct tests cover warm-up, no timer, bridge, gap, lull, the gate-checked dealbreaker only via a bridge, retries, `bridgesTo`, the question-rate band, the stall guard, moves and the natural end.
- `api-check` all passed (local dev-db, LLM off). Client build green.
- **Act plans on the same scripted 14-message chat, 50 seeds, HEAD vs SN:**

| | HEAD | SN |
|---|---|---|
| Messages ending in a question | 0.75 | **0.57** |
| Agenda topics per chat | 3.5 of 6 of my messages | **2.0 of 6** |
| Gate-checked smoking dealbreaker asked cold | yes | never |

**Left (needs `server/.env` + LLM):**
- The live 6-pair run (c1 c2 i1 i2 m1 m2) + `metrics.js` vs S1: question rate ≤ 0.55, no cold topics, judge accuracy not below 5/6, fallbacks ≤ 7%, unsupported claims not higher.
- Two transcripts for the owner to read.
- Not run: `smoke:browsers`. No client change in SN, and it needs a seeded DB.

## S3 results: dating-app core (2026-10-19) ✅

**Built:**
- **Profile view** `/u/:id` (photos and prompts interleaved, Like / Pass, report / block menu; your own profile opens as a preview) and **profile editor** `/profile` (completeness meter in steps, photos, 3 prompts, basics incl. job / workplace / education / height / languages / about, live preview). Prompts: 30 to pick from, answers ≤ 150 characters.
- **Like a photo or a prompt** with an optional comment (≤ 150). `Like.target { kind, ref }` + `comment`; a comment with contact details, another app or money talk is refused (the trust check's rules). On a match the comment becomes the first message (`Message.like`), and the other side's agent replies to it first (the engine reads it as `(on the prompt "…") …`).
- **Likes you** `/likes` (+ nav count, live `like:new`): who liked what, their comment, Like back / Pass, tap through to the full profile. Free, no blur. Likes from people who aren't active yet aren't listed.
- **Match choice** sheet: "Let our agents break the ice" or "Chat myself now", default from agent mode (off → self). Either side picking self → a normal human chat (`startHumanChat`: agents off, status `handed_off`, no verdict). Before the trust check finishes, the pipeline reads the choice itself, so the safety check always runs first.
- **Preferences** sheet in Discover: age range, show me, city (the signup combobox), distance (0 = my city only). Saves the existing Profile fields; the gate is rebuilt.
- **Human chat:** photo messages (resized in the browser, checked by the vision model before they're sent; refused with "We can't check photos right now" if the model is down), live **Seen** (`message:read` / `match:read` socket events), typing, timestamps, unread counts (already there).
- **Safety:** unmatch, block, report (6 reasons, optional note, "also block"). A block hides both people from each other in Discover, Likes you, profiles and matches, closes the match and stops any agent at once. `GET /api/admin/reports` + close.
- **Agent labels** for both sides were done in S6; the consent copy now says both people see which messages an agent wrote.

**Checks:**
- `npm test` 125/125 (new `datingCore.test.js`: comment → first message, the other agent opens; agent mode off → self; human chat stops both agents; block hides both ways and closes; unmatch hides for both).
- `api-check` passes; client build clean; `smoke:browsers` chromium / firefox / webkit ✓.
- **Agent mode Off, two real browsers** (1440 on dev, 375 on the production build): like a prompt with a comment → Likes you → Like back ("Chat myself now" preselected) → room shows "Liked a prompt" + the comment → reply → "Seen" → photo delivered (1440; at 375 NVIDIA's vision model returned 500 twice, so the photo was correctly refused) → block → 0 matches for the other side, their profile 404, gone from Discover. 0 agent messages. No console errors, no horizontal overflow.
- **Auto, live:** a new user liked a seed's prompt with a comment; the seed liked back; the seed's agent opened by replying to the comment, 59 s after the like (incl. the seed's like-back delay and waiting for the new user's graph).
- **Moderation** `npm run photo-moderation:check` (real vision calls, generated safe images): landscape ok; phone number on a card, mostly-text screenshot, QR-style code and a social handle all rejected. 5/5.

**Deviations / not done:**
- Photos stay two lists (`photos` + private `photoUploads`), as in S2.
- Editing prompts or basics re-runs the self-check and the gate, but doesn't update the knowledge graph (prompts were never part of it; basics come from onboarding answers).
- The match choice is a sheet, not the design's full-screen "It's a match" page.
- A human chat started with "Chat myself now" still waits for the trust check (8–20 s on NVIDIA) before it becomes `handed_off`; typing works during that time.

## S2 results: new onboarding (2026-10-19) ✅

**Flow (7 steps, `pages/Onboarding.jsx`):** Basics (job, workplace, education, languages, height, optional interests) → Photos (2–6, crop 4:5 with react-easy-crop, 1080 px, ≤ 300 KB) → 3 prompts from 30 (≤ 150 chars) → Lifestyle and values (all 11, each skippable; importance never pre-selected; accepts; dealbreaker) → 5 replies (one at a time, like a chat) → **submit** (phase-1 graph; phase 2 runs during the live check) → Live check (step 6; "Skip for now" = browse only) → Done with "Teach your agent more" (stories, 10 more replies, 20 personality statements → `POST /api/onboarding/more`, merged, phase 2 re-runs).

**Server:**
- `Profile.status` `active | browse_only | held` (private). New accounts start `browse_only` (or `active` when `LIVE_CHECK_ENABLED=false`); profiles without a status (seeds, older accounts) are active and never gated. The discover query skips non-active profiles; `createMatch` returns null while either side isn't active; a held profile gets 403 `PROFILE_HELD` on discover and likes.
- Likes made while browse_only are kept; when the profile turns active (live check passed, admin release), mutual likes become matches (`deliverLikes`).
- Scam self-check (`services/profileStatus.js`) in the `profileCheck` job after submit, profile edits and photo moderation: plan 06 rules + the cached consistency check on my own public profile + photo rejections for contact details / QR codes. likely_fake → **held** (reasons in `selfCheck`); caution → medium (stored); else low. `POST /api/admin/profiles/:id/release` releases that profile version.
- Photos: `/api/photos` (ticket, add, order, delete). Cloudinary signed direct upload with `node:crypto` (no SDK) or the local stub. One `MODEL_VISION` call per photo (`moderatePhoto` job, 8 attempts; pending until it succeeds); code decides (nudity, violence, mostly text, contact details, QR code, social handle; photo 1 must show a person). `PUT /profile` accepts only DiceBear URLs for `photos` now.
- Voice under 10 samples: the agent prompt says to keep replies short and plain; "This is you" shows the teach cards.

**Checks:** `npm test` 122/122 (new `profileStatus.test.js`: browse_only hidden + can't match + likes delivered on activation; the seed fake (seed28 text) held; a normal profile low; release sticks; photo decisions). `api-check` passes (new step: browse_only hidden). Browser e2e of the whole flow at 1440 and 375 px, dev and production build: 0 console errors, no horizontal overflow; Discover's browse_only banner and held screen checked at both widths. `smoke:browsers` on the production build: chromium, firefox, webkit ✓. Photo stub e2e: a real vision call rejected a mostly-text image.

**Deviations:**
- Photos are two lists, not subdocuments: `photos: [String]` stays the public list (only moderated-ok URLs, in order) and a private `photoUploads` holds every upload with `{ url, publicId, w, h, status, reasons, person, at }`. Every existing reader of `photos` (seeds, client, trust check) works unchanged; no migration.
- Submit happens at the end of step 5, before the live check, so the graph builds while the user does the live check.
- "Teach your agent more" re-runs the whole phase 2 (idempotent by fact key), not one block.
- In the e2e, the vision model flagged "mostly text" but **not** the phone number in the same image; S3's moderation acceptance must test a phone-number photo on its own.
- Check scripts (`seed-check`, `speed-check`, `api-check`) mark their throwaway users live-checked in the DB (`scripts/lib/activate.js`), so they need `MONGODB_URI` pointing at the server's DB.
- **Timing (≤ 6 min acceptance):** not timed by a person yet; the scripted run takes ~23 s plus typing. The owner should time one real run.

## S1 results: speed (2026-10-18/19) ✅

Full numbers: `server/eval/results/speed-after.md` (3 local runs with `node scripts/speed-check.js`) vs `speed-before.md`.

| What | Before | After (median of 3, local) | Target |
|---|---|---|---|
| Submit → app usable | ~92 s | **0.2 s** | ≤ 5 s ✓ |
| Full graph ready | 92 s | **14.5 s** | p50 ≤ 2 min ✓ |
| Match → first agent message | 40 s | 43 s | ≤ 20 s ✗ (NVIDIA 429s) |
| Whole agent chat | 23 min, 18 msgs | **4.7 min, 13 msgs** (4.0–5.0) | p50 ≤ 4 min (close) |
| Model time per agent message | 26 s | **16 s** | ~15 s ✓ |

**6-pair quality check** (c1 c2 i1 i2 m1 m2), one-call turn + lean regeneration vs the old two calls:
- verdicts **5/6** vs 3/6;
- template fallbacks **1/66** vs 3/66;
- unsupported self-claims 9/35 = 26% vs 9/38 = 24% (same count);
- style distance 0.16 (unchanged from B5);
- tokens per pair ~63k vs ~83k.

New defaults: `AGENT_TURN_MODE=merged`, `AGENT_REGEN=lean`.

**Gaps (explained with numbers):**
- **First message:** the code path is now a cached trust check (no model call) plus the brief (~6 s). In every run the shared NVIDIA key answered 429s (99 in one run), so briefs failed after ~33 s of retries and the opener waited out a 30 s back-off.
- **Whole chat:** 4.0–5.0 min, and the 429 back-offs are most of the gap to 4 min.
- **Re-measure:** with the owner's separate local key, on Token Factory (Oct 26) and on the deployed site (S7).

**Not built in S1:**
- The "Your agents are talking, about 3 min" banner and the end-of-chat toast are UI, so they come with the new design in S6. The server already sends `match:status` and `report:ready`.
- Merging the story extract + support check into one call was skipped: the support check is the quality guard on story facts.

**Checks:**
- `npm test` 119/119 (+5 in `test/speed.test.js`).
- `api-check` all passed.
- Client build green.
- `smoke:browsers` on the local production build: chromium ✓ firefox ✓ webkit ✓.
- Killing the server mid-build: phase 1 is committed in the submit request, and phase 2 is a `buildUserGraph` job the worker reclaims after a restart (plan 17 behaviour; the 3 runs didn't kill it).

**Env changes for Render at S7 (new, all optional with defaults):** `AGENT_PACING` replaces `DEMO_PACING` (render.yaml updated). Optional: `AGENT_MAX_REPLIES_PER_MINUTE`, `AGENT_TURN_MODE`, `AGENT_REGEN`, `LLM_TASK_TIERS`. After deploying, run the seed script again so every seed gets its cached trust check (`ProfileCheck`).

## S1 step 0: speed before (2026-10-18) — ⏸ STOP, waiting for the owner

Full report: `server/eval/results/speed-before.md`, from `node scripts/speed-report.js` (read-only, production `Usage`). Production provider: **NVIDIA**. Models: fast `nemotron-3.5-lightning-30b-a3b`, mid `nemotron-3-super-120b-a12b`, smart `nemotron-3-ultra-550b-a55b`, embed `nemotron-3-embed-1b`.

| What | Production now | Target |
|---|---|---|
| Onboarding build (one real user, 23 calls) | **92 s** wall | p50 ≤ 2 min |
| Submit → app usable | ~92 s (waits for the whole build) | ≤ 5 s |
| Match → first agent message | 40 s | ≤ 20 s |
| Whole agent chat (18 messages) | **23 min**; gap p50 49 s, p95 335 s | p50 ≤ 4 min, 12–14 messages |

**What the numbers say (some of it differs from plan 30's list of causes):**
1. **The onboarding build is already ~1.5 min with the current key.** The 15–20 min earlier came from the old key and from seeding running at the same time. Two-phase onboarding is still needed for "usable in ≤ 5 s".
2. **The fast tier is the slowest tier on NVIDIA:**
   - Lightning p50 is 33–59 s, and 8 of 34 calls hit the 90 s timeout.
   - Super, with reasoning off, takes 2–9 s.
   - Moving tags, contradictions, style and perceive to the fast tier, as plan 30 says, would make them **slower** on NVIDIA.
3. **3% of calls fail after all 4 attempts.** These are quick 429/5xx answers; each costs ~16 s and loses the result. That accounts for 21 of 202 perceive calls and 24 of 323 replies, and for most of the p95 stalls. At the time, seeding (local) and Render shared one key, while our limiter is per process.
4. **Agent chats are mostly pacing:** ~26 s of LLM time per agent message, but a 49 s p50 gap. The rest is the 2-replies-per-minute cap, typing delays of up to 20 s and the 4 s debounce. These are exactly plan 30's B items.

**Proposed plan (owner to approve):**
- **B as written:** pacing env, no agent↔agent debounce, overlap compose with the delay, 12–14 messages.
- **A as written, with one change:** keep the tier for tags / contradictions / style / perceive in config. They stay on **mid** while on NVIDIA. Re-measure the fast tier on Token Factory on Oct 26 and switch only if it's faster there.
- **Move fast-tier calls to mid on NVIDIA** for now: stance check, icebreakers, wind-down and date ideas, via the same config.
- **429/5xx:** honour `Retry-After`. Give onboarding and agent turns one more slow retry instead of failing after 16 s. Never run seeding against production at the same time as judges or users.

## S0 results (2026-10-18)

**Diagnosis (deployed site, Playwright chromium / firefox / webkit, read-only):**
- **Main cause: CORS.** Right after the first deploy, the API sent no `Access-Control-Allow-Origin` for either Vercel URL, because `CLIENT_URL` was still a placeholder. Every browser was blocked, and the old `WakeUp.jsx` showed any failed `/health` fetch as "waking", then "Try again".
- **Old Safari:** the old `WakeUp.jsx` also used `AbortSignal.timeout`, which Safari < 16 lacks. It threw on every try, which looked the same as a sleeping server.
- **Since `CLIENT_URL` was set:** all 3 engines load, log in and open Discover on the deployed site.
- **Cold start not reproduced:** the server was awake on every run, and a sleep can't be forced without 15 idle minutes. The new screen waits up to 120 s.
- **Test-browser limitation, not ours:** Playwright's WebKit build for Windows crashes its network process on any WebSocket (a minimal `ws` server too). Socket.IO falls back to polling. `smoke:browsers` ignores only that one message, only for WebKit on Windows. Real Safari still needs a manual check (S7 QA).

**Fixes:**
- **`WakeUp.jsx`:** `AbortController` + timer; retries for up to 120 s; "waking" only on timeouts and 502/503/504. A blocked request shows "Your browser blocked the connection (<error name>)".
- **Server CORS:**
  - `/health*` answers any origin.
  - `/api` and Socket.IO accept `CLIENT_URL` plus `CLIENT_URL_PATTERN` (default: this team's Vercel preview hostnames).
  - Each rejected origin is logged once.
  - Helmet's CORP is set to cross-origin.
- **Build:** fails unless `VITE_API_URL` is `https://host` with no trailing slash (or `http://localhost:port`). Target: es2020 / Safari 15 / Firefox 115.
- **One-call sign-up (one transaction):**
  - Creates User + Profile (name, date of birth → age, gender, interestedIn, city + coordinates), then the gate.
  - Under 18 → 400 `UNDERAGE`.
  - `User.dob` is private.
- **Cities:**
  - 104 Indian cities with lat/lng (`server/src/data/cities.json`, `GET /api/cities`).
  - Sign-up uses a searchable field (native datalist); any other city can be typed and matches by name.
  - The gate checks a radius in both directions when a side sets `radiusKm` (query + `passesGate` filter in Discover).
- **Copy:**
  - Placeholder photo caption removed.
  - Login reads "Log in / Welcome back."
  - Validation errors are plain sentences ("Please enter a valid email address.").
- **`npm run smoke:browsers [-- --url <site> --api <api>]`:** Playwright, as a devDependency; browsers installed locally only.

**Checks:**
- `npm test` **114/114** (+6 in `test/s0.test.js`); `api-check` all passed (+ an under-18 case); client build green.
- **`smoke:browsers`, local production build** (vite preview :4173 + API :5000 with `NODE_ENV=production`): ✓ chromium, ✓ firefox, ✓ webkit.
- **`smoke:browsers`, deployed site (read-only):** ✓ chromium, ✓ firefox; webkit logs in but hits the Windows-WebKit WebSocket crash above.
- **Layout:**
  - 375 px and 1440 px for landing / login / sign-up: no horizontal overflow, no console errors.
  - A real sign-up at 375 px → /onboarding, profile age 30, city Pune with coordinates.

**For S7 (owner sets on Render):** `CLIENT_URL=https://dating-agent-flame.vercel.app,https://dating-agent-chandal-chowkdi.vercel.app`. Previews are covered by the pattern; set `CLIENT_URL_PATTERN` only if the Vercel team slug changes.

## Plans

| Plan | Title | Status | Where |
|---|---|---|---|
| 00 | Start here | 📖 | `plan/00-START-HERE.md` |
| 01 | Accounts and local setup | 🚫 Humans | `plan/01-accounts-and-setup.md` |
| 02–11, 17, 19 | Build plans (scaffold → live check) | ✅ 📦 | `plan/archive/` (results in CLAUDE.md Status) |
| 12 | Deploy on free tiers + keep-alive | ✅ Deployed 2026-10-18 | `plan/12-deploy-free-and-keepalive.md` |
| 13 | Submission | ⬜ (S7) | `plan/13-submission.md` |
| 14 | Switch to Nebius Token Factory | ⬜ (S7, Oct 26) | `plan/14-switch-to-nebius.md` |
| 15 | Knowledge graph: final design | 📖 Source of truth | `plan/15-knowledge-graph-final.md` |
| 16 | KG upgrade execution | 📦 | `plan/archive/16-kg-upgrade-execution.md` |
| 18 | Architecture decisions | 📖 Partly adopted | `plan/18-architecture-decisions.md` |
| 20 | UI design brief | 📦 Replaced by Round 7 | `plan/archive/20-ui-design-brief.md` |
| 21, 22 | Speed, dating-app core | 📦 Merged into 30 | `plan/archive/21-…`, `plan/archive/22-…` |
| 30 | Final sprint | 🔄 | `plan/30-final-sprint.md` |

## Blocked / needs a human

- **(2026-10-21) The NVIDIA key in `server/.env` gets `404 Function … Not found for account` on `MODEL_MID` (`nvidia/nemotron-3-super-120b-a12b`)**, though `/v1/models` lists it. Fast (Lightning) and smart (Ultra) answer. Mid writes every agent reply, the brief, the read and graph builds, so with this key agents can't talk. If the deployed site uses the same account, check it. The plan 31 simulation used `MODEL_MID=nvidia/nemotron-3-ultra-550b-a55b` for that run only (shell override; `.env` unchanged).
- **Cloudinary** (`CLOUDINARY_*`) and **Resend** (`RESEND_API_KEY`, `EMAIL_FROM`): not in `.env` yet → S3/S4 build against local stubs and hide in production.
- **Nebius account + credits** by Oct 26 (S7 / plan 14). Until then: NVIDIA free API.
- **Production seed:** a teammate runs `seed.js` + `seed.js --judges` against Atlas (see `DEPLOY-HANDOFF.md`).
- **Env values for Render/Vercel** are collected here and set by the owner at S7.

## How to continue

```bash
git checkout main
cd server && npm install && cd ../client && npm install
cd ../server && npm run dev-db          # local replica set on :27999, keep running
```

`server/.env` comes from the team (never commit it). Tests: `npm test`; `npm run api-check`; client: `npm run build`.

## Handoff to another Claude Code session

> Read CLAUDE.md, this file, then `plan/30-final-sprint.md`. Continue at the first step that isn't ✅, in the order above. After every step: tests + api-check + client build green, check 375 px and 1440 px, `npm run smoke:browsers` on the local production build, update this file, **commit locally, never push**. Stop at every **STOP**.

Standing rules: never print, echo, log or commit secrets; confirm no `.env` is tracked before the push; ask before a dependency the plan doesn't approve; ask before deleting real data or changing how agent messages are sent or shown beyond plan 30.

---

## History (before plan 30, kept as written)

### Plans

Build order (`00-START-HERE` phase table, owner 2026-10-17):

| Phase | Plans |
|---|---|
| Done | 02 → 03 → 04 → 17 → 05 → 06 → 07 → 08 → 09 |
| 1. Backend + tests (now) | 11 Part B (B1 tuning → B2 scale test → B3 metrics → B4 ablation → B5 one full run → B6 results) |
| 2. Frontend | 10, from the owner's design (with its backend additions) |
| 3. Go live | 14 (Nebius, by Oct 26) → 12 (deploy, keep-alive, judge accounts, demo pacing §7) |
| 4. Submit | 13 (feature freeze Oct 28, submit Oct 29) |

| Plan | Title | Status | Branch | Last commit | Notes / next step |
|---|---|---|---|---|---|
| 00 | Start here | ✅ Done | main | `4cafa14` | Build order + fixed dates. |
| 01 | Accounts and local setup | 🚫 Not for Claude Code | — | — | Humans. Still open: Atlas login, Tavily key, Nebius account (see Blocked). |
| 02 | Scaffold | ✅ Done | main | `13a7f10` | |
| 03 | LLM layer | ✅ Done | main | `1567236` | Runs on NVIDIA's free API for now; only the provider changes later (plan 14). |
| 04 | Backend core + API contract | ✅ Done | main | `04b66db` | `npm run api-check` 19/19. |
| 05 | Onboarding + knowledge graph (v2) | ✅ Done | main | `1417ee0` | v1 was `219d0ef`. `feat/plan-05-kg-v2` is merged and can be deleted. |
| 06 | Trust check (v2) | ✅ Done | main | `d8d1a80` | The DB spy proves it reads only the public profile. |
| 07 | Gate, brief, agenda, conversation (v2) | ✅ Done | main | `916f89d` | No facts about the other user are stored. |
| 08 | Agent conversation: persona engine + per-turn pipeline (v2) | ✅ Done | main | `3072867` | ~76k tokens / 50 calls per conversation (v1 ~266k). Known gaps are listed in CLAUDE.md Status. `feat/plan-08-engine` is merged and can be deleted. |
| 09 | Independent judges, handoff, compaction, date ideas (v2) | ✅ Done | main | `857aff1` | Includes the structural "ask my human" fix. Meera × Ishaan → Compatible (yes/yes). `feat/plan-09-judges` and `fix/ask-my-human` are merged and can be deleted. |
| 10 | Frontend v2 (from the owner's design) | ✅ Done (live-agent browser run pending) | main | merge of `feat/plan-10-frontend` | All screens in the design on real data; CodeRabbit + ponytail reviewed; 102/102, api-check 20/20, sign-up browser flow 6/6. Pending: take-over / pause in a live chat when NVIDIA stops 429-ing; licensed landing photo. |
| 11 | Seed personas + evaluation (v2) | ✅ Done | main | `67a8666` | B1–B6 done. B5: 4/17, gate 1/1, fakes 2/2; the judges cluster on Maybe. Human labels for judge agreement pending (`eval/labels/`). |
| 12 | Deploy on free tiers + keep-alive | 🔄 Code done | main | `67a8666` | render.yaml, keep-alive, self-ping, DEPLOY.md, credit guard, demo pacing, `--judges`. Human steps in DEPLOY.md after plan 14. |
| 13 | Submission (README, video, Devpost) | ⬜ Not started | — | — | README skeleton is queued as side work. |
| 14 | Switch back to Nebius Token Factory | ⬜ Not started | — | — | **Due Oct 26.** Needs the Nebius account. The dry-run checklist is queued as side work. |
| 15 | Knowledge graph: final design | ✅ Done (design doc) | main | `f91d072` | Source of truth for the KG. |
| 16 | KG upgrade execution | 📦 Archived | main | `df05021` | Done; moved to `plan/archive/16-kg-upgrade-execution.md`. |
| 17 | Jobs, storage and indexes | ✅ Done | main | `3522f63` | Job queue, compact vectors, gate query, indexes. |
| 18 | Architecture decisions | 📖 Reference, partly adopted | main | `df05021` | See its status banner: built parts in 05–09; Maybe-extend (10), demo pacing (12 §7), metrics (11) scheduled; the rest deferred. |
| 19 | Verification (liveness + face match) | 🚫 Not for Claude Code | — | — | Owner's decision 2026-10-17. No file. |
| 20 | UI design brief | 🚫 Not for Claude Code (design team) | main | `11bdcf6` | The owner hands over the design for Phase 2. |
| ref | kg-upgrade-reference | 📦 Archived | main | `df05021` | Moved to `plan/archive/kg-upgrade-reference.md`. |

### Owner's order (updated 2026-10-17, replaces the earlier order)

**Backend and testing first, frontend last, then deploy and submit.** No UI or `client/` work until the owner hands over the frontend design.

1. **Phase 1, backend + tests (now):**
   - finish 09 (live checks, merge)
   - 11A: seed personas + re-seed
   - 11B: evaluation harness, ablations, scale test, 20-pair runs
   - tuning: conversation quality and judge calibration
   - fix whatever the tests find

   Backend-only parts of later plans also go here when they need no UI: plan 12's `trust proxy`, Socket.IO CORS, the log level, the credit guard and `seed.js --judges`.
2. **Phase 2, frontend:** plan 10 (v2 screens) built from the owner's design (which replaces plan 20's brief), including plan 12's wake-up screen.
3. **Phase 3, go live:**
   - 14: switch to the Nebius key. Smoke-test the key as soon as it exists; if the embedding model differs, switch before 11's final eval numbers.
   - 12: render.yaml, keep-alive, DEPLOY.md
4. **Phase 4, submit:** 13 (README, Devpost; the video is by humans).

**Not for Claude Code:** 19 (verification) and 20 (design brief).

Humans, before Phase 3: Nebius account + credits, Atlas login, Tavily key (optional).

### Currently working on

**Owner, 2026-10-18 night:** commit the plan edits and finish everything except plan 14 (it can come after deploy); show everything on localhost before deploying; run CodeRabbit before shipping. A new NVIDIA key from a teammate's account is in `server/.env`: all 5 model IDs are listed and Super answers in ~0.7 s (the old key took 16–163 s per call).

- ✅ **Plan 19 live check** on `feat/plan-19-live-check` (owner's plan, committed `be15b41`):
  - **Backend:** challenge with 2 random moves; code checks (single-use nonce → 409; order, timing, JPEG ≤ 120 KB, timeline → 400); ONE vision call; decision in code; only the result stored; trust-check bonus.
  - **Client:** `/live-check` (MediaPipe self-hosted, lazy), "Live-checked" badge with the exact tooltip, Settings row.
  - **Model:** `MODEL_VISION` = `nvidia/nemotron-3.5-super-vl-120b-a12b`; Nano 12B v2 VL isn't on our NVIDIA account.
  - **Checks:** 108/108 tests. Headless Chrome with a fake camera: page, consent gate, camera + MediaPipe start, kind timeout with no face, no failed requests.
  - **Pending (owner):** `npm run live-check:vision` on your own selfies (left/right mapping, phone-screen photo); pass on a laptop and a phone; a held-up phone fails. Cut-off Oct 25.
- ✅ **Plan 13 drafts:** README in full + SUBMISSION.md. `TODO(deploy)` marks the live URL, final Token Factory IDs, team names and the screenshot. No credentials.
- 🔄 **Judge accounts** seeding on the dev DB with the new key. The local judge password is in `server/.env` (`JUDGE_PASSWORD`).
- **Next:** CodeRabbit on plan 19 → live-agent browser run (take-over latency, pause) → merge → localhost demo for the owner → deploy (plan 12) → plan 14.


**Re-plan (owner, 2026-10-18 afternoon).** The design arrived (`Frontend-Design/04-direction/`, local only and gitignored), and the Tavily key is in (only **1,000 credits** for everything). Atlas: the IP allow-list is `0.0.0.0/0`, but login still fails (`bad auth`), so the **owner fixes the DB user/password in `MONGODB_URI`**. On this machine Node also needs public DNS for the Atlas SRV lookup; Render won't.

Owner's decisions:
- add `motion`, `lucide-react` and 4 `@fontsource` fonts;
- the app is called **Prelude**;
- no selfie or liveness claims: show our real trust check instead;
- build **Pause / Resume** per match.

| # | Track | What | Estimate | Status |
|---|---|---|---|---|
| 1 | Backend | Judge fix merged to main (`6eb1cc2`): rejudge 8/17, compatible 5/7, harmful 1 at JUDGE_YES_MIN 0.65; step 4 on i3/i5/c4/m1 → 2/4, 0 harmful (i5 drinking conflict caught); README numbers updated | done | ✅ |
| 2 | Backend | Tavily guard (`3ab63e8`): basic depth, TAVILY_MAX_SEARCHES (dev 30 / prod 700) + 3 per user per day as Usage rows, 30-day cache keyed by sorted interests, city fallback; key verified live by api-check (1 credit) | done | ✅ |
| 3 | Backend | Pause / Resume per match (`3ab63e8`) + /matches/:id/kg returns my chat moments and interest | done | ✅ |
| 4 | Frontend | Plan 10 on `feat/plan-10-frontend` (pushed, main merged in, 102/102 tests, api-check 20/20): design tokens/fonts/icons/motion, light + lamplight; Landing (demo chat), Sign-up (basics + consent) / Log in, Onboarding (segmented progress, How would you reply? + learning panel), This is you (radial map on real data, privacy, edit/delete, Which is right?, How you text), Introductions (blurred photos), Matches, Match room (notes in the margin, trust / shared / how they seem / agenda, Pause / Resume / Take over, I wouldn't say that, mobile sheet), Verdict (Compatible / Maybe + Let them talk longer / Not compatible + Talk anyway, date ideas after Continue), Replay, Settings (Learn from my chats, lamplight), wake-up screen. Checked in headless Chrome at 1440 and 375 (no overflow, no console errors). Left: Profile + Inbox polish, plan 10 end-to-end browser run, code-splitting (bundle 600 KB) | ~1 day → ~3 h left | 🔄 |
| 5 | Backend | Retry `seed.js --judges` (NVIDIA 429s today) | ~1 h of LLM | ⬜ |
| 6 | Review | CodeRabbit + ponytail audit once the frontend is done | ~1 h | ⬜ |
| 7 | Go live | Plan 14 (Nebius, by Oct 26) → plan 12 (DEPLOY.md human steps + live smoke) | ~4–5 h + humans | ⬜ needs Nebius + Atlas login |
| 8 | Submit | Plan 13: README, SUBMISSION.md (freeze Oct 28, submit Oct 29) | ~2–3 h | ⬜ |

**Tavily budget (1,000 credits, basic search = 1 credit):**

| Use | Credits |
|---|---|
| Dev checks | ≤ 20 |
| Pre-warming 5 demo cities × ~4 interest pairs | ~20 |
| Judge accounts | ~10 |
| Live demo and judging (Dec 1–15), behind the all-time cap | ≤ 600 |
| Reserve | ~350 |

Cached ideas never cost a credit.

**Judge fix (owner, 2026-10-18; plan 11 follow-up) on `feat/judge-fix`:** steps 1–3 need no new chats; step 4 re-runs i3, i5, c4 and m1 only after telling the owner.
- ✅ **Step 1** (`04047d6`): the decision is made in code (`services/conversation/judgeDecision.js`, numbers in `kg/config.js` `JUDGE_*`, unit-tested). The LLM lists evidence only: positives/frictions carry the F-id of my fact, dealbreakerRisk carries the option they stated.
  - **No:** a stated dealbreaker value outside my accepts, or a severity-3 friction on a fact with importance ≥ 0.9.
  - **Yes:** ≥ 2 distinct verified positives in their words on key facts (importance ≥ 0.6, a dealbreaker, or a like with strength ≥ 0.6), with no severity-3 friction and no conflicting or unclear dealbreaker.
  - **Undiscussed dealbreaker:** a severity-2 friction plus "worth asking" in the summary.
  - **Otherwise:** unsure.
  - `npm test` 97/97.
- ✅ **Step 2** (`60f7df2`):
  - Removed "prediction is weak… say unsure" from the prompt; the LLM lists evidence in both directions and its summary states no verdict.
  - Undiscussed topics are no longer LLM frictions; the code adds them.
  - Template filler lines are labelled `[system filler, not their words]` and never count as evidence.
  - 97/97.
- ✅ **Step 3** (`8afd2b5`, `e08fc44`): `scripts/eval/rejudge.js` re-judged the 17 saved B5 conversations, with no new chats (`eval/results/rejudge.md`).
  - **Accuracy:** 4/17 → **8/17**.
  - **Compatible pairs:** 0/7 → **5/7** (target ≥ 4/7 ✓).
  - **Harmful errors:** 1 → 2 at `JUDGE_YES_MIN` 0.6. Both swaps are the hidden-conflict pairs: i3 (long-term) and i5 (drinking) never actually discussed the conflict in those chats.
  - **Calibration** (`calibrate.js`, its threshold drift fixed): **0.65** keeps 8/17 and brings harmful errors back to **1** (target ✓). `JUDGE_YES_MIN` is now 0.65. It was tuned on the same data; step 4's fresh chats check it.
  - Also: the judge only sees messages up to the conversation's end (no wind-down), an unclear dealbreaker answer counts as undiscussed (per the spec), and confidence is rounded before comparing.
- ✅ **Step 4 code** (`e4aa816`):
  - **Must-ask items:** dealbreakers and answers that matter a lot (priority ≥ `ASK_EXPLICIT_PRIORITY` 0.9; i3/i5's conflicts are high-importance answers, because a dealbreaker would close the match at the gate).
  - **Counted as covered when:** my agent asked a direct question naming the attribute, or they stated it themselves.
  - **Until then:** steered to first with no tries cap, asked as one direct question, and no natural end. 99/99.
- ✅ **Step 4 re-run** (`ec4b804`, `eval/results-step4.md`; NVIDIA returned many 429s today):
  - **c4:** compatible ✓.
  - **i3:** maybe. It was a harmful "compatible" in the re-judge, so it's no longer harmful, but not yet the expected incompatible.
  - **m1:** incompatible (expected maybe). Arjun's *agent* misrepresented him ("still figuring out what I'm looking for", "just seeing how things go") while his answer is long-term, so Meera's judge rightly said no. **Fixed:** the looking_for contradiction check now catches these wordings and checks sentences that address nobody, not only ones with I/mera. 100/100.
  - **i5:** stalled at 14 messages on 429s (pair timeout). Step 4 did its job before that: Gauri's agent asked "how do you feel about drinking?" directly, and Arnav answered with his brew.
- **Next (ask the owner):** re-run i5 and m1 once NVIDIA stops returning 429s, then retry `seed.js --judges`.
- Also: the live `seed.js --judges` run hit NVIDIA 429 (rate limit) while building the first judge's graph; it will be retried after the judge fix.

**Owner, 2026-10-18:** finish ALL backend today (every KG learning path, plan 10's backend additions, plan 12's backend-only parts) plus tests; frontend only if the design arrives. B5 stays at 2 pairs at a time. Code-critique tools (ponytail, CodeRabbit) run once the coding is complete.

**B5 ✅ (final full run, `feat/plan-11-tuning` `72a9a9e`, 07:51 → 10:05 IST, RULES=on, 2 pairs at a time):**
- **Results:** 4/17 correct (24%); 1 harmful swap (c2: compatible → Not compatible); gate 1/1; fakes 2/2, 0 genuine pairs flagged.
- **Fallback rate:** 7% (22 template + 17 constrained of 294 agent messages); target < 5%.
- **Cost:** ~101k tokens per pair (1.73M total); 17.3 messages to a verdict.
- **Confusion:** compatible → maybe 6, incompatible 1. Maybe → maybe 2, incompatible 2. Incompatible → maybe 4, incompatible 2. **The judges cluster on Maybe:** one side says "unsure" in most chats, so the threshold can't help. Calibration over raw-full + raw-rules-on is flat (5/20 at every value from 0.50 to 0.95), so `JUDGE_YES_MIN` stays 0.6.
- **Offline metrics** (`eval/results/metrics-full.md`): style distance 0.16, language-mix distance 0.06, Devanagari script kept 1/1, ask-back 0.58, distinct-2 0.89. Observer notes: precision 0.27, recall 0.61.
- **Judge-agreement set exported:** `eval/labels/`, 10 transcripts (yes 2 / unsure 3 / no 5). **Needs the team to fill `human_label` in `labels.csv`.**
- **In progress:** `llm-metrics --tag full` (unsupported self-claims, agreement rate), then B6 (`latest.md` + the README Evaluation section).

**Backend finish on `feat/backend-finish`** (worktree, branched from `feat/plan-11-tuning`; `npm test` 90/90, no LLM needed):
- ✅ KG learning from my own side (plan 08 §3, plan 15 stage 7):
  - `POST /api/messages/:id/wouldnt-say { fix? }`, only on my own agent's messages. A fix becomes a `VoiceSample(edited_draft)`. The rule goes to corrections / neverSay, or becomes a `userEdited` fact when the agent got a fact wrong.
  - After handoff, my typed messages become `VoiceSample(own_chat)`, unless `settings.learnFromChats` is off (`PUT /api/me/settings { learnFromChats }`).
  - **Bug fixed:** never-say corrections stored the rule sentence, which the style check could never match. They now store the literal phrase.
- ✅ "Let them talk a bit longer" (plan 10 backend addition): `POST /api/matches/:id/extend`.
  - Allowed once per match, only on my own unsure while the match is Maybe.
  - Runs a round-2 conversation of up to `EXTEND_TURNS` (8) messages, steering to open important agenda items.
  - Then both judges run again on the whole transcript. The newest decision is the report; older ones are kept.
- ✅ Plan 12 backend parts:
  - Credit guard: `JUDGE_LIVE_CHATS_PER_DAY` (default 2). Over it, a match is `scheduled` with `startsAt` and starts the next UTC day.
  - Seeds are exempt from the per-user LLM cap.
  - `DEMO_PACING=fast` applies to seed and judge accounts only (replaces `DEMO_FAST`).
  - `LOG_LEVEL`: in production, errors plus one line per LLM call, with no message contents.
- ✅ `seed.js --judges` (`seed/judges.json`, `JUDGE_PASSWORD`):
  - 2 judge accounts that copy a seed persona's answers.
  - Real runs against each judge's gate pool fill a flagged fake, a match frozen at 6 messages (it resumes when opened) and whichever verdicts the judges reach.
  - **Not run yet** (~1 h of LLM): first after B5, then once more on Nebius in plan 12.
- **Next:**
  1. Live check of the new routes, plus one `--judges` run after B5.
  2. Plan 12 deploy prep (render.yaml, keep-alive, self-ping, DEPLOY.md) and the plan 14 dry-run checklist (no UI or accounts needed).

**B1 report (tuning stopped at the 3-iteration cap, 2026-10-17):**
- Best 4/6 (iteration 2). Gated and fake pairs are always right; i6 (values clash) right in all 3; i2 (hidden smoking) right in iterations 1 and 2.
- Fallback rate 13% → 5% → 8%.
- Left:
  1. Compatible pairs land on "maybe": one judge says yes (0.85) while the other says unsure (0.5–0.55). Calibrating `JUDGE_YES_MIN` in B5 may move some.
  2. Run-to-run variance on 6 pairs is large (i2 flipped in iteration 3).
  3. Fixed after the cap, measured by B4/B5 (`fix(plan-11)`): one vague dealbreaker hint ended c1 at 7 messages; now the first hint reopens the topic and only a second ends the chat.
- **Correctness fixes found in the B4 rules-on run** (commit `fix(plan-11): reply retries…`), measured by B5:
  - c7 stalled for 45 min after 3 quick NVIDIA failures. Replies now back off 30 s → 8 min before the sweep takes over.
  - c1 came out incompatible because Meera's agent said "haven't thought much about kids yet" while her answer is "open". When they ask about a topic my graph covers, its facts are now always in the prompt, and a hedge on it triggers the regeneration.

**Owner's approved plan, step 3: plan 11 personas on `feat/plan-11-personas`.**

- **Step 1 ✅:** plan 09 merged (`cbd8faa`). judge-check passed every step, agent-check 3× in a row, api-check 19/19, seed-check end to end, check-indexes ✓, `npm test` 74/74.
- **Step 2 ✅:** "ask my human" is structural (`21742b6`, `522b2fb`). Tests: IPL with no cricket fact → inbox; with a "dislikes cricket" fact → none, honest dislike grounded; Hinglish "tera favourite IPL team kaunsa hai?" → inbox; a repeat → merged; a confident uncited reply → grounding problem (regeneration) + inbox. In all 3 agent-check runs Meera answered honestly ("not sure about ipl teams honestly") and the inbox item was filed.
- **Step 3 (now):**
  - a) `seed/persona-quotas.json`
  - b) `scripts/seed/restyle-personas.js` (voice answers only, cached by spec hash)
  - c) `scripts/seed/check-personas.js` (pure code, non-zero exit on a quota miss)
  - d) incremental seeding (`contentHash`, `--force`)
  - e) re-run the 08/09 checks + eval `--limit 6`, then merge
- **Step 3 progress (`d5fdbea`):**
  - a) quotas ✓, b) restyle script ✓ (NVIDIA Super returned inputs unchanged even with measured retries, so most voices were hand-written), c) `check-personas` exits 0 ✓, d) incremental seed ✓ (`User.seedHash`, `--force`).
  - 38 personas (8 new). Before → after: Hinglish 1 → 7, Devanagari 0 → 3, Gujarati 0 → 2, Tamil/Marathi 0 → 2, code-switching 3 → 17, terse 1 → 5. Cities: 7 → 5 demo cities, each with ≥ 3 visible seeds for both new users (was 1–4). Pairs failing the gate: 10 → 0.
  - Full re-seed: **38 graphs in 1,666 s** (~28 min, concurrency 2, no failures). An immediate re-run: **0 s, 38 unchanged**.
  - `eval.js` restored from `wip/plan-11b` and adapted to v2 (`60130a7`): MatchDecision verdicts, `gated`, judge receipts.
  - e) ✓ agent-check passes and judge-check passes on the re-seeded data. Eval subset (6 varied pairs; the first 6 by `--limit` are all compatible): i1 gated ✓, f1 fake ✓, i6 incompatible ✓; c1, c7 and i2 → maybe. ~89k tokens per pair, 9–18 min per conversation.
  - Why the misses: (1) the engine's neutral fallback replies ("haha fair 😄", "oh nice, i like that") read as low effort to the judges; (2) i2 ended "naturally" at 14 messages without smoking coming up.
- **Step 3 ✅ merged** (`3966f5a`). **Waiting for the owner.**
- **Plan 11 remaining: the owner's reduced scope** (2026-10-17, also recorded at the top of `plan/archive/11-seed-data-and-eval.md`). Order: tuning → scale test → metric scripts → ablation subset → ONE full run (tell the owner first) → calibration → README numbers.
  1. 🔄 **Tuning** (6-pair loop, ≤ 3 iterations, target ≥ 5/6 and no filler).
     - Iteration 1 code is on `feat/plan-11-tuning`:
       - important topics are retried;
       - the model's end is gated on the agenda;
       - a constrained regeneration replaces filler, and fallbacks are logged per message;
       - no natural end with importance ≥ 0.7 open, and near `MAX_TURNS` the agent steers to it;
       - a META wording check; agenda likes ≤ 3 words.
     - `npm test` 78/78. Iteration 1 eval is running.
     - Seen mid-run: over-strict grounding drops honest drafts, which forces fallbacks (Meera × Ishaan: 2 template + 1 constrained in 6 messages). Fixed for iteration 2 (`278a59e`): an unsure hedge never contradicts a like; "I saw you…" is about them; the same opening is blocked only from the 3rd time. `npm test` 79/79.
  3. 🔄 Metric scripts: `scripts/eval/metrics.js` done (style/language fidelity, conversation stats, observer accuracy, from saved chats, no LLM). Unsupported self-claims (offline LLM judge) and the leak probe are next.
  2. ✅ Scale test (`scripts/eval/scale-test.js`, no LLM, local in-memory replica set, 28 s): 2,000 users. Discover p50 2.1 / p95 4.2 ms on index `gate.city_1_gate.gender_1_gate.age_1`; context build per message miss 9.5 / 10.4 ms, hit 1.6 / 3.0 ms; 88 KB/user → ~5,900 users in M0. → `eval/results/scale.md`.
  4. ⬜ Ablation `RULES` on/off on the 6-pair subset.
  5. ⬜ ONE full 20-pair run, overnight, resumable (**ask the owner first**).
  6. ⬜ Judge-agreement export (10 transcripts → `eval/labels/`).
  7. ⬜ Calibrate `JUDGE_YES_MIN`; headline numbers → `eval/results/latest.md` + README.

**Side work: paused by the owner's order above** (item 1 is done; the rest happens in Phase 2/3):

1. ✅ **CI test workflow** on `side/ci-tests` (`bbd6dcd`, **merged to `main`** in `4aa13c8` on the owner's OK). Only `.github/workflows/ci.yml`: Node 22, `npm ci` + `npm test` in `server/`, dummy env (no secrets; `LLM_ENABLED=false`; dummy `MODEL_*` IDs because `createConcept` reads the embed model name), caches the MongoDB binary, runner pinned to `ubuntu-24.04` (`ubuntu-latest` moves to Ubuntu 26 on Oct 19 and mongodb-memory-server may not know it), actions checkout@v7 / setup-node@v7 / cache@v6 (v4 ran on deprecated Node 20). GitHub Actions run 38928682293: green, 52/52, no warnings.
2. **Deploy prep (plan 12)** on `side/deploy-prep`. Touches `render.yaml`, `.github/workflows/keep-alive.yml`, `server/src/keepalive.js` (+ one line in `index.js`), and `DEPLOY.md`. Nothing schema-related.
3. **README skeleton + "How we use Nemotron + Token Factory"** (plan 13 prep) on `side/readme`.
4. **Plan 14 dry-run checklist** on `side/nebius-dryrun`: docs only, no key needed.
5. **Plan 18 §1 benchmark** (face-embedding memory/latency at 512 MB, MediaPipe prototype) in an isolated folder, on `side/verify-bench`. **Starts only after you approve the dependencies.**
