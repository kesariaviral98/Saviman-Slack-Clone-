// ─────────────────────────────────────────────────────────────────────────────
// Messaging Handler
//
// All write operations are guarded by an idempotency key:
//   Redis SETNX  message:idem:{clientTempId}  1  EX 60
// If the key already exists the event was already processed — ack success and
// return without touching the DB or emitting a duplicate broadcast.
//
// Events (client → server):
//   message:send    — create message; broadcast message:new to channel room
//   message:edit    — edit own message; broadcast message:updated
//   message:delete  — delete own/admin message; broadcast message:deleted
//   reaction:add    — upsert reaction; broadcast reaction:updated
//   reaction:remove — remove reaction; broadcast reaction:updated
//   typing:start    — relay typing indicator to channel peers (not sender)
//   typing:stop     — relay typing-stopped indicator
// ─────────────────────────────────────────────────────────────────────────────

import type { Server, Socket } from 'socket.io';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../shared';
import type {
  WsSendMessage,
  WsEditMessage,
  WsDeleteMessage,
  WsReactionAdd,
  WsReactionRemove,
  WsTyping,
  SocketAck,
} from '../shared';
import { prisma } from '../utils/prisma';
import { redis } from '../utils/redis';
import { messagingService } from '../services/messaging.service';
import { notificationService } from '../services/notification.service';
import { logger } from '../utils/logger';

const IDEM_TTL_SECONDS = 60;

function idemKey(clientTempId: string): string {
  return `message:idem:${clientTempId}`;
}

// ── @mention detector — finds all @{uuid} patterns in message content ─────────

function extractMentionedUserIds(content: string): string[] {
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const mentionRe = new RegExp(`@(${UUID_RE.source})`, 'gi');
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = mentionRe.exec(content)) !== null) {
    if (match[1]) ids.push(match[1]);
  }
  return [...new Set(ids)];
}

export function registerMessagingHandler(io: Server, socket: Socket): void {
  const { user } = socket.data;

  // ── message:send ─────────────────────────────────────────────────────────────

  socket.on(
    CLIENT_EVENTS.MESSAGE_SEND,
    (payload: WsSendMessage, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const { channelId, content, parentId, clientTempId } = payload ?? {};

          if (!channelId || !clientTempId) {
            ack?.({ success: false, error: 'channelId and clientTempId are required' });
            return;
          }

          if (!content?.trim()) {
            ack?.({ success: false, error: 'Message content is required' });
            return;
          }

          // ── Idempotency ────────────────────────────────────────────────────
          const acquired = await redis.set(
            idemKey(clientTempId),
            '1',
            'EX',
            IDEM_TTL_SECONDS,
            'NX',
          );
          if (!acquired) {
            // Already processed — return success without re-broadcasting
            ack?.({ success: true, data: null });
            return;
          }

          // ── Channel membership + announcement guard ────────────────────────
          const channelCheck = await prisma.channel.findUnique({
            where: { id: channelId },
            select: {
              type: true,
              workspaceId: true,
              members: {
                where: { userId: user.id },
                select: { id: true },
              },
            },
          });
          if (!channelCheck || channelCheck.members.length === 0) {
            ack?.({ success: false, error: 'You are not a member of this channel' });
            return;
          }
          // Announcement channels are write-locked to workspace admins
          if (channelCheck.type === 'announcement') {
            const wsMember = await prisma.workspaceMember.findUnique({
              where: {
                workspaceId_userId: {
                  workspaceId: channelCheck.workspaceId,
                  userId: user.id,
                },
              },
              select: { role: true },
            });
            if (wsMember?.role !== 'admin') {
              ack?.({ success: false, error: 'Only admins can post in announcement channels' });
              return;
            }
          }

          // ── Persist ────────────────────────────────────────────────────────
          const message = await messagingService.createMessage({
            channelId,
            senderId: user.id,
            content,
            parentId: parentId ?? undefined,
          });

          // ── Broadcast to all channel subscribers ───────────────────────────
          io.to(`channel:${channelId}`).emit(SERVER_EVENTS.MESSAGE_NEW, {
            message,
            clientTempId,
          });

          // ── Fetch channel metadata once for all notification payloads ──────
          const channel = await prisma.channel.findUnique({
            where: { id: channelId },
            select: {
              type: true,
              workspaceId: true,
              name: true,
              members: { select: { userId: true } },
            },
          });
          const workspaceId = channel?.workspaceId;
          const channelName = channel?.name;

          // ── Notify mentioned users ─────────────────────────────────────────
          if (content) {
            const mentionedIds = extractMentionedUserIds(content);
            for (const mentionedUserId of mentionedIds) {
              if (mentionedUserId === user.id) continue;
              // Fire-and-forget; notification failure must not block message delivery
              notificationService
                .createNotification({
                  userId: mentionedUserId,
                  type: 'mention',
                  payload: {
                    messageId: message.id,
                    channelId,
                    workspaceId,
                    channelName,
                    fromUserId: user.id,
                    fromDisplayName: user.displayName,
                    preview: content.slice(0, 100),
                  },
                })
                .catch((err: unknown) => {
                  logger.warn({ err, mentionedUserId }, 'Failed to create mention notification');
                });
            }
          }

          // ── Notify thread participants (reply) ─────────────────────────────
          if (parentId) {
            const parentMsg = await prisma.message.findUnique({
              where: { id: parentId },
              select: { senderId: true },
            });
            if (parentMsg && parentMsg.senderId !== user.id) {
              notificationService
                .createNotification({
                  userId: parentMsg.senderId,
                  type: 'reply',
                  payload: {
                    messageId: message.id,
                    channelId,
                    workspaceId,
                    channelName,
                    fromUserId: user.id,
                    fromDisplayName: user.displayName,
                    preview: (content ?? '').slice(0, 100),
                  },
                })
                .catch((err: unknown) => {
                  logger.warn({ err }, 'Failed to create reply notification');
                });
            }
          }

          // ── Notify the other member of a DM channel ────────────────────────
          if (!parentId && channel?.type === 'dm') {
            const otherMember = channel.members.find((m) => m.userId !== user.id);
            if (otherMember) {
              notificationService
                .createNotification({
                  userId: otherMember.userId,
                  type: 'dm',
                  payload: {
                    messageId: message.id,
                    channelId,
                    workspaceId,
                    channelName,
                    fromUserId: user.id,
                    fromDisplayName: user.displayName,
                    preview: (content ?? '').slice(0, 100),
                  },
                })
                .catch((err: unknown) => {
                  logger.warn({ err }, 'Failed to create DM notification');
                });
            }
          }

          ack?.({ success: true, data: { message } });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'message:send error');
          ack?.({ success: false, error: 'Failed to send message' });
        }
      })();
    },
  );

  // ── message:edit ─────────────────────────────────────────────────────────────

  socket.on(
    CLIENT_EVENTS.MESSAGE_EDIT,
    (payload: WsEditMessage, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const { messageId, content } = payload ?? {};
          if (!messageId || !content?.trim()) {
            ack?.({ success: false, error: 'messageId and content are required' });
            return;
          }

          const message = await messagingService.editMessage(messageId, user.id, content);

          io.to(`channel:${message.channelId}`).emit(SERVER_EVENTS.MESSAGE_UPDATED, {
            messageId: message.id,
            content: message.content,
            isEdited: message.isEdited,
            editedAt: message.editedAt ?? new Date().toISOString(),
          });

          ack?.({ success: true, data: { message } });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'message:edit error');
          ack?.({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to edit message',
          });
        }
      })();
    },
  );

  // ── message:delete ────────────────────────────────────────────────────────────

  socket.on(
    CLIENT_EVENTS.MESSAGE_DELETE,
    (payload: WsDeleteMessage, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const { messageId } = payload ?? {};
          if (!messageId) {
            ack?.({ success: false, error: 'messageId is required' });
            return;
          }

          // Fetch workspace role so admins can delete any message
          const msgRecord = await prisma.message.findUnique({
            where: { id: messageId },
            select: { channel: { select: { workspaceId: true } } },
          });

          let workspaceRole: string | undefined;
          if (msgRecord) {
            const wsMember = await prisma.workspaceMember.findUnique({
              where: {
                workspaceId_userId: {
                  workspaceId: msgRecord.channel.workspaceId,
                  userId: user.id,
                },
              },
              select: { role: true },
            });
            workspaceRole = wsMember?.role;
          }

          const { channelId } = await messagingService.deleteMessage(
            messageId,
            user.id,
            workspaceRole,
          );

          io.to(`channel:${channelId}`).emit(SERVER_EVENTS.MESSAGE_DELETED, {
            messageId,
            channelId,
          });

          ack?.({ success: true, data: null });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'message:delete error');
          ack?.({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to delete message',
          });
        }
      })();
    },
  );

  // ── reaction:add ─────────────────────────────────────────────────────────────

  socket.on(
    CLIENT_EVENTS.REACTION_ADD,
    (payload: WsReactionAdd, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const { messageId, emoji } = payload ?? {};
          if (!messageId || !emoji) {
            ack?.({ success: false, error: 'messageId and emoji are required' });
            return;
          }

          const msg = await prisma.message.findUnique({
            where: { id: messageId },
            select: { channelId: true, senderId: true },
          });
          if (!msg) {
            ack?.({ success: false, error: 'Message not found' });
            return;
          }

          const reactions = await messagingService.addReaction(messageId, user.id, emoji);

          io.to(`channel:${msg.channelId}`).emit(SERVER_EVENTS.REACTION_UPDATED, {
            messageId,
            reactions,
          });

          // Notify the message author (not if they reacted to their own message)
          if (msg.senderId !== user.id) {
            // Look up channel metadata for the notification payload
            prisma.channel.findUnique({
              where: { id: msg.channelId },
              select: { workspaceId: true, name: true },
            }).then((reactionChannel) => {
              notificationService
                .createNotification({
                  userId: msg.senderId,
                  type: 'reaction',
                  payload: {
                    messageId,
                    channelId: msg.channelId,
                    workspaceId: reactionChannel?.workspaceId,
                    channelName: reactionChannel?.name,
                    fromUserId: user.id,
                    fromDisplayName: user.displayName,
                    preview: emoji,
                  },
                })
                .catch((err: unknown) => {
                  logger.warn({ err }, 'Failed to create reaction notification');
                });
            }).catch((err: unknown) => {
              logger.warn({ err }, 'Failed to fetch channel for reaction notification');
            });
          }

          ack?.({ success: true, data: { reactions } });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'reaction:add error');
          ack?.({ success: false, error: 'Failed to add reaction' });
        }
      })();
    },
  );

  // ── reaction:remove ───────────────────────────────────────────────────────────

  socket.on(
    CLIENT_EVENTS.REACTION_REMOVE,
    (payload: WsReactionRemove, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const { messageId, emoji } = payload ?? {};
          if (!messageId || !emoji) {
            ack?.({ success: false, error: 'messageId and emoji are required' });
            return;
          }

          const msg = await prisma.message.findUnique({
            where: { id: messageId },
            select: { channelId: true },
          });
          if (!msg) {
            ack?.({ success: false, error: 'Message not found' });
            return;
          }

          const reactions = await messagingService.removeReaction(messageId, user.id, emoji);

          io.to(`channel:${msg.channelId}`).emit(SERVER_EVENTS.REACTION_UPDATED, {
            messageId,
            reactions,
          });

          ack?.({ success: true, data: { reactions } });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'reaction:remove error');
          ack?.({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to remove reaction',
          });
        }
      })();
    },
  );

  // ── typing:start ─────────────────────────────────────────────────────────────

  socket.on(CLIENT_EVENTS.TYPING_START, (payload: WsTyping) => {
    const channelId = payload?.channelId;
    if (!channelId) return;

    socket.to(`channel:${channelId}`).emit(SERVER_EVENTS.TYPING_UPDATE, {
      channelId,
      userId: user.id,
      displayName: user.displayName,
      isTyping: true,
    });
  });

  // ── typing:stop ───────────────────────────────────────────────────────────────

  socket.on(CLIENT_EVENTS.TYPING_STOP, (payload: WsTyping) => {
    const channelId = payload?.channelId;
    if (!channelId) return;

    socket.to(`channel:${channelId}`).emit(SERVER_EVENTS.TYPING_UPDATE, {
      channelId,
      userId: user.id,
      displayName: user.displayName,
      isTyping: false,
    });
  });
}
