// ─────────────────────────────────────────────────────────────────────────────
// Notification Handler
//
// Events:
//   notification:read  — marks a single notification as read via the socket
//                        (mirrors the PATCH /notifications/:id/read REST route)
// ─────────────────────────────────────────────────────────────────────────────

import type { Server, Socket } from 'socket.io';
import { CLIENT_EVENTS } from '../shared';
import type { WsNotificationRead, SocketAck } from '../shared';
import { notificationService } from '../services/notification.service';
import { logger } from '../utils/logger';

export function registerNotificationHandler(io: Server, socket: Socket): void {
  const { user } = socket.data;

  socket.on(
    CLIENT_EVENTS.NOTIFICATION_READ,
    (payload: WsNotificationRead, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const { notificationId } = payload ?? {};
          if (!notificationId) {
            ack?.({ success: false, error: 'notificationId is required' });
            return;
          }

          const notification = await notificationService.markRead(notificationId, user.id);
          ack?.({ success: true, data: { notification } });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'notification:read error');
          ack?.({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to mark notification as read',
          });
        }
      })();
    },
  );

  // Suppress unused variable warning — io reserved for future server→client notification pushes
  void io;
}
