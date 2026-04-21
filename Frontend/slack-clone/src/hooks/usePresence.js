import { useCallback } from 'react';
import { usePresenceStore } from '@/stores/presenceStore';
import { socketEmit } from '@/lib/socket';
import { CLIENT_EVENTS } from '@/lib/events';

/**
 * Exposes presence data for a list of users (from the store, kept fresh by
 * socket events) and helpers to update the local user's own status.
 */
export function usePresence(userIds = []) {
  const presence = usePresenceStore((s) => s.presence);

  const getPresence = useCallback(
    (userId) => presence[userId] ?? { isOnline: false, status: 'active' },
    [presence],
  );

  const setStatus = useCallback(
    (status) => socketEmit(CLIENT_EVENTS.PRESENCE_STATUS, { status }).catch(() => {}),
    [],
  );

  const sendHeartbeat = useCallback(
    () => socketEmit(CLIENT_EVENTS.PRESENCE_HEARTBEAT, {}).catch(() => {}),
    [],
  );

  // Build a subset map for the requested user IDs
  const presenceMap = {};
  for (const id of userIds) {
    presenceMap[id] = presence[id] ?? { isOnline: false, status: 'active' };
  }

  return { presenceMap, getPresence, setStatus, sendHeartbeat };
}

/**
 * Simple single-user helper: useUserPresence(userId) → { isOnline, status }
 */
export function useUserPresence(userId) {
  return usePresenceStore(
    (s) => s.presence[userId] ?? { isOnline: false, status: 'active' },
  );
}
