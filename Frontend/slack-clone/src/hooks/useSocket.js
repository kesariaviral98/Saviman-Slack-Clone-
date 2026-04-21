// ─────────────────────────────────────────────────────────────────────────────
// useSocket — wires all Socket.io server→client events to Zustand stores.
//
// Called once in App.jsx.  Re-registers listeners whenever the socket
// reconnects (accessToken changes → new socket instance).
//
// Typing indicators are intentionally excluded — they are ephemeral and
// managed with local component state inside the MessageComposer.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { SERVER_EVENTS, CLIENT_EVENTS } from '@/lib/events';
import { useAuthStore } from '@/stores/authStore';
import { getSocket, socketEmit } from '@/lib/socket';
import { useMessageStore } from '@/stores/messageStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useChannelStore } from '@/stores/channelStore';
import { useCallStore } from '@/stores/callStore';

// Heartbeat every 20 s — server TTL is 35 s so this gives a safe 15 s margin
const HEARTBEAT_INTERVAL_MS = 20_000;

export function useSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Stable refs so the single effect closure always sees the latest store methods
  const msgRef  = useRef(useMessageStore.getState());
  const presRef = useRef(usePresenceStore.getState());
  const notifRef= useRef(useNotificationStore.getState());
  const chanRef = useRef(useChannelStore.getState());
  const callRef = useRef(useCallStore.getState());
  const qcRef   = useRef(qc);
  const navRef  = useRef(navigate);

  useEffect(() => {
    msgRef.current   = useMessageStore.getState();
    presRef.current  = usePresenceStore.getState();
    notifRef.current = useNotificationStore.getState();
    chanRef.current  = useChannelStore.getState();
    callRef.current  = useCallStore.getState();
    qcRef.current    = qc;
    navRef.current   = navigate;
  });

  useEffect(() => {
    if (!accessToken) return;

    const socket = getSocket();
    if (!socket) return;

    // ── Seed own presence immediately so the user bar shows correctly ─────────
    const selfId = useAuthStore.getState().user?.id;
    if (selfId) {
      presRef.current.setPresence(selfId, { isOnline: true, status: 'active' });
    }

    // ── Heartbeat — keeps the Redis TTL alive (server TTL = 35 s) ────────────
    const heartbeat = setInterval(() => {
      socketEmit(CLIENT_EVENTS.PRESENCE_HEARTBEAT, {}).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    // Re-seed own presence on socket reconnect
    const onReconnect = () => {
      const id = useAuthStore.getState().user?.id;
      if (id) presRef.current.setPresence(id, { isOnline: true, status: 'active' });
    };
    socket.on('connect', onReconnect);

    // ── Messaging ────────────────────────────────────────────────────────────

    socket.on(SERVER_EVENTS.MESSAGE_NEW, ({ message, clientTempId }) => {
      if (message.parentId) {
        // Thread reply — refresh thread panel + bump parent's reply count
        qcRef.current.invalidateQueries({ queryKey: ['thread', message.parentId] });
        const parentMsg = msgRef.current.getMessage(message.parentId);
        if (parentMsg) {
          msgRef.current.updateMessage(message.parentId, {
            replyCount: (parentMsg.replyCount ?? 0) + 1,
          });
        }
      } else {
        // Top-level message — add to channel list (replaces optimistic if clientTempId matches)
        msgRef.current.addMessage(message.channelId, message, clientTempId);
      }
    });

    socket.on(SERVER_EVENTS.MESSAGE_UPDATED, ({ messageId, content, isEdited, editedAt }) => {
      msgRef.current.updateMessage(messageId, { content, isEdited, editedAt });
    });

    socket.on(SERVER_EVENTS.MESSAGE_DELETED, ({ messageId, channelId }) => {
      msgRef.current.removeMessage(messageId, channelId);
    });

    socket.on(SERVER_EVENTS.REACTION_UPDATED, ({ messageId, reactions }) => {
      msgRef.current.updateReactions(messageId, reactions);
    });

    // ── Presence ──────────────────────────────────────────────────────────────

    socket.on(SERVER_EVENTS.PRESENCE_CHANGED, ({ userId, isOnline, status }) => {
      presRef.current.setPresence(userId, { isOnline, status });
    });

    socket.on(SERVER_EVENTS.TYPING_UPDATE, ({ channelId, userId, isTyping }) => {
      if (isTyping) presRef.current.setTyping(channelId, userId);
      else presRef.current.clearTyping(channelId, userId);
    });

    // ── Workspace membership ──────────────────────────────────────────────────

    socket.on(SERVER_EVENTS.WORKSPACE_MEMBER_ADDED, ({ workspaceId, member }) => {
      // Append to the members query cache so the modal updates instantly
      qcRef.current.setQueryData(['workspaces', workspaceId, 'members'], (old) => {
        if (!old) return [member];
        if (old.some((m) => m.userId === member.userId)) return old;
        return [...old, member];
      });
    });

    socket.on(SERVER_EVENTS.WORKSPACE_MEMBER_ROLE_CHANGED, ({ workspaceId, userId, role }) => {
      // Update the role in the members query cache so the modal reflects it instantly
      qcRef.current.setQueryData(['workspaces', workspaceId, 'members'], (old) => {
        if (!old) return old;
        return old.map((m) => (m.userId === userId ? { ...m, role } : m));
      });
      // If it's the current user whose role changed, invalidate so RBAC-gated
      // UI (composer lock, delete buttons, etc.) re-evaluates immediately
      const selfId = useAuthStore.getState().user?.id;
      if (userId === selfId) {
        qcRef.current.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'members'] });
      }
    });

    socket.on(SERVER_EVENTS.WORKSPACE_MEMBER_REMOVED, ({ workspaceId }) => {
      // Clear local channel state for this workspace so the sidebar is clean
      // if the user is ever re-added later in the same session
      chanRef.current.setChannels(workspaceId, []);
      qcRef.current.removeQueries({ queryKey: ['channels', workspaceId] });
      qcRef.current.removeQueries({ queryKey: ['workspaces', workspaceId] });
      // If currently inside this workspace, redirect to the workspace picker
      if (window.location.pathname.startsWith(`/workspaces/${workspaceId}`)) {
        navRef.current('/workspaces', { replace: true });
      }
    });

    // ── Channel ───────────────────────────────────────────────────────────────

    socket.on(SERVER_EVENTS.CHANNEL_ADDED, ({ channel }) => {
      // Add to Zustand store immediately (deduplication built-in)
      chanRef.current.addChannel(channel.workspaceId, channel);
      // Also update the React Query cache so the sidebar's query re-renders
      qcRef.current.setQueryData(['channels', channel.workspaceId], (old) => {
        if (!old) return [channel];
        if (old.some((c) => c.id === channel.id)) return old;
        return [...old, channel];
      });
    });

    socket.on(SERVER_EVENTS.CHANNEL_DELETED, ({ channelId, workspaceId }) => {
      // Remove from Zustand store and React Query cache
      chanRef.current.removeChannel(channelId);
      qcRef.current.setQueryData(['channels', workspaceId], (old) => {
        if (!old) return old;
        return old.filter((c) => c.id !== channelId);
      });
      // If the user is currently viewing the deleted channel, redirect to the workspace
      if (window.location.pathname.includes(`/channels/${channelId}`)) {
        navRef.current(`/workspaces/${workspaceId}`, { replace: true });
      }
    });

    socket.on(SERVER_EVENTS.CHANNEL_UPDATED, ({ channel }) => {
      chanRef.current.updateChannel(channel.id, channel);
    });

    socket.on(SERVER_EVENTS.CHANNEL_SYNC_RESPONSE, ({ channelId, messages }) => {
      // Treat sync response as a fresh page (replaces stale local state)
      msgRef.current.setMessages(channelId, [...messages].reverse(), false, null);
    });

    // ── Notifications ─────────────────────────────────────────────────────────

    socket.on(SERVER_EVENTS.NOTIFICATION_NEW, ({ notification }) => {
      notifRef.current.prependNotification(notification);
    });

    // ── Calls — lifecycle ─────────────────────────────────────────────────────

    socket.on(SERVER_EVENTS.CALL_RINGING, ({ call, initiator }) => {
      // The server broadcasts to the whole channel room, including the initiator.
      // Skip if this socket belongs to the initiator or they're already in an active call.
      const currentUserId = useAuthStore.getState().user?.id;
      if (initiator?.id === currentUserId) return;
      if (useCallStore.getState().activeCall) return;
      callRef.current.setIncomingCall(call, initiator);
    });

    socket.on(SERVER_EVENTS.CALL_ACCEPTED, ({ callId, userId }) => {
      const existing = useCallStore.getState().activeCall;
      const acceptedAt = existing?.acceptedAt ?? new Date().toISOString();
      callRef.current.updateActiveCall({ state: 'active', acceptedAt });
    });

    socket.on(SERVER_EVENTS.CALL_REJECTED, ({ callId, userId }) => {
      // If the local user's outgoing call was rejected, the incoming-call modal
      // is the caller's UI — nothing to clear unless it's also the active call.
      const { activeCall } = useCallStore.getState();
      if (activeCall?.id === callId && activeCall?.participants?.length <= 1) {
        callRef.current.clearCall();
      }
    });

    socket.on(SERVER_EVENTS.CALL_ENDED, ({ callId }) => {
      const { activeCall, incomingCall } = useCallStore.getState();
      if (activeCall?.id === callId || incomingCall?.call?.id === callId) {
        callRef.current.clearCall();
      }
    });

    socket.on(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, ({ callId, user }) => {
      callRef.current.addParticipant({
        callId,
        userId: user.id,
        user,
        joinedAt: new Date().toISOString(),
        leftAt: null,
      });
    });

    socket.on(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, ({ callId, userId }) => {
      const currentUserId = useAuthStore.getState().user?.id;
      if (userId === currentUserId) {
        // I left (or was removed) — clear my local call state entirely
        callRef.current.clearCall();
      } else {
        // Someone else left — remove them from the participant list and their video tile
        callRef.current.removeParticipant(userId);
        callRef.current.removeRemoteStream(userId);
      }
    });

    // ── WebRTC signaling — handled in useWebRTC (Phase 8) ────────────────────
    // call:sdp-offer, call:sdp-answer, call:ice-candidate are forwarded there.

    return () => {
      clearInterval(heartbeat);
      socket.off('connect', onReconnect);
      socket.off(SERVER_EVENTS.MESSAGE_NEW);
      socket.off(SERVER_EVENTS.MESSAGE_UPDATED);
      socket.off(SERVER_EVENTS.MESSAGE_DELETED);
      socket.off(SERVER_EVENTS.REACTION_UPDATED);
      socket.off(SERVER_EVENTS.PRESENCE_CHANGED);
      socket.off(SERVER_EVENTS.TYPING_UPDATE);
      socket.off(SERVER_EVENTS.WORKSPACE_MEMBER_ROLE_CHANGED);
      socket.off(SERVER_EVENTS.WORKSPACE_MEMBER_ADDED);
      socket.off(SERVER_EVENTS.WORKSPACE_MEMBER_REMOVED);
      socket.off(SERVER_EVENTS.CHANNEL_ADDED);
      socket.off(SERVER_EVENTS.CHANNEL_DELETED);
      socket.off(SERVER_EVENTS.CHANNEL_UPDATED);
      socket.off(SERVER_EVENTS.CHANNEL_SYNC_RESPONSE);
      socket.off(SERVER_EVENTS.NOTIFICATION_NEW);
      socket.off(SERVER_EVENTS.CALL_RINGING);
      socket.off(SERVER_EVENTS.CALL_ACCEPTED);
      socket.off(SERVER_EVENTS.CALL_REJECTED);
      socket.off(SERVER_EVENTS.CALL_ENDED);
      socket.off(SERVER_EVENTS.CALL_PARTICIPANT_JOINED);
      socket.off(SERVER_EVENTS.CALL_PARTICIPANT_LEFT);
    };
  }, [accessToken]); // Re-register when token changes (new socket instance)
}
