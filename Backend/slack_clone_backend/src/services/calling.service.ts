// ─────────────────────────────────────────────────────────────────────────────
// Calling Service — DB operations for WebRTC call lifecycle.
//
// State machine:
//   ringing → active  (on first non-initiator accept)
//   ringing → ended   (initiator cancels, everyone rejects, or disconnect)
//   active  → ended   (explicit end, or last participant disconnects)
//
// WebRTC signaling (SDP offer/answer, ICE candidates) is pure relay in the
// socket handler — the service only tracks call state in PostgreSQL.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError } from '../middleware/errorHandler';
import type { Call, CallParticipant, UserPublic } from '../shared';

// ── DB include shape ──────────────────────────────────────────────────────────

const CALL_INCLUDE = {
  participants: {
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true, statusText: true },
      },
    },
    orderBy: { joinedAt: 'asc' as const },
  },
} satisfies Prisma.CallInclude;

type CallRow = Prisma.CallGetPayload<{ include: typeof CALL_INCLUDE }>;

// ── Formatter ─────────────────────────────────────────────────────────────────

function formatParticipant(
  p: CallRow['participants'][number],
): CallParticipant {
  return {
    id: p.id,
    callId: p.callId,
    userId: p.userId,
    joinedAt: p.joinedAt.toISOString(),
    leftAt: p.leftAt?.toISOString() ?? null,
    user: p.user
      ? {
          id: p.user.id,
          displayName: p.user.displayName,
          avatarUrl: p.user.avatarUrl,
          statusText: p.user.statusText,
        }
      : undefined,
  };
}

export function formatCall(row: CallRow): Call {
  return {
    id: row.id,
    channelId: row.channelId,
    initiatorId: row.initiatorId,
    state: row.state as Call['state'],
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    participants: row.participants.map(formatParticipant),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export const callingService = {
  /**
   * Create a new call in the given channel.
   * Throws 409 if a ringing or active call already exists there.
   * The initiator is automatically added as the first participant.
   */
  async initiateCall(
    channelId: string,
    initiatorId: string,
  ): Promise<{ call: Call; initiator: UserPublic }> {
    // One active call per channel at a time
    const existing = await prisma.call.findFirst({
      where: { channelId, state: { in: ['ringing', 'active'] } },
    });
    if (existing) {
      throw new AppError(409, 'There is already an active call in this channel');
    }

    // Caller must be a channel member
    const member = await prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId: initiatorId } },
    });
    if (!member) throw new AppError(403, 'You are not a member of this channel');

    // Create call + add initiator as first participant in one transaction
    const callId = await prisma.$transaction(async (tx) => {
      const newCall = await tx.call.create({
        data: { channelId, initiatorId, state: 'ringing' },
      });
      await tx.callParticipant.create({
        data: { callId: newCall.id, userId: initiatorId },
      });
      return newCall.id;
    });

    const callRow = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
      include: CALL_INCLUDE,
    });

    const initiatorRow = await prisma.user.findUniqueOrThrow({
      where: { id: initiatorId },
      select: { id: true, displayName: true, avatarUrl: true, statusText: true },
    });

    return {
      call: formatCall(callRow),
      initiator: {
        id: initiatorRow.id,
        displayName: initiatorRow.displayName,
        avatarUrl: initiatorRow.avatarUrl,
        statusText: initiatorRow.statusText,
      },
    };
  },

  /**
   * Accept a ringing call.
   * Idempotent — re-joining is allowed (sets leftAt=null).
   * Transitions state to 'active' on first accept.
   */
  async acceptCall(callId: string, userId: string): Promise<{ call: Call }> {
    const call = await prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw new AppError(404, 'Call not found');
    if (call.state === 'ended') throw new AppError(400, 'This call has already ended');

    // Must be a channel member
    const member = await prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: call.channelId, userId } },
    });
    if (!member) throw new AppError(403, 'You are not a member of this channel');

    // Add/rejoin participant; transition to active
    const updatedRow = await prisma.$transaction(async (tx) => {
      await tx.callParticipant.upsert({
        where: { callId_userId: { callId, userId } },
        update: { leftAt: null, joinedAt: new Date() },
        create: { callId, userId },
      });

      return tx.call.update({
        where: { id: callId },
        data: { state: 'active' },
        include: CALL_INCLUDE,
      });
    });

    return { call: formatCall(updatedRow) };
  },

  /**
   * Reject (decline) an incoming call.
   * - If the initiator rejects their own call → end it.
   * - Otherwise → emit rejection; only auto-end when call is still 'ringing'
   *   and has no other live participants besides the initiator.
   * Returns whether the call was ended as a result.
   */
  async rejectCall(callId: string, userId: string): Promise<{ ended: boolean; channelId: string }> {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: {
        id: true,
        state: true,
        channelId: true,
        initiatorId: true,
      },
    });
    if (!call) throw new AppError(404, 'Call not found');
    if (call.state === 'ended') return { ended: false, channelId: call.channelId };

    const isInitiator = call.initiatorId === userId;
    let shouldEnd = isInitiator; // Initiator cancelling always ends the call

    if (!shouldEnd && call.state === 'ringing') {
      // Auto-end a ringing call if only the initiator remains connected
      const activeCount = await prisma.callParticipant.count({
        where: { callId, leftAt: null },
      });
      shouldEnd = activeCount <= 1; // Only initiator present
    }

    if (shouldEnd) {
      await prisma.call.update({
        where: { id: callId },
        data: { state: 'ended', endedAt: new Date() },
      });
      // Mark all participants as left
      await prisma.callParticipant.updateMany({
        where: { callId, leftAt: null },
        data: { leftAt: new Date() },
      });
    }

    return { ended: shouldEnd, channelId: call.channelId };
  },

  /**
   * Explicitly end a call (any active participant or initiator may end it).
   * Marks all participants as leftAt=now and sets state=ended.
   */
  async endCall(callId: string, requesterId: string): Promise<Call> {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: CALL_INCLUDE,
    });
    if (!call) throw new AppError(404, 'Call not found');
    // Idempotent — return the ended call without error so concurrent end requests don't log noise
    if (call.state === 'ended') return formatCall(call);

    const isParticipant = call.participants.some((p) => p.userId === requesterId);
    const isInitiator = call.initiatorId === requesterId;
    if (!isParticipant && !isInitiator) {
      throw new AppError(403, 'You are not a participant in this call');
    }

    const now = new Date();
    const updatedRow = await prisma.$transaction(async (tx) => {
      await tx.callParticipant.updateMany({
        where: { callId, leftAt: null },
        data: { leftAt: now },
      });
      return tx.call.update({
        where: { id: callId },
        data: { state: 'ended', endedAt: now },
        include: CALL_INCLUDE,
      });
    });

    return formatCall(updatedRow);
  },

  /**
   * Mark a participant as having left.
   * If no active participants remain, ends the call automatically.
   * Safe to call on disconnect — returns callEnded=false if already recorded.
   */
  async participantLeft(
    callId: string,
    userId: string,
  ): Promise<{ callEnded: boolean; channelId: string }> {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: { state: true, channelId: true },
    });
    if (!call || call.state === 'ended') {
      return { callEnded: false, channelId: call?.channelId ?? '' };
    }

    const participant = await prisma.callParticipant.findUnique({
      where: { callId_userId: { callId, userId } },
    });
    if (!participant || participant.leftAt !== null) {
      return { callEnded: false, channelId: call.channelId };
    }

    await prisma.callParticipant.update({
      where: { callId_userId: { callId, userId } },
      data: { leftAt: new Date() },
    });

    const remaining = await prisma.callParticipant.count({
      where: { callId, leftAt: null },
    });

    if (remaining < 2) {
      await prisma.call.update({
        where: { id: callId },
        data: { state: 'ended', endedAt: new Date() },
      });
      // Mark the last participant as left too
      await prisma.callParticipant.updateMany({
        where: { callId, leftAt: null },
        data: { leftAt: new Date() },
      });
      return { callEnded: true, channelId: call.channelId };
    }

    return { callEnded: false, channelId: call.channelId };
  },

  /** Get the currently ringing or active call in a channel, if any. */
  async getActiveCall(channelId: string): Promise<Call | null> {
    const row = await prisma.call.findFirst({
      where: { channelId, state: { in: ['ringing', 'active'] } },
      include: CALL_INCLUDE,
    });
    return row ? formatCall(row) : null;
  },

  async getCallById(callId: string): Promise<Call> {
    const row = await prisma.call.findUnique({
      where: { id: callId },
      include: CALL_INCLUDE,
    });
    if (!row) throw new AppError(404, 'Call not found');
    return formatCall(row);
  },

  /** Cursor-based history of ended calls in a channel, newest first. */
  async getCallHistory(
    channelId: string,
    options: { before?: string; limit?: number } = {},
  ): Promise<{ calls: Call[]; hasMore: boolean; nextCursor: string | null }> {
    const limit = Math.min(options.limit ?? 20, 50);

    let cursorDate: Date | undefined;
    if (options.before) {
      const cursor = await prisma.call.findUnique({
        where: { id: options.before },
        select: { startedAt: true },
      });
      if (cursor) cursorDate = cursor.startedAt;
    }

    const rows = await prisma.call.findMany({
      where: {
        channelId,
        state: 'ended',
        ...(cursorDate ? { startedAt: { lt: cursorDate } } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: limit + 1,
      include: CALL_INCLUDE,
    });

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = slice[slice.length - 1];

    return {
      calls: slice.map(formatCall),
      hasMore,
      nextCursor: hasMore && lastRow ? lastRow.id : null,
    };
  },
};
