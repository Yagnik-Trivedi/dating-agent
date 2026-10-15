import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { env, clientOrigins } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import { adminRouter } from './routes/admin.js';
import { refresh as loadBudget } from './services/llm/budget.js';
import { authRouter } from './routes/auth.js';
import { discoverRouter } from './routes/discover.js';
import { inboxRouter } from './routes/inbox.js';
import { kgRouter } from './routes/kg.js';
import { matchesRouter } from './routes/matches.js';
import { meRouter } from './routes/me.js';
import { onboardingRouter } from './routes/onboarding.js';
import { profileRouter } from './routes/profile.js';
import { registerSockets } from './sockets/index.js';
import { io } from './sockets/io.js';

const app = express();
app.set('trust proxy', 1); // Render's proxy; needed for per-IP rate limits
app.use(helmet());
app.use(cors({ origin: clientOrigins }));
app.use(express.json({ limit: '1mb' }));

// No DB call: keep-alive pingers hit this.
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), time: new Date().toISOString() });
});

app.get('/health/deep', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const state = mongoose.connection.readyState;
  res.status(state === 1 ? 200 : 503).json({ ok: state === 1, mongo: states[state] ?? 'unknown' });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api', requireAuth, meRouter, profileRouter, onboardingRouter, kgRouter, discoverRouter, matchesRouter, inboxRouter);

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
  } catch (err) {
    const delay = Math.min(30_000, 2_000 * attempt);
    console.error(`✖ MongoDB connect failed (attempt ${attempt}): ${err.message}. Retrying in ${delay / 1000}s`);
    setTimeout(() => connectMongo(attempt + 1), delay);
  }
}

server.listen(env.PORT, () => console.log(`✓ Server listening on :${env.PORT}`));
connectMongo();

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  io.close();
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
});
