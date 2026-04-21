// ─────────────────────────────────────────────────────────────────────────────
// Notification model — corresponds to the "Notification" table.
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'mention'
  | 'reply'
  | 'reaction'
  | 'channel_invite'
  | 'workspace_invite'
  | 'call_missed'
  | 'dm';

export interface NotificationPayload {
  messageId?: string;
  channelId?: string;
  workspaceId?: string;
  channelName?: string;
  callId?: string;
  fromUserId?: string;
  fromDisplayName?: string;
  preview?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
  isRead: boolean;
  createdAt: string;
}
