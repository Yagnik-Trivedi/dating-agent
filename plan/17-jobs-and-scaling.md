# 17 — Jobs, storage and indexes (build this before the new 05)

> **Prompt for Claude Code:** Read `CLAUDE.md` (section "Knowledge graph — final design") and `plan/15-knowledge-graph-final.md` §6, then implement this file. Run the acceptance checks. Plans 05–11 build on everything here.

## Goal

Lay the foundation that plan 15 §6 says must exist from day one:
- a transaction-capable local database
- one config file for every threshold
- a Mongo job queue and worker that replace all fire-and-forget work
- compact vector storage
- the gate (`Profile.gate`) with the indexed discover query
- the index set and a storage-per-user report

**The core scaling property:** every operation touches one or two users' data. Nothing scans all users, and nothing compares two users' graphs.

**Keep the app runnable:** after this plan, signup → onboarding → discover → match → agent chat must still work end to end on the existing (v1) feature code. Wipe and re-seed test data instead of migrating.

---

## 1. Local database: a replica set (transactions)

- Add `mongodb-memory-server` to `server/` **devDependencies** (approved at Checkpoint A).
- `scripts/dev-db.js`:
  - starts a `MongoMemoryReplSet` (1 member, wiredTiger) on port 27999
  - persists to `server/.dev-db/` (add it to `.gitignore`)
  - prints the URI
  - **refuses to start when `NODE_ENV=production`**
- `npm run dev-db` runs it. Local `.env` uses `MONGODB_URI=mongodb://127.0.0.1:27999/dating_agent?replicaSet=testset` (document it in `.env.example`; production stays Atlas, which is already a replica set).
- `scripts/lib/testDb.js`: an ephemeral replica set for checks and tests (`start()` → uri, `stop()`).
- `services/db.js` exports `withTransaction(fn)`. It uses a Mongoose session (`connection.transaction`) and throws a clear error if the server isn't a replica set.

## 2. Config: `server/src/services/kg/config.js`

Every threshold and constant lives here (later plans add to it, never inline numbers). Export one frozen object `KG`, with env overrides only where an operator needs them.

```js
export const KG = Object.freeze({
  // concepts & retrieval (T_HIGH/T_LOW are re-calibrated for the embedding model in plan 05)
  T_HIGH: 0.85, T_LOW: 0.75, T_ASKED: 0.6, T_LEAK: 0.8,
  DECAY_HALF_LIFE_DAYS: 365, CURRENT_FACT_TTL_DAYS: 180,
  SELECT_K: 10, EXEMPLARS_K: 4, MIN_STORIES: 4, TOPIC_TEMP: 0.7,
  MAX_REGENERATIONS: 1,                       // Checkpoint A: one regeneration per message, max
  STYLE_REBUILD_EVERY: 20, REFLECT_EVERY: 10,
  // caps & retention
  MAX_SELF_FACTS: 150, MAX_VOICE_SAMPLES: 200, NOTES_RETENTION_DAYS: 30,
  VOICE_SAMPLES_ONBOARDING: 15,
  // embeddings
  EMBED_DIMS: null,                           // null = model default
  EMBED_STORAGE: 'float32',                   // 'float32' | 'int8'
  CONCEPT_CACHE_MAX: 5000,                    // above this, plan to move to Atlas Vector Search
  // conversation engine (plan 08)
  STANCE_HOLD: 0.7, STANCE_BEND: 0.4, RESOLVE_WINDOW: 4,
  K_LIKE: 0.25, K_DISLIKE: 0.25, K_QUESTION: 0.05, K_HUMOR: 0.05,
  K_LOW_EFFORT: 0.1, K_REPEAT: 0.05, K_DECAY: 0.1,
  LOW_INTEREST: 0.3, END_AFTER_LOW_TURNS: 3, MAX_TURNS: 24,
  TOPIC_SHIFT: 0.25, STORY_RATE: 0.2, TEMP_RANGE: [0.7, 1.0],
  AGENT_MODEL_BY_SIDE: null, JUDGE_MODEL: null,
  // judge (plan 09)
  JUDGE_YES_MIN: 0.6,
  // jobs
  JOB_POLL_MS: 1000, JOB_LOCK_MS: 120_000, JOB_MAX_ATTEMPTS: 5,
  JOB_CONCURRENCY: { buildUserGraph: 1, matchCreated: 2, agentTurn: 3, judge: 2, compactNotes: 1,
                     rebuildVoice: 1, reflect: 1, reconfirm: 1, conceptCleanup: 1, archiveNotes: 1 },
});
```

`MAX_TURNS` replaces `AGENT_MAX_TURNS` from env (remove it from `env.js` and `.env.example` in plan 08, when the stop rules move). `MAX_REGENERATIONS` is 1, not the reference spec's 2 (Checkpoint A).

## 3. Job queue: `models/Job.js` + `services/jobs/`

**Model**
```js
Job {
  type, payload: Mixed,
  status: 'queued'|'running'|'done'|'failed',
  runAt: Date, attempts: Number, maxAttempts: Number,
  lockedUntil: Date, lockedBy: String,
  dedupeKey: String,          // unique when set (partial index): the same logical job is enqueued once
  lastError: String, result: Mixed,
  createdAt, finishedAt
}
```
Indexes: `{ status: 1, runAt: 1 }`, `{ dedupeKey: 1 }` unique + partial (`dedupeKey` exists and status in queued/running), and a TTL on `finishedAt` (7 days).

**`services/jobs/queue.js`**
- `enqueue(type, payload, { runAt, dedupeKey, maxAttempts })`: upsert on `dedupeKey` when it's given. Re-enqueueing a queued job moves its `runAt`, which is how debounce works.
- `cancel(dedupeKey)`: deletes a queued job (for example on Take over).
- `registerJob(type, handler)`: handlers are `async (payload, { job, heartbeat })` and **must be idempotent**.
- **Worker** `startWorker()`:
  - Poll every `JOB_POLL_MS`.
  - Claim atomically with `findOneAndUpdate`: `{ status: 'queued', runAt ≤ now }` or `{ status: 'running', lockedUntil < now }` (a crashed worker's job), giving `status: 'running', lockedUntil: now + JOB_LOCK_MS, $inc attempts`.
  - Respect `JOB_CONCURRENCY[type]` in-process.
  - On error: retry with exponential backoff + jitter (`runAt = now + 2^attempts s`), up to `maxAttempts`, then `failed` with `lastError`. A `BudgetExceededError` doesn't burn an attempt; it re-queues at the next budget window.
  - `heartbeat()` extends `lockedUntil` for long jobs.
  - Graceful shutdown on SIGTERM: stop claiming, let running jobs finish, up to 10 s.
- The worker runs **inside the web process** (exactly one Render service). `JOB_WORKER=false` disables it, for scripts that only enqueue.
- The same handler code can later move to a managed queue or Nebius Serverless Jobs without changes.

**Move today's fire-and-forget work onto the queue now** (this keeps the app runnable with the v1 feature code):

| Job type | Replaces | Enqueued by |
|---|---|---|
| `buildUserGraph` | `routes/onboarding.js` async call + boot "mark failed" | `POST /onboarding/submit` (dedupeKey `build:<userId>`) |
| `matchCreated` | `pipeline/index.js#onMatchCreated` + `resumePipelines` on boot | `createMatch` (dedupeKey `match:<matchId>`) |
| `agentTurn` | `agent/scheduler.js` in-memory debounce timers + boot resume | incoming message (dedupeKey `turn:<matchId>:<userId>`, `runAt = now + debounce`) |
| `evaluate` | `compat/index.js#startEvaluation` fire-and-forget | stop rule (becomes `judge` in plan 09) |

Remove the boot-time resume and sweep code that the queue makes unnecessary. The existing Mongo lock per (match, agent user) stays until plan 08 rewrites the engine.

**Periodic jobs: `services/jobs/periodic.js`.** A tick every minute enqueues due jobs with a time-bucket `dedupeKey` (e.g. `conceptCleanup:2026-10-17`), so restarts and repeated ticks never duplicate work.

| Job | Schedule | Handler lives in |
|---|---|---|
| `archiveNotes` | daily | this plan (§6) |
| `conceptCleanup` | nightly | plan 05 |
| `reconfirm` | daily | plan 05 |
| `rebuildVoice` | event: every `STYLE_REBUILD_EVERY` new voice samples | plan 05 |
| `reflect` | event: every `REFLECT_EVERY` new self facts | plan 05 |
| `judge`, `compactNotes` | event: conversation end / match close | plan 09 |

A job type with no handler registered yet is skipped by the tick, not enqueued.

`GET /api/admin/jobs` (admin token): counts by type and status, plus the last 20 failures.

## 4. Compact vectors: `utils/vector.js`

- `toBinary(numbers)` → `Buffer` (float32 LE, or int8 with a per-vector scale when `EMBED_STORAGE='int8'`).
- `fromBinary(buffer)` → `Float32Array`.
- `cosine(a, b)` works on typed arrays (update `services/kg/similarity.js` to accept both).
- Store embeddings as `Buffer` with `select: false`:
  - `KgFact.embedding`
  - `EmbCache.vector`
  - (later) `Concept.embedding` and `VoiceSample.embedding`
- Every query that needs vectors selects them explicitly. Nothing else ever loads them.
- **`EMBED_DIMS`:**
  - In `smoke.js`, try the `dimensions` parameter once.
  - If the provider rejects it, log that it isn't supported and keep `null`.
  - Store the actual dims with `embeddingModel`.
- Wipe and re-seed after this change (no migration). `scripts/reembed.js` keeps working with binary vectors.

## 5. The gate: `Profile.gate` + discover query + `passesGate`

**Profile fields** (added to `models/Profile.js` and `PUT /api/profile` validation):
- `ageMin` (default 18), `ageMax` (default 99), optional `radiusKm`
- optional `geo` (GeoJSON point). City match comes first; geo is optional and unused unless set.

**`Profile.gate`** (denormalised; never selected by any LLM-facing or other-user code):
```js
gate: {
  age, gender, interestedIn: [String], ageMin, ageMax, city, geo, radiusKm,
  values:  { smoking: 'never', drinking: 'socially', kids: 'yes', ... },  // my B answers, attribute → value
  accepts: { smoking: ['never', 'socially'], ... },                       // only for my dealbreaker attributes
  dealbreakers: ['smoking', ...]                                          // attributes where I set dealbreaker
}
```
- `services/match/gate.js#buildGate(userId)`:
  - Rebuilds `Profile.gate` from `Profile` basics and the user's B answers.
  - Called after onboarding and after any profile or B change.
  - Until plan 05 adds `accepts`, a v1 `dealbreaker` importance means "partner must give the same answer" (`accepts = [own answer]`).
- `discoverQuery(me)` → one Mongo filter:
  - **Basics:** their gender ∈ my `interestedIn`, my gender ∈ theirs; their age within my range, mine within theirs; same city (or `$geoWithin` when both have geo + radius).
  - **My dealbreakers vs their values:** for each attribute `k` in `me.gate.dealbreakers`, `gate.values.k ∈ me.gate.accepts.k`. A missing value doesn't pass; unknown is treated as a mismatch.
  - **Their dealbreakers vs my values:** my values are constants in the query, so for every B attribute `k`: `$nor: [{ 'gate.dealbreakers': k, [`gate.accepts.${k}`]: { $ne: myValue[k] } }, …]` (on an array, `$ne` means "doesn't contain"). If I have no value for `k`, any profile with `k` as a dealbreaker is excluded.
  - Already-liked users and myself excluded.
- `GET /api/discover`: `aggregate([{ $match: discoverQuery(me) }, { $sample: { size: limit } }, { $project: PUBLIC_PROFILE }])`.
  - **Random order, no ranking.**
  - `PUBLIC_PROFILE` never includes `gate` or `dealbreakers`.
- `passesGate(a, b)` → **boolean only**, pure code, no LLM, no score, no reasons returned to any agent. Plan 07 calls it at match creation.
- **Indexes on `Profile`:** `{ 'gate.city': 1, 'gate.gender': 1, 'gate.age': 1 }`, one per attribute `gate.values.<k>` for every section B attribute, `gate.dealbreakers`, and `2dsphere` on `geo`.

## 6. Indexes, retention and caps

- **`scripts/check-indexes.js`:** runs `syncIndexes()` for every model, then asserts that each index in plan 15 §6.6 exists for the models that exist so far. Later plans extend the expected list as they add collections.
- **Generic caps helper `services/kg/caps.js`:** `pruneToCap(Model, filter, cap, sortSpec, protectFilter)` deletes the lowest-ranked unprotected documents beyond `cap`. Plans 05 and 08 call it for `MAX_SELF_FACTS` and `MAX_VOICE_SAMPLES`.
- **TTL archiving:** collections that hold per-conversation raw data (notes, ChatEvents, agent messages of closed matches) get an `archiveAt: Date` field with a TTL index (`expireAfterSeconds: 0`). The `archiveNotes` job sets `archiveAt` for conversations closed more than `NOTES_RETENTION_DAYS` ago. Plan 09's compaction must run first; handed-off matches are never archived.

## 7. Storage report: `scripts/storage-report.js`

For each collection that exists:
- docs, total and average `$bsonSize`
- docs per user and **bytes per user** (grouped by the user field: `subjectId`/`userId`/`users`)
- embedding bytes, separately

Print a table and the projected users that fit in Atlas M0 (512 MB). Plan 11's scale test uses it.

## Acceptance checks

- [ ] `npm run dev-db` starts a replica set; `withTransaction` commits and rolls back (a check script throws inside a transaction and the write is gone). With `NODE_ENV=production`, `dev-db` exits with an error.
- [ ] Queue unit tests (`node:test`, ephemeral replica set):
  - [ ] Two workers never run the same job.
  - [ ] A job whose worker died (`lockedUntil` passed) is picked up again.
  - [ ] Failures retry with backoff and end as `failed` after `maxAttempts`.
  - [ ] `dedupeKey` re-enqueue moves `runAt` instead of duplicating.
  - [ ] `cancel()` removes a queued job.
  - [ ] Periodic ticks never duplicate a bucket.
- [ ] Onboarding build, the match pipeline, agent turns and evaluation all run as jobs. Killing the server mid-job and restarting it finishes the job. There is no boot-time resume code left (grep).
- [ ] Vectors are `Buffer`s; `fromBinary(toBinary(v))` round-trips within float32 precision; `/api/kg/me` and every non-vector query return no embedding bytes.
- [ ] Gate unit tests:
  - [ ] Dealbreakers filter both directions.
  - [ ] Basics (gender both ways, age both ways, city) filter.
  - [ ] `passesGate` returns a boolean and nothing else.
  - [ ] Discover order varies across calls with the same data (random).
  - [ ] A pair sharing many interests is not more likely to appear than a pair sharing none.
- [ ] `explain()` on the discover query uses a `gate.*` index (no COLLSCAN) with 2,000 synthetic profiles loaded.
- [ ] `node scripts/check-indexes.js` passes. `node scripts/storage-report.js` prints bytes per user.
- [ ] End to end after wipe + re-seed: signup → onboarding → discover (gate-filtered, random) → like a seed → match → agents chat → verdict.
- [ ] Update the Status section of `CLAUDE.md`.

**Commit:** `feat(plan-17): job queue, compact vectors, gate query, indexes`
