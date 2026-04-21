import type { Request, Response, NextFunction } from 'express';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Redis sliding-window rate limiter factory.
//
// Algorithm: ZADD sorted set keyed by (requesterId), score = timestamp.
//   - Remove entries older than window start (ZREMRANGEBYSCORE)
//   - Count remaining entries (ZCARD)
//   - If count < max: allow, add entry, expire the set
//   - If count >= max: deny, compute retryAfterMs from oldest entry
//
// Per the spec: rate limits are per userId except login (per IP).
// ─────────────────────────────────────────────────────────────────────────────

export interface RateLimiterOptions {
  /** Derive the rate-limit key from the request. Use userId for most endpoints, IP for login. */
  key: (req: Request) => string;
  /** Maximum number of requests allowed in the window. */
  max: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

/**
 * Creates an Express middleware that enforces a per-key sliding-window rate limit.
 * On limit exceeded: 429 with `{ retryAfterMs }` in body.
 * Rate limiter errors are logged but never block the request (fail-open).
 */
export function createRateLimiter(options: RateLimiterOptions) {
  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const rawKey = options.key(req);
      const redisKey = `ratelimit:${rawKey}`;
      const now = Date.now();
      const windowStart = now - options.windowMs;
      // Unique member — timestamp + random suffix to allow same-ms requests
      const member = `${now}-${Math.random().toString(36).slice(2)}`;

      // Atomic pipeline: remove stale, add current, count, set TTL
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(redisKey, '-inf', windowStart);
      pipeline.zadd(redisKey, now, member);
      pipeline.zcard(redisKey);
      pipeline.pexpire(redisKey, options.windowMs + 1000);
      const results = await pipeline.exec();

      // results[2] = [null, count]
      const count = (results?.[2]?.[1] as number | null) ?? 0;

      if (count > options.max) {
        // Undo the just-added member so we don't inflate the count for retry checks
        await redis.zrem(redisKey, member);

        // Compute retry delay from the oldest entry in the window
        const oldest = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
        const oldestScore = oldest[1] !== undefined ? parseInt(oldest[1], 10) : now;
        const retryAfterMs = Math.max(0, oldestScore + options.windowMs - now);

        res.status(429).json({
          success: false,
          error: 'Too many requests. Please slow down.',
          code: 'RATE_LIMITED',
          retryAfterMs,
        });
        return;
      }

      next();
    } catch (err) {
      // Fail-open: a Redis outage should not block legitimate traffic
      logger.error({ err }, 'Rate limiter error — allowing request through');
      next();
    }
  };
}

// ── Pre-built limiters referenced across multiple modules ─────────────────────

/** 5 messages per second per userId (spec requirement) */
export const messageRateLimit = createRateLimiter({
  key: (req) => `msg:${req.user?.id ?? req.ip ?? 'anon'}`,
  max: 5,
  windowMs: 1_000,
});

/** 10 file uploads per minute per userId */
export const uploadRateLimit = createRateLimiter({
  key: (req) => `upload:${req.user?.id ?? req.ip ?? 'anon'}`,
  max: 10,
  windowMs: 60_000,
});

/** 20 search requests per minute per userId */
export const searchRateLimit = createRateLimiter({
  key: (req) => `search:${req.user?.id ?? req.ip ?? 'anon'}`,
  max: 20,
  windowMs: 60_000,
});

/** 10 login attempts per minute per IP */
export const loginRateLimit = createRateLimiter({
  key: (req) => `login:${req.ip ?? 'unknown'}`,
  max: 10,
  windowMs: 60_000,
});
