import { create } from 'zustand';

// Shape per channel:
//   { messages: Message[], hasMore: boolean, nextCursor: string|null }

const EMPTY_CHANNEL = { messages: [], hasMore: false, nextCursor: null };

export const useMessageStore = create((set, get) => ({
  // channelId → { messages, hasMore, nextCursor }
  channels: {},

  // ── Write operations ────────────────────────────────────────────────────────

  /** Replace the message list for a channel (initial load / React Query sync).
   *  Preserves any real-time messages that arrived after the last fetch so they
   *  aren't lost when the query re-runs (e.g. after staleTime expires). */
  setMessages: (channelId, messages, hasMore, nextCursor) =>
    set((state) => {
      const existing = state.channels[channelId];
      if (!existing) {
        return {
          channels: { ...state.channels, [channelId]: { messages, hasMore, nextCursor } },
        };
      }
      // Keep real-time messages (no clientTempId) that aren't already in the fetched set
      const fetchedIds = new Set(messages.map((m) => m.id));
      const extraRealtime = existing.messages.filter(
        (m) => !fetchedIds.has(m.id) && !m.clientTempId,
      );
      return {
        channels: {
          ...state.channels,
          [channelId]: { messages: [...messages, ...extraRealtime], hasMore, nextCursor },
        },
      };
    }),

  /** Prepend older messages when the user scrolls to load more. */
  prependMessages: (channelId, messages, hasMore, nextCursor) =>
    set((state) => {
      const existing = state.channels[channelId] ?? EMPTY_CHANNEL;
      const existingIds = new Set(existing.messages.map((m) => m.id));
      const deduped = messages.filter((m) => !existingIds.has(m.id));
      return {
        channels: {
          ...state.channels,
          [channelId]: {
            messages: [...deduped, ...existing.messages],
            hasMore,
            nextCursor,
          },
        },
      };
    }),

  /**
   * Append a new real-time message.
   * If `clientTempId` is provided, the optimistic placeholder with that ID is
   * removed first to avoid duplicates.
   * Creates the channel entry if it doesn't exist yet (handles the race where a
   * socket event arrives before the initial React Query fetch completes).
   */
  addMessage: (channelId, message, clientTempId) =>
    set((state) => {
      const existing = state.channels[channelId] ?? EMPTY_CHANNEL;

      // Remove optimistic placeholder
      const filtered = clientTempId
        ? existing.messages.filter((m) => m.clientTempId !== clientTempId)
        : existing.messages;

      // Dedup by real ID
      if (filtered.some((m) => m.id === message.id)) return state;

      return {
        channels: {
          ...state.channels,
          [channelId]: { ...existing, messages: [...filtered, message] },
        },
      };
    }),

  /** Append an optimistic message before the server confirms it.
   *  Creates the channel entry if it doesn't exist yet. */
  addOptimisticMessage: (channelId, optimisticMessage) =>
    set((state) => {
      const existing = state.channels[channelId] ?? EMPTY_CHANNEL;
      return {
        channels: {
          ...state.channels,
          [channelId]: {
            ...existing,
            messages: [...existing.messages, optimisticMessage],
          },
        },
      };
    }),

  /** Remove an optimistic message by its clientTempId (e.g. on send failure). */
  removeOptimistic: (channelId, clientTempId) =>
    set((state) => {
      const existing = state.channels[channelId];
      if (!existing) return state;
      return {
        channels: {
          ...state.channels,
          [channelId]: {
            ...existing,
            messages: existing.messages.filter((m) => m.clientTempId !== clientTempId),
          },
        },
      };
    }),

  /** Apply a partial update to a message (edit, isEdited, editedAt). */
  updateMessage: (messageId, partial) =>
    set((state) => ({
      channels: Object.fromEntries(
        Object.entries(state.channels).map(([cid, ch]) => [
          cid,
          {
            ...ch,
            messages: ch.messages.map((m) =>
              m.id === messageId ? { ...m, ...partial } : m,
            ),
          },
        ]),
      ),
    })),

  /** Remove a deleted message. */
  removeMessage: (messageId, channelId) =>
    set((state) => {
      const ch = state.channels[channelId];
      if (!ch) return state;
      return {
        channels: {
          ...state.channels,
          [channelId]: {
            ...ch,
            messages: ch.messages.filter((m) => m.id !== messageId),
          },
        },
      };
    }),

  /** Replace the reaction groups on a specific message. */
  updateReactions: (messageId, reactions) =>
    set((state) => ({
      channels: Object.fromEntries(
        Object.entries(state.channels).map(([cid, ch]) => [
          cid,
          {
            ...ch,
            messages: ch.messages.map((m) =>
              m.id === messageId ? { ...m, reactions } : m,
            ),
          },
        ]),
      ),
    })),

  // ── Read operations ─────────────────────────────────────────────────────────

  getMessages: (channelId) =>
    get().channels[channelId] ?? EMPTY_CHANNEL,

  getMessage: (messageId) => {
    for (const ch of Object.values(get().channels)) {
      const msg = ch.messages.find((m) => m.id === messageId);
      if (msg) return msg;
    }
    return null;
  },
}));
