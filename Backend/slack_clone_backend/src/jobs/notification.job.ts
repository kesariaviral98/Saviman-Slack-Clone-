// ─────────────────────────────────────────────────────────────────────────────
// Notification job — processes push-notification dispatch jobs.
//
// Enqueued by notificationService.createNotification after the DB row and
// real-time socket event have both been handled.  Running push dispatch in a
// Bull worker means:
//   1. The HTTP/socket handler returns quickly (no waiting on web-push).
//   2. Transient failures are retried with exponential back-off.
//   3. Push delivery never blocks message delivery.
// ─────────────────────────────────────────────────────────────────────────────

import type Bull from 'bull';
import { notificationQueue, type PushJobData } from '../utils/bull';
import { notificationService } from '../services/notification.service';
import { logger } from '../utils/logger';

const CONCURRENCY = 5; // concurrent push dispatches per worker process

export function startNotificationWorker(): void {
  notificationQueue.process(CONCURRENCY, async (job: Bull.Job<PushJobData>) => {
    const { userId, title, body, data } = job.data;

    logger.debug({ jobId: job.id, userId }, 'Push notification job started');

    await notificationService.dispatchPush(userId, { title, body, data });

    logger.debug({ jobId: job.id, userId }, 'Push notification job completed');
  });

  logger.info('Notification worker started (concurrency=%d)', CONCURRENCY);
}
