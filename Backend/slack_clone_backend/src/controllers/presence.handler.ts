// ─────────────────────────────────────────────────────────────────────────────
// Presence Handler
//
// Lifecycle:
//   connect     → setOnline, join workspace rooms, broadcast presence:changed
//   disconnect  → setOffline, broadcast presence:changed (isOnline=false when
//                 last device disconnects)
//
// Events:
//   presence:heartbeat  — refresh Redis TTL so key doesn't expire mid-session
//   presence:status     — update dnd/away/active; broadcast to workspace peers
// ─────────────────────────────────────────────────────────────────────────────

import type { Server, Socket } from 'socket.io';
import { SERVER_EVENTS, CLIENT_EVENTS } from '../shared';
import type { WsPresenceStatus } from '../shared';
import { presenceService } from '../services/presence.service';
import { logger } from '../utils/logger';

const VALID_STATUSES = new Set(['active', 'away', 'dnd'] as const);

export function registerPresenceHandler(io: Server, socket: Socket): void {
  const { user, deviceId, workspaceIds } = socket.data;

  // ── Helper: broadcast presence to all workspace peers ────────────────────────

  async function broadcastPresence(isOnline: boolean): Promise<void> {
    const presence = await presenceService.getPresence(user.id);
    const payload = {
      userId: user.id,
      isOnline,
      status: presence.status,
    };
    for (const workspaceId of workspaceIds) {
      socket.to(`workspace:${workspaceId}`).emit(SERVER_EVENTS.PRESENCE_CHANGED, payload);
    }
  }

  // ── Connect (called immediately when handler is registered) ──────────────────

  void (async () => {
    try {
      // Join workspace rooms so the user receives presence broadcasts
      for (const workspaceId of workspaceIds) {
        await socket.join(`workspace:${workspaceId}`);
      }
      await presenceService.setOnline(user.id, deviceId, 'web');
      await broadcastPresence(true);
    } catch (err) {
      logger.error({ err, userId: user.id, socketId: socket.id }, 'Presence: connect error');
    }
  })();

  // ── Disconnect ────────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    void (async () => {
      try {
        const finalPresence = await presenceService.setOffline(user.id, deviceId);
        // Only announce offline when the LAST device disconnects
        const payload = {
          userId: user.id,
          isOnline: finalPresence.isOnline,
          status: finalPresence.status,
        };
        for (const workspaceId of workspaceIds) {
          // Can't use socket.to() after disconnect — use io.to() instead
          io.to(`workspace:${workspaceId}`).emit(SERVER_EVENTS.PRESENCE_CHANGED, payload);
        }
      } catch (err) {
        logger.error({ err, userId: user.id }, 'Presence: disconnect error');
      }
    })();
  });

  // ── presence:heartbeat ────────────────────────────────────────────────────────

  socket.on(CLIENT_EVENTS.PRESENCE_HEARTBEAT, () => {
    void (async () => {
      try {
        await presenceService.refreshHeartbeat(user.id);
      } catch (err) {
        logger.error({ err, userId: user.id }, 'Presence: heartbeat error');
      }
    })();
  });

  // ── presence:status ───────────────────────────────────────────────────────────

  socket.on(CLIENT_EVENTS.PRESENCE_STATUS, (payload: WsPresenceStatus) => {
    void (async () => {
      try {
        if (!VALID_STATUSES.has(payload?.status)) return;

        await presenceService.updateStatus(user.id, payload.status);

        const updated = {
          userId: user.id,
          isOnline: true,
          status: payload.status,
        };
        for (const workspaceId of workspaceIds) {
          // Include the sender — their own UI needs the update too
          io.to(`workspace:${workspaceId}`).emit(SERVER_EVENTS.PRESENCE_CHANGED, updated);
        }
      } catch (err) {
        logger.error({ err, userId: user.id }, 'Presence: status update error');
      }
    })();
  });
}
