// ─────────────────────────────────────────────────────────────────────────────
// ChannelMember model — corresponds to the "ChannelMember" table.
// ─────────────────────────────────────────────────────────────────────────────

import type { UserPublic } from './user.model';

export interface ChannelMember {
  id: string;
  channelId: string;
  userId: string;
  joinedAt: string;
  user?: UserPublic;
}
