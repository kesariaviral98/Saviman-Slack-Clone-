// ─────────────────────────────────────────────────────────────────────────────
// Auth Router
//   POST /auth/register      — create account
//   POST /auth/login         — issue access token + refresh cookie
//   POST /auth/refresh       — rotate refresh token → new access token
//   POST /auth/logout        — revoke refresh token
//   POST /auth/oauth/google  — Google ID token → issue tokens
//   GET  /auth/me            — return current user (requires Bearer token)
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type Request, type Response, type NextFunction } from 'express';
import { RegisterSchema, LoginSchema } from '../shared';
import { authService } from '../services/auth.service';
import { authenticate } from '../middleware/auth.middleware';
import { loginRateLimit } from '../middleware/rateLimit.middleware';
import { AppError } from '../middleware/errorHandler';
import { config } from '../config/config';

export const authRouter = Router();

// ── Cookie helpers ────────────────────────────────────────────────────────────

const COOKIE_NAME = 'refresh_token';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function setRefreshCookie(res: Response, tokenId: string): void {
  res.cookie(COOKIE_NAME, tokenId, {
    httpOnly: true,
    secure: config.app.isProduction,
    sameSite: config.app.isProduction ? 'none' : 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/auth', // Scope the cookie to /auth routes only
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/auth' });
}

// ── POST /auth/register ───────────────────────────────────────────────────────

authRouter.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = RegisterSchema.parse(req.body);
      const user = await authService.register(body.email, body.password, body.displayName);

      const accessToken = authService.generateAccessToken(user.id);
      const refreshTokenId = await authService.createRefreshToken(user.id);

      setRefreshCookie(res, refreshTokenId);

      res.status(201).json({
        success: true,
        data: { user, accessToken },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /auth/login ──────────────────────────────────────────────────────────

authRouter.post(
  '/login',
  loginRateLimit,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = LoginSchema.parse(req.body);
      const { user, accessToken, refreshTokenId } = await authService.login(
        body.email,
        body.password,
      );

      setRefreshCookie(res, refreshTokenId);

      res.json({
        success: true,
        data: { user, accessToken },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /auth/refresh ────────────────────────────────────────────────────────

authRouter.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const oldTokenId = req.cookies[COOKIE_NAME] as string | undefined;
      if (!oldTokenId) {
        throw new AppError(401, 'No refresh token provided');
      }

      const { accessToken, refreshTokenId } = await authService.rotateRefreshToken(oldTokenId);

      setRefreshCookie(res, refreshTokenId);

      res.json({
        success: true,
        data: { accessToken },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /auth/logout ─────────────────────────────────────────────────────────

authRouter.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tokenId = req.cookies[COOKIE_NAME] as string | undefined;
      if (tokenId) {
        await authService.revokeRefreshToken(tokenId);
      }

      clearRefreshCookie(res);

      res.json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /auth/oauth/google ───────────────────────────────────────────────────

authRouter.post(
  '/oauth/google',
  loginRateLimit,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { idToken } = req.body as { idToken?: unknown };
      if (typeof idToken !== 'string' || !idToken) {
        throw new AppError(400, 'idToken (string) is required');
      }

      const { user, accessToken, refreshTokenId } =
        await authService.loginWithGoogle(idToken);

      setRefreshCookie(res, refreshTokenId);

      res.json({
        success: true,
        data: { user, accessToken },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /auth/me ──────────────────────────────────────────────────────────────

authRouter.get(
  '/me',
  authenticate,
  (req: Request, res: Response): void => {
    // req.user is guaranteed by authenticate middleware
    res.json({ success: true, data: { user: req.user } });
  },
);
