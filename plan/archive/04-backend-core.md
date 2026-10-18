# 04 — Backend core: models, auth, profiles, matching, chat (+ API contract)

> **Prompt for Claude Code:** Read `CLAUDE.md`, then implement the backend core below. This file also defines the **API contract** the frontend builds against, so follow names exactly. Agent logic is NOT part of this task, only the hooks it will plug into. Run the acceptance checks.

## Goal

Two humans can sign up (with consent), set up a profile, like each other, match, and chat in real time. All data needed by later agent steps is modelled now.

## Mongoose models (`server/src/models/`)

**User**
```
email (unique, lowercased), passwordHash, name,
consentAgent: Boolean (required true), consentAt: Date,
agentMode: 'off' | 'shadow' | 'auto' (default 'shadow'),
onboarding: { status: 'not_started'|'in_progress'|'processing'|'done'|'failed', answers: Mixed, completedAt },
styleProfile: { metrics: Mixed, description: String },
isSeed: Boolean (default false),
createdAt
```

**Profile** (one per user)
```
userId (unique), name, age, city, gender, interestedIn: [String],
photos: [String] (URLs; DiceBear for seeds),
bio: String,
prompts: [{ q: String, a: String }],     // Hinge-style prompts
tags: { interests:[String], lifestyle:{ smoking, drinking, workout, diet }, wantsKids, relationshipGoal, religionImportance },
dealbreakers: [String]
```

**KgFact** (the knowledge graph as triples; used from plan 05 on)
```
subjectId (ref User)          // who the fact is about
observerId (ref User|null)    // null = self-reported; else whose agent learned it
matchId (ref Match|null)
predicate: 'likes'|'dislikes'|'values'|'dealbreaker'|'trait'|'goal'|'story'|'style'|'lifestyle'|'background'
object: String                // "trekking", "wants kids", "extraversion"
value: Mixed                  // optional numeric/score, e.g. 0.8
weight: Number (0..1)         // importance to the subject
confidence: Number (0..1)
source: 'questionnaire'|'profile'|'conversation'|'user_answer'|'inferred'
evidence: [{ messageId, quote }]
disclosure: 'public'|'if_asked'|'private' (default 'public')
embedding: [Number] (select: false)
updatedAt
indexes: { subjectId, observerId }, { matchId }
```

**Like**: `{ fromUserId, toUserId, liked: Boolean, createdAt }`, with a unique index on (from, to).

**Match**
```
users: [ObjectId, ObjectId] (sorted), createdAt,
status: 'matched'|'trust_check'|'flagged_fake'|'briefing'|'agent_chatting'|'evaluating'
        |'compatible'|'maybe'|'incompatible'|'handed_off'|'closed',
perUser: [{ userId, agentActive: Boolean, tookOverAt: Date, decision: 'continue'|'pass'|null }],
trust: Mixed   // per side: { [userId]: { score, level, flags[] } }  (plan 06)
brief: Mixed   // per side: { [userId]: { summary, agenda[], openers[], earlyDealbreaker } } (plan 07)
agentState: Mixed // { turnCount, lastAgentAt, stopReason, runningLock } (plan 08)
report: Mixed  // per side: { [userId]: { verdict, score, reasons[], concerns[], dimensions{}, askYourself[] } } (plan 09)
```

**Message**
```
matchId, senderId, authoredBy: 'human'|'agent', text, createdAt,
meta: { usedFactIds:[ObjectId], targets:String, flagged:Boolean }
```

**InboxItem** ("ask my human")
```
userId, matchId, question, status: 'open'|'answered'|'dismissed', answer, createdAt, answeredAt
```

**Usage** and **EmbCache** already exist from plan 03.

## REST API (all under `/api`; JSON; auth = `Authorization: Bearer <jwt>` unless noted)

| Method & path | Body / query | Returns |
|---|---|---|
| POST `/auth/signup` (public) | `{ email, password, name, consentAgent }` | `{ token, user }`. Reject with 400 if `consentAgent !== true`. |
| POST `/auth/login` (public) | `{ email, password }` | `{ token, user }` |
| GET `/me` | | `{ user, profile }` |
| PUT `/me/settings` | `{ agentMode }` | `{ user }` |
| DELETE `/me` | | Deletes the user, profile, facts about them, their likes/messages/inbox; anonymizes their side of matches. `204`. |
| GET `/profile` / PUT `/profile` | profile fields | `{ profile }` |
| POST `/onboarding/submit` | `{ answers }` | `{ status: 'processing' }` (plan 05 fills the logic) |
| GET `/onboarding/status` | | `{ status }` |
| GET `/kg/me` | | `{ nodes, links }` for the graph view (plan 05) |
| PATCH `/kg/facts/:id` | `{ disclosure }` | `{ fact }`. Own self-reported facts only. |
| DELETE `/kg/facts/:id` | | `204`. Own self-reported facts only. |
| GET `/discover` | `?limit=20` | Profiles not yet liked/passed, excluding self |
| POST `/likes` | `{ toUserId, liked }` | `{ matched, matchId? }`. Mutual like creates a Match and emits a `match:new` event. |
| GET `/matches` | | List with the other person's profile summary, status, last message, unread count |
| GET `/matches/:id` | | Full match for the requesting user: their side of trust, brief and report, plus status and `agentActive` |
| GET `/matches/:id/messages` | `?before=<iso>&limit=50` | Messages, oldest first. `authoredBy` is hidden from the other user until handoff (see below). |
| POST `/matches/:id/messages` | `{ text }` | Human send. Same effect as the socket event. |
| POST `/matches/:id/takeover` | | Sets `agentActive=false` for the requester and emits `match:status` |
| POST `/matches/:id/decision` | `{ decision: 'continue'|'pass' }` | Stores the decision; if both `continue`, status becomes `handed_off` |
| GET `/matches/:id/kg` | | Facts about the other person as observed by the requester's agent (plan 07/08) |
| GET `/matches/:id/date-ideas` | | Plan 09 |
| GET `/inbox` / POST `/inbox/:id/answer` | `{ answer }` | Plan 08 |
| GET `/admin/usage` | header `x-admin-token` | Plan 03 |

**`authoredBy` visibility:** a user always sees `authoredBy` on their **own** side's messages. They see it on the **other** side's messages only after the match is `handed_off`. At that point the UI shows a reveal ("The first 14 messages were handled by agents"). Consent already covers that this can happen.

## Socket.IO events

Authenticate on connect with `socket.handshake.auth.token`. Each user joins room `user:<id>`, and `match:<id>` rooms on `match:join` (verify membership).

| Direction | Event | Payload |
|---|---|---|
| client → server | `match:join` | `{ matchId }` |
| client → server | `message:send` | `{ matchId, text }` |
| client → server | `typing` | `{ matchId }` |
| server → client | `message:new` | `{ message }` |
| server → client | `typing` | `{ matchId, userId }`. The agent emits this too, as its user, while composing. |
| server → client | `match:new` | `{ match }` |
| server → client | `match:status` | `{ matchId, status, agentActive }` |
| server → client | `kg:update` | `{ matchId, facts }` (plan 08) |
| server → client | `inbox:new` | `{ item }` (plan 08) |
| server → client | `report:ready` | `{ matchId }` (plan 09) |

## Hooks for later plans (create as no-op functions now)

- `services/pipeline/onMatchCreated(match)`: called after a mutual like. Plans 06 → 07 → 08 chain from here.
- `services/agent/onIncomingMessage(message)`: called after **every** saved message (human or agent). Plan 08 implements the reply loop.
- A single `services/pipeline/setStatus(match, status)` that saves and emits `match:status`.

## Security basics

- bcrypt with cost 10, JWT expiry 7 days, and an `express-rate-limit` cap on auth routes.
- Every match route checks that the requester is in `match.users`.
- Messages capped at 1,000 characters; trim and reject empty ones.

## Acceptance checks

- [ ] With Bruno or Postman: signup without consent → 400; with consent → token.
- [ ] Two users like each other → a match is created and `match:new` reaches both sockets.
- [ ] Two browser windows chat live via `message:send` → `message:new`.
- [ ] `DELETE /me` removes the user's data.
- [ ] Export a Bruno/Postman collection to `server/api-collection/` so the frontend team can use it.
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-04): backend core, API contract, realtime chat`
