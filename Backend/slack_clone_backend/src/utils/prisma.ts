import { PrismaClient } from '@prisma/client';
import { logger } from './logger';
import { config } from '../config/config';

// Singleton pattern prevents multiple PrismaClient instances during hot-reload in dev.
const globalForPrisma = globalThis as unknown as { _prisma: PrismaClient | undefined };

export const prisma: PrismaClient =
  globalForPrisma._prisma ??
  new PrismaClient({
    log: config.app.isDevelopment
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ]
      : [{ emit: 'event', level: 'error' }],
  });

if (config.app.isDevelopment) {
  // Log slow queries (> 200ms) in dev to catch N+1s early.
  (prisma as PrismaClient).$on('query' as never, (e: { query: string; duration: number }) => {
    if (e.duration > 200) {
      logger.warn({ query: e.query, durationMs: e.duration }, 'Slow Prisma query');
    }
  });
}

if (!config.app.isProduction) {
  globalForPrisma._prisma = prisma;
}
