import { Server } from 'socket.io';
import { clientOrigins } from '../config/env.js';

// Attached to the HTTP server in index.js; services import this to emit.
export const io = new Server({ cors: { origin: clientOrigins } });

export const emitToUser = (userId, event, payload) => io.to(`user:${userId}`).emit(event, payload);
