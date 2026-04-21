import { create } from 'zustand';

// userId → { isOnline: boolean, status: 'active'|'away'|'dnd' }
// typingByChannel → { [channelId]: userId[] }

export const usePresenceStore = create((set, get) => ({
  presence: {},
  typingByChannel: {},

  setPresence: (userId, data) =>
    set((state) => ({
      presence: { ...state.presence, [userId]: data },
    })),

  /** Bulk-update from a presence map { [userId]: { isOnline, status } }. */
  setBatchPresence: (presenceMap) =>
    set((state) => ({
      presence: { ...state.presence, ...presenceMap },
    })),

  /** Mark a user as offline without erasing their status. */
  setOffline: (userId) =>
    set((state) => ({
      presence: {
        ...state.presence,
        [userId]: {
          ...(state.presence[userId] ?? { status: 'active' }),
          isOnline: false,
        },
      },
    })),

  /** Mark a user as typing in a channel (auto-cleared by TYPING_STOP event). */
  setTyping: (channelId, userId) =>
    set((state) => {
      const current = state.typingByChannel[channelId] ?? [];
      if (current.includes(userId)) return {};
      return { typingByChannel: { ...state.typingByChannel, [channelId]: [...current, userId] } };
    }),

  /** Remove a user from the typing list for a channel. */
  clearTyping: (channelId, userId) =>
    set((state) => ({
      typingByChannel: {
        ...state.typingByChannel,
        [channelId]: (state.typingByChannel[channelId] ?? []).filter((id) => id !== userId),
      },
    })),

  clearAll: () => set({ presence: {}, typingByChannel: {} }),

  // Selector
  getPresence: (userId) =>
    get().presence[userId] ?? { isOnline: false, status: 'active' },
}));
