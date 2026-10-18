# Deploying (free tiers only)

A checklist for the team. Claude Code can't click dashboards, so a human does these steps. Everything is free; nothing
needs a credit card except the Nebius account (plan 14), which runs on promo credits.

**Do this after plan 14** (the switch to Nebius Token Factory). Seeding production spends credits, so do it once,
on the final provider.

| Piece | Where | Free-tier limit to respect |
|---|---|---|
| API (Express + Socket.IO + job worker) | Render Free web service, from `render.yaml` | Sleeps after 15 idle min; 750 h/month per workspace = exactly **one** service running 24/7. Never add a second free service. |
| Web app (Vite build) | Vercel Hobby, `client/` | — |
| Database | MongoDB Atlas M0 | 512 MB |
| Keep-alive | self-ping + cron-job.org + GitHub Actions | — |

## One-time setup

1. **Atlas**
   - Fix the database user's login. It currently fails, so every check so far ran on the local replica set.
   - Under Network Access, allow `0.0.0.0/0`. Render's outbound IPs aren't fixed on the free plan.
   - Copy the `mongodb+srv://…` URI.
2. **Render:** New → Blueprint → select this repo. `render.yaml` creates `dating-agent-api` (free, Singapore).
   Fill every `sync: false` variable in the dashboard:
   - **Database and auth:**
     - `MONGODB_URI`: the Atlas URI.
     - `JWT_SECRET`: 32+ random characters.
     - `ADMIN_TOKEN`: random; protects `GET /api/admin/usage`.
   - **`CLIENT_URL`:** leave it for now (step 5).
   - **Nebius:**
     - `NEBIUS_API_KEY`
     - `MODEL_FAST`, `MODEL_MID`, `MODEL_SMART` and `MODEL_EMBED`: the IDs from `node scripts/smoke.js` (plan 14).
   - **Prices:** `LLM_PRICE_FAST`, `LLM_PRICE_MID`, `LLM_PRICE_SMART` and `LLM_PRICE_EMBED`, each as `input,output` USD per 1M tokens from the Nebius pricing page. Without prices, the $35 all-time cap (`LLM_HARD_CAP_USD`) can't count spend.
   - **`TAVILY_API_KEY`:** optional. Without it, date ideas return a friendly 503.
3. **First deploy**
   - Open `https://<service>.onrender.com/health`: it should return `{"ok":true,…}`.
   - `/health/deep` shows the Mongo connection.
   - `/health/keepalive-status` shows `lastSelfPingAt` about 10 min after start.
4. **Vercel:** Add New → Project → this repo.
   - Root directory: `client`. Framework: Vite. Build command: `npm run build`. Output: `dist`.
   - Env: `VITE_API_URL=https://<service>.onrender.com`.
5. **`CLIENT_URL` on Render:** set it to the Vercel URL, comma-separated if preview URLs need access too. Saving redeploys.
6. **cron-job.org** (the primary waker):
   - Create a job that hits `https://<service>.onrender.com/health` every 10 minutes, with a 30 s timeout.
   - Turn on failure emails to the team.
7. **GitHub Actions** (the backup waker):
   - Under Settings → Secrets and variables → Actions, add the secret `RENDER_HEALTH_URL` = `https://<service>.onrender.com/health`.
   - Under Actions → keep-alive → Run workflow, run it once and check that it's green.
8. **Seed production** from a laptop, with the production values in `server/.env` (never committed):
   ```bash
   cd server
   MONGODB_URI='<atlas uri>' node scripts/seed.js                # 38 personas, ~30 min, spends credits
   MONGODB_URI='<atlas uri>' JUDGE_PASSWORD='<pick one>' node scripts/seed.js --judges   # 2 judge accounts, ~1 h
   ```
   - `--judges` reports any demo state that no real run reached. Re-run it to try the remaining partners. It never re-runs a partner that already has a match.
   - Put the judge logins (`judge1@demo.local`, `judge2@demo.local` + `JUDGE_PASSWORD`) **only** in Devpost's private testing instructions, never in the README.
9. **Smoke test on a phone** against the live URL: signup → onboarding → discover → match → agent chat → report. Then log in as a judge, open the frozen match, and watch a few live turns.

## Weekly until Dec 15 (end of judging)

- **Credits left:** `GET /api/admin/usage` with the admin token shows today's calls and the all-time USD against the cap.
- **Render:** instance hours used this month. One service should be about 720–744 h; never more than one service.
- **Keep-alive:** cron-job.org failure emails, plus the keep-alive workflow runs on GitHub. GitHub disables scheduled workflows after 60 days with no repo activity; a commit by late October covers Dec 15.
- **Atlas:** storage stays under 512 MB (about 88 KB per user).

## If something breaks during judging

- **Spend cap reached** (`LLM_HARD_CAP_USD`): agents pause and the app shows a banner. The judge accounts' finished matches still work, because they need no LLM calls.
- **Daily live-chat cap** (`JUDGE_LIVE_CHATS_PER_DAY`, default 2): a third new match shows "your agent will start this chat tomorrow". That message is expected, not an error.
- **Kill switch:** set `LLM_ENABLED=false` on Render. AI calls stop immediately.
