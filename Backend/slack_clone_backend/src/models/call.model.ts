// ─────────────────────────────────────────────────────────────────────────────
// Call model — corresponds to the "Call" table.
// ─────────────────────────────────────────────────────────────────────────────

import type { UserPublic } from './user.model';
import type { CallParticipant } from './call-participant.model';

export type CallState = 'ringing' | 'active' | 'ended';

export interface Call {
  id: string;
  channelId: string;
  initiatorId: string;
  state: CallState;
  startedAt: string;
  endedAt: string | null;
  participants?: CallParticipant[];
  initiator?: UserPublic;
}
