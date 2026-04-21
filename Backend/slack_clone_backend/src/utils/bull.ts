// ─────────────────────────────────────────────────────────────────────────────
// Bull queues — one per concern so they can be scaled independently.
//
// All queues share the same Redis instance but use separate key prefixes.
// Workers are registered in src/jobs/index.ts which is called from index.ts.
// ─────────────────────────────────────────────────────────────────────────────

import Bull from 'bull';
import { logger } from './logger';
import { config } from '../config/config';

const REDIS_URL = config.redis.url;

const SHARED_OPTIONS: Bull.QueueOptions = {
  redis: REDIS_URL as unknown as Bull.QueueOptions['redis'],
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: 100,  // Keep last 100 completed for inspection
    removeOnFail: 200,      // Keep last 200 failed for debugging
  },
};

// ── Queue definitions ─────────────────────────────────────────────────────────

/** Dispatches web-push and in-app notifications to users. */
export const notificationQueue = new Bull<PushJobData>('notifications', SHARED_OPTIONS);

/** Sends transactional emails (mention alerts, welcome, digest). */
export const emailQueue = new Bull<EmailJobData>('emails', SHARED_OPTIONS);

// ── Job data types ────────────────────────────────────────────────────────────

export interface PushJobData {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface EmailJobData {
  type: 'mention' | 'reply' | 'welcome' | 'missed_call' | 'workspace_invite';
  to: string;
  subject: string;
  /** Prerendered HTML body */
  html: string;
  /** Plain-text fallback */
  text: string;
}

// ── Queue-level event logging ─────────────────────────────────────────────────

function attachQueueLogger(queue: Bull.Queue, name: string): void {
  queue.on('error', (err) =>
    logger.error({ err, queue: name }, 'Bull queue error'),
  );
  queue.on('failed', (job, err) =>
    logger.warn({ jobId: job.id, queue: name, err }, 'Job failed'),
  );
  queue.on('stalled', (job) =>
    logger.warn({ jobId: job.id, queue: name }, 'Job stalled'),
  );
}

attachQueueLogger(notificationQueue, 'notifications');
attachQueueLogger(emailQueue, 'emails');
