// ─────────────────────────────────────────────────────────────────────────────
// Socket.io Authentication Middleware
//
// Runs once per connection before the `connection` event fires.
// Reads the JWT from handshake.auth.token, verifies it with RS256, loads the
// user from DB, fetches workspace membership IDs, and attaches everything to
// socket.data so every handler can trust socket.data.user is present.
// ─────────────────────────────────────────────────────────────────────────────

import type { Socket } from 'socket.io';
import { prisma } from '../utils/prisma';
import { authService } from '../services/auth.service';

// ── socket.data shape (augments socket.io's SocketData interface) ─────────────

export interface SocketUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isPlatformAdmin: boolean;
}

declare module 'socket.io' {
  interface SocketData {
    user: SocketUser;
    deviceId: string;      // Set to socket.id (unique per connection)
    workspaceIds: string[]; // All workspaces the user currently belongs to
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function socketAuth(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const token = socket.handshake.auth['token'] as string | undefined;

    if (!token || typeof token !== 'string' || token.trim() === '') {
      return next(new Error('Authentication token is required'));
    }

    // Throws AppError(401) on expired or invalid tokens
    let payload: { sub: string };
    try {
      payload = authService.verifyAccessToken(token.trim());
    } catch {
      return next(new Error('Invalid or expired authentication token'));
    }

    // Validate the user still exists (covers banned / deleted accounts)
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
      return next(new Error('User account not found'));
    }

    // Pre-load workspace memberships so handlers can use them without extra queries
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      select: { workspaceId: true },
    });

    socket.data.user = user;
    socket.data.deviceId = socket.id;
    socket.data.workspaceIds = memberships.map((m) => m.workspaceId);

    next();
  } catch (err) {
    next(err instanceof Error ? err : new Error('Socket authentication failed'));
  }
}
