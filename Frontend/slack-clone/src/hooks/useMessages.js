// ─────────────────────────────────────────────────────────────────────────────
// useMessages — infinite-scroll message loading + real-time send/edit/delete.
//
// Pagination strategy:
//   The server returns messages newest-first with a `nextCursor` pointing to the
//   oldest message in the page.  "Load more" fetches OLDER messages.
//
//   Display order (oldest → newest, top → bottom) is computed by reversing
//   pages and their contents.
// ─────────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useMessageStore } from '@/stores/messageStore';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { socketEmit } from '@/lib/socket';
import { CLIENT_EVENTS } from '@/lib/events';

// ── UUID helper — crypto.randomUUID() requires HTTPS; fall back on HTTP ───────

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Optimistic message builder ──────────────────────────────────────────────────

function buildOptimisticMessage(channelId, content, options) {
  const user = useAuthStore.getState().user;
  if (!user) return null;
  const clientTempId = generateId();
  return {
    id: clientTempId,          // temp id — replaced by real id when server confirms
    clientTempId,
    channelId,
    content,
    senderId: user.id,
    sender: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
      statusText: user.statusText ?? '',
    },
    parentId: options.parentId ?? null,
    createdAt: new Date().toISOString(),
    editedAt: null,
    isEdited: false,
    reactions: [],
    replyCount: 0,
    metadata: {},
  };
}

export function useMessages(channelId) {
  const { setMessages, prependMessages, addOptimisticMessage, removeOptimistic } = useMessageStore();

  const query = useInfiniteQuery({
    queryKey: ['messages', channelId],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (pageParam) params.set('before', pageParam);
      const data = await api.get(`/channels/${channelId}/messages?${params}`);
      return {
        messages: data.messages ?? [],
        hasMore: data.hasMore ?? false,
        nextCursor: data.nextCursor ?? null,
      };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
    enabled: !!channelId,
  });

  // Sync React Query pages → messageStore for components that prefer the store
  useEffect(() => {
    if (!query.data?.pages || !channelId) return;
    const firstPage = query.data.pages[0];
    if (!firstPage) return;
    // pages[0] = latest; pages[N] = oldest. Feed oldest first into the store.
    const pages = [...query.data.pages].reverse();
    const allMessages = pages.flatMap((p) => [...p.messages].reverse());
    setMessages(channelId, allMessages, firstPage.hasMore, firstPage.nextCursor);
  }, [query.data?.pages, channelId]);

  // Flatten for rendering: oldest messages at index 0
  const messages = useMemo(() => {
    if (!query.data?.pages) return [];
    return [...query.data.pages]
      .reverse()
      .flatMap((page) => [...page.messages].reverse());
  }, [query.data?.pages]);

  // ── Socket actions ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content, options = {}) => {
      const optimistic = buildOptimisticMessage(channelId, content, options);
      const clientTempId = optimistic?.clientTempId ?? generateId();

      // Only add optimistic message to channel list for top-level messages (not thread replies)
      if (optimistic && !options.parentId) {
        addOptimisticMessage(channelId, optimistic);
      }

      try {
        await socketEmit(CLIENT_EVENTS.MESSAGE_SEND, {
          channelId,
          content,
          clientTempId,
          ...options,
        });
      } catch (err) {
        // If the socket call fails, roll back the optimistic message
        if (optimistic && !options.parentId) {
          removeOptimistic(channelId, clientTempId);
        }
        throw err;
      }
    },
    [channelId, addOptimisticMessage, removeOptimistic],
  );

  const editMessage = useCallback(
    (messageId, content) =>
      socketEmit(CLIENT_EVENTS.MESSAGE_EDIT, { messageId, content }),
    [],
  );

  const deleteMessage = useCallback(
    (messageId) =>
      socketEmit(CLIENT_EVENTS.MESSAGE_DELETE, { messageId }),
    [],
  );

  const addReaction = useCallback(
    (messageId, emoji) =>
      socketEmit(CLIENT_EVENTS.REACTION_ADD, { messageId, emoji }),
    [],
  );

  const removeReaction = useCallback(
    (messageId, emoji) =>
      socketEmit(CLIENT_EVENTS.REACTION_REMOVE, { messageId, emoji }),
    [],
  );

  return {
    messages,
    isLoading: query.isLoading,
    isFetchingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    loadMore: query.fetchNextPage,
    error: query.error,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
  };
}

// ── Thread ─────────────────────────────────────────────────────────────────────

export function useThread(parentMessageId) {
  return useQuery({
    queryKey: ['thread', parentMessageId],
    queryFn: async () => {
      const data = await api.get(`/messages/${parentMessageId}/thread`);
      return data;
    },
    enabled: !!parentMessageId,
    staleTime: 0, // Always refetch when the thread panel opens
  });
}

// ── Typing indicator ──────────────────────────────────────────────────────────

export function useTyping(channelId) {
  const { user } = useAuthStore();

  const startTyping = useCallback(() => {
    socketEmit(CLIENT_EVENTS.TYPING_START, { channelId }).catch(() => {});
  }, [channelId]);

  const stopTyping = useCallback(() => {
    socketEmit(CLIENT_EVENTS.TYPING_STOP, { channelId }).catch(() => {});
  }, [channelId]);

  return { startTyping, stopTyping, userId: user?.id };
}
