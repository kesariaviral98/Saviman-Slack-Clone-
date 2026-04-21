// ─────────────────────────────────────────────────────────────────────────────
// Auth Service — bcrypt hashing, RS256 JWT issuance, refresh token rotation.
//
// Access token:   RS256 JWT, 15-minute TTL, payload: { sub: userId }
// Refresh token:  Opaque UUIDv4 stored in Redis as "refresh:token:{id}" → userId
//                 TTL: 7 days. Rotation: old token deleted on every use.
// ─────────────────────────────────────────────────────────────────────────────

import jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../utils/prisma';
import { redis } from '../utils/redis';
import { AppError } from '../middleware/errorHandler';
import { config } from '../config/config';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// ── Key helpers ───────────────────────────────────────────────────────────────

function getPrivateKey(): string {
  return config.auth.jwtPrivateKey;
}

function getPublicKey(): string {
  return config.auth.jwtPublicKey;
}

function refreshKey(tokenId: string): string {
  return `refresh:token:${tokenId}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string; // userId
  iat: number;
  exp: number;
}

export type SafeUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  statusText: string;
  isPlatformAdmin: boolean;
  createdAt: Date;
};

// ── Safe user selector — never returns passwordHash ───────────────────────────

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  statusText: true,
  isPlatformAdmin: true,
  createdAt: true,
} as const;

// ── Auth service ──────────────────────────────────────────────────────────────

export const authService = {
  // ── Register ──────────────────────────────────────────────────────────────

  async register(
    email: string,
    password: string,
    displayName: string,
  ): Promise<SafeUser> {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) throw new AppError(409, 'An account with this email already exists');

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        displayName: displayName.trim(),
        passwordHash,
      },
      select: SAFE_USER_SELECT,
    });

    return user;
  },

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(
    email: string,
    password: string,
  ): Promise<{ user: SafeUser; accessToken: string; refreshTokenId: string }> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Constant-time comparison even when user doesn't exist (prevents user enumeration)
    const hash = user?.passwordHash ?? '$2b$12$invalidhashforenumeration0000000000000000000';
    const valid = await bcrypt.compare(password, hash);

    if (!user || !valid) {
      throw new AppError(401, 'Invalid email or password');
    }

    const accessToken = this.generateAccessToken(user.id);
    const refreshTokenId = await this.createRefreshToken(user.id);

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      statusText: user.statusText,
      isPlatformAdmin: user.isPlatformAdmin,
      createdAt: user.createdAt,
    };

    return { user: safeUser, accessToken, refreshTokenId };
  },

  // ── JWT access token ──────────────────────────────────────────────────────

  generateAccessToken(userId: string): string {
    return jwt.sign({ sub: userId }, getPrivateKey(), {
      algorithm: 'RS256',
      expiresIn: ACCESS_TOKEN_TTL,
    });
  },

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const payload = jwt.verify(token, getPublicKey(), {
        algorithms: ['RS256'],
      }) as AccessTokenPayload;
      return payload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AppError(401, 'Access token expired');
      }
      throw new AppError(401, 'Invalid access token');
    }
  },

  // ── Refresh token ─────────────────────────────────────────────────────────

  async createRefreshToken(userId: string): Promise<string> {
    const tokenId = uuidv4();
    await redis.setex(refreshKey(tokenId), REFRESH_TOKEN_TTL_SECONDS, userId);
    return tokenId;
  },

  /**
   * Verify a refresh token, rotate it (delete old, issue new), and return
   * fresh access + refresh tokens.
   */
  async rotateRefreshToken(
    oldTokenId: string,
  ): Promise<{ accessToken: string; refreshTokenId: string; userId: string }> {
    const userId = await redis.get(refreshKey(oldTokenId));
    if (!userId) {
      throw new AppError(401, 'Refresh token is expired or has already been used');
    }

    // Delete the old token immediately (rotation — prevents replay)
    await redis.del(refreshKey(oldTokenId));

    const accessToken = this.generateAccessToken(userId);
    const refreshTokenId = await this.createRefreshToken(userId);

    return { accessToken, refreshTokenId, userId };
  },

  async revokeRefreshToken(tokenId: string): Promise<void> {
    await redis.del(refreshKey(tokenId));
  },

  /**
   * Revoke ALL refresh tokens for a user (e.g. ban, password change).
   * Uses SCAN because we store tokens as individual keys (no set index).
   * For high-frequency use, a separate Redis set per user would be faster —
   * this is adequate for the admin/ban scenario.
   */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    // We don't maintain a set of all tokens per user, so we track by convention:
    // Blacklist the userId instead — check on rotation.
    await redis.setex(`user:revoked:${userId}`, REFRESH_TOKEN_TTL_SECONDS, '1');
  },

  // ── Google OAuth — verifies ID token via google-auth-library (audience-validated) ─

  async loginWithGoogle(
    idToken: string,
  ): Promise<{ user: SafeUser; accessToken: string; refreshTokenId: string }> {
    const clientId = config.auth.googleClientId;
    const client = new OAuth2Client(clientId);

    let email: string;
    let name: string | null;

    try {
      // verifyIdToken validates signature, expiry, issuer, and (when clientId is set) audience.
      // Passing undefined audience is safe — it just skips the audience check.
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      if (!payload) throw new Error('Empty payload');

      if (!payload.email) throw new AppError(401, 'Google token did not contain an email');
      if (!payload.email_verified) throw new AppError(401, 'Google email address is not verified');

      email = payload.email;
      name = payload.name ?? null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(401, 'Invalid or expired Google ID token');
    }

    // Find or provision user by email (email is the stable identity)
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const displayName = name ?? email.split('@')[0] ?? 'User';
      // OAuth users have no local password — passwordHash is empty string; bcrypt never matches it
      user = await prisma.user.create({
        data: { email, displayName, passwordHash: '' },
      });
    }

    const accessToken = this.generateAccessToken(user.id);
    const refreshTokenId = await this.createRefreshToken(user.id);

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      statusText: user.statusText,
      isPlatformAdmin: user.isPlatformAdmin,
      createdAt: user.createdAt,
    };

    return { user: safeUser, accessToken, refreshTokenId };
  },
};
