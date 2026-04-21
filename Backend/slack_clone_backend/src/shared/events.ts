// ─────────────────────────────────────────────────────────────────────────────
// Socket.io event name constants — source of truth for both client and server.
// Import these constants everywhere; never hardcode event name strings.
// ─────────────────────────────────────────────────────────────────────────────

/** Events emitted by the CLIENT, handled by the server */
export const CLIENT_EVENTS = {
  // Messaging
  MESSAGE_SEND:       'message:send',        // { channelId, content, parentId?, clientTempId }
  MESSAGE_EDIT:       'message:edit',        // { messageId, content }
  MESSAGE_DELETE:     'message:delete',      // { messageId }

  // Reactions
  REACTION_ADD:       'reaction:add',        // { messageId, emoji }
  REACTION_REMOVE:    'reaction:remove',     // { messageId, emoji }

  // Typing
  TYPING_START:       'typing:start',        // { channelId }
  TYPING_STOP:        'typing:stop',         // { channelId }

  // Channel
  CHANNEL_JOIN:       'channel:join',        // { channelId }
  CHANNEL_LEAVE:      'channel:leave',       // { channelId }
  CHANNEL_SYNC:       'channel:sync',        // { channelId, lastSeenSequence }

  // Presence
  PRESENCE_HEARTBEAT: 'presence:heartbeat',  // {}
  PRESENCE_STATUS:    'presence:status',     // { status: 'active'|'away'|'dnd' }

  // Calling
  CALL_INITIATE:      'call:initiate',       // { channelId }
  CALL_ACCEPT:        'call:accept',         // { callId }
  CALL_REJECT:        'call:reject',         // { callId }
  CALL_END:           'call:end',            // { callId }
  CALL_LEAVE:         'call:leave',          // { callId }
  CALL_SDP_OFFER:     'call:sdp-offer',      // { callId, targetUserId, sdp }
  CALL_SDP_ANSWER:    'call:sdp-answer',     // { callId, targetUserId, sdp }
  CALL_ICE_CANDIDATE: 'call:ice-candidate',  // { callId, targetUserId, candidate }

  // Notifications
  NOTIFICATION_READ:  'notification:read',   // { notificationId }
} as const;

export type ClientEventName = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];

/** Events emitted by the SERVER, handled by the client */
export const SERVER_EVENTS = {
  // Messaging
  MESSAGE_NEW:             'message:new',             // { message, clientTempId? }
  MESSAGE_UPDATED:         'message:updated',         // { messageId, content, isEdited, editedAt }
  MESSAGE_DELETED:         'message:deleted',         // { messageId, channelId }

  // Reactions
  REACTION_UPDATED:        'reaction:updated',        // { messageId, reactions }

  // Typing
  TYPING_UPDATE:           'typing:update',           // { channelId, userId, displayName, isTyping }

  // Presence
  PRESENCE_CHANGED:        'presence:changed',        // { userId, isOnline, status }

  // Workspace membership
  WORKSPACE_MEMBER_ADDED:        'workspace:member:added',        // { workspaceId, member }
  WORKSPACE_MEMBER_REMOVED:      'workspace:member:removed',      // { workspaceId }
  WORKSPACE_MEMBER_ROLE_CHANGED: 'workspace:member:role:changed', // { workspaceId, userId, role }

  // Channel
  CHANNEL_ADDED:           'channel:added',           // { channel } — pushed to members when they're added to a channel
  CHANNEL_DELETED:         'channel:deleted',         // { channelId, workspaceId }
  CHANNEL_UPDATED:         'channel:updated',         // { channel }
  CHANNEL_SYNC_RESPONSE:   'channel:sync:response',   // { messages, channelId }

  // Calling
  CALL_RINGING:            'call:ringing',            // { call, initiator }
  CALL_ACCEPTED:           'call:accepted',           // { callId, userId }
  CALL_REJECTED:           'call:rejected',           // { callId, userId }
  CALL_ENDED:              'call:ended',              // { callId }
  CALL_PARTICIPANT_JOINED: 'call:participant:joined', // { callId, user }
  CALL_PARTICIPANT_LEFT:   'call:participant:left',   // { callId, userId }
  CALL_SDP_OFFER:          'call:sdp-offer',          // { callId, fromUserId, sdp }
  CALL_SDP_ANSWER:         'call:sdp-answer',         // { callId, fromUserId, sdp }
  CALL_ICE_CANDIDATE:      'call:ice-candidate',      // { callId, fromUserId, candidate }

  // Notifications
  NOTIFICATION_NEW:        'notification:new',        // { notification }
  UNREAD_COUNT:            'unread:count',            // { channelId, count }

  // System
  ERROR:                   'error',                   // { code, message }
} as const;

export type ServerEventName = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];
