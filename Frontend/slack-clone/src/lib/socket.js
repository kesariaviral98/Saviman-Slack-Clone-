// ─────────────────────────────────────────────────────────────────────────────
// Socket.io client singleton
//
// The socket is created on login / session-restore and destroyed on logout.
// A single instance is shared across the app via getSocket().
//
// Connection URL is relative (same origin) so the Vite proxy handles routing
// in dev and Nginx handles it in production.
// ─────────────────────────────────────────────────────────────────────────────

import { io } from 'socket.io-client';
import { config } from '@/lib/config';

let _socket = null;

/**
 * Return the active socket instance, or null if not connected.
 * Read-only — call connectSocket() to create one.
 */
export function getSocket() {
  return _socket;
}

/**
 * Create and connect a Socket.io socket authenticated with `accessToken`.
 * If a socket already exists and is connected, it is returned as-is.
 * If a stale disconnected socket exists, it is replaced.
 */
export function connectSocket(accessToken) {
  if (_socket?.connected) return _socket;

  // Clean up stale socket if it exists
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }

  _socket = io(config.socketUrl, {
    // JWT passed in the handshake — socket.auth.token on the server
    auth: { token: accessToken },
    transports: ['websocket', 'polling'],
    // Reconnection strategy (matches server's 35-second presence TTL)
    reconnection: true,
    reconnectionAttempts: 15,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    timeout: 20_000,
  });

  _socket.on('connect', () => {
    console.debug('[socket] connected', _socket.id);
  });

  _socket.on('connect_error', (err) => {
    console.warn('[socket] connection error:', err.message);
  });

  _socket.on('disconnect', (reason) => {
    console.debug('[socket] disconnected:', reason);
  });

  return _socket;
}

/**
 * Disconnect and destroy the current socket.
 * Called on logout or before creating a new session.
 */
export function disconnectSocket() {
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }
}

/**
 * Emit a socket event and return a Promise that resolves/rejects with the ack.
 * Timeout after `timeoutMs` (default 5 s) to avoid hanging callers.
 */
export function socketEmit(event, payload, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    if (!_socket?.connected) {
      reject(new Error('Socket is not connected'));
      return;
    }

    const timer = setTimeout(() => {
      reject(new Error(`Socket ack timeout for event: ${event}`));
    }, timeoutMs);

    _socket.emit(event, payload, (ack) => {
      clearTimeout(timer);
      if (ack?.success) {
        resolve(ack.data);
      } else {
        reject(new Error(ack?.error ?? `Socket event '${event}' failed`));
      }
    });
  });
}
