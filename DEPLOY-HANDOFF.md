# Deploy handoff (quick version)

Full steps are in [DEPLOY.md](DEPLOY.md). This is the short checklist for whoever deploys.

## Before you start
- Deploy from the `main` branch. Never commit `.env`, and never paste keys into chat or into the repo.
- Get the `.env` values from Yagnik privately: the NVIDIA key (temporary until plan 14), the Atlas URI, `JWT_SECRET`, `TAVILY_API_KEY`, `SEED_PASSWORD`, `JUDGE_PASSWORD`.

## 1. MongoDB Atlas (M0)
- Network Access: allow `0.0.0.0/0`, because Render's IPs change.
- Copy the `mongodb+srv://` URI into `MONGODB_URI`.

## 2. Render (API): exactly ONE free web service
- Go to New → Blueprint and pick this repo. `render.yaml` sets up everything.
- Fill in every `sync: false` env var with the value from `.env`.
- Set `CLIENT_URL` to the Vercel URL once you have it, then redeploy.
- Check: `https://<render-url>/health` returns ok.

## 3. Vercel (web)
- Import the repo. Root directory: `client`. Framework: Vite.
- Env: set `VITE_API_URL` to the Render URL.
- The SPA routes need the rewrite to `index.html`. It's in DEPLOY.md if Vercel 404s on refresh.

## 4. Seed production
Run this once, from a laptop:

```bash
cd server
MONGODB_URI='<atlas uri>' node scripts/seed.js
MONGODB_URI='<atlas uri>' node scripts/seed.js --judges
```

## 5. Keep-alive
- cron-job.org: hit `https://<render-url>/health` every 10 min.
- GitHub → Settings → Secrets: add `KEEPALIVE_URL` (see `.github/workflows/keep-alive.yml`).

## 6. Smoke test on the live URL
1. Sign up a new user, then finish onboarding.
2. Log in as `judge1@demo.local`, open Matches, and open a finished match and the mid-chat one. Test Pause and Take over.
3. Settings → Live check, on a phone and on a laptop.
4. Send us anything that breaks: the screen, the time, and the Render log lines.

## After deploy (left to do)
- Run CodeRabbit and fix what it finds.
- Plan 14: switch to Nebius Token Factory. This is `.env` only; see `plan/14-switch-to-nebius.md`.
- Fill in the `TODO(deploy)` spots in README.md and SUBMISSION.md: the URL, model IDs and team.
