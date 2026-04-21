// ─────────────────────────────────────────────────────────────────────────────
// Admin Service — platform-admin-only operations.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../utils/prisma';
import { redis } from '../utils/redis';
import { authService } from './auth.service';
import { AppError } from '../middleware/errorHandler';

export interface AdminStats {
  totalUsers: number;
  totalWorkspaces: number;
  totalChannels: number;
  totalMessages: number;
  messagesToday: number;
  activeCallsNow: number;
}

export const adminService = {
  async getStats(): Promise<AdminStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalWorkspaces,
      totalChannels,
      totalMessages,
      messagesToday,
      activeCallsNow,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.workspace.count(),
      prisma.channel.count(),
      prisma.message.count(),
      prisma.message.count({ where: { createdAt: { gte: today } } }),
      prisma.call.count({ where: { state: 'active' } }),
    ]);

    return {
      totalUsers,
      totalWorkspaces,
      totalChannels,
      totalMessages,
      messagesToday,
      activeCallsNow,
    };
  },

  async listWorkspaces(options: { page: number; limit: number }) {
    const skip = (options.page - 1) * options.limit;
    const [workspaces, total] = await Promise.all([
      prisma.workspace.findMany({
        skip,
        take: options.limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { members: true, channels: true } } },
      }),
      prisma.workspace.count(),
    ]);

    return {
      workspaces: workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        plan: w.plan,
        createdAt: w.createdAt.toISOString(),
        memberCount: w._count.members,
        channelCount: w._count.channels,
      })),
      total,
      page: options.page,
      pages: Math.ceil(total / options.limit),
    };
  },

  async listUsers(options: { page: number; limit: number }) {
    const skip = (options.page - 1) * options.limit;
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: options.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          isPlatformAdmin: true,
          createdAt: true,
          _count: { select: { messages: true, workspaceMembers: true } },
        },
      }),
      prisma.user.count(),
    ]);

    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        isPlatformAdmin: u.isPlatformAdmin,
        createdAt: u.createdAt.toISOString(),
        messageCount: u._count.messages,
        workspaceCount: u._count.workspaceMembers,
      })),
      total,
      page: options.page,
      pages: Math.ceil(total / options.limit),
    };
  },

  async deleteMessage(messageId: string): Promise<void> {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new AppError(404, 'Message not found');
    await prisma.message.delete({ where: { id: messageId } });
  },

  async banUser(targetUserId: string, reason?: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new AppError(404, 'User not found');
    if (user.isPlatformAdmin) throw new AppError(400, 'Cannot ban a platform administrator');

    // Store ban reason in the user's statusText as a simple marker
    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        statusText: `[BANNED]${reason ? ': ' + reason : ''}`,
        passwordHash: '', // Invalidate local login
      },
    });

    // Revoke all refresh tokens so existing sessions are terminated
    await authService.revokeAllRefreshTokens(targetUserId);

    // Clear presence
    await redis.del(`presence:${targetUserId}`);
  },
};
