import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { env, clientOrigins } from './config/env.js';
import { adminRouter } from './routes/admin.js';

const app = express();
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

app.use('/api/admin', adminRouter);

app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: { code: err.code || 'INTERNAL', message: err.expose ? err.message : 'Internal server error' } });
});

const server = createServer(app);
export const io = new Server(server, { cors: { origin: clientOrigins } });

async function connectMongo(attempt = 1) {
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
    console.log('✓ MongoDB connected');
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
