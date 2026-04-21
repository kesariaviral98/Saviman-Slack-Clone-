// ─────────────────────────────────────────────────────────────────────────────
// Message — renders one message row with hover actions and reactions.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback } from 'react';
import Avatar from '@/components/ui/Avatar';
import { useMessages } from '@/hooks/useMessages';
import { useAuthStore } from '@/stores/authStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

// Common reaction emoji shortcuts (displayed in the picker)
const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '✅', '🙏'];

// ── Reaction pill ─────────────────────────────────────────────────────────────

function ReactionPill({ emoji, count, hasReacted, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-1 text-xs rounded-full border px-1.5 py-0.5 transition-colors
        ${hasReacted
          ? 'bg-blue-50 border-blue-300 text-blue-700'
          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
        }`}
    >
      <span>{emoji}</span>
      <span className="font-medium">{count}</span>
    </button>
  );
}

// ── Date divider ──────────────────────────────────────────────────────────────

export function DateDivider({ date }) {
  return (
    <div className="flex items-center gap-3 my-4 px-4">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs font-medium text-gray-400 whitespace-nowrap">
        {formatDate(date)}
      </span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

// ── Message ───────────────────────────────────────────────────────────────────

export default function Message({ message, isGrouped, channelId, onReply }) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { editMessage, deleteMessage, addReaction, removeReaction } = useMessages(channelId);

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [hovering, setHovering] = useState(false);

  const isOwn = message.sender?.id === currentUserId || message.senderId === currentUserId;

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editContent.trim() || editContent === message.content) {
      setIsEditing(false);
      return;
    }
    try {
      await editMessage(message.id, editContent.trim());
      setIsEditing(false);
    } catch {}
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Escape') { setIsEditing(false); setEditContent(message.content); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(e); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this message?')) return;
    try { await deleteMessage(message.id); } catch {}
  };

  const handleReaction = async (emoji) => {
    setShowReactionPicker(false);
    const existing = (message.reactions ?? []).find((r) => r.emoji === emoji);
    const hasReacted = existing?.userIds?.includes(currentUserId);
    try {
      if (hasReacted) await removeReaction(message.id, emoji);
      else await addReaction(message.id, emoji);
    } catch {}
  };

  const reactions = message.reactions ?? [];

  return (
    <div
      className={`group relative flex gap-3 px-4 py-0.5 hover:bg-gray-50 ${isGrouped ? '' : 'mt-2'}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => { setHovering(false); setShowReactionPicker(false); }}
    >
      {/* Avatar or time gutter */}
      <div className="w-9 flex-shrink-0 mt-0.5">
        {!isGrouped ? (
          <Avatar user={message.sender} size="sm" />
        ) : (
          <span className="block text-center text-[10px] text-gray-300 group-hover:text-gray-400 mt-1 leading-none">
            {formatTime(message.createdAt)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Author + timestamp header (shown for first in group) */}
        {!isGrouped && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-bold text-gray-900 text-sm hover:underline cursor-pointer">
              {message.sender?.displayName ?? 'Unknown'}
            </span>
            <span className="text-[11px] text-gray-400">
              {formatTime(message.createdAt)}
              {message.isEdited && (
                <span className="ml-1 text-gray-300">(edited)</span>
              )}
            </span>
          </div>
        )}

        {/* Message body — edit mode or display */}
        {isEditing ? (
          <form onSubmit={handleEditSubmit}>
            <textarea
              autoFocus
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="w-full border border-blue-400 rounded px-2 py-1.5 text-sm resize-none outline-none focus:ring-1 focus:ring-blue-400"
              rows={Math.max(1, editContent.split('\n').length)}
            />
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-400">
                Enter to save · Escape to cancel
              </span>
              <button type="submit" className="text-xs text-blue-600 hover:underline">Save</button>
              <button type="button" onClick={() => { setIsEditing(false); setEditContent(message.content); }} className="text-xs text-gray-500 hover:underline">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
            {message.isEdited && isGrouped && (
              <span className="ml-1 text-[10px] text-gray-300">(edited)</span>
            )}
          </p>
        )}

        {/* Reactions */}
        {reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {reactions.map((r) => (
              <ReactionPill
                key={r.emoji}
                emoji={r.emoji}
                count={r.count ?? r.userIds?.length ?? 0}
                hasReacted={r.userIds?.includes(currentUserId)}
                onToggle={() => handleReaction(r.emoji)}
              />
            ))}
          </div>
        )}

        {/* Thread reply count */}
        {message.replyCount > 0 && !isEditing && (
          <button
            onClick={() => onReply?.(message)}
            className="mt-1 text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>

      {/* Hover action toolbar */}
      {hovering && !isEditing && (
        <div className="absolute right-4 -top-3 bg-white border border-gray-200 rounded-lg shadow-sm flex items-center z-10">
          {/* Emoji react */}
          <div className="relative">
            <button
              onClick={() => setShowReactionPicker((v) => !v)}
              className="p-1.5 hover:bg-gray-100 rounded-l-lg text-gray-500 hover:text-gray-800 transition-colors"
              title="Add reaction"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            {showReactionPicker && (
              <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1 z-20">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="text-lg hover:bg-gray-100 rounded p-0.5 transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reply in thread */}
          <button
            onClick={() => onReply?.(message)}
            className="p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
            title="Reply in thread"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>

          {/* Edit (own messages only) */}
          {isOwn && (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
              title="Edit message"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}

          {/* Delete (own messages only) */}
          {isOwn && (
            <button
              onClick={handleDelete}
              className="p-1.5 hover:bg-gray-100 text-red-400 hover:text-red-600 transition-colors rounded-r-lg"
              title="Delete message"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
