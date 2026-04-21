// ─────────────────────────────────────────────────────────────────────────────
// Search Service — PostgreSQL full-text search via tsvector/tsquery.
//
// Uses $queryRaw with Prisma.sql for safe parameterised queries.
// Results are always filtered to channels the requesting user is a member of —
// this prevents leaking messages from private channels.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';

export interface SearchResult {
  id: string;
  channelId: string;
  channelName: string;
  senderId: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  content: string;
  createdAt: Date;
  isEdited: boolean;
  rank: number;
}

export interface SearchResultFormatted {
  id: string;
  channelId: string;
  channelName: string;
  senderId: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  content: string;
  createdAt: string;
  isEdited: boolean;
  rank: number;
}

export const searchService = {
  async search(options: {
    query: string;
    workspaceId: string;
    userId: string;
    channelId?: string;
    limit?: number;
  }): Promise<SearchResultFormatted[]> {
    const limit = Math.min(options.limit ?? 20, 50);

    // Build optional channel filter safely
    const channelFilter = options.channelId
      ? Prisma.sql`AND m."channelId" = ${options.channelId}`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<SearchResult[]>(
      Prisma.sql`
        SELECT
          m.id,
          m."channelId",
          c.name                                          AS "channelName",
          m."senderId",
          u."displayName"                                 AS "senderDisplayName",
          u."avatarUrl"                                   AS "senderAvatarUrl",
          m.content,
          m."createdAt",
          m."isEdited",
          ts_rank(m."searchVec", plainto_tsquery('english', ${options.query})) AS rank
        FROM "Message" m
        JOIN "User"    u  ON u.id = m."senderId"
        JOIN "Channel" c  ON c.id = m."channelId"
        -- Security: only channels the requesting user is a member of
        JOIN "ChannelMember" cm
          ON cm."channelId" = m."channelId"
         AND cm."userId"    = ${options.userId}
        WHERE
          c."workspaceId" = ${options.workspaceId}
          AND m."searchVec" @@ plainto_tsquery('english', ${options.query})
          ${channelFilter}
        ORDER BY rank DESC
        LIMIT ${limit}
      `,
    );

    return rows.map((r) => ({
      id: r.id,
      channelId: r.channelId,
      channelName: r.channelName,
      senderId: r.senderId,
      senderDisplayName: r.senderDisplayName,
      senderAvatarUrl: r.senderAvatarUrl,
      content: r.content,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      isEdited: r.isEdited,
      rank: Number(r.rank),
    }));
  },
};
