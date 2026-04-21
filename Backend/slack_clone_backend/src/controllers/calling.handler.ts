// ─────────────────────────────────────────────────────────────────────────────
// Calling Handler — WebRTC call lifecycle and SDP/ICE signaling relay.
//
// Call lifecycle (via Socket.io):
//   call:initiate    → create DB record; emit call:ringing to channel room
//   call:accept      → add participant; emit call:accepted + participant:joined
//   call:reject      → emit call:rejected; auto-end if no participants remain
//   call:end         → end call; emit call:ended to channel room
//
// WebRTC peer-to-peer signaling (pure relay — server never inspects SDP/ICE):
//   call:sdp-offer   → forward to user:{targetUserId} room
//   call:sdp-answer  → forward to user:{targetUserId} room
//   call:ice-candidate → forward to user:{targetUserId} room
//
// Disconnect cleanup:
//   On disconnect, any active call participation is closed.
//   If the last participant leaves, the call is auto-ended.
//
// Room conventions (same as messaging layer):
//   channel:{channelId} — all channel members (receives ringing, ended, etc.)
//   user:{userId}       — personal room (receives SDP/ICE point-to-point)
// ─────────────────────────────────────────────────────────────────────────────

import type { Server, Socket } from 'socket.io';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../shared';
import type { SocketAck } from '../shared';
import type {
  CallSdpOfferInput,
  CallSdpAnswerInput,
  CallIceCandidateInput,
  CallInitiateInput,
  CallAcceptInput,
  CallRejectInput,
  CallEndInput,
} from '../shared';
import { prisma } from '../utils/prisma';
import { callingService } from '../services/calling.service';
import { notificationService } from '../services/notification.service';
import { logger } from '../utils/logger';

// Module-level map: callId → callType.
// Keeps callType in memory so all participants receive it without a DB migration.
const callTypeMap = new Map<string, 'audio' | 'video'>();

export function registerCallingHandler(io: Server, socket: Socket): void {
  const { user } = socket.data;

  // ── call:initiate ─────────────────────────────────────────────────────────────
  // Creates a new call and notifies all channel members.

  socket.on(
    CLIENT_EVENTS.CALL_INITIATE,
    (payload: CallInitiateInput, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const channelId = payload?.channelId;
          const callType: 'audio' | 'video' = payload?.callType ?? 'video';
          if (!channelId) {
            ack?.({ success: false, error: 'channelId is required' });
            return;
          }

          const { call, initiator } = await callingService.initiateCall(channelId, user.id);
          callTypeMap.set(call.id, callType);
          const callWithType = { ...call, callType };

          // Join the channel room if not already in it (auto-join handles this, but be safe)
          await socket.join(`channel:${channelId}`);

          // Notify all channel members of the incoming call (callType lets callee open right media)
          io.to(`channel:${channelId}`).emit(SERVER_EVENTS.CALL_RINGING, { call: callWithType, initiator });

          ack?.({ success: true, data: { call: callWithType } });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'call:initiate error');
          ack?.({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to initiate call',
          });
        }
      })();
    },
  );

  // ── call:accept ──────────────────────────────────────────────────────────────

  socket.on(
    CLIENT_EVENTS.CALL_ACCEPT,
    (payload: CallAcceptInput, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const callId = payload?.callId;
          if (!callId) {
            ack?.({ success: false, error: 'callId is required' });
            return;
          }

          const { call } = await callingService.acceptCall(callId, user.id);
          const callType = callTypeMap.get(callId) ?? 'video';

          // Notify the channel that this user accepted
          io.to(`channel:${call.channelId}`).emit(SERVER_EVENTS.CALL_ACCEPTED, {
            callId,
            userId: user.id,
          });

          // Announce the new participant to everyone in the channel
          io.to(`channel:${call.channelId}`).emit(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, {
            callId,
            user: {
              id: user.id,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
              statusText: '',
            },
          });

          ack?.({ success: true, data: { call: { ...call, callType } } });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'call:accept error');
          ack?.({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to accept call',
          });
        }
      })();
    },
  );

  // ── call:reject ──────────────────────────────────────────────────────────────

  socket.on(
    CLIENT_EVENTS.CALL_REJECT,
    (payload: CallRejectInput, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const callId = payload?.callId;
          if (!callId) {
            ack?.({ success: false, error: 'callId is required' });
            return;
          }

          // Get call initiator before modifying state
          const callRecord = await prisma.call.findUnique({
            where: { id: callId },
            select: { initiatorId: true, channelId: true },
          });
          if (!callRecord) {
            ack?.({ success: false, error: 'Call not found' });
            return;
          }

          const { ended, channelId } = await callingService.rejectCall(callId, user.id);

          // Notify channel of the rejection
          io.to(`channel:${channelId}`).emit(SERVER_EVENTS.CALL_REJECTED, {
            callId,
            userId: user.id,
          });

          if (ended) {
            io.to(`channel:${channelId}`).emit(SERVER_EVENTS.CALL_ENDED, { callId });

            // Notify the initiator of a missed call (when someone else rejected)
            if (callRecord.initiatorId !== user.id) {
              // Look up channel metadata for email/notification link
              prisma.channel.findUnique({
                where: { id: callRecord.channelId },
                select: { workspaceId: true, name: true },
              }).then((callChannel) => {
                notificationService
                  .createNotification({
                    userId: callRecord.initiatorId,
                    type: 'call_missed',
                    payload: {
                      callId,
                      channelId: callRecord.channelId,
                      workspaceId: callChannel?.workspaceId,
                      channelName: callChannel?.name,
                      fromUserId: user.id,
                      fromDisplayName: user.displayName,
                    },
                  })
                  .catch((err: unknown) => {
                    logger.warn({ err }, 'Failed to send missed call notification');
                  });
              }).catch((err: unknown) => {
                logger.warn({ err }, 'Failed to fetch channel for missed call notification');
              });
            }
          }

          ack?.({ success: true, data: null });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'call:reject error');
          ack?.({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to reject call',
          });
        }
      })();
    },
  );

  // ── call:end ──────────────────────────────────────────────────────────────────
  // An explicit "end call" action terminates the call for everyone in the
  // channel. This matches the UI expectation for the red hang-up button.

  socket.on(
    CLIENT_EVENTS.CALL_END,
    (payload: CallEndInput, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const callId = payload?.callId;
          if (!callId) {
            ack?.({ success: false, error: 'callId is required' });
            return;
          }

          const call = await callingService.endCall(callId, user.id);
          callTypeMap.delete(callId);
          io.to(`channel:${call.channelId}`).emit(SERVER_EVENTS.CALL_ENDED, { callId });

          ack?.({ success: true, data: null });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'call:end error');
          ack?.({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to end call',
          });
        }
      })();
    },
  );

  // ── call:leave — participant leaves without force-ending the call ────────────
  // Uses participantLeft logic: only ends the call when < 2 participants remain.

  socket.on(
    CLIENT_EVENTS.CALL_LEAVE,
    (payload: CallEndInput, ack?: (res: SocketAck) => void) => {
      void (async () => {
        try {
          const callId = payload?.callId;
          if (!callId) {
            ack?.({ success: false, error: 'callId is required' });
            return;
          }

          const { callEnded, channelId } = await callingService.participantLeft(callId, user.id);

          io.to(`channel:${channelId}`).emit(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, {
            callId,
            userId: user.id,
          });

          if (callEnded) {
            callTypeMap.delete(callId);
            io.to(`channel:${channelId}`).emit(SERVER_EVENTS.CALL_ENDED, { callId });
          }

          ack?.({ success: true, data: null });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'call:leave error');
          ack?.({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to leave call',
          });
        }
      })();
    },
  );

  // ── call:sdp-offer — relay to target user's personal room ─────────────────────
  // Server is a pure relay — SDP content is never inspected or modified.

  socket.on(
    CLIENT_EVENTS.CALL_SDP_OFFER,
    (payload: CallSdpOfferInput, ack?: (res: SocketAck) => void) => {
      const { callId, targetUserId, sdp } = payload ?? {};
      if (!callId || !targetUserId || !sdp) {
        ack?.({ success: false, error: 'callId, targetUserId, and sdp are required' });
        return;
      }

      io.to(`user:${targetUserId}`).emit(SERVER_EVENTS.CALL_SDP_OFFER, {
        callId,
        fromUserId: user.id,
        sdp,
      });

      ack?.({ success: true, data: null });
    },
  );

  // ── call:sdp-answer — relay to target user's personal room ───────────────────

  socket.on(
    CLIENT_EVENTS.CALL_SDP_ANSWER,
    (payload: CallSdpAnswerInput, ack?: (res: SocketAck) => void) => {
      const { callId, targetUserId, sdp } = payload ?? {};
      if (!callId || !targetUserId || !sdp) {
        ack?.({ success: false, error: 'callId, targetUserId, and sdp are required' });
        return;
      }

      io.to(`user:${targetUserId}`).emit(SERVER_EVENTS.CALL_SDP_ANSWER, {
        callId,
        fromUserId: user.id,
        sdp,
      });

      ack?.({ success: true, data: null });
    },
  );

  // ── call:ice-candidate — relay to target user's personal room ─────────────────

  socket.on(
    CLIENT_EVENTS.CALL_ICE_CANDIDATE,
    (payload: CallIceCandidateInput, ack?: (res: SocketAck) => void) => {
      const { callId, targetUserId, candidate } = payload ?? {};
      if (!callId || !targetUserId || !candidate) {
        ack?.({ success: false, error: 'callId, targetUserId, and candidate are required' });
        return;
      }

      io.to(`user:${targetUserId}`).emit(SERVER_EVENTS.CALL_ICE_CANDIDATE, {
        callId,
        fromUserId: user.id,
        candidate,
      });

      ack?.({ success: true, data: null });
    },
  );

  // ── Disconnect — clean up active call participation ───────────────────────────

  socket.on('disconnect', () => {
    void (async () => {
      try {
        // Find all active (not-yet-left) participations for this user
        const participations = await prisma.callParticipant.findMany({
          where: { userId: user.id, leftAt: null },
          select: {
            callId: true,
            call: { select: { channelId: true, state: true } },
          },
        });

        for (const p of participations) {
          if (p.call.state === 'ended') continue;

          const { callEnded, channelId } = await callingService.participantLeft(
            p.callId,
            user.id,
          );

          // Announce the departure to channel members
          io.to(`channel:${channelId}`).emit(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, {
            callId: p.callId,
            userId: user.id,
          });

          if (callEnded) {
            callTypeMap.delete(p.callId);
            io.to(`channel:${channelId}`).emit(SERVER_EVENTS.CALL_ENDED, {
              callId: p.callId,
            });
          }
        }
      } catch (err) {
        logger.error({ err, userId: user.id }, 'Calling: disconnect cleanup error');
      }
    })();
  });
}
