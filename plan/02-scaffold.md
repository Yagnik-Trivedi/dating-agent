# 02 — Scaffold the monorepo

> **Prompt for Claude Code:** Read `CLAUDE.md`, then implement everything below. Don't build features yet; this is only the skeleton. Finish by running the acceptance checks.

## Goal

A runnable empty MERN skeleton: the server answers `/health`, the client renders a placeholder page that calls it, and the repo has LICENSE, .gitignore, README stub and env examples.

## Build

### Root
- `LICENSE`: MIT, copyright `2026 dating-agent team`.
- `.gitignore`: node_modules, `.env`, `.env.*` (but not `.env.example`), dist, build, `.DS_Store`, coverage, `*.log`, `server/eval/tmp/`.
- `README.md` stub: project name, one-paragraph pitch (from `CLAUDE.md`), a "Setup" heading with TODO, and an "How we use NVIDIA Nemotron + Nebius Token Factory" heading with TODO.
- Root `package.json` (private) with scripts:
  - `dev`: runs server and client together, using `concurrently` as a root devDependency
  - `dev:server`, `dev:client`

### Server (`server/`)
- `npm init`, then set `"type": "module"`, `"engines": { "node": ">=22" }`.
- Dependencies: `express@5 mongoose socket.io openai @tavily/core dotenv cors jsonwebtoken bcryptjs zod helmet express-rate-limit`
- Dev dependencies: `nodemon`
- Scripts: `dev` (nodemon src/index.js), `start` (node src/index.js), `smoke` (node scripts/smoke.js), `seed`, `simulate`, `eval`. The last three can point at placeholder scripts for now.
- Create the folder layout from `CLAUDE.md` with a `.gitkeep` in empty folders.
- `src/config/env.js`: load dotenv and validate with zod. For now: `PORT` (default 5000), `NODE_ENV`, `CLIENT_URL`, `MONGODB_URI`, `JWT_SECRET`, `NEBIUS_API_KEY`, `NEBIUS_BASE_URL` (default `https://api.tokenfactory.nebius.com/v1/`), `MODEL_FAST`, `MODEL_MID`, `MODEL_SMART`, `MODEL_EMBED`, `TAVILY_API_KEY`.
  - Model and API vars may be optional until plan 03, but warn loudly if missing.
- `src/index.js`:
  - Express app with helmet, cors (origin = `CLIENT_URL`; allow a comma-separated list), JSON body limit 1mb
  - `GET /health` returns `{ ok: true, uptime, time }` with **no DB call** (keep-alive pings this)
  - `GET /health/deep` checks the Mongo connection state
  - Mongo connect with a retry log
  - Socket.IO attached to the same HTTP server, with the same CORS origin
  - Graceful shutdown on SIGTERM
- `server/.env.example` with every var above and placeholder values.

### Client (`client/`)
- `npm create vite@latest client -- --template react`
- Install: `react-router-dom axios socket.io-client react-force-graph-2d`, plus dev `tailwindcss @tailwindcss/vite`.
- Configure Tailwind v4 via the Vite plugin, with `@import "tailwindcss";` in `src/index.css`.
- `client/.env.example`: `VITE_API_URL=http://localhost:5000`
- `src/lib/api.js`: axios instance with `baseURL = import.meta.env.VITE_API_URL` that attaches the `Bearer` token from localStorage.
- `src/lib/socket.js`: a lazy socket.io-client factory that passes `auth: { token }`.
- Placeholder `App.jsx` with React Router: route `/` shows "dating-agent" plus the result of `GET /health`.
- `client/vercel.json`: SPA rewrite of all routes to `/index.html`.

## Acceptance checks

- [ ] `npm install` succeeds in root, server and client.
- [ ] `npm run dev` at the root starts both. `http://localhost:5000/health` returns JSON, and `http://localhost:5173` shows the health result.
- [ ] The server refuses to boot with a clear message if `MONGODB_URI` or `JWT_SECRET` is missing.
- [ ] `git status` shows no `.env` files.
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `chore(plan-02): scaffold MERN monorepo`
