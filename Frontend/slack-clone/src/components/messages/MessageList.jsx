// ─────────────────────────────────────────────────────────────────────────────
// MessageList — infinite-scroll list with grouping and date dividers.
// Scroll-to-bottom on new messages; load-more on scroll to top.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMessages } from '@/hooks/useMessages';
import { useMessageStore } from '@/stores/messageStore';
import Message, { DateDivider } from './Message';

// Two messages are "grouped" if same author + within 5 minutes + no date boundary
function shouldGroup(prev, curr) {
  if (!prev) return false;
  const prevAuthorId = prev.sender?.id ?? prev.senderId;
  const currAuthorId = curr.sender?.id ?? curr.senderId;
  if (prevAuthorId !== currAuthorId) return false;
  const diff = new Date(curr.createdAt) - new Date(prev.createdAt);
  return diff < 5 * 60 * 1000; // 5 minutes
}

function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return da.toDateString() === db.toDateString();
}

export default function MessageList({ channelId, onReply }) {
  // useMessages drives React Query (pagination, initial fetch) and syncs → store
  const { isLoading, isFetchingMore, hasMore, loadMore } = useMessages(channelId);

  // Read messages from the Zustand store — updated by both React Query sync
  // AND real-time socket events (MESSAGE_NEW / UPDATED / DELETED / REACTIONS).
  const messages = useMessageStore((s) => s.channels[channelId]?.messages ?? []);
  const bottomRef = useRef(null);
  const listRef = useRef(null);
  const prevScrollHeight = useRef(0);
  const isAtBottom = useRef(true);

  // Track user scroll position to decide when to auto-scroll
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottom.current = distFromBottom < 100;

    // Load more when near the top
    if (el.scrollTop < 200 && hasMore && !isFetchingMore) {
      prevScrollHeight.current = el.scrollHeight;
      loadMore();
    }
  }, [hasMore, isFetchingMore, loadMore]);

  // After load-more, restore scroll position so content doesn't jump
  useEffect(() => {
    const el = listRef.current;
    if (!el || !prevScrollHeight.current) return;
    const newScrollHeight = el.scrollHeight;
    const delta = newScrollHeight - prevScrollHeight.current;
    if (delta > 0) {
      el.scrollTop = delta;
      prevScrollHeight.current = 0;
    }
  }, [messages.length]);

  // Auto-scroll to bottom when new messages arrive and user is near the bottom
  useEffect(() => {
    if (isAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Scroll to bottom on channel switch
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    isAtBottom.current = true;
  }, [channelId]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Loading messages…
      </div>
    );
  }

  if (!messages.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
        <div className="text-4xl">💬</div>
        <p className="font-semibold text-gray-700">No messages yet</p>
        <p className="text-sm text-gray-400">Be the first to say something!</p>
      </div>
    );
  }

  // Build decorated list (date dividers + grouping flags)
  const decorated = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = messages[i - 1];

    // Date divider when day changes
    if (!prev || !isSameDay(prev.createdAt, msg.createdAt)) {
      decorated.push({ type: 'divider', key: `div-${msg.id}`, date: msg.createdAt });
    }

    decorated.push({
      type: 'message',
      key: msg.id,
      message: msg,
      isGrouped: shouldGroup(prev, msg) && (!prev || isSameDay(prev.createdAt, msg.createdAt)),
    });
  }

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto scrollable flex flex-col"
    >
      {/* Load-more spinner */}
      {isFetchingMore && (
        <div className="py-3 text-center text-xs text-gray-400">Loading older messages…</div>
      )}

      {/* Load-more trigger button for non-scroll environments */}
      {hasMore && !isFetchingMore && (
        <button
          onClick={() => loadMore()}
          className="mx-auto my-2 text-xs text-blue-500 hover:underline"
        >
          Load older messages
        </button>
      )}

      {/* Message rows */}
      <div className="flex-1" />
      {decorated.map((item) =>
        item.type === 'divider' ? (
          <DateDivider key={item.key} date={item.date} />
        ) : (
          <Message
            key={item.key}
            message={item.message}
            isGrouped={item.isGrouped}
            channelId={channelId}
            onReply={onReply}
          />
        ),
      )}
      <div ref={bottomRef} className="h-2" />
    </div>
  );
}
