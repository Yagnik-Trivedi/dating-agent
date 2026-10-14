import { verifyToken } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { sendMessage, serializeMessage } from '../services/chat.js';
import { getMatchFor } from '../services/matches.js';

/** Wrap a handler so it always acks `{ ok, ...result }` or `{ ok: false, error }` and never crashes the socket. */
const handle = (fn) => async (payload, ack) => {
  const reply = typeof ack === 'function' ? ack : () => {};
  try {
    reply({ ok: true, ...(await fn(payload ?? {})) });
  } catch (err) {
    if (!err.expose) console.error(err);
    reply({ ok: false, error: { code: err.code ?? 'INTERNAL', message: err.expose ? err.message : 'Internal error' } });
  }
};

export function registerSockets(io) {
  io.use(async (socket, next) => {
    try {
      const userId = verifyToken(socket.handshake.auth?.token);
      if (!await User.exists({ _id: userId })) throw new Error('gone');
      socket.data.userId = userId;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    const joined = new Set();
    socket.join(`user:${userId}`);

    socket.on('match:join', handle(async ({ matchId }) => {
      await getMatchFor(matchId, userId);
      socket.join(`match:${matchId}`);
      joined.add(String(matchId));
      return {};
    }));

    socket.on('message:send', handle(async ({ matchId, text }) => {
      const match = await getMatchFor(matchId, userId);
      const message = await sendMessage({ match, senderId: userId, authoredBy: 'human', text });
      return { message: serializeMessage(message, userId, match.status) };
    }));

    socket.on('typing', ({ matchId } = {}) => {
      if (joined.has(String(matchId))) socket.to(`match:${matchId}`).emit('typing', { matchId, userId });
    });
  });
}
