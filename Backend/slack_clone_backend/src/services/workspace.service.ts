// ─────────────────────────────────────────────────────────────────────────────
// Workspace Service
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { emailQueue } from '../utils/bull';
import { buildInviteEmail } from '../jobs/email.job';
import { config } from '../config/config';
import { invalidateRoleCache } from '../middleware/rbac.middleware';
import { getSocketServer } from '../utils/socketEmitter';
import { SERVER_EVENTS } from '../shared';
import type { Workspace, WorkspaceMember } from '../shared';

const INVITE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// Invite tokens can be plain workspaceId strings (generic links) or
// JSON { workspaceId, email } (email-locked links). Parse both.
function parseInvitePayload(raw: string): { workspaceId: string; email: string | null } {
  try {
    const parsed = JSON.parse(raw) as { workspaceId: string; email?: string };
    return { workspaceId: parsed.workspaceId, email: parsed.email ?? null };
  } catch {
    // Legacy / generic link — plain workspaceId string
    return { workspaceId: raw, email: null };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function generateUniqueSlug(baseName: string): Promise<string> {
  const base = baseName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 35);

  let slug = base;
  let attempt = 0;

  while (true) {
    const existing = await prisma.workspace.findUnique({ where: { slug } });
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

function formatWorkspace(ws: {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  plan: string;
  settings: unknown;
  createdAt: Date;
}): Workspace {
  return {
    id: ws.id,
    slug: ws.slug,
    name: ws.name,
    ownerId: ws.ownerId,
    plan: ws.plan,
    settings: ws.settings as Record<string, unknown>,
    createdAt: ws.createdAt.toISOString(),
  };
}

function formatMember(m: {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  joinedAt: Date;
  user: { id: string; displayName: string; avatarUrl: string | null; statusText: string };
}): WorkspaceMember {
  return {
    id: m.id,
    workspaceId: m.workspaceId,
    userId: m.userId,
    role: m.role as WorkspaceMember['role'],
    joinedAt: m.joinedAt.toISOString(),
    user: {
      id: m.user.id,
      displayName: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
      statusText: m.user.statusText,
    },
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export const workspaceService = {
  async listForUser(userId: string): Promise<Workspace[]> {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map((m) => formatWorkspace(m.workspace));
  },

  async getById(workspaceId: string): Promise<Workspace> {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new AppError(404, 'Workspace not found');
    return formatWorkspace(ws);
  },

  async create(
    userId: string,
    name: string,
    slugInput?: string,
  ): Promise<Workspace> {
    const slug = slugInput
      ? await (async () => {
          const exists = await prisma.workspace.findUnique({ where: { slug: slugInput } });
          if (exists) throw new AppError(409, 'Workspace slug is already taken');
          return slugInput;
        })()
      : await generateUniqueSlug(name);

    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        slug,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: 'admin',
          },
        },
      },
    });

    // Auto-create the standard channels
    const defaultChannels = ['general', 'random', 'announcements'];
    for (const channelName of defaultChannels) {
      const channel = await prisma.channel.create({
        data: {
          workspaceId: workspace.id,
          name: channelName,
          type: channelName === 'announcements' ? 'announcement' : 'text',
        },
      });
      await prisma.channelMember.create({
        data: { channelId: channel.id, userId },
      });
    }

    return formatWorkspace(workspace);
  },

  async delete(workspaceId: string, requesterId: string): Promise<void> {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new AppError(404, 'Workspace not found');
    if (ws.ownerId !== requesterId) throw new AppError(403, 'Only the workspace owner can delete it');
    // Cascades to members, channels, messages via schema onDelete: Cascade
    await prisma.workspace.delete({ where: { id: workspaceId } });
  },

  async update(
    workspaceId: string,
    data: { name?: string; settings?: Record<string, unknown> },
  ): Promise<Workspace> {
    const ws = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.settings ? { settings: data.settings as Prisma.InputJsonValue } : {}),
      },
    });
    return formatWorkspace(ws);
  },

  async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, statusText: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return members.map(formatMember);
  },

  async removeMember(
    workspaceId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<void> {
    // Cannot remove the workspace owner
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new AppError(404, 'Workspace not found');
    if (ws.ownerId === targetUserId) throw new AppError(400, 'Cannot remove the workspace owner');

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (!membership) throw new AppError(404, 'Member not found in this workspace');

    // Prevent removing yourself (use /auth/logout for that)
    if (targetUserId === requesterId) {
      throw new AppError(400, 'Use the leave workspace action to remove yourself');
    }

    // Snapshot ALL channels in this workspace the user belongs to before removal.
    // We need:
    //   • allChannelIds      — to leave only workspace-specific socket rooms
    //   • privateChannels    — to decide which ones to delete afterward
    const allMemberships = await prisma.channelMember.findMany({
      where: { userId: targetUserId, channel: { workspaceId } },
      select: { channel: { select: { id: true, isDm: true, isPrivate: true } } },
    });
    const allChannelIds    = allMemberships.map((m) => m.channel.id);
    const privateChannels  = allMemberships
      .map((m) => m.channel)
      .filter((ch) => ch.isPrivate || ch.isDm); // includes both private groups and DMs

    logger.info(`[removeMember] user=${targetUserId} workspace=${workspaceId} allChannels=${allChannelIds.length} privateChannels=${privateChannels.length} dms=${privateChannels.filter(c => c.isDm).length}`);

    // ── Atomic removal ────────────────────────────────────────────────────────
    await prisma.$transaction([
      prisma.channelMember.deleteMany({
        where: { userId: targetUserId, channel: { workspaceId } },
      }),
      prisma.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      }),
    ]);

    await invalidateRoleCache(targetUserId, workspaceId);

    // ── Clean up now-orphaned private channels and ALL DMs ────────────────────
    // Rules:
    //   • DM channel  → always delete (1-to-1; meaningless without both parties)
    //   • Private group channel with < 2 members remaining → delete
    //   • Private group channel with 2+ remaining → keep (others still need it)
    const deletedChannelIds: string[] = [];
    for (const ch of privateChannels) {
      if (ch.isDm) {
        // DMs are always deleted when either participant leaves the workspace
        logger.info(`[removeMember] deleting DM channel=${ch.id}`);
        await prisma.channel.delete({ where: { id: ch.id } });
        deletedChannelIds.push(ch.id);
        logger.info(`[removeMember] deleted DM channel=${ch.id}`);
      } else {
        const remainingCount = await prisma.channelMember.count({
          where: { channelId: ch.id },
        });
        logger.info(`[removeMember] private channel=${ch.id} remainingCount=${remainingCount}`);
        if (remainingCount < 2) {
          await prisma.channel.delete({ where: { id: ch.id } });
          deletedChannelIds.push(ch.id);
        }
      }
    }
    logger.info(`[removeMember] deletedChannelIds=${JSON.stringify(deletedChannelIds)}`);

    // ── Real-time ─────────────────────────────────────────────────────────────
    const io = getSocketServer();
    if (io) {
      // 1. Tell the removed user's client to redirect away from this workspace
      io.to(`user:${targetUserId}`).emit(SERVER_EVENTS.WORKSPACE_MEMBER_REMOVED, {
        workspaceId,
      });

      // 2. Leave only THIS workspace's rooms — do not touch rooms from other
      //    workspaces the user may belong to
      const sockets = await io.in(`user:${targetUserId}`).fetchSockets();
      for (const s of sockets) {
        s.leave(`workspace:${workspaceId}`);
        for (const channelId of allChannelIds) {
          s.leave(`channel:${channelId}`);
        }
      }

      // 3. Broadcast each deleted channel to the workspace so every remaining
      //    member's sidebar (and open DM list) removes it instantly
      for (const channelId of deletedChannelIds) {
        io.to(`workspace:${workspaceId}`).emit(SERVER_EVENTS.CHANNEL_DELETED, {
          channelId,
          workspaceId,
        });
      }
    }
  },

  async changeMemberRole(
    workspaceId: string,
    targetUserId: string,
    newRole: 'guest' | 'member' | 'admin',
    requesterId: string,
  ): Promise<WorkspaceMember> {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new AppError(404, 'Workspace not found');

    // Only the workspace owner can grant or revoke the admin role
    if (newRole === 'admin' && ws.ownerId !== requesterId) {
      throw new AppError(403, 'Only the workspace owner can grant admin role');
    }
    if (ws.ownerId === targetUserId) {
      throw new AppError(400, 'Cannot change the workspace owner\'s role');
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (!membership) throw new AppError(404, 'Member not found in this workspace');

    const updated = await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { role: newRole },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, statusText: true } },
      },
    });

    await invalidateRoleCache(targetUserId, workspaceId);

    const io = getSocketServer();
    if (io) {
      io.to(`workspace:${workspaceId}`).emit(SERVER_EVENTS.WORKSPACE_MEMBER_ROLE_CHANGED, {
        workspaceId,
        userId: targetUserId,
        role: newRole,
      });
    }

    return formatMember(updated);
  },

  // ── Invite system ────────────────────────────────────────────────────────

  async createInvite(workspaceId: string): Promise<string> {
    const { v4: uuidv4 } = await import('uuid');
    const token = uuidv4();
    await redis.setex(`invite:${token}`, INVITE_TTL_SECONDS, workspaceId);
    return token;
  },

  async sendInviteEmail(
    workspaceId: string,
    inviterUserId: string,
    recipientEmail: string,
  ): Promise<void> {
    // Get workspace and inviter details in parallel
    const [ws, inviter] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId } }),
      prisma.user.findUnique({ where: { id: inviterUserId }, select: { displayName: true } }),
    ]);
    if (!ws) throw new AppError(404, 'Workspace not found');

    const { v4: uuidv4 } = await import('uuid');
    const token = uuidv4();
    // Store workspaceId + locked email so only this recipient can accept
    await redis.setex(
      `invite:${token}`,
      INVITE_TTL_SECONDS,
      JSON.stringify({ workspaceId, email: recipientEmail.toLowerCase().trim() }),
    );

    const inviteLink = `${config.app.clientOrigin}/invite/${token}`;
    const inviterName = inviter?.displayName ?? 'A teammate';

    await emailQueue.add({
      type: 'workspace_invite',
      ...buildInviteEmail({
        to: recipientEmail,
        inviterName,
        workspaceName: ws.name,
        inviteLink,
      }),
    });
  },

  async getInviteWorkspace(token: string): Promise<Workspace> {
    const raw = await redis.get(`invite:${token}`);
    if (!raw) throw new AppError(404, 'Invite link is invalid or has expired');
    const { workspaceId } = parseInvitePayload(raw);
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new AppError(404, 'Workspace no longer exists');
    return formatWorkspace(ws);
  },

  async acceptInvite(token: string, userId: string): Promise<Workspace> {
    const raw = await redis.get(`invite:${token}`);
    if (!raw) throw new AppError(404, 'Invite link is invalid or has expired');

    const { workspaceId, email: lockedEmail } = parseInvitePayload(raw);

    // If this token was issued for a specific email, enforce it
    if (lockedEmail) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (!user || user.email.toLowerCase() !== lockedEmail) {
        throw new AppError(403, 'This invite link was sent to a different email address');
      }
    }

    // Delete immediately — one-time use so no one else can join with the same link
    await redis.del(`invite:${token}`);

    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { channels: { where: { isPrivate: false }, select: { id: true } } },
    });
    if (!ws) throw new AppError(404, 'Workspace no longer exists');

    // Idempotent — ignore if already a member
    const existing = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });

    if (!existing) {
      await prisma.$transaction(async (tx) => {
        await tx.workspaceMember.create({
          data: { workspaceId, userId, role: 'member' },
        });
        // Add to all public channels
        for (const channel of ws.channels) {
          await tx.channelMember.upsert({
            where: { channelId_userId: { channelId: channel.id, userId } },
            update: {},
            create: { channelId: channel.id, userId },
          });
        }
      });

      // Invalidate the RBAC Redis cache so the next request sees the new membership
      // immediately (instead of getting a stale 'null' for up to 5 minutes)
      await invalidateRoleCache(userId, workspaceId);

      // ── Real-time ─────────────────────────────────────────────────────────────
      const io = getSocketServer();
      if (io) {
        // Join the new member's sockets into workspace + channel rooms
        await io.in(`user:${userId}`).socketsJoin(`workspace:${workspaceId}`);
        for (const channel of ws.channels) {
          await io.in(`user:${userId}`).socketsJoin(`channel:${channel.id}`);
        }

        // Fetch the new member record with user details to broadcast to the workspace
        const newMember = await prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId } },
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true, statusText: true } },
          },
        });
        if (newMember) {
          // Notify every connected member so their members modal updates live
          io.to(`workspace:${workspaceId}`).emit(SERVER_EVENTS.WORKSPACE_MEMBER_ADDED, {
            workspaceId,
            member: formatMember(newMember),
          });
        }
      }
    }

    return formatWorkspace(ws);
  },
};
