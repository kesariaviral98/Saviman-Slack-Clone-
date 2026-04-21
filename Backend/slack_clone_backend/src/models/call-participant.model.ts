// ─────────────────────────────────────────────────────────────────────────────
// CallParticipant model — corresponds to the "CallParticipant" table.
// ─────────────────────────────────────────────────────────────────────────────

import type { UserPublic } from './user.model';

export interface CallParticipant {
  id: string;
  callId: string;
  userId: string;
  joinedAt: string;
  leftAt: string | null;
  user?: UserPublic;
}
