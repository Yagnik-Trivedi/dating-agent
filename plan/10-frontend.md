# 10 — Frontend (React + Vite + Tailwind)

> **Prompt for Claude Code:** Read `CLAUDE.md` and the API contract in `plan/04-backend-core.md`. Load the `frontend-design` skill if available. Build the screens below against that contract. Where backend pieces aren't ready yet, use a small mock layer in `src/lib/mock.js` behind `VITE_USE_MOCKS=true`. Run the acceptance checks.

## Design direction

- **Mobile-first** (judges may open it on a phone), and it must look good at 1280px too.
- Warm and trustworthy, not Tinder-clone neon. One accent color, generous spacing, rounded cards, readable type (a Google Font pair, e.g. a characterful display font plus a clean sans).
- The agent should feel like a calm **assistant at your side**: a small consistent agent avatar or icon and a soft secondary color for anything agent-related.
- Light and dark mode via CSS variables.
- Every async action has loading and error states. No blank screens.

## Routes and screens

| Route | Screen | Key elements |
|---|---|---|
| `/` | Landing | One-line pitch, how it works in 4 steps (Trust check → Understand → Pre-chat → Verdict), sign up / log in |
| `/signup` | Sign up | Name, email, password, and a **required consent checkbox**: "Early conversations with your matches may be handled by AI agents, including yours." Link to a short "How the agent works" modal. |
| `/login` | Log in | |
| `/onboarding` | Multi-step questionnaire | Step per section A–E from plan 05 (fetched from `GET /api/onboarding/questions`). Progress bar; Likert as tappable 1–5 chips; importance selector per value item; chat-bubble UI for style samples ("reply like you would"). Save drafts to localStorage. Submit, then a processing screen. |
| `/onboarding/review` | Your graph + privacy | Force-graph of `GET /api/kg/me`, plus a list grouped by predicate. Each fact has a disclosure toggle (public / if asked / private) and delete. Explain tiers in one line. |
| `/profile` | Edit profile | Photos (DiceBear URL picker for the demo), bio, 3 prompts, tags, dealbreakers |
| `/discover` | Swipe deck | Card with photo, name, age, city, bio, prompts, interests. Like / Pass buttons (no gestures needed). On match: a celebratory modal, "Your agent is checking this profile…". |
| `/matches` | Match list | Each row shows a status badge (Checking · Agent chatting · Compatible · Maybe · Not compatible · Flagged · You're chatting), last message preview and unread dot |
| `/matches/:id` | Match room | See the details below |
| `/matches/:id/report` | Verdict report | See the details below |
| `/inbox` | Ask my human | Questions from your agent with an answer box. On answer, a toast: "Your agent learned something new". |
| `/settings` | Settings | Default agent mode (off / shadow / auto) with a plain explanation of each; delete account (confirm dialog) |

### Match room (`/matches/:id`) — the hero screen for the demo

Desktop has three panels (stacked tabs on mobile).

1. **Chat (center):**
   - Live messages via socket. Typing indicator.
   - **Own-side agent messages** get a subtle "sent by your agent" marker that only the owner sees.
   - Banner at the top while the agent is active: "Your agent is chatting (shadow mode)", with a big **Take over** button.
   - Message input is disabled while your agent is active, with a "Take over to type" hint.
   - After handoff, show the **reveal** divider message.
2. **Trust + brief (left):**
   - Trust level chip with flags and quotes.
   - Brief summary.
   - Agenda checklist with live status (open / partially / answered ✓).
3. **What we're learning (right):**
   - Live force-graph of observed facts about the match (`GET /api/matches/:id/kg` plus `kg:update` events). Nodes fade in; size = weight; opacity = confidence.
   - Below it, confidence bars per agenda topic.
   - **This panel is the "wow" moment of the video: make it smooth.**

### Report (`/matches/:id/report`)
- Big verdict badge and a short summary.
- Dimension bars (values, lifestyle, interests, communication, personality, chemistry) with a confidence hint.
- Reasons ✓ and concerns ⚠. Each is clickable and **scrolls/highlights the cited messages** in a transcript drawer (the "receipts").
- "Ask yourself" questions.
- **Actions:**
  - Compatible/Maybe: **Continue as myself** / **Pass**. Date ideas (Tavily) and icebreakers after continue.
  - Incompatible: "Talk anyway" override.

## Client plumbing

- `src/lib/api.js`, `src/lib/socket.js` (from plan 02).
- `useAuth`, `useSocket(matchId)` and `useMatch(matchId)` hooks. The socket reconnects with the token.
- Global toasts for `inbox:new`, `report:ready`, `match:new`.
- Route guard: not logged in → `/login`; onboarding not done → `/onboarding`.
- Basic accessibility: labelled inputs, focus states, color contrast, `aria-live` on new messages.

## Acceptance checks

- [ ] The full flow works in the browser against the real backend: signup with consent → onboarding → review graph → discover → match → match room shows the agent chatting live → report → continue → reveal.
- [ ] Take over works instantly and the input unlocks.
- [ ] Clicking a reason in the report highlights its cited messages.
- [ ] Usable at 375px width with no horizontal scroll.
- [ ] No console errors in normal use.
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-10): frontend screens and live match room`
