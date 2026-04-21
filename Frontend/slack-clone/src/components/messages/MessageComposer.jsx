// ─────────────────────────────────────────────────────────────────────────────
// MessageComposer — textarea with typing indicators and send on Enter.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from 'react';
import { useMessages, useTyping } from '@/hooks/useMessages';
import { usePresenceStore } from '@/stores/presenceStore';

// How long after last keystroke to fire typing:stop (ms)
const TYPING_DEBOUNCE = 2_000;

export default function MessageComposer({ channelId, placeholder, parentMessageId, channelType, isAdmin }) {
  const [content, setContent] = useState('');
  const { sendMessage } = useMessages(channelId);
  const { startTyping, stopTyping, userId } = useTyping(channelId);
  const typingTimeout = useRef(null);
  const textareaRef = useRef(null);

  // Typing indicators from other users
  const typingUsers = usePresenceStore((s) => s.typingByChannel[channelId] ?? []);
  const othersTyping = typingUsers.filter((id) => id !== userId);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [content]);

  const handleChange = useCallback((e) => {
    setContent(e.target.value);

    // Fire typing start
    startTyping();

    // Reset the debounced stop timer
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      stopTyping();
    }, TYPING_DEBOUNCE);
  }, [startTyping, stopTyping]);

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    setContent('');
    stopTyping();
    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    try {
      await sendMessage(trimmed, parentMessageId ? { parentId: parentMessageId } : {});
    } catch {
      // Re-populate on failure so the user doesn't lose their text
      setContent(trimmed);
    }
  }, [content, sendMessage, stopTyping, parentMessageId]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      stopTyping();
    };
  }, [stopTyping]);

  const resolvedPlaceholder = placeholder ?? 'Message…';
  const isAnnouncementLocked = channelType === 'announcement' && !isAdmin;

  if (isAnnouncementLocked) {
    return (
      <div className="px-4 pb-4">
        <div className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 flex items-center gap-2 text-sm text-gray-500">
          <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Only admins can post in announcement channels.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4">
      {/* Typing indicator */}
      {othersTyping.length > 0 && (
        <div className="px-1 pb-1 text-xs text-gray-400 h-4">
          {othersTyping.length === 1
            ? 'Someone is typing…'
            : `${othersTyping.length} people are typing…`}
        </div>
      )}

      <div className="border border-gray-300 rounded-lg focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 bg-white transition-colors">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={resolvedPlaceholder}
          rows={1}
          className="block w-full px-3 pt-2.5 pb-1 text-sm text-gray-800 resize-none outline-none bg-transparent placeholder-gray-400 max-h-[200px]"
          style={{ overflowY: 'auto' }}
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between px-2 pb-2">
          {/* Left: formatting hints */}
          <div className="flex items-center gap-1 text-gray-400">
            <span className="text-xs">Shift+Enter for new line</span>
          </div>

          {/* Right: send button */}
          <button
            onClick={handleSend}
            disabled={!content.trim()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors
              ${content.trim()
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
              }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
