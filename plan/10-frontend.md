# 10 — Frontend (React + Vite + Tailwind), v2 patch

> **Prompt for Claude Code:** Read `CLAUDE.md` (section "Knowledge graph — final design"), `plan/15-knowledge-graph-final.md` §5, and the API added by plans 05–09 (v2). The v1 screens exist and run on the real API (mocks were removed in plan 09). Update them as below, run the acceptance checks.

## Design direction (unchanged)

- Mobile-first, and good at 1280px too.
- Warm and trustworthy: one accent color, generous spacing, rounded cards, a characterful display font + a clean sans.
- The agent is a calm assistant at your side: a consistent agent icon and a soft secondary color for anything agent-related.
- Light and dark mode via CSS variables.
- Every async action has loading and error states. No blank screens.
- Accessibility: labelled inputs, focus states, contrast, `aria-live` on new messages.

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
- **Actions:**
  - Compatible / Maybe: **Continue as myself** / **Pass**. After Continue: date ideas (Tavily, or the 503 message) and icebreakers.
  - Not compatible: "Talk anyway".
- Never show anything from the other side's decision.

### Chat replay (`/matches/:id/replay`, from `GET /api/conversations/:id/replay`)
- The whole agent conversation with **my** side's ChatEvents as inline badges and my decision's evidence highlighted.
- "I wouldn't say that" is available on my own agent's messages here too.

### Settings
- Default agent mode (off / shadow / auto) with a plain explanation.
- **"Learn from my chats"** toggle (default on): "After you take over, your own messages help your agent sound like you."
- Delete account (confirm dialog).

## Acceptance checks

- [ ] Real backend, headless Chrome (puppeteer-core with system Chrome, scratchpad only, not committed): signup (with basics + consent) → onboarding v2 (B importance required, dealbreaker validation) → hub review (edit, delete, contradiction resolve, "I never use emojis") → discover → match → match room (agent chatting, My notes growing live) → "I wouldn't say that" → report with receipts → continue → reveal.
- [ ] Take over unlocks the input in under 100 ms and no agent message follows.
- [ ] Clicking a positive or friction highlights its cited message.
- [ ] 375px width: no horizontal scroll. Light and dark both readable. No console errors.
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-10): v2 onboarding, hub review, my-notes panel, replay, corrections`
