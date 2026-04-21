// ─────────────────────────────────────────────────────────────────────────────
// Message model — corresponds to the "Message" table.
// ─────────────────────────────────────────────────────────────────────────────

import type { UserPublic } from './user.model';
import type { ReactionGroup } from './reaction.model';

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  parentId: string | null;
  content: string;
  metadata: Record<string, unknown>;
  isEdited: boolean;
  createdAt: string;
  editedAt: string | null;
  sender?: UserPublic;
  reactions?: ReactionGroup[];
  replyCount?: number;
}
