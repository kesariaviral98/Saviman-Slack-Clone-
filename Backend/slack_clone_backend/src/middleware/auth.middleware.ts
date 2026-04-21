// ─────────────────────────────────────────────────────────────────────────────
// Auth Middleware
//
// authenticate(req, res, next)
//   - Extracts Bearer token from Authorization header
//   - Verifies RS256 JWT signature and expiry
//   - Loads the user record from DB
//   - Attaches req.user
//   - Calls next(AppError(401)) on any failure
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { authService } from '../services/auth.service';
import { AppError } from './errorHandler';

/**
 * Strict authentication guard — rejects requests without a valid Bearer token.
 * Attach BEFORE any route handler that requires an authenticated user.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'Authorization header with Bearer token is required');
    }

    const token = authHeader.slice(7).trim();
    if (!token) throw new AppError(401, 'Bearer token is empty');

    // Verify signature + expiry — throws AppError(401) on failure
    const payload = authService.verifyAccessToken(token);

    // Fetch user from DB — ensures deleted/banned users can't use old tokens
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        isPlatformAdmin: true,
      },
    });

    if (!user) {
      throw new AppError(401, 'User associated with this token no longer exists');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional authentication — attaches req.user if a valid token is present,
 * but does NOT reject requests without one.  Useful for routes that behave
 * differently for authenticated vs anonymous visitors.
 */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  return authenticate(req, res, next);
}
