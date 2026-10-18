# 19 — Live check (cut-down verification)

> **Owner decision, 2026-10-18:** build a cut-down version of plan 18 §1. This replaces the 2026-10-17 "not for Claude Code" decision.
> **Optional feature with a hard cut-off:** if the acceptance checks don't pass by **Oct 25, end of day**, set `LIVE_CHECK_ENABLED=false`, remove every link to the screen, and keep the no-claims rule (plans 10 and 13).
> **Effort:** about 1.5 days (backend ½, client ½, testing ½).

## What it proves, and what it doesn't
- **Proves:** a real person was on camera **just now** and did 2 random moves in the right order. That stops bots, mass fake signups, and replays of a photo or an old video.
- **Doesn't prove:** that the profile photos are theirs, or who they legally are.
- **Copy:**
  - The name is **"Live-checked"**.
  - Never write "verified", "photo verified", "ID verified" or "every profile is checked".
  - Badge tooltip: *"A live camera check showed a real person made this account. It doesn't check their photos or ID."*
- **Bonus for judging:** the server's decision uses **NVIDIA Nemotron Nano 2 VL**, a second NVIDIA open model family in the app.

## What's dropped from plan 18 §1, and why
- **Selfie ↔ profile-photo face match:** dropped.
  - Profile photos are just URLs; there's no upload.
  - Seed and demo users have no real faces to match.
  - A server-side face-embedding model on Render's free 512 MB was never benchmarked.
- **Blink:** dropped. A blink can't be judged reliably from still frames.
- **"Required before your agent can chat":** deferred. The check is optional; an unchecked account is never a red flag.
- **Email OTP, device attestation:** deferred.

## Flow
1. **Consent screen.** A required checkbox, with the draft copy:
   > **Live check.** You'll do 2 quick moves on camera. We take one still photo per move and send them to our AI provider (NVIDIA / Nebius) to confirm a real person did them, in order. We don't keep the photos or any face data, only the result. This shows you're a real person. It doesn't check your profile photos or your ID.
2. **`POST /api/live-check/start`** (auth):
   - Creates a `LiveCheckChallenge`: `{ userId, nonce (crypto random), actions, expiresAt, usedAt }`, with a TTL index on `expiresAt`.
   - `actions` = `['neutral', a, b]`, where `a` and `b` are 2 distinct random picks from `turn_left`, `turn_right`, `look_up`, `smile`, in random order.
   - `expiresAt` = now + `LIVE_CHECK_TTL_S` (90).
   - Rate limit: `LIVE_CHECK_MAX_PER_DAY` (5) starts per user per day. Returns 429 after that.
3. **Client capture** (`/live-check`):
   - Front camera, 640×480.
   - **MediaPipe Face Landmarker** in VIDEO mode, with blendshapes and the facial transformation matrix, for live guidance only.
   - The preview is mirrored with CSS only. Captured frames are drawn **unmirrored** from the raw video to a canvas.
   - **Thresholds** (all in one config object):
     - neutral: |yaw| and |pitch| < 8°
     - turn: |yaw| > 20° in the right direction
     - look up: pitch > 15°
     - smile: average of `mouthSmileLeft` and `mouthSmileRight` > 0.6
     - each pose must be held for 300 ms, with exactly one face in frame
   - **Capture:** one JPEG per action at the moment it's held. Max 640 px, quality 0.8, ≤ 120 KB.
   - **Timeline:** `{ t, yaw, pitch, smile }` at 10 Hz, at most 300 points.
   - **Timeouts:** 15 s per action, and the whole challenge must finish before `expiresAt`.
   - **Fallbacks:** no camera or permission denied → explain it calmly and offer "Skip for now". Under reduced motion, use text and icon guidance with no animation. Announce each step with `aria-live`.
4. **`POST /api/live-check/finish`** (auth). Allow a body of up to 1 MB on this route only.
   - Body: `{ challengeId, nonce, frames: [{ action, capturedAt, jpegBase64 }], timeline }`.
5. **Server checks, cheap code first** (reject early and never call the model if any of these fail):
   - The challenge exists, belongs to this user, isn't expired, and is **atomically** marked used (`findOneAndUpdate` with `usedAt: null`). A reused nonce gets a 409.
   - Frames match the actions exactly and in order. `capturedAt` is increasing, inside the window, with gaps ≥ 300 ms.
   - Each frame starts with the JPEG magic bytes, is ≤ 120 KB, and there are ≤ 3 frames in total.
   - Sanity check the timeline: around each frame's `capturedAt`, the timeline crosses the threshold for that action. Only a weak signal: a mismatch fails the check but is logged as `timeline_mismatch`.
6. **ONE vision call:**
   - Settings: tier `vision`, model `MODEL_VISION`, temperature 0, JSON output.
   - Images are labelled F1…F3 in order.
   - Output: per frame `{ faceCount, facing: center|image_left|image_right|up|down, smiling, screenOrPrintSigns, signs }`, plus `samePersonAllFrames: yes|no|unclear`.
   - Prompt rules:
     - The images are from the camera's point of view.
     - Describe only pose, smile, face count and signs of a screen or printed photo (bezels, moiré, glare on glass, paper edges, flat lighting).
     - **Never** estimate or mention age, gender, race, emotion beyond a smile, attractiveness or identity.
   - If the model doesn't accept several images per request, make one call per frame and skip `samePersonAllFrames`. Step 1 decides this.
7. **The decision is made in code**, as a pure, unit-tested function:
   - **Pass** only if:
     - every frame has `faceCount == 1`
     - every frame faces the expected way: neutral → `center`; `look_up` → `up`; turn left/right → the mapped `image_*` side
     - the smile frame has `smiling == true`
     - no frame has `screenOrPrintSigns`
     - `samePersonAllFrames != 'no'`
   - **Left/right mapping:** in an unmirrored frame, a user turning to *their* left appears facing `image_right`. **Confirm this with real samples in step 1** before trusting it; it's easy to get backwards.
   - **Model unavailable or timed out:** the result is `error`, not `failed`. The attempt doesn't count, and the user sees "Try again in a few minutes". **Never pass without the model.**
   - Failure reasons are codes (`wrong_direction`, `no_smile`, `faces`, `screen_signs`, `different_person`, `timeline_mismatch`, `expired`). Show the user a kind, specific retry hint.
8. **Delete and record:**
   - Frames live only in request memory. They are **never** written to the DB, disk, logs or the LLM usage log. Make sure the error paths in `llm/client.js` can't print the image content.
   - Store on `User.liveCheck`: `{ status: none|passed|failed, checkedAt, model, actions, attempts: [{ at, result, reason }] }`, keeping the last 5 attempts.
   - Public `Profile`: `liveChecked: Boolean`, `liveCheckedAt`.
   - **Never store** images, embeddings or landmark data.

## Effects in the app
- **Badge:** "Live-checked" on discover cards, the match room header and the public profile, with the tooltip above.
- **Trust check (plan 06):** gets `liveChecked` from the other user's **public** profile as one small positive input. It never cancels a scam signal. "Not checked" is never a flag.
- **Agents and judges:** never mention it in conversation. Only the public boolean may be read across users; `User.liveCheck` never is. Extend the DB-spy boundary test to cover this.
- **Seed and judge accounts:** **never** set `liveChecked: true` in seed data, because that would be a fake claim. Judges can run the check themselves on a judge account.

## Config (all in `config/env.js` and `.env.example`)
- `LIVE_CHECK_ENABLED` (default `true` in dev).
- `MODEL_VISION`: default `nvidia/nemotron-nano-12b-v2-vl` on NVIDIA. On Token Factory, pick the Nemotron Nano 2 VL ID from `GET /v1/models` (plan 14 checklist).
- `LIVE_CHECK_MAX_PER_DAY` (5), `LIVE_CHECK_TTL_S` (90).
- `LLM_PRICE_VISION`.
- The vision tier goes through the same rate limiter, `LLM_HARD_CAP_USD` budget and `LLM_ENABLED` switch as the other tiers.

## Dependencies (approved by the owner here)
- Client: `@mediapipe/tasks-vision` (Apache-2.0).
  - Self-host the WASM files and `face_landmarker.task` under `client/public/mediapipe/`, with no runtime CDN.
  - Lazy-load them only on `/live-check`.
- **No new server dependencies:** images go through the existing OpenAI-compatible client as `image_url` content parts with `data:` URLs.

## Client scope
- A **functional, plain** `/live-check` screen, plus the badge component. This is new UI, not a restyle of existing screens.
- Final styling comes from the owner's design export with plan 10.
- Settings: "Live check: Not done / Passed on <date> / Try again".

## Tests and checks
- **Unit:** the decision function. Mocked vision outputs for: pass; wrong direction; 2 faces; screen signs; different person; missing smile; model error.
- **Routes:**
  - a reused nonce → 409
  - expired, another user's challenge, wrong order or an oversized frame → 400
  - the 6th start in a day → 429
  - `error` isn't counted as an attempt
  - `LIVE_CHECK_ENABLED=false` → 404
- **Boundary:** the DB-spy test proves agents and judges read only `Profile.liveChecked`.
- **Privacy:** after `finish`, no collection holds image bytes, and the LLM usage log has no base64.
- **Manual script `npm run live-check:vision`:**
  - Runs the vision prompt on JPEGs in `server/scripts/live-check-samples/` and prints the per-frame JSON. That folder is **gitignored**; the owner adds their own selfies.
  - Use it to confirm the left/right mapping and that a photo shown on a phone gets `screenOrPrintSigns`.
- **Human acceptance:**
  - The owner passes on a laptop and on a phone.
  - Holding up a phone or a printed photo fails.
  - Replaying a recording of an earlier attempt fails (the moves are different).

## Acceptance
- [ ] `npm test` is green, including the new tests. CI is green.
- [ ] `live-check:vision` gets the right left/right on the owner's samples, and flags the screen photo.
- [ ] The human acceptance checks above pass.
- [ ] Median time from start to result is ≤ 25 s. The vision call's p50 and p95 latency are recorded in `PROGRESS.md`.
- [ ] No image bytes in the DB, logs or usage log (test + manual grep).
- [ ] Copy says "Live-checked" with the exact tooltip. A search shows no "verified" claims in `client/`, the README or the landing copy.
