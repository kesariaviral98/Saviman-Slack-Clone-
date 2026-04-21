// ─────────────────────────────────────────────────────────────────────────────
// Channel model — corresponds to the "Channel" table.
// ─────────────────────────────────────────────────────────────────────────────

import type { ChannelMember } from './channel-member.model';

export type ChannelType = 'text' | 'voice' | 'announcement';

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  isPrivate: boolean;
  isDm: boolean;
  type: ChannelType;
  createdAt: string;
  members?: ChannelMember[];
  /** Injected by server per-user request */
  unreadCount?: number;
}
