import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { env, allowOrigin } from './config/env.js';
import { keepaliveStatus, startKeepalive, stopKeepalive } from './keepalive.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { discoverRouter } from './routes/discover.js';
import { inboxRouter } from './routes/inbox.js';
import { kgRouter } from './routes/kg.js';
import { liveCheckRouter } from './routes/liveCheck.js';
import { matchesRouter } from './routes/matches.js';
import { meRouter } from './routes/me.js';
import { onboardingRouter } from './routes/onboarding.js';
import { profileRouter } from './routes/profile.js';
import './services/jobs/handlers.js';
import { startPeriodic, stopPeriodic } from './services/jobs/periodic.js';
import { startWorker, stopWorker } from './services/jobs/queue.js';
import { refresh as loadBudget } from './services/llm/budget.js';
import { CITY_NAMES } from './services/cities.js';
import { registerSockets } from './sockets/index.js';
import { io } from './sockets/io.js';

const app = express();
app.set('trust proxy', 1); // Render's proxy; needed for per-IP rate limits
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // the API is meant to be read by the Vercel site
app.use('/health', cors()); // any origin: the wake-up check must never be mistaken for a sleeping server (plan 30 S0)
app.use(cors({ origin: allowOrigin }));
app.use(express.json({ limit: '1mb' }));

// No DB call: keep-alive pingers hit this.
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), time: new Date().toISOString() });
});

// Did the service restart / is the self-ping running? (plan 12)
app.get('/health/keepalive-status', (req, res) => res.json(keepaliveStatus()));

app.get('/health/deep', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const state = mongoose.connection.readyState;
  res.status(state === 1 ? 200 : 503).json({ ok: state === 1, mongo: states[state] ?? 'unknown' });
});

app.get('/api/cities', (req, res) => res.set('Cache-Control', 'public, max-age=86400').json({ cities: CITY_NAMES }));
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api', requireAuth, meRouter, profileRouter, onboardingRouter, kgRouter, discoverRouter, matchesRouter, inboxRouter, liveCheckRouter);

app.use(notFound);
app.use(errorHandler);

const server = createServer(app);
io.attach(server);
registerSockets(io);

async function connectMongo(attempt = 1) {
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
    console.log('✓ MongoDB connected');
    await loadBudget({ force: true }).catch((err) => console.error(`budget load failed: ${err.message}`));
    // Onboarding builds, match pipelines, agent turns and evaluations are jobs: a restart resumes them (plan 17).
    if (env.JOB_WORKER) {
      startWorker();
      startPeriodic();
    }
  } catch (err) {
    const delay = Math.min(30_000, 2_000 * attempt);
    console.error(`✖ MongoDB connect failed (attempt ${attempt}): ${err.message}. Retrying in ${delay / 1000}s`);
    setTimeout(() => connectMongo(attempt + 1), delay);
  }
}

server.listen(env.PORT, () => console.log(`✓ Server listening on :${env.PORT}`));
startKeepalive();
connectMongo();

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  io.close();
  stopPeriodic();
  stopKeepalive();
  server.close(async () => {
    await stopWorker();
    await mongoose.disconnect();
    process.exit(0);
  });
});
