# 10 — Frontend (React + Vite + Tailwind), v2 patch

> **Prompt for Claude Code:** Read `CLAUDE.md` (section "Knowledge graph — final design"), `plan/15-knowledge-graph-final.md` §5, and the API added by plans 05–09 (v2). The v1 screens exist and run on the real API (mocks were removed in plan 09). Update them as below, run the acceptance checks.

## Design direction: follow the owner's final design
- **The visual design comes from the owner's final Claude Design export** (Round 4 "Prelude" base plus the Round 5 additions), handed over at the start of Phase 2. Build to it exactly: its tokens, type, components, light + "Lamplight" dark mode and motion spec. `plan/20-ui-design-brief.md` is background only; where the export differs, the export wins.
- **Fixed principles** (also in the design):
  - no mascot or decorative props
  - agent-written lines use a second ink plus the "drafted by your agent" mark
  - no percentage or score anywhere
  - calm motion, `prefers-reduced-motion` respected
  - a 12 px minimum text size, AA contrast
  - 375 px with no horizontal scroll
- **The "first letter" frame:** the agents' conversation sits on the letter surface; on Take over or handoff it gives way to the normal chat ("From here, it's you two.").
- **The verdict letter:** the one signature animation (≈450 ms). Compatible unfolds, Maybe half-opens, Not compatible closes gently. There's a static version for reduced motion.
- **Client caching:** only UI state in memory (fetch + revalidate). Nothing sensitive in `localStorage` except the auth token and onboarding drafts; clear everything on logout.
- **Every async action** has loading and error states. No blank screens. Labelled inputs, focus states, `aria-live` on new messages.

**Keep the app runnable:** each backend plan (05–09) already made the minimum client change so the flow keeps working. This plan finishes those screens. Nothing here may break signup → onboarding → discover → match → agent chat.

## Changes

### Signup / profile
- Signup collects age, gender, interested in and city (plan 15 stage 1). Consent checkbox unchanged (required).
- `/profile` adds the wanted age range (two number inputs, or a dual slider) and an optional radius. **Dealbreakers move out of the profile:** they live in section B now (shown read-only, with a link to edit them in the questionnaire).

### Onboarding (`/onboarding`, sections fetched from `GET /api/onboarding/questions`)
- **Identity** step first: job/studies, languages spoken (chips + "other"), optional family setup.
- **B:**
  - The importance selector has **no default**; Next is disabled until every item has one.
  - After the importance, an "In a partner I'd accept" chip multi-select (all selected by default) and a **Dealbreaker** toggle.
  - Turning on the dealbreaker toggle with every option still accepted shows an inline error and blocks Next.
- **C:** 7 prompts, at least 4 answered (counter "3 of 4 minimum"), each with a grey example placeholder; the opinion prompt asks "how strongly?" with a 3-step strength chip.
- **D:** chips + free text, each with an intensity chip (casual / into it / obsessed).
- **E:** 15 chat-bubble "how would you reply?" items, grouped by mood; any language and script is welcome (say so in one line).
- Drafts save to localStorage. The processing screen polls the build job ("building your profile…").

### Review screen (`/onboarding/review` and `/profile/graph`)
- **Hub graph** (`GET /api/kg/me`): the user in the centre and 8 hubs (Who I am · Likes · Dislikes · Values & lifestyle · Goals · Stories · Opinions & humour · How I text). Node size = `max(importance, strength)`, opacity = confidence. Traits are never shown.
- **Fact list** grouped by hub. Per fact:
  - edit wording, strength (slider) and privacy (public / if asked / private)
  - delete (explain: "it won't come back when you re-submit")
  - `PATCH` / `DELETE /api/kg/facts/:id`
- **Contradictions panel** (`GET /api/kg/contradictions`): "Which is right?" with both quotes; choosing one calls resolve, and the item leaves the panel.
- **"How I text" corrections:** each style node has "That's not me" with a short fix field (`POST /api/kg/voice/corrections`), for example "I never use emojis".

### Match room (`/matches/:id`)
- **Right panel → "My notes":** what **my** agent learned about them (notes with quotes) and chat moments (shared interest, laugh, disagreement, …) growing live via `notes:update`. It replaces the observed-facts force graph. Everything shown comes from the transcript.
- **Left panel:** trust chip with flags and quotes; brief summary; agenda checklist with live statuses.
- **Own agent messages:**
  - The "sent by your agent" marker (owner only).
  - A small **"I wouldn't say that"** action that opens an optional "how would you say it?" field (`POST /api/messages/:id/wouldnt-say`); toast "Your agent will remember".
  - Never shown on the other side's messages.
- Take over: unchanged (instant, input unlocks).

### Report (`/matches/:id/report`, from my `MatchDecision`)
- Big label (Compatible / Maybe / Not compatible) + `summaryForUser`.
- **Positives ✓, frictions ⚠ and dealbreaker risks**, each with its quote. Clicking one opens the transcript drawer and **highlights the cited message** (the receipts).
- The dimension bars from v1 are removed (there are no code dimension scores any more).
- **Maybe** gets its own design and copy (what's promising, what's still unclear, why the agents stopped): hopeful, not a soft rejection.
- **Chat-moment chips** ("A real laugh", "Both love trekking", "Disagreed, then settled") come from my ChatEvents and link to their lines.
- **Actions:**
  - Maybe: **Let them talk a bit longer** (primary; see "Backend additions" below), **I'll take it from here**, **Pass, kindly**.
  - Compatible / Maybe: **Continue as myself** / **Pass**. After Continue: date ideas (Tavily, or the 503 message) and icebreakers.
  - Not compatible: "Talk anyway".
- Never show anything from the other side's decision.

### Chat replay (`/matches/:id/replay`, from `GET /api/conversations/:id/replay`)
- The whole agent conversation with **my** side's ChatEvents as inline badges and my decision's evidence highlighted.
- "I wouldn't say that" is available on my own agent's messages here too.

### Wake-up screen (from plan 12)
- If `/health` takes more than 3 s, show "Waking up the server…" with retry. Render's free tier sleeps.

### Live check screen (plan 19)
- `/live-check` and the "Live-checked" badge, as specified in `plan/19-live-check.md` (the functional screen is built there; style it from the design export here).
- Copy: only "Live-checked" with its tooltip. Never "verified", "photo verified", "ID verified" or "every profile is checked". If plan 19 is switched off at its Oct 25 cut-off, remove the screen, the badge and every mention.

### Settings
- Default agent mode (off / shadow / auto) with a plain explanation.
- **"Learn from my chats"** toggle (default on): "After you take over, your own messages help your agent sound like you."
- Delete account (confirm dialog).

## Backend additions the design needs (small; do them first in Phase 2)
- **"Let them talk a bit longer"** for a Maybe: `POST /api/matches/:id/extend`, allowed once per match and only if my verdict is Maybe. It resumes both agents for up to `EXTEND_TURNS` (default 8) more messages, steering to the unclear agenda items, then re-runs both judges. The new verdicts replace the old ones; history is kept.
- A **conversation-length state** for the layout (early / mid / long), derived from the message count. No API change is needed if the client counts.

## Acceptance checks

- [ ] Real backend, headless Chrome (puppeteer-core with system Chrome, scratchpad only, not committed): signup (with basics + consent) → onboarding v2 (B importance required, dealbreaker validation) → hub review (edit, delete, contradiction resolve, "I never use emojis") → discover → match → match room (agent chatting, My notes growing live) → "I wouldn't say that" → report with receipts → continue → reveal.
- [ ] Take over unlocks the input in under 100 ms and no agent message follows.
- [ ] Clicking a positive or friction highlights its cited message.
- [ ] Maybe → "Let them talk a bit longer" resumes the agents once and produces new verdicts; a second extend is refused.
- [ ] The screens match the final design export at 375 and 1440, light and Lamplight.
- [ ] 375px width: no horizontal scroll. Light and dark both readable. No console errors.
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-10): v2 onboarding, hub review, my-notes panel, replay, corrections`
