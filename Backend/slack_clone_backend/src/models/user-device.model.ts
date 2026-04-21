// ─────────────────────────────────────────────────────────────────────────────
// UserDevice model — corresponds to the "UserDevice" table.
// Also contains presence-related types backed by this table.
// ─────────────────────────────────────────────────────────────────────────────

import type { UserStatus } from './user.model';

export interface UserDevice {
  id: string;
  userId: string;
  deviceId: string;
  platform: string;
  pushToken: string | null;
  webPushSub: Record<string, unknown> | null;
  lastSeenAt: string;
}

export interface DevicePresence {
  deviceId: string;
  platform: string;
}

export interface PresenceData {
  userId: string;
  isOnline: boolean;
  status: UserStatus;
  statusText?: string;
  lastSeen?: string;
  devices?: DevicePresence[];
}
