import { Server } from 'socket.io';
import { verifyAccessToken } from './utils/jwt.js';

export function createSocketServer(httpServer, allowedOrigins) {
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      next(new Error('Authentication token is required'));
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      socket.user = { id: payload.id, role: payload.role, employeeCode: payload.employeeCode };
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`);

    socket.on('disconnect', () => {
      // Room membership is cleaned up automatically by socket.io on disconnect.
    });
  });

  return io;
}
