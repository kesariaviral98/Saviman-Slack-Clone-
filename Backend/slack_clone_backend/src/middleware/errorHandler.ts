import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// AppError — typed application error with HTTP status and machine-readable code.
// Throw this anywhere in the codebase; the global handler maps it to a response.
// ─────────────────────────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code ?? httpCodeToString(statusCode);
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

function httpCodeToString(code: number): string {
  const map: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
  };
  return map[code] ?? 'UNKNOWN_ERROR';
}

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler — must be registered LAST in the Express middleware chain.
// ─────────────────────────────────────────────────────────────────────────────

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // ── AppError (known, operational) ────────────────────────────────────────
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, url: req.url, method: req.method }, 'AppError 5xx');
    }
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  // ── Zod validation error ──────────────────────────────────────────────────
  if (err instanceof ZodError) {
    const message = err.errors
      .map((e) => `${e.path.join('.') || 'value'}: ${e.message}`)
      .join('; ');
    res.status(400).json({
      success: false,
      error: message,
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  // ── Prisma known errors ───────────────────────────────────────────────────
  if (isPrismaError(err)) {
    if (err.code === 'P2002') {
      // Unique constraint violation
      res.status(409).json({
        success: false,
        error: 'A record with this value already exists',
        code: 'CONFLICT',
      });
      return;
    }
    if (err.code === 'P2025') {
      // Record not found
      res.status(404).json({
        success: false,
        error: 'Resource not found',
        code: 'NOT_FOUND',
      });
      return;
    }
  }

  // ── Unknown / programming error ───────────────────────────────────────────
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}

function isPrismaError(err: unknown): err is { code: string; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as Record<string, unknown>)['code'] === 'string'
  );
}
