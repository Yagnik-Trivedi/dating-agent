# 22 — Make it a real dating app (the agent is a layer on top)

> **Owner, 2026-10-18:** it must feel like a normal dating app (photos, prompts, likes, chat), with the AI agent built in. Start after plan 21.
> **Principle:** with agent mode **Off**, this is a complete, ordinary dating app. The agent adds the "let our agents break the ice" option on top.
> **Deadline:** P0 by Oct 23, P1 by Oct 25. Feature freeze Oct 28. Whatever isn't done by then gets cut, not rushed.

## Not building (and why)
- **A social feed, posts or stories:** the big dating apps don't have one. Hinge, Bumble and Tinder are built on photos + prompts + likes + chat. A feed needs moderation and adds nothing judges will look for.
- **Also not:** video, voice notes, payments or premium tiers, live GPS location.

## P0 — must have
1. **Photos**
   - 2–6 per profile; the first one is required. Upload, reorder (drag), delete.
   - The client crops to 4:5 and resizes to 1080 px, JPEG/WebP, ≤ 300 KB.
   - **Storage: Cloudinary free plan.**
     - The server signs each upload using `node:crypto` (no SDK); the client uploads directly to Cloudinary.
     - Store `{ publicId, url, w, h, order, moderation, createdAt }`.
     - Images load from the CDN even while Render is asleep.
     - Env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (owner adds them; never printed).
   - **Moderation:** one `MODEL_VISION` call per photo, with JSON output and the decision made in code.
     - Reject: nudity or sexual content, violence, mostly-text images, contact details, QR codes or social handles (also a scam signal for plan 06).
     - Photo 1 must show a person.
     - Never estimate age, gender, race or attractiveness.
     - Store the moderation result privately.
     - If the model is unavailable, the photo stays "pending" (visible only to its owner) and is retried by a job.
   - **Migration:** `Profile.photos` goes from `[String]` to subdocuments. Seed photos are converted.
2. **Profile editor + full profile view** (`/u/:id`, Hinge-style):
   - Photos interleaved with **3 prompts**: pick from ~30 questions, answers ≤ 150 characters.
   - Basics: age, city, height (optional), job, education, languages.
   - Existing lifestyle tags and interests.
   - Live-checked badge.
   - A completeness meter.
3. **Discover like a real app:**
   - The first photo is full-bleed; tap to move through photos; scroll for the whole profile.
   - Like / Pass.
   - **Preferences screen:** age range, show me (gender), city/distance. These already exist in `Profile`/`gate`; expose them in the UI.
4. **Like a specific photo or prompt, with an optional comment** (≤ 150 characters, Hinge's core interaction).
   - `Like` gets `target: { kind: photo|prompt|profile, id }` and `comment`.
   - On a match, the comment is the first message in the chat **and** context for both agents: the other agent opens by replying to it.
5. **"Likes you" screen:**
   - Everyone who liked you, with what they liked and their comment. Free; no paywall or blur.
   - Like back / Pass.
6. **Match choice:**
   - On a mutual like: **"Let our agents break the ice (~3 min)"** or **"Chat myself now"**.
   - The default comes from agent mode: Auto → agents, Off → chat now.
   - If either person picks "Chat myself now", it's a normal human chat. Their agents can still sit in shadow mode.
7. **Human chat like a normal app:**
   - Text and photos (same upload and moderation path).
   - Emoji, typing indicator, "Seen" read receipts, timestamps, unread badges on Matches.
   - `Message.attachments: [{ kind: 'image', url, w, h }]`.
8. **Safety:**
   - Unmatch, block and report. Report reasons: fake profile, scam, harassment, inappropriate photos, underage, other.
   - A block hides both users from each other everywhere (discover, likes, matches) and stops any agent chat at once.
   - Reports are stored and listed in the admin route.

## P1 — should have
9. **Notifications centre + toasts:** new like, new match, agents finished, new message, ask-my-human. All in-app over the existing socket.
10. **Photos → agent suggestions:**
    - The vision model suggests interests from the user's own photos, e.g. "3 of your photos look like trekking. Add 'Trekking'?"
    - A suggestion becomes a fact only when the user taps Add (`source: 'photo_suggestion'`, public).
    - It never infers sensitive attributes (religion, health, ethnicity, etc.).
11. **Edit-after-onboarding:** prompts and basics can be edited from the profile, and the graph updates incrementally through the plan 21 phase-2 job.

## P2 — only if there's time
12. Browser push notifications (Web Push with VAPID; ask the owner before adding `web-push`).

## Rules
- **Information boundary:** photos, prompts and the like comment are public profile data, so agents may use them. Moderation results, preferences and the gate are never shared. Extend the DB-spy test.
- **Seed and judge accounts:**
  - Use illustrated avatars plus photos of places and objects. **Never photos of real people.**
  - Label them "Demo profile".
  - They're exempt from the face rule for photo 1.
  - Never fake `liveChecked`.
- **Design:** build in the existing Prelude design system (plan 10 tokens and components). No new design round is needed. Check 375 px and 1440 px.
- **Dependencies:** client `react-easy-crop` (MIT) is approved for cropping. Ask before adding any other dependency.

## Acceptance
- [ ] With agent mode Off, a new user can sign up, add photos and prompts, set preferences, like a prompt with a comment, match, and chat with photos. **No agent involved.**
- [ ] With agent mode Auto, the same flow offers "Let our agents break the ice". The agents open from the like comment, and the plan 21 time targets hold.
- [ ] Moderation rejects a test explicit image (use a safe stand-in, such as a stock image the provider flags; no real explicit content in the repo), a photo containing a phone number or QR code, and a mostly-text image. It accepts normal photos.
- [ ] Block and report work both ways. Blocked users never reappear.
- [ ] `npm test`, `api-check` and CI pass. New API routes have tests. Screens are checked at 375 px and 1440 px.
