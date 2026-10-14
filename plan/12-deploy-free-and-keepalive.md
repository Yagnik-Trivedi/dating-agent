# 12 — Deploy on free tiers + keep Render alive 24/7

> **Prompt for Claude Code:** Read `CLAUDE.md`, then add the deployment config and the keep-alive bot below. You can't click dashboards, so produce the files plus a precise checklist (`DEPLOY.md`) for the human. Run the local acceptance checks.

## Free-tier facts we design around

- **Render Free web service:**
  - spins down after **15 minutes without inbound traffic**
  - takes ~30–60 s to wake
  - may restart at any time
  - has an ephemeral filesystem
- **Render hours:** 750 free instance hours per workspace per month. One service running 24/7 uses ~720–744, so **only ONE free service** can stay up. Never add a second free Render service to the same workspace, or the hours run out and all free services suspend until next month.
- **Render traffic:** may suspend free services with unusually high outbound traffic. One ping every 10 minutes is negligible.
- **WebSockets:** Socket.IO falls back to HTTP long-polling automatically, so chat works either way. Keep the default transports (`['polling', 'websocket']`).
- **GitHub Actions:** scheduled workflows are free on public repos. They can run late during busy periods, and GitHub disables them after 60 days without repo activity. That's fine through Dec 15 if we commit by late October.
- **Judging runs Dec 1–15.** The app and the credits must survive until then.

## 1. Render blueprint: `render.yaml` (repo root)

```yaml
services:
  - type: web
    name: dating-agent-api
    runtime: node
    plan: free
    region: singapore
    rootDir: server
    buildCommand: npm ci
    startCommand: node src/index.js
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: NODE_ENV
        value: production
      - key: NODE_VERSION
        value: "22"
      - key: KEEPALIVE_SELF_PING
        value: "true"
      - key: MONGODB_URI
        sync: false
      - key: JWT_SECRET
        sync: false
      - key: CLIENT_URL
        sync: false
      - key: NEBIUS_API_KEY
        sync: false
      - key: NEBIUS_BASE_URL
        value: https://api.tokenfactory.nebius.com/v1/
      - key: MODEL_FAST
        sync: false
      - key: MODEL_MID
        sync: false
      - key: MODEL_SMART
        sync: false
      - key: MODEL_EMBED
        sync: false
      - key: TAVILY_API_KEY
        sync: false
      - key: ADMIN_TOKEN
        sync: false
```

## 2. Keep-alive bot: three independent layers

Any one of them is enough. Together they cover each other's gaps.

### Layer 1 — Server self-ping (`server/src/keepalive.js`, started from `index.js`)
- If `KEEPALIVE_SELF_PING=true` and `RENDER_EXTERNAL_URL` is set (Render sets it automatically), call `fetch(`${RENDER_EXTERNAL_URL}/health`)` every **10 minutes**, with a 30 s timeout. Log only failures.
- The request goes out to the public URL and comes back in as inbound traffic, which resets the 15-minute idle timer.
- Its weakness: it can't wake a service that's already asleep. That's what layers 2 and 3 are for.

### Layer 2 — cron-job.org (external, primary waker)
Document this for the human in `DEPLOY.md`:
- Create a job hitting `https://<service>.onrender.com/health` every **10 minutes**, with a 30 s timeout.
- Turn on failure notifications to the team email.

### Layer 3 — GitHub Actions backup (`.github/workflows/keep-alive.yml`)
```yaml
name: keep-alive
on:
  schedule:
    - cron: "*/10 * * * *"
  workflow_dispatch: {}
jobs:
  ping:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Ping Render health endpoint (retries cover cold starts)
        env:
          HEALTH_URL: ${{ secrets.RENDER_HEALTH_URL }}
        run: |
          for i in 1 2 3 4; do
            if curl -fsS --max-time 60 "$HEALTH_URL"; then echo " ok"; exit 0; fi
            echo "attempt $i failed, retrying in 20s"; sleep 20
          done
          exit 1
```
The human adds the repo secret `RENDER_HEALTH_URL` (Settings → Secrets and variables → Actions).

### `/health` rules (already from plan 02)
- No DB or LLM call, so pings cost nothing.
- Add `GET /health/keepalive-status` returning `{ lastSelfPingAt, uptimeSeconds, startedAt }` so the team can see whether the service restarted.

## 3. Frontend on Vercel (Hobby, free)
- Project root `client/`, framework Vite, build `npm run build`, output `dist`.
- Env: `VITE_API_URL=https://<service>.onrender.com`
- `vercel.json` SPA rewrite already exists (plan 02).
- Then set `CLIENT_URL` on Render to the Vercel URL. Support comma-separated values for preview URLs.

## 4. Production hardening (code)
- `app.set('trust proxy', 1)` so rate limiting sees real IPs behind Render.
- Socket.IO CORS uses the same `CLIENT_URL` list.
- **Cold-start UX on the client:** if `/health` takes more than 3 s, show a friendly "Waking up the server…" screen with retry. This matters if keep-alive ever fails during judging.
- **Production log level:** errors plus one line per LLM call (purpose, tokens). No prompt contents.
- **Credit guard for judging:** tighten `LLM_DAILY_CALLS_PER_USER` for new signups (e.g. 150). Seed accounts are exempt from per-user caps but count toward the global cap.

## 5. Demo accounts for judges
- `seed/README.md` lists 2 judge accounts (e.g. `judge1@demo.local`), pre-onboarded, each with 2–3 matches in different states (one compatible with a report, one mid-conversation, one flagged).
- `scripts/seed.js --judges` creates them idempotently.
- Put the credentials in the Devpost "testing instructions" field only, **not** in the public README.

## 6. `DEPLOY.md` (write this for humans)
A numbered checklist:
1. Atlas network access.
2. Render: New → Blueprint → select the repo, then fill the secret env vars.
3. First deploy, and check that `/health` works.
4. Vercel import plus the env var.
5. Update `CLIENT_URL` on Render.
6. cron-job.org job.
7. GitHub secret plus a manual run of the `keep-alive` workflow.
8. Run `node scripts/seed.js` and `--judges` against production Mongo (from a laptop with the prod URI).
9. Smoke test the full flow on the live URL from a phone.
10. A weekly checklist until Dec 15: credits remaining, Render hours used this month, keep-alive logs, Atlas storage under 512 MB.

## Acceptance checks (local)
- [ ] `render.yaml` is valid YAML. `node src/index.js` works with `NODE_ENV=production`.
- [ ] With `KEEPALIVE_SELF_PING=true` and `RENDER_EXTERNAL_URL=http://localhost:5000`, the self-ping logs and `/health/keepalive-status` updates. Use a 1-minute interval via env for testing.
- [ ] `keep-alive.yml` passes `actionlint` if available (or a careful manual review).
- [ ] The client shows the wake-up screen when the API is slow. Test by adding an artificial delay.
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `chore(plan-12): free-tier deploy config and keep-alive bot`
