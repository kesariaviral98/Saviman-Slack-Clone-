// ─────────────────────────────────────────────────────────────────────────────
// Channel Handler
//
// Auto-join:  On connect all channel rooms the user belongs to are joined so
//             messages arrive immediately without a round-trip from the client.
//
// Events:
//   channel:join   — join a channel room (e.g. after being added to a channel)
//   channel:leave  — leave a channel room (user-initiated; not a membership removal)
//   channel:sync   — catch-up: returns the 50 most recent messages in a channel
// ─────────────────────────────────────────────────────────────────────────────

import type { Server, Socket } from 'socket.io';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../shared';
import type { WsChannelJoin, WsChannelLeave, WsChannelSync, SocketAck } from '../shared';
import { prisma } from '../utils/prisma';
import { messagingService } from '../services/messaging.service';
import { logger } from '../utils/logger';

export function registerChannelHandler(io: Server, socket: Socket): void {
  const { user } = socket.data;

  // ── Auto-join all current channel memberships ─────────────────────────────────

  void (async () => {
    try {
      const memberships = await prisma.channelMember.findMany({
        where: { userId: user.id },
        select: { channelId: true },
      });
      for (const { channelId } of memberships) {
        await socket.join(`channel:${channelId}`);
      }
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Channel: auto-join error');
    }
  })();

  // ── channel:join ─────────────────────────────────────────────────────────────

  socket.on(
    CLIENT_EVENTS.CHANNEL_JOIN,
    (payload: WsChannelJoin, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const { channelId } = payload ?? {};
          if (!channelId) {
            ack?.({ success: false, error: 'channelId is required' });
            return;
          }

          // Verify the user is actually a member before joining the room
          const member = await prisma.channelMember.findUnique({
            where: { channelId_userId: { channelId, userId: user.id } },
          });
          if (!member) {
            ack?.({ success: false, error: 'You are not a member of this channel' });
            return;
          }

          await socket.join(`channel:${channelId}`);
          ack?.({ success: true, data: { channelId } });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'channel:join error');
          ack?.({ success: false, error: 'Internal error' });
        }
      })();
    },
  );

  // ── channel:leave ─────────────────────────────────────────────────────────────

  socket.on(
    CLIENT_EVENTS.CHANNEL_LEAVE,
    (payload: WsChannelLeave, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const { channelId } = payload ?? {};
          if (!channelId) {
            ack?.({ success: false, error: 'channelId is required' });
            return;
          }

          await socket.leave(`channel:${channelId}`);
          ack?.({ success: true, data: { channelId } });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'channel:leave error');
          ack?.({ success: false, error: 'Internal error' });
        }
      })();
    },
  );

  // ── channel:sync ─────────────────────────────────────────────────────────────
  // Returns the 50 most recent messages so the client can reconcile its local
  // state after a reconnect or tab-switch.

  socket.on(
    CLIENT_EVENTS.CHANNEL_SYNC,
    (payload: WsChannelSync, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const { channelId } = payload ?? {};
          if (!channelId) {
            ack?.({ success: false, error: 'channelId is required' });
            return;
          }

          const member = await prisma.channelMember.findUnique({
            where: { channelId_userId: { channelId, userId: user.id } },
          });
          if (!member) {
            ack?.({ success: false, error: 'You are not a member of this channel' });
            return;
          }

          const { messages } = await messagingService.getMessages(channelId, { limit: 50 });

          socket.emit(SERVER_EVENTS.CHANNEL_SYNC_RESPONSE, { channelId, messages });
          ack?.({ success: true, data: null });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'channel:sync error');
          ack?.({ success: false, error: 'Internal error' });
        }
      })();
    },
  );

  // Suppress unused variable warning — io reserved for future channel broadcasts
  void io;
}
