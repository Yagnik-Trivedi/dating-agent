# 20 — UI design brief (prompt for Claude Design)

Paste everything below the line into Claude Design. When the design is final, hand it to Claude Code (see the end of this file).

---

Design the complete UI for a dating web app with a built-in AI agent. The current UI is plain and looks AI-generated. I want something with a strong, memorable identity that feels made by a design studio, not a template.

## The product (so the design tells the right story)
- Dating apps match on preferences, not character, so people waste 2–3 chats discovering they're incompatible.
- Here, every user has a personal AI agent built from their own **knowledge graph**: what they like, value and believe, their stories, and **how they text** (emoji use, mixed languages like Hindi-English, laugh style, message length).
- After a mutual like, the two users' agents hold the first conversation in each person's real voice. Each agent learns about the other person only from that chat, then a separate judge decides for its own user: Compatible / Maybe / Not compatible, with quoted evidence.
- If both sides say yes, the humans take over and see a short "why" card. There is **no percentage score anywhere**.
- Trust matters: liveness and photo verification at signup, fake-profile checks, privacy levels on every fact (public / only if asked / private), and users can read everything their agent said.
- Audience: people aged 21–34 in Indian cities. Bilingual, mobile-first, used to Hinge and Bumble.

## Visual direction
Propose **3 distinct directions** first, each shown on the landing hero and the match room. I'll pick one, then you design the full set in it.

Avoid the "AI look":
- no purple-to-blue gradients
- no glassmorphism everywhere
- no generic Inter-on-white cards
- no robot or sparkle icons for the agent
- no neon glows

Starting ideas (push further or replace them):
- **A. "Ink & Paper":** warm cream paper, deep ink, one tomato-red accent, editorial serif headlines, hand-drawn underlines and ink-stroke animations. The agent is shown as an ink pen or quill that writes. Tactile, literary, romantic without being cheesy.
- **B. "Night Market":** dusky indigo-to-plum night tones with warm marigold and chai-amber lights, soft 3D lantern shapes, playful rounded display type. Inspired by Indian evening streets.
- **C. "Clay":** soft 3D claymorphic objects (rounded, matte, slightly squishy) on calm pastel grounds, chunky friendly type, objects that squash and bounce on interaction.

## Typography (free fonts only: Google Fonts or Fontshare)
- Use a characterful display face for headlines, for example **Fraunces**, **Instrument Serif**, **Clash Display** or **Gambetta**.
- Use a clean, warm sans for UI and body text, for example **Satoshi**, **General Sans** or **Manrope**.
- Use a mono or handwritten accent for the "agent's notes" and evidence quotes, for example **JetBrains Mono**, **IBM Plex Mono** or **Caveat** (sparingly).
- The type must render Hindi (Devanagari) well in chat. Pair it with a Devanagari font such as **Mukta** or **Tiro Devanagari Hindi**.
- Show a type scale (display, h1–h3, body, small, label) with sizes for mobile and desktop.

## 3D and motion (make it feel alive, but keep it fast)
- **3D knowledge graph** ("This is you"): a slowly rotating constellation or garden. The user is at the centre; 8 hubs orbit them (Who I am, Likes, Dislikes, Values & lifestyle, Goals, Stories, Opinions & humour, How I text), with fact nodes around each hub. Hover or tap brings a node forward with a label; dragging rotates the scene. Node size means importance, glow means confidence, and private facts appear as locked or frosted nodes. Show a 2D fallback for low-end phones.
- **Tilting profile cards** on Discover with layered depth (photo, name, prompts at different depths) following the cursor or the phone's gyroscope. Swipe and like with satisfying physics.
- **Agent companion:** a small abstract 3D object (not a robot) per user that idles, "thinks" (while the agent composes) and "speaks" (when a message is sent). It appears in the chat and on the user's own pages. It could be a folded paper bird, a lantern or a clay blob, depending on the direction.
- **Live chat moments:** when the agents find something in common, a small burst or connection line animates between the two avatars. A laugh produces a ripple. A disagreement shows two shapes gently pushing apart, then settling when it's resolved.
- **Verdict reveal:** a short cinematic moment (≤ 1.5 s), e.g. an envelope unfolding into the "why" card. Different for Compatible, Maybe and Not compatible; the last should be kind, not dramatic.
- **The reveal at handoff:** "The first 14 messages were handled by your agents. From here, it's you two." The agent companions step back and fade, and the input field "unlocks".
- **Micro-interactions:** buttons press with depth; page transitions use shared-element morphs (a match card morphs into the match room); typing indicators match the visual direction (ink dots, lantern flicker, clay bounce).
- **Rules:**
  - Respect `prefers-reduced-motion` (show static alternatives).
  - Animations under 400 ms for UI and ≤ 1.5 s for hero moments.
  - Target 60 fps on a mid-range Android phone.
  - 3D only where it adds meaning: the graph, cards, companion and hero.

## Screens to design (mobile 375 px and desktop 1440 px, plus empty, loading and error states)
1. **Landing:** a hero with 3D, "how it works" in 4 steps (Verify → Your agent learns you → Agents talk first → You meet with reasons), trust and privacy points, CTA.
2. **Sign up:** fields plus a **required consent checkbox**: "Early conversations with your matches may be handled by AI agents, including yours." Include a link to "How the agent works".
3. **Verification:** a camera frame with a random 2–3-step liveness challenge ("Turn left… now smile"), live guidance, progress, success, and a clear note that the photos are deleted after the check. Then the "Verified" badge.
4. **Onboarding (multi-step, delightful, not a form dump):**
   - Identity: job/studies, languages.
   - Personality: 20 quick statements rated 1–5 as tappable chips.
   - Values and lifestyle: each question needs an answer, an importance pick (nothing pre-selected) and "In a partner I'd accept" as multi-select chips. Show a dealbreaker state.
   - At least 4 stories, with example placeholders, including "something you'll argue about and how strongly".
   - Interests as chips with intensity.
   - 15 "How would you reply?" messages shown as a chat UI: the user types as they normally text, emojis and Hinglish welcome.
   - Use a progress metaphor that fits the direction.
5. **"This is you":** the review screen with the 3D graph and a list view. Each fact has edit, delete and a privacy toggle (public / only if asked / private). Include a "Which is right?" contradictions card, plus the **"How I text"** section with readable style chips ("Mixes Hindi & English ~35%", "Top emojis 😂🔥", "Laughs: hahaha", "Short replies ~8 words"), each correctable.
6. **Discover:** the tilting card deck; Like / Pass; a verified badge; "it's a match" moment ("Your agent is checking their profile…").
7. **Matches list:** status chips (Checking · Agents chatting · Compatible · Maybe · Not compatible · Flagged · You're chatting) and a live indicator when agents are talking.
8. **Match room (the hero screen of the demo):** desktop has 3 panels; mobile uses tabs.
   - **Left:** trust check result and brief, plus an agenda checklist ticking off live.
   - **Centre:** the live chat. My agent's messages carry a subtle "sent by your agent" mark only I see; there's a big **Take over** button and an "I wouldn't say that" action on my agent's messages.
   - **Right:** "What my agent is noticing": my notes about them, appearing live with quotes; the interest meter; chat moments (shared interest, laugh, disagreement).
9. **Verdict / "why" card:**
   - **Compatible / Maybe:** 2–3 things that clicked (each with a quote), 1–2 things to explore, unknowns that matter. **No percentage.** Actions: Continue as myself / Pass. Then date ideas and icebreakers.
   - **Not compatible:** kind wording, a "Talk anyway" override, and the transcript.
10. **Chat replay:** the full agent transcript with evidence moments highlighted; tap a "why" point to jump to its quote.
11. **Inbox ("Ask my human"):** questions from my agent ("Do you actually like trekking?"), with a quick answer UI and a toast: "Your agent learned something new".
12. **Settings:** agent mode (Off / Shadow / Auto, explained simply), "Learn my voice from my chats" toggle, privacy defaults, re-verify, delete account.
13. **Flagged / fake-profile warning:** calm, protective, with the reasons shown.

## Deliverables
- **Design system:**
  - colour tokens for light and dark mode, with AA contrast checked
  - the type scale
  - spacing, radius and elevation/depth tokens
  - the icon style
  - the agent-companion states (idle, thinking, speaking)
  - motion tokens (durations, easings, springs)
- **Components:** buttons, chips (incl. multi-select and importance), inputs, the chat bubble set (mine / mine-by-agent / theirs / system / evidence quote), status chips, cards, toasts, modals, a tabs-to-panels layout, privacy toggle, verified badge, contradiction card, style chip.
- **All screens above,** mobile and desktop, with key states.
- **A motion and 3D spec** per hero moment: what moves, duration, easing, and the reduced-motion fallback.

## Build constraints (so it can be implemented as-is)
- React + Vite + Tailwind CSS v4.
- Motion (Framer Motion) for animation.
- react-three-fiber + drei for 3D; react-force-graph-3d is acceptable for the graph.
- Free fonts only.
- No paid assets. Avatars in the demo use DiceBear or abstract shapes, never real people's photos.
- Performance budget: 3D scenes lazy-loaded; first meaningful paint under 2 s on 4G; the 2D fallback is automatic on weak devices.
- Accessibility: keyboard navigation, focus states, labels, `aria-live` for new chat messages, AA contrast.

---

## After the design is final, prompt for Claude Code
```text
Read plan/20-ui-design-brief.md and the exported Claude Design files I've placed in
design/ (or the design link I'll paste). Rebuild the client to match the design exactly:
- Implement the design tokens as CSS variables + Tailwind v4 theme.
- Load the fonts and build the components.
- Add Motion and react-three-fiber/drei (approved dependencies).
- Lazy-load the 3D scenes with a 2D fallback, and respect prefers-reduced-motion.
Keep every existing API call, route and behaviour; this is a visual rebuild only. Work
screen by screen in this order: tokens and components → match room → verdict card →
"This is you" graph → onboarding → discover → the rest. After each screen: run the app,
check 375 px and 1440 px with screenshots, fix issues, commit, and stop for my "go".
```
