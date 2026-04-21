// ─────────────────────────────────────────────────────────────────────────────
// Socket.io Server
//
// Initialisation flow:
//   1. Create a Socket.io Server attached to the Node HTTP server
//   2. Wire up the Redis pub/sub adapter (scales across multiple processes)
//   3. Apply the JWT authentication middleware (socketAuth)
//   4. On every `connection` event register all domain handlers
//
// Room conventions:
//   user:{userId}          — personal room; receives notifications
//   workspace:{workspaceId}— workspace-wide events (presence)
//   channel:{channelId}    — channel messages, typing indicators
//
// Exported:
//   initSocketServer(httpServer) — call once from index.ts after app.listen()
// ─────────────────────────────────────────────────────────────────────────────

import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'http';
import { config } from '../config/config';
import { redis, createSubscriberClient, setSocketServer, logger } from '../utils/index';
import { socketAuth } from './socket.auth';
import {
  registerPresenceHandler, registerChannelHandler, registerMessagingHandler,
  registerNotificationHandler, registerCallingHandler,
} from '../controllers';

const CLIENT_ORIGIN = config.app.clientOrigin;

export function initSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: CLIENT_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    // Ping / pong keep-alive — client heartbeats every 20 s (presence TTL is 35 s)
    pingInterval: 25_000,
    pingTimeout: 10_000,
    // Limit incoming payload to 1 MB to prevent memory-exhaustion attacks
    maxHttpBufferSize: 1e6,
    transports: ['websocket', 'polling'],
  });

  // ── Redis pub/sub adapter ─────────────────────────────────────────────────────
  // pubClient  — shared with the main command client (fine for publishing)
  // subClient  — dedicated client that enters subscribe mode exclusively

  const subClient = createSubscriberClient();

  subClient.on('error', (err: Error) => {
    logger.error({ err }, 'Socket.io Redis sub-client error');
  });

  io.adapter(createAdapter(redis, subClient));

  // ── Auth middleware ───────────────────────────────────────────────────────────

  io.use((socket, next) => {
    void socketAuth(socket, next);
  });

  // ── Connection handler ────────────────────────────────────────────────────────

  io.on('connection', (socket) => {
    const { user } = socket.data;
    logger.info({ userId: user.id, socketId: socket.id }, 'Socket connected');

    // Join personal room so the server can push directly to this user
    void socket.join(`user:${user.id}`);

    // Register domain handlers (each sets up event listeners and runs init logic)
    registerPresenceHandler(io, socket);
    registerChannelHandler(io, socket);
    registerMessagingHandler(io, socket);
    registerNotificationHandler(io, socket);
    registerCallingHandler(io, socket);

    socket.on('disconnect', (reason) => {
      logger.info({ userId: user.id, socketId: socket.id, reason }, 'Socket disconnected');
    });

    socket.on('error', (err: Error) => {
      logger.error({ err, userId: user.id, socketId: socket.id }, 'Socket error');
    });
  });

  // ── Auth error handler ────────────────────────────────────────────────────────
  // Emits an error event to the client before closing the connection

  io.on('connect_error', (err: Error) => {
    logger.warn({ message: err.message }, 'Socket connection rejected');
  });

  // ── Register with the socketEmitter so services can emit events ───────────────

  setSocketServer(io);

  logger.info('Socket.io server initialised');
  return io;
}
