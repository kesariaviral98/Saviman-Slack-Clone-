// ─────────────────────────────────────────────────────────────────────────────
// RBAC Middleware
//
// Enforcement order for every protected route (per spec rule 17):
//   authenticate → requireWorkspaceMember → requireRole(minRole)
//   → requireChannelMember (channel-scoped routes only) → handler
//
// Roles (ascending power): guest < member < admin
// Platform admins bypass all workspace/channel role checks.
//
// Role cache: Redis key "rbac:{userId}:{workspaceId}" with 5-minute TTL.
// This prevents a DB hit on every request while still reflecting
// role changes within 5 minutes.
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { redis } from '../utils/redis';
import { AppError } from './errorHandler';

// ── Role hierarchy ─────────────────────────────────────────────────────────────

type WorkspaceRole = 'guest' | 'member' | 'admin';

const ROLE_WEIGHT: Record<WorkspaceRole, number> = {
  guest:  1,
  member: 2,
  admin:  3,
};

const RBAC_CACHE_TTL_SECONDS = 300; // 5 minutes

// ── Internal helpers ──────────────────────────────────────────────────────────

async function fetchWorkspaceRole(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceRole | null> {
  const cacheKey = `rbac:${userId}:${workspaceId}`;

  const cached = await redis.get(cacheKey);
  if (cached === 'null') return null;
  if (cached !== null) return cached as WorkspaceRole;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });

  // Cache result (including absence) to avoid DB hits on every request
  await redis.setex(cacheKey, RBAC_CACHE_TTL_SECONDS, member?.role ?? 'null');

  return (member?.role as WorkspaceRole) ?? null;
}

/** Invalidate the cached role for a user in a workspace. Call after role changes. */
export async function invalidateRoleCache(userId: string, workspaceId: string): Promise<void> {
  await redis.del(`rbac:${userId}:${workspaceId}`);
}

// ── Middleware factories ───────────────────────────────────────────────────────

/**
 * Verifies the authenticated user is a member of the given workspace.
 * Attaches req.workspaceRole for downstream requireRole() checks.
 *
 * @param getWorkspaceId  Extract workspaceId from the request (params, body, query).
 */
export function requireWorkspaceMember(getWorkspaceId: (req: Request) => string) {
  return async function workspaceMemberGuard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'Not authenticated');

      // Platform admins have implicit access to every workspace
      if (req.user.isPlatformAdmin) {
        req.workspaceRole = 'admin';
        return next();
      }

      const workspaceId = getWorkspaceId(req);
      const role = await fetchWorkspaceRole(req.user.id, workspaceId);

      if (!role) {
        throw new AppError(403, 'You are not a member of this workspace');
      }

      req.workspaceRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Enforces a minimum workspace role.
 * Must be placed AFTER requireWorkspaceMember() in the middleware chain.
 *
 * @param minRole  The minimum role required ('guest' | 'member' | 'admin')
 */
export function requireRole(minRole: WorkspaceRole) {
  return function roleGuard(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      return next(new AppError(401, 'Not authenticated'));
    }

    // Platform admins bypass all role checks
    if (req.user.isPlatformAdmin) return next();

    const currentRole = req.workspaceRole as WorkspaceRole | undefined;
    if (!currentRole) {
      return next(new AppError(403, 'Workspace membership not verified'));
    }

    const userWeight = ROLE_WEIGHT[currentRole] ?? 0;
    const requiredWeight = ROLE_WEIGHT[minRole] ?? 0;

    if (userWeight < requiredWeight) {
      return next(
        new AppError(403, `This action requires the '${minRole}' role or higher`),
      );
    }

    next();
  };
}

/**
 * Like requireWorkspaceMember but resolves the workspaceId from the channel.
 * Use for channel-scoped routes where the URL only contains a channelId, not a workspaceId.
 * Must appear BEFORE requireRole() in the middleware chain.
 *
 * @param getChannelId  Extract channelId from the request.
 */
export function requireWorkspaceMemberViaChannel(getChannelId: (req: Request) => string) {
  return async function workspaceMemberViaChannelGuard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'Not authenticated');

      if (req.user.isPlatformAdmin) {
        req.workspaceRole = 'admin';
        return next();
      }

      const channelId = getChannelId(req);
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { workspaceId: true },
      });
      if (!channel) throw new AppError(404, 'Channel not found');

      const role = await fetchWorkspaceRole(req.user.id, channel.workspaceId);
      if (!role) throw new AppError(403, 'You are not a member of this workspace');

      req.workspaceRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Verifies the authenticated user is a member of the given channel.
 * Returns 403 (NOT 404) for private channels to avoid revealing their existence.
 *
 * @param getChannelId  Extract channelId from the request.
 */
export function requireChannelMember(getChannelId: (req: Request) => string) {
  return async function channelMemberGuard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'Not authenticated');

      const channelId = getChannelId(req);

      const member = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId: req.user.id } },
        select: { id: true },
      });

      if (!member) {
        // Always 403 — never 404. This prevents non-members from probing
        // whether a private channel exists.
        throw new AppError(403, 'You are not a member of this channel');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Hard-gates a route to platform admins only.
 * Does NOT require requireWorkspaceMember in the chain before it.
 */
export function requirePlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    return next(new AppError(401, 'Not authenticated'));
  }
  if (!req.user.isPlatformAdmin) {
    return next(new AppError(403, 'Platform administrator access required'));
  }
  next();
}
