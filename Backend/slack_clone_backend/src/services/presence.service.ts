// ─────────────────────────────────────────────────────────────────────────────
// Presence Service — Redis-backed online/offline tracking.
//
// Key schema:
//   presence:{userId}          → JSON PresenceRecord (TTL 35s, refreshed every 20s)
//   presence:status:{userId}   → UserStatus string (persistent — survives reconnects)
//
// Multi-device: the PresenceRecord stores an array of { deviceId, platform }.
// User is "online" when the array is non-empty.
// Status (active/away/dnd) is stored separately and survives device disconnects.
//
// Per spec rule 16: use Redis MGET for batch lookups — never N individual GETs.
// ─────────────────────────────────────────────────────────────────────────────

import { redis } from '../utils/redis';
import type { PresenceData, UserStatus, DevicePresence } from '../shared';

const PRESENCE_TTL_SECONDS = 35; // Heartbeat every 20s → 35s TTL gives comfortable margin
const DEFAULT_STATUS: UserStatus = 'active';

interface PresenceRecord {
  userId: string;
  isOnline: boolean;
  status: UserStatus;
  lastSeen: string;
  devices: DevicePresence[];
}

function presenceKey(userId: string): string {
  return `presence:${userId}`;
}

function statusKey(userId: string): string {
  return `presence:status:${userId}`;
}

export const presenceService = {
  // ── Set online ─────────────────────────────────────────────────────────────

  async setOnline(userId: string, deviceId: string, platform: string): Promise<void> {
    const key = presenceKey(userId);

    // Load existing record or start fresh
    const raw = await redis.get(key);
    const record: PresenceRecord = raw
      ? (JSON.parse(raw) as PresenceRecord)
      : { userId, isOnline: true, status: DEFAULT_STATUS, lastSeen: new Date().toISOString(), devices: [] };

    // Add device if not already tracked
    if (!record.devices.some((d) => d.deviceId === deviceId)) {
      record.devices.push({ deviceId, platform });
    }

    // Restore persisted status (user may have set dnd before reconnecting)
    const persistedStatus = await redis.get(statusKey(userId));
    if (persistedStatus) {
      record.status = persistedStatus as UserStatus;
    }

    record.isOnline = true;
    record.lastSeen = new Date().toISOString();

    await redis.setex(key, PRESENCE_TTL_SECONDS, JSON.stringify(record));
  },

  // ── Set offline ────────────────────────────────────────────────────────────

  async setOffline(userId: string, deviceId: string): Promise<PresenceData> {
    const key = presenceKey(userId);
    const raw = await redis.get(key);

    if (!raw) {
      return { userId, isOnline: false, status: DEFAULT_STATUS };
    }

    const record = JSON.parse(raw) as PresenceRecord;
    record.devices = record.devices.filter((d) => d.deviceId !== deviceId);
    record.lastSeen = new Date().toISOString();

    if (record.devices.length === 0) {
      // No devices left — user is offline, delete the presence key
      await redis.del(key);
      record.isOnline = false;
    } else {
      // Still has other connected devices
      record.isOnline = true;
      await redis.setex(key, PRESENCE_TTL_SECONDS, JSON.stringify(record));
    }

    return {
      userId: record.userId,
      isOnline: record.isOnline,
      status: record.status,
      lastSeen: record.lastSeen,
      devices: record.devices,
    };
  },

  // ── Heartbeat (refresh TTL) ────────────────────────────────────────────────

  async refreshHeartbeat(userId: string): Promise<void> {
    const key = presenceKey(userId);
    // EXPIRE returns 1 if key exists, 0 if not
    const refreshed = await redis.expire(key, PRESENCE_TTL_SECONDS);
    if (!refreshed) {
      // Key expired between heartbeats — restore a minimal online record and
      // recover the persisted status so dnd/away survive a brief TTL gap.
      const persistedStatus = await redis.get(statusKey(userId));
      const record: PresenceRecord = {
        userId,
        isOnline: true,
        status: (persistedStatus as UserStatus | null) ?? DEFAULT_STATUS,
        lastSeen: new Date().toISOString(),
        devices: [],
      };
      await redis.setex(key, PRESENCE_TTL_SECONDS, JSON.stringify(record));
    }
  },

  // ── Update status ──────────────────────────────────────────────────────────

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    // Persist status separately — survives device disconnects
    await redis.set(statusKey(userId), status);

    // Update the live presence record if it exists
    const key = presenceKey(userId);
    const raw = await redis.get(key);
    if (raw) {
      const record = JSON.parse(raw) as PresenceRecord;
      record.status = status;
      await redis.setex(key, PRESENCE_TTL_SECONDS, JSON.stringify(record));
    }
  },

  // ── Get single presence ────────────────────────────────────────────────────

  async getPresence(userId: string): Promise<PresenceData> {
    const raw = await redis.get(presenceKey(userId));
    if (!raw) {
      return { userId, isOnline: false, status: DEFAULT_STATUS };
    }
    const record = JSON.parse(raw) as PresenceRecord;
    return {
      userId: record.userId,
      isOnline: record.isOnline,
      status: record.status,
      lastSeen: record.lastSeen,
      devices: record.devices,
    };
  },

  // ── Batch presence (single Redis round-trip via MGET) ──────────────────────

  async getPresenceBatch(userIds: string[]): Promise<Map<string, PresenceData>> {
    const result = new Map<string, PresenceData>();
    if (userIds.length === 0) return result;

    const keys = userIds.map(presenceKey);
    const values = await redis.mget(...keys);

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const raw = values[i];
      if (!userId) continue;

      if (raw) {
        const record = JSON.parse(raw) as PresenceRecord;
        result.set(userId, {
          userId: record.userId,
          isOnline: record.isOnline,
          status: record.status,
          lastSeen: record.lastSeen,
          devices: record.devices,
        });
      } else {
        result.set(userId, { userId, isOnline: false, status: DEFAULT_STATUS });
      }
    }

    return result;
  },
};
