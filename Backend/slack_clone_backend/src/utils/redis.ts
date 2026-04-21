import Redis from 'ioredis';
import { logger } from './logger';
import { config } from '../config/config';

const REDIS_URL = config.redis.url;

function createRedisClient(): Redis {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number | null {
      if (times > 10) {
        logger.error('Redis: maximum reconnect attempts reached — giving up');
        return null;
      }
      const delay = Math.min(times * 150, 3000);
      logger.warn({ attempt: times, delayMs: delay }, 'Redis: reconnecting...');
      return delay;
    },
    enableOfflineQueue: true,
    lazyConnect: false,
  });

  client.on('connect', () => logger.info('Redis: connected'));
  client.on('ready', () => logger.info('Redis: ready'));
  client.on('error', (err: Error) => logger.error({ err }, 'Redis: connection error'));
  client.on('close', () => logger.warn('Redis: connection closed'));
  client.on('reconnecting', () => logger.warn('Redis: reconnecting'));

  return client;
}

// Singleton — one connection for commands, one for pub/sub (Socket.io adapter needs separate clients).
export const redis = createRedisClient();

/** Create a fresh Redis client for pub/sub use (subscribe locks the connection). */
export function createSubscriberClient(): Redis {
  return createRedisClient();
}
