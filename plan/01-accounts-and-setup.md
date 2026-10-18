# 01 — Accounts and local setup (HUMANS do this, not Claude Code)

Everything here is free. Nothing should ask for a credit card. If something does, stop and pick the alternative listed.

## A. Accounts (Day 1)

### 1. Devpost
- [ ] Everyone registers at https://nebiusglobalaihackathon.devpost.com/ (click **Join hackathon**).
- [ ] Pick the **Representative**. They create the project draft and invite the other three. Prizes are paid to the Representative.

### 2. Nebius Token Factory (most important — do it first)
- [ ] Sign up at https://tokenfactory.nebius.com/
- [ ] **Confirm billing / country setup works from India.** Some countries aren't supported yet. If you're blocked, post in the Nebius Discord (https://discord.gg/eXYTGhgnhK) on day 1, not day 10.
- [ ] Redeem $25 in credits through the form on the hackathon Resources page, with activation code `NEBIUS-DEVPOST-GLOBAL26`.
- [ ] Join the Nebius Builders Program (https://dev.nebius.com/builders) for another $25 plus Tavily credits.
- [ ] Create an API key. Share it with the team privately (a password manager or DM), **never in git**.
- [ ] Optional: each teammate can redeem their own credits on their own account for a separate dev key, so the shared production key keeps its credits for the deployed app and judging.

### 3. Tavily
- [ ] Sign up at https://tavily.com and create an API key (free tier, or Builders Program credits).

### 4. MongoDB Atlas
- [ ] Sign up at https://www.mongodb.com/cloud/atlas and create a **Free (M0)** cluster in the region closest to Render's (Singapore if available).
- [ ] Database Access: create a user with a strong password.
- [ ] Network Access: add `0.0.0.0/0`. Render's free tier has no static IP, so this is required.
- [ ] Copy the connection string and add the database name: `.../dating_agent?retryWrites=true&w=majority`

### 5. GitHub
- [ ] Create a **public** repo `dating-agent` with **no** README, license or .gitignore. The scaffold step adds those locally.
- [ ] Add the three teammates as collaborators.

### 6. Hosting (create the accounts now; deploy later in plan 12)
- [ ] Render: https://render.com (sign in with GitHub)
- [ ] Vercel: https://vercel.com (sign in with GitHub)
- [ ] cron-job.org: https://cron-job.org (free keep-alive pinger)

## B. Local tools (each teammate)

- [ ] Node.js 22 LTS. Check with `node -v`.
- [ ] Git. Check with `git --version`.
- [ ] Claude Code.
- [ ] MongoDB Compass (to inspect the knowledge graph visually).
- [ ] Bruno or Postman (API testing).

## C. Connect the folder to GitHub (Representative, once)

```powershell
cd D:\projects\dating-agent
git init
git branch -M main
git remote add origin https://github.com/<you>/dating-agent.git
```

Then run `plan/archive/02-scaffold.md` in Claude Code, commit, and push.

## D. Secrets you should have before plan 03

| Name | Where it goes |
|---|---|
| `NEBIUS_API_KEY` | `server/.env` |
| `MONGODB_URI` | `server/.env` |
| `TAVILY_API_KEY` | `server/.env` |
| `JWT_SECRET` | `server/.env`. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
