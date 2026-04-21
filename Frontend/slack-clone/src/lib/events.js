// Socket.io event name constants — source of truth for client.
// Never hardcode event name strings; always import from here.

/** Events emitted by the CLIENT, handled by the server */
export const CLIENT_EVENTS = {
  // Messaging
  MESSAGE_SEND:       'message:send',
  MESSAGE_EDIT:       'message:edit',
  MESSAGE_DELETE:     'message:delete',

  // Reactions
  REACTION_ADD:       'reaction:add',
  REACTION_REMOVE:    'reaction:remove',

  // Typing
  TYPING_START:       'typing:start',
  TYPING_STOP:        'typing:stop',

  // Channel
  CHANNEL_JOIN:       'channel:join',
  CHANNEL_LEAVE:      'channel:leave',
  CHANNEL_SYNC:       'channel:sync',

  // Presence
  PRESENCE_HEARTBEAT: 'presence:heartbeat',
  PRESENCE_STATUS:    'presence:status',

  // Calling
  CALL_INITIATE:      'call:initiate',
  CALL_ACCEPT:        'call:accept',
  CALL_REJECT:        'call:reject',
  CALL_END:           'call:end',
  CALL_LEAVE:         'call:leave',
  CALL_SDP_OFFER:     'call:sdp-offer',
  CALL_SDP_ANSWER:    'call:sdp-answer',
  CALL_ICE_CANDIDATE: 'call:ice-candidate',

  // Notifications
  NOTIFICATION_READ:  'notification:read',
};

/** Events emitted by the SERVER, handled by the client */
export const SERVER_EVENTS = {
  // Messaging
  MESSAGE_NEW:             'message:new',
  MESSAGE_UPDATED:         'message:updated',
  MESSAGE_DELETED:         'message:deleted',

  // Reactions
  REACTION_UPDATED:        'reaction:updated',

  // Typing
  TYPING_UPDATE:           'typing:update',

  // Presence
  PRESENCE_CHANGED:        'presence:changed',

  // Workspace membership
  WORKSPACE_MEMBER_ADDED:        'workspace:member:added',
  WORKSPACE_MEMBER_REMOVED:      'workspace:member:removed',
  WORKSPACE_MEMBER_ROLE_CHANGED: 'workspace:member:role:changed',

  // Channel
  CHANNEL_ADDED:           'channel:added',
  CHANNEL_DELETED:         'channel:deleted',
  CHANNEL_UPDATED:         'channel:updated',
  CHANNEL_SYNC_RESPONSE:   'channel:sync:response',

  // Calling
  CALL_RINGING:            'call:ringing',
  CALL_ACCEPTED:           'call:accepted',
  CALL_REJECTED:           'call:rejected',
  CALL_ENDED:              'call:ended',
  CALL_PARTICIPANT_JOINED: 'call:participant:joined',
  CALL_PARTICIPANT_LEFT:   'call:participant:left',
  CALL_SDP_OFFER:          'call:sdp-offer',
  CALL_SDP_ANSWER:         'call:sdp-answer',
  CALL_ICE_CANDIDATE:      'call:ice-candidate',

  // Notifications
  NOTIFICATION_NEW:        'notification:new',
  UNREAD_COUNT:            'unread:count',

  // System
  ERROR:                   'error',
};
