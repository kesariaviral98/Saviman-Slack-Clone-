// ─────────────────────────────────────────────────────────────────────────────
// Socket Emitter — thin module that holds the Socket.io Server reference.
//
// Exists solely to break the circular dependency that would arise if services
// imported `io` directly from `socket.server.ts` while `socket.server.ts`
// imports those same services via its handlers.
//
// Usage:
//   setSocketServer(io)   — called once in socket.server.ts after io is created
//   getSocketServer()     — called anywhere a socket emit is needed; returns
//                           null before the socket server is initialised
// ─────────────────────────────────────────────────────────────────────────────

import type { Server } from 'socket.io';

let _io: Server | null = null;

export function setSocketServer(io: Server): void {
  _io = io;
}

export function getSocketServer(): Server | null {
  return _io;
}
