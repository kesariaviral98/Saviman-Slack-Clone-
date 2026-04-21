// ─────────────────────────────────────────────────────────────────────────────
// Messaging Service
//
// createMessage is called by BOTH the socket handler (Phase 4) and can be used
// by REST. All other methods are used by both REST routes and socket handlers.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError } from '../middleware/errorHandler';
import type { Message, ReactionGroup } from '../shared';

// ── DB selection shape ────────────────────────────────────────────────────────

const MESSAGE_INCLUDE = {
  sender: {
    select: { id: true, displayName: true, avatarUrl: true, statusText: true },
  },
  reactions: {
    select: { id: true, emoji: true, userId: true, messageId: true },
  },
  _count: { select: { replies: true } },
} satisfies Prisma.MessageInclude;

type MessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

// ── Formatters ────────────────────────────────────────────────────────────────

function groupReactions(
  reactions: { id: string; emoji: string; userId: string; messageId: string }[],
): ReactionGroup[] {
  const map = new Map<string, { count: number; userIds: string[] }>();
  for (const r of reactions) {
    const entry = map.get(r.emoji);
    if (entry) {
      entry.count += 1;
      entry.userIds.push(r.userId);
    } else {
      map.set(r.emoji, { count: 1, userIds: [r.userId] });
    }
  }
  return Array.from(map.entries()).map(([emoji, data]) => ({
    emoji,
    count: data.count,
    userIds: data.userIds,
  }));
}

export function formatMessage(row: MessageRow): Message {
  return {
    id: row.id,
    channelId: row.channelId,
    senderId: row.senderId,
    parentId: row.parentId,
    content: row.content,
    metadata: row.metadata as Record<string, unknown>,
    isEdited: row.isEdited,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    sender: row.sender
      ? {
          id: row.sender.id,
          displayName: row.sender.displayName,
          avatarUrl: row.sender.avatarUrl,
          statusText: row.sender.statusText,
        }
      : undefined,
    reactions: groupReactions(row.reactions),
    replyCount: row._count.replies,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export const messagingService = {
  /**
   * Fetch messages for a channel using cursor-based pagination.
   * `before` is a messageId — returns messages older than that message.
   * Returns newest-first; client reverses for display.
   */
  async getMessages(
    channelId: string,
    options: { before?: string; limit?: number } = {},
  ): Promise<{ messages: Message[]; hasMore: boolean; nextCursor: string | null }> {
    const limit = Math.min(options.limit ?? 50, 100);

    let cursorDate: Date | undefined;
    let cursorId: string | undefined;

    if (options.before) {
      const cursor = await prisma.message.findUnique({
        where: { id: options.before },
        select: { createdAt: true, id: true },
      });
      if (cursor) {
        cursorDate = cursor.createdAt;
        cursorId = cursor.id;
      }
    }

    const rows = await prisma.message.findMany({
      where: {
        channelId,
        parentId: null, // Top-level messages only; thread replies fetched separately
        ...(cursorDate
          ? {
              OR: [
                { createdAt: { lt: cursorDate } },
                // Tie-breaking: same timestamp but earlier ID
                { createdAt: cursorDate, id: { lt: cursorId ?? '' } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: MESSAGE_INCLUDE,
    });

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = slice[slice.length - 1];
    const nextCursor = hasMore && lastRow ? lastRow.id : null;

    return {
      messages: slice.map(formatMessage),
      hasMore,
      nextCursor,
    };
  },

  /** Fetch a single message (used by socket handlers after creation). */
  async getById(messageId: string): Promise<Message> {
    const row = await prisma.message.findUnique({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });
    if (!row) throw new AppError(404, 'Message not found');
    return formatMessage(row);
  },

  /**
   * Create a new message.
   * Called by the socket handler (which handles dedup) and can be called directly.
   */
  async createMessage(data: {
    channelId: string;
    senderId: string;
    content: string;
    parentId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Message> {
    const row = await prisma.message.create({
      data: {
        channelId: data.channelId,
        senderId: data.senderId,
        content: data.content.trim(),
        parentId: data.parentId ?? null,
        metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      },
      include: MESSAGE_INCLUDE,
    });

    return formatMessage(row);
  },

  async editMessage(
    messageId: string,
    requesterId: string,
    content: string,
  ): Promise<Message> {
    const existing = await prisma.message.findUnique({ where: { id: messageId } });
    if (!existing) throw new AppError(404, 'Message not found');
    if (existing.senderId !== requesterId) {
      throw new AppError(403, 'You can only edit your own messages');
    }

    const row = await prisma.message.update({
      where: { id: messageId },
      data: { content: content.trim(), isEdited: true, editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });
    return formatMessage(row);
  },

  async deleteMessage(
    messageId: string,
    requesterId: string,
    requesterWorkspaceRole?: string,
  ): Promise<{ channelId: string }> {
    const existing = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, channelId: true },
    });
    if (!existing) throw new AppError(404, 'Message not found');

    const isOwner = existing.senderId === requesterId;
    const isAdmin = requesterWorkspaceRole === 'admin';

    if (!isOwner && !isAdmin) {
      throw new AppError(403, 'You do not have permission to delete this message');
    }

    await prisma.message.delete({ where: { id: messageId } });
    return { channelId: existing.channelId };
  },

  async getThread(
    parentMessageId: string,
  ): Promise<{ parent: Message; replies: Message[] }> {
    const parentRow = await prisma.message.findUnique({
      where: { id: parentMessageId },
      include: MESSAGE_INCLUDE,
    });
    if (!parentRow) throw new AppError(404, 'Message not found');

    const replyRows = await prisma.message.findMany({
      where: { parentId: parentMessageId },
      orderBy: { createdAt: 'asc' },
      include: MESSAGE_INCLUDE,
    });

    return {
      parent: formatMessage(parentRow),
      replies: replyRows.map(formatMessage),
    };
  },

  async addReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<ReactionGroup[]> {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new AppError(404, 'Message not found');

    await prisma.reaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      update: {},
      create: { messageId, userId, emoji },
    });

    return this._getReactionGroups(messageId);
  },

  async removeReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<ReactionGroup[]> {
    const existing = await prisma.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });
    if (!existing) throw new AppError(404, 'Reaction not found');

    await prisma.reaction.delete({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });

    return this._getReactionGroups(messageId);
  },

  async _getReactionGroups(messageId: string): Promise<ReactionGroup[]> {
    const reactions = await prisma.reaction.findMany({
      where: { messageId },
      select: { id: true, emoji: true, userId: true, messageId: true },
    });
    return groupReactions(reactions);
  },
};
