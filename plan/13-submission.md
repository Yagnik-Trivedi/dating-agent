# 13 — Submission: README, video, Devpost write-up

> **Prompt for Claude Code:** Read `CLAUDE.md` and `server/eval/results.md`, then write the final `README.md` and `SUBMISSION.md` (Devpost text, ready to paste). No new features. Run the final checklist.

## 1. `README.md` (public repo)

Sections, in order:
1. **Title + one-line pitch.** Badges: MIT license, live demo link.
2. **The problem:** 3 sentences.
3. **How it works:** a 4-step diagram (Trust check → Understand the match → Agent pre-chat → Verdict with receipts), plus one screenshot or GIF of the match room.
4. **Live demo:** the URL. Say that judge credentials are in the Devpost testing instructions.
5. **How we use NVIDIA Nemotron + Nebius Token Factory** (required by the rules; make it specific):
   - a table of each task → model (Nano / Super / Ultra / embedding) → why that tier
   - the reasoning-model handling (token headroom, stripping)
   - the budget guard and usage logging
   - how Token Factory helped: one OpenAI-compatible API for chat and embeddings, fast iteration, tiered cost
6. **Architecture:** MERN plus Socket.IO plus the knowledge graph in Mongo. A short component list and the data model summary.
7. **Knowledge graph:** facts as triples with confidence, evidence quotes and disclosure tiers; how the agent grounds every self-claim.
8. **Evaluation:** the headline numbers from `eval/results.md`, the confusion matrix, cost per pair, and a link to the transcripts.
9. **Safety and consent:** consent at signup, `authoredBy` audit and the reveal, take over, the honest-if-asked rule, scam detection, no inference of sensitive attributes, SFW, delete-my-data.
10. **Honest limits:** compatibility prediction before meeting is weak in research, so we filter mismatches and fakes rather than claim to predict love. Also: synthetic eval data, and English/Hinglish only.
11. **Setup:** clone; env vars (link `.env.example`); `npm i`; `npm run dev`; seed; eval.
12. **Deploy:** link `DEPLOY.md`. Note that it runs entirely on free tiers.
13. **Team** + license.

## 2. `SUBMISSION.md` (paste into Devpost)

- **Track:** Best Apps & Agents.
- **Inspiration / What it does / How we built it / Challenges / Accomplishments / What we learned / What's next.** Keep each section short and concrete.
- **Built with:** nvidia-nemotron, nebius-token-factory, tavily, mongodb, express, react, node.js, socket.io, vite, tailwindcss.
- **Testing instructions:** the live URL, both judge accounts, and what to try in 2 minutes ("open Matches → 'Aarav' to see a finished report with receipts; 'Meera' is mid-conversation, so press Take over").
- **Feedback for Nebius / NVIDIA** (it's a separate prize — be specific and constructive):
  - onboarding experience
  - reasoning output and `max_tokens` behavior
  - model catalog discoverability
  - latency per tier
  - docs gaps you hit
  - what would make Token Factory easier for agent builders
- **Existing project?** No. Built during the submission period.

## 3. Video (≤ 3:00, public YouTube; judges may stop at 3:00)

| Time | Shot |
|---|---|
| 0:00–0:20 | The problem: "matched on preferences, found out three chats later you're not compatible." |
| 0:20–0:45 | Sign up with **consent shown**; onboarding; your knowledge graph appears; privacy tiers |
| 0:45–1:05 | Like a profile → trust check catches a **fake** (scam quotes highlighted) |
| 1:05–2:00 | Match room: the agent chats in your voice; the live graph fills in; the agenda ticks off; "ask my human" pops into the inbox; you answer and the agent uses it |
| 2:00–2:30 | Report: the verdict with receipts (click a reason → the message highlights); one compatible and one not compatible with the wind-down |
| 2:30–2:50 | Continue as myself → the reveal → date ideas from Tavily |
| 2:50–3:00 | Architecture plus Nemotron routing plus eval numbers on one slide |

Use royalty-free music or none, and no third-party trademarks or copyrighted music. Record at 1080p. Do the voice-over after the edit.

## 4. Final checklist (Oct 28–29)

- [ ] The repo is public, MIT shows in About, and the README is complete.
- [ ] No secrets in git history (`git log -p | grep -i "api_key\|mongodb+srv"` finds nothing).
- [ ] The live URL works on a phone, logged out → signup → full flow.
- [ ] Judge accounts work; their states are as described in the testing instructions.
- [ ] The video is public, under 3:00, and its link is in the form.
- [ ] Track selected; feedback section filled; "built with" tags added.
- [ ] Teammates added to the Devpost project.
- [ ] **Submitted by Oct 29.** Take a screenshot of the confirmation.
- [ ] Keep-alive running; a credit check is scheduled weekly until Dec 15.

**Commit:** `docs(plan-13): README, submission text`
