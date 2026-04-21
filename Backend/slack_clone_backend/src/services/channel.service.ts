// ─────────────────────────────────────────────────────────────────────────────
// Channel Service
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../utils/prisma';
import { AppError } from '../middleware/errorHandler';
import { invalidateRoleCache } from '../middleware/rbac.middleware';
import { getSocketServer } from '../utils/socketEmitter';
import { SERVER_EVENTS } from '../shared';
import type { Channel, ChannelMember } from '../shared';

// ── Formatters ────────────────────────────────────────────────────────────────

function formatChannel(ch: {
  id: string;
  workspaceId: string;
  name: string;
  isPrivate: boolean;
  isDm: boolean;
  type: string;
  createdAt: Date;
}): Channel {
  return {
    id: ch.id,
    workspaceId: ch.workspaceId,
    name: ch.name,
    isPrivate: ch.isPrivate,
    isDm: ch.isDm,
    type: ch.type as Channel['type'],
    createdAt: ch.createdAt.toISOString(),
  };
}

function formatMember(m: {
  id: string;
  channelId: string;
  userId: string;
  joinedAt: Date;
  user: { id: string; displayName: string; avatarUrl: string | null; statusText: string };
}): ChannelMember {
  return {
    id: m.id,
    channelId: m.channelId,
    userId: m.userId,
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

export const channelService = {
  /**
   * List channels in a workspace visible to the requesting user:
   * - All public channels
   * - Private channels where user is a member
   */
  async listForWorkspace(workspaceId: string, userId: string): Promise<Channel[]> {
    const channels = await prisma.channel.findMany({
      where: {
        workspaceId,
        OR: [
          { isPrivate: false },
          { isPrivate: true, members: { some: { userId } } },
        ],
      },
      orderBy: [{ isDm: 'asc' }, { name: 'asc' }],
    });
    return channels.map(formatChannel);
  },

  async getById(channelId: string, userId: string): Promise<Channel> {
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new AppError(404, 'Channel not found');

    if (channel.isPrivate) {
      const member = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
      });
      // 403, not 404 — never reveal whether a private channel exists
      if (!member) throw new AppError(403, 'You are not a member of this channel');
    }

    return formatChannel(channel);
  },

  async create(
    workspaceId: string,
    userId: string,
    data: { name: string; isPrivate?: boolean; type?: string; memberIds?: string[] },
  ): Promise<Channel> {
    // Check name uniqueness within workspace
    const existing = await prisma.channel.findUnique({
      where: { workspaceId_name: { workspaceId, name: data.name } },
    });
    if (existing) throw new AppError(409, `Channel #${data.name} already exists`);

    const channel = await prisma.$transaction(async (tx) => {
      const ch = await tx.channel.create({
        data: {
          workspaceId,
          name: data.name.toLowerCase().trim(),
          isPrivate: data.isPrivate ?? false,
          type: data.type ?? 'text',
        },
      });
      // Creator always added as first member
      await tx.channelMember.create({ data: { channelId: ch.id, userId } });

      if (data.isPrivate) {
        // Private channel: add only the explicitly selected members (if any)
        if (data.memberIds && data.memberIds.length > 0) {
          const invited = [...new Set(data.memberIds)].filter((id) => id !== userId);
          if (invited.length > 0) {
            // Verify all invited users are workspace members
            const valid = await tx.workspaceMember.findMany({
              where: { workspaceId, userId: { in: invited } },
              select: { userId: true },
            });
            const validIds = valid.map((m) => m.userId);
            if (validIds.length > 0) {
              await tx.channelMember.createMany({
                data: validIds.map((id) => ({ channelId: ch.id, userId: id })),
                skipDuplicates: true,
              });
            }
          }
        }
      } else {
        // Public channel: add all workspace members automatically
        const wsMembers = await tx.workspaceMember.findMany({
          where: { workspaceId },
          select: { userId: true },
        });
        const otherMembers = wsMembers.filter((m) => m.userId !== userId);
        if (otherMembers.length > 0) {
          await tx.channelMember.createMany({
            data: otherMembers.map((m) => ({ channelId: ch.id, userId: m.userId })),
            skipDuplicates: true,
          });
        }
      }

      return ch;
    });

    const formattedChannel = formatChannel(channel);

    // ── Real-time: push the new channel to all affected members ──────────────
    const io = getSocketServer();
    if (io) {
      if (data.isPrivate) {
        // For private channels: notify each member individually and join their
        // sockets into the channel room so messages arrive without a page reload.
        const channelMembers = await prisma.channelMember.findMany({
          where: { channelId: channel.id },
          select: { userId: true },
        });
        for (const { userId: memberId } of channelMembers) {
          // Force all active sockets of this user into the channel room
          await io.in(`user:${memberId}`).socketsJoin(`channel:${channel.id}`);
          // Send the channel object so the sidebar can add it instantly
          io.to(`user:${memberId}`).emit(SERVER_EVENTS.CHANNEL_ADDED, {
            channel: formattedChannel,
          });
        }
      } else {
        // For public channels: broadcast to the whole workspace room and join
        // every connected workspace member into the new channel room at once.
        await io.in(`workspace:${workspaceId}`).socketsJoin(`channel:${channel.id}`);
        io.to(`workspace:${workspaceId}`).emit(SERVER_EVENTS.CHANNEL_ADDED, {
          channel: formattedChannel,
        });
      }
    }

    return formattedChannel;
  },

  async update(
    channelId: string,
    data: { name?: string; isPrivate?: boolean },
  ): Promise<Channel> {
    if (data.name) {
      // Check for name conflict within workspace
      const channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel) throw new AppError(404, 'Channel not found');

      const conflict = await prisma.channel.findUnique({
        where: { workspaceId_name: { workspaceId: channel.workspaceId, name: data.name } },
      });
      if (conflict && conflict.id !== channelId) {
        throw new AppError(409, `Channel #${data.name} already exists`);
      }
    }

    const updated = await prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(data.name ? { name: data.name.toLowerCase().trim() } : {}),
        ...(data.isPrivate !== undefined ? { isPrivate: data.isPrivate } : {}),
      },
    });
    return formatChannel(updated);
  },

  async delete(channelId: string): Promise<void> {
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new AppError(404, 'Channel not found');
    const { workspaceId } = channel;
    // Cascade deletes members, messages via schema onDelete: Cascade
    await prisma.channel.delete({ where: { id: channelId } });
    const io = getSocketServer();
    if (io) {
      io.to(`workspace:${workspaceId}`).emit(SERVER_EVENTS.CHANNEL_DELETED, {
        channelId,
        workspaceId,
      });
    }
  },

  async getMembers(channelId: string): Promise<ChannelMember[]> {
    const members = await prisma.channelMember.findMany({
      where: { channelId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, statusText: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return members.map(formatMember);
  },

  async addMember(channelId: string, targetUserId: string): Promise<ChannelMember> {
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new AppError(404, 'Channel not found');

    // Verify target user is a workspace member
    const wsMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: channel.workspaceId, userId: targetUserId } },
    });
    if (!wsMember) throw new AppError(400, 'User is not a member of this workspace');

    const member = await prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      update: {},
      create: { channelId, userId: targetUserId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, statusText: true } },
      },
    });
    return formatMember(member);
  },

  async removeMember(channelId: string, targetUserId: string): Promise<void> {
    const existing = await prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId: targetUserId } },
    });
    if (!existing) throw new AppError(404, 'User is not a member of this channel');

    await prisma.channelMember.delete({
      where: { channelId_userId: { channelId, userId: targetUserId } },
    });
  },

  /**
   * Create or return an existing DM channel between two users in a workspace.
   * DM channels are identified by isDm: true and have exactly 2 members.
   */
  async getOrCreateDm(
    workspaceId: string,
    userIdA: string,
    userIdB: string,
  ): Promise<Channel> {
    // Look for an existing DM channel with exactly these two members
    const existing = await prisma.channel.findFirst({
      where: {
        workspaceId,
        isDm: true,
        members: {
          every: {
            userId: { in: [userIdA, userIdB] },
          },
        },
        AND: [
          { members: { some: { userId: userIdA } } },
          { members: { some: { userId: userIdB } } },
        ],
      },
    });

    if (existing) {
      // Ensure both users' live sockets are in the channel room.
      // This covers cases where a user reconnected after the DM was created
      // (auto-join only runs at connect time for channels known at that point).
      const io = getSocketServer();
      if (io) {
        await io.in(`user:${userIdA}`).socketsJoin(`channel:${existing.id}`);
        await io.in(`user:${userIdB}`).socketsJoin(`channel:${existing.id}`);
      }
      return formatChannel(existing);
    }

    // Verify both are workspace members
    const [memberA, memberB] = await Promise.all([
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: userIdA } },
      }),
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: userIdB } },
      }),
    ]);
    if (!memberA || !memberB) {
      throw new AppError(400, 'Both users must be workspace members to start a DM');
    }

    // Create the DM channel
    const dmName = [userIdA, userIdB].sort().join('-dm-');
    const channel = await prisma.$transaction(async (tx) => {
      const ch = await tx.channel.create({
        data: { workspaceId, name: dmName, isPrivate: true, isDm: true, type: 'text' },
      });
      await tx.channelMember.createMany({
        data: [
          { channelId: ch.id, userId: userIdA },
          { channelId: ch.id, userId: userIdB },
        ],
      });
      return ch;
    });

    const formattedChannel = formatChannel(channel);

    // Join both users' sockets into the new channel room and notify them so
    // the DM appears in their sidebar immediately (critical for the recipient
    // who never clicked anything).
    const io = getSocketServer();
    if (io) {
      for (const userId of [userIdA, userIdB]) {
        await io.in(`user:${userId}`).socketsJoin(`channel:${channel.id}`);
        io.to(`user:${userId}`).emit(SERVER_EVENTS.CHANNEL_ADDED, {
          channel: formattedChannel,
        });
      }
    }

    return formattedChannel;
  },
};
