// ─────────────────────────────────────────────────────────────────────────────
// Notification Service
//
// Unread count is kept in Redis (`notif:unread:{userId}`) for O(1) reads.
// On cache miss the count is recomputed from DB and stored permanently (no TTL).
// ─────────────────────────────────────────────────────────────────────────────

import webpush from 'web-push';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { getSocketServer } from '../utils/socketEmitter';
import { SERVER_EVENTS } from '../shared';
import type { Notification, NotificationType, NotificationPayload } from '../shared';
import { notificationQueue, emailQueue } from '../utils/bull';
import { buildMentionEmail, buildReplyEmail, buildMissedCallEmail } from '../jobs/email.job';
import { config } from '../config/config';

// Initialise VAPID keys once at module load time
const VAPID_PUBLIC_KEY = config.webPush.publicKey;
const VAPID_PRIVATE_KEY = config.webPush.privateKey;
const VAPID_EMAIL = config.webPush.email;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}


function unreadKey(userId: string): string {
  return `notif:unread:${userId}`;
}

function formatNotification(n: {
  id: string;
  userId: string;
  type: string;
  payload: unknown;
  isRead: boolean;
  createdAt: Date;
}): Notification {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type as NotificationType,
    payload: n.payload as NotificationPayload,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  };
}

// ── Side-effect enqueueing (push + email) ─────────────────────────────────────

async function enqueueSideEffects(
  data: { userId: string; type: NotificationType; payload: NotificationPayload },
  notification: Notification,
): Promise<void> {
  const payload = data.payload as Record<string, unknown>;

  // Fetch the target user's email for potential email delivery
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { email: true, displayName: true },
  });
  if (!user) return;

  // ── Web-push ───────────────────────────────────────────────────────────────
  const pushTitles: Record<string, string> = {
    mention: '📣 You were mentioned',
    reply: '💬 New reply',
    reaction: '😀 New reaction',
    call_missed: '📞 Missed call',
    dm: '💬 New direct message',
  };

  await notificationQueue.add({
    userId: data.userId,
    title: pushTitles[data.type] ?? 'TeamChat notification',
    body: String(payload['preview'] ?? payload['fromDisplayName'] ?? 'You have a new notification'),
    data: { notificationId: notification.id, type: data.type },
  });

  // ── Email (only for mention / reply / missed_call) ─────────────────────────
  const CLIENT = config.app.clientOrigin;

  if (data.type === 'mention' && payload['channelId']) {
    const emailPayload = buildMentionEmail({
      to: user.email,
      mentionedBy: String(payload['fromDisplayName'] ?? 'Someone'),
      channelName: String(payload['channelName'] ?? 'channel'),
      preview: String(payload['preview'] ?? ''),
      link: `${CLIENT}/workspaces/${payload['workspaceId']}/channels/${payload['channelId']}`,
    });
    await emailQueue.add({ type: 'mention', ...emailPayload });
  }

  if (data.type === 'reply' && payload['channelId']) {
    const emailPayload = buildReplyEmail({
      to: user.email,
      repliedBy: String(payload['fromDisplayName'] ?? 'Someone'),
      channelName: String(payload['channelName'] ?? 'channel'),
      preview: String(payload['preview'] ?? ''),
      link: `${CLIENT}/workspaces/${payload['workspaceId']}/channels/${payload['channelId']}`,
    });
    await emailQueue.add({ type: 'reply', ...emailPayload });
  }

  if (data.type === 'call_missed') {
    const emailPayload = buildMissedCallEmail({
      to: user.email,
      callerName: String(payload['fromDisplayName'] ?? 'Someone'),
      channelName: String(payload['channelName'] ?? 'channel'),
      link: `${CLIENT}/workspaces/${payload['workspaceId']}/channels/${payload['channelId']}`,
    });
    await emailQueue.add({ type: 'missed_call', ...emailPayload });
  }
}

export const notificationService = {
  async createNotification(data: {
    userId: string;
    type: NotificationType;
    payload: NotificationPayload;
  }): Promise<Notification> {
    const notification = await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        payload: data.payload as unknown as Prisma.InputJsonValue,
      },
    });

    // Increment the cached unread counter (create if it doesn't exist)
    await redis.incr(unreadKey(data.userId));

    const formatted = formatNotification(notification);

    // Push real-time notification to the user's personal socket room (if connected)
    const io = getSocketServer();
    if (io) {
      io.to(`user:${data.userId}`).emit(SERVER_EVENTS.NOTIFICATION_NEW, {
        notification: formatted,
      });
    }

    // ── Async side-effects (non-blocking) ─────────────────────────────────
    void enqueueSideEffects(data, formatted).catch((err: unknown) => {
      logger.warn({ err }, 'Failed to enqueue notification side-effects');
    });

    return formatted;
  },

  async getNotifications(
    userId: string,
    options: { limit?: number; before?: string } = {},
  ): Promise<{ notifications: Notification[]; hasMore: boolean }> {
    const limit = Math.min(options.limit ?? 20, 50);

    let cursorDate: Date | undefined;
    if (options.before) {
      const cursor = await prisma.notification.findUnique({
        where: { id: options.before },
        select: { createdAt: true },
      });
      if (cursor) cursorDate = cursor.createdAt;
    }

    const rows = await prisma.notification.findMany({
      where: {
        userId,
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    return {
      notifications: rows.slice(0, limit).map(formatNotification),
      hasMore,
    };
  },

  async markRead(notificationId: string, userId: string): Promise<Notification> {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw new AppError(404, 'Notification not found');
    if (notification.userId !== userId) {
      throw new AppError(403, 'This notification does not belong to you');
    }

    if (!notification.isRead) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
      });
      // Safely decrement without going below 0
      const key = unreadKey(userId);
      const current = await redis.get(key);
      if (current !== null && parseInt(current, 10) > 0) {
        await redis.decr(key);
      }
    }

    return formatNotification({ ...notification, isRead: true });
  },

  async markAllRead(userId: string): Promise<{ count: number }> {
    const { count } = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    await redis.set(unreadKey(userId), '0');
    return { count };
  },

  async getUnreadCount(userId: string): Promise<number> {
    const cached = await redis.get(unreadKey(userId));
    if (cached !== null) {
      const n = parseInt(cached, 10);
      return isNaN(n) ? 0 : Math.max(0, n);
    }

    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    });
    // Persist without TTL so incr/decr ops never drift after expiry
    await redis.set(unreadKey(userId), count.toString());
    return count;
  },

  /**
   * Dispatch a web-push notification to all registered devices for a user.
   * Silently ignores devices with invalid/expired subscriptions.
   */
  async dispatchPush(
    userId: string,
    payload: { title: string; body: string; data?: Record<string, unknown> },
  ): Promise<void> {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      logger.debug('VAPID keys not configured — skipping push dispatch');
      return;
    }

    const devices = await prisma.userDevice.findMany({
      where: { userId, webPushSub: { not: Prisma.JsonNull } },
      select: { id: true, webPushSub: true },
    });

    const staleDeviceIds: string[] = [];

    await Promise.all(
      devices.map(async (device) => {
        if (!device.webPushSub) return;

        try {
          await webpush.sendNotification(
            device.webPushSub as unknown as webpush.PushSubscription,
            JSON.stringify(payload),
          );
        } catch (err: unknown) {
          // 410 Gone = subscription expired — clean it up
          if (
            typeof err === 'object' &&
            err !== null &&
            'statusCode' in err &&
            (err as { statusCode: number }).statusCode === 410
          ) {
            staleDeviceIds.push(device.id);
          } else {
            logger.warn({ err, deviceId: device.id }, 'Push notification delivery failed');
          }
        }
      }),
    );

    if (staleDeviceIds.length > 0) {
      await prisma.userDevice.deleteMany({ where: { id: { in: staleDeviceIds } } });
    }
  },
};
