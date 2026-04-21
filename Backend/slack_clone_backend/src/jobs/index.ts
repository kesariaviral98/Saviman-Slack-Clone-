// ─────────────────────────────────────────────────────────────────────────────
// Jobs bootstrap — starts all Bull workers and schedules recurring jobs.
//
// Called once from src/index.ts after the HTTP server is listening.
// Workers run in the same process as the API server for simplicity.
// For production scale: move workers to a dedicated worker process.
// ─────────────────────────────────────────────────────────────────────────────

import { startNotificationWorker } from './notification.job';
import { startEmailWorker } from './email.job';
import { logger } from '../utils/logger';

export async function initJobs(): Promise<void> {
  startNotificationWorker();
  startEmailWorker();
  logger.info('All Bull workers started');
}
