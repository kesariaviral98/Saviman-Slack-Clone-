// ─────────────────────────────────────────────────────────────────────────────
// ThreadPanel — right-side panel showing replies for a parent message.
// ─────────────────────────────────────────────────────────────────────────────

import { useThread } from '@/hooks/useMessages';
import Message from './Message';
import MessageComposer from './MessageComposer';
import Avatar from '@/components/ui/Avatar';

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ThreadPanel({ parentMessage, channelId, onClose }) {
  const { data, isLoading } = useThread(parentMessage?.id);

  if (!parentMessage) return null;

  const replies = data?.replies ?? [];

  return (
    <aside className="fixed inset-0 z-30 flex flex-col bg-white md:static md:inset-auto md:z-auto md:w-80 md:border-l md:border-gray-200 md:h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div>
          <h2 className="font-bold text-gray-900 text-sm">Thread</h2>
          <p className="text-xs text-gray-400">#{parentMessage.channel?.name ?? 'channel'}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
          aria-label="Close thread"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Parent message preview */}
      <div className="px-4 py-3 border-b border-gray-100 bg-surface-raised">
        <div className="flex items-start gap-2">
          <Avatar user={parentMessage.sender} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-gray-900 text-xs">
                {parentMessage.sender?.displayName}
              </span>
              <span className="text-[10px] text-gray-400">
                {formatTime(parentMessage.createdAt)}
              </span>
            </div>
            <p className="text-sm text-gray-700 mt-0.5 line-clamp-3 whitespace-pre-wrap break-words">
              {parentMessage.content}
            </p>
          </div>
        </div>
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto scrollable py-2">
        {isLoading && (
          <p className="text-center text-gray-400 text-sm py-6">Loading replies…</p>
        )}

        {!isLoading && replies.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-8">
            <p>No replies yet.</p>
            <p className="text-xs mt-1">Start the thread below.</p>
          </div>
        )}

        {replies.map((reply, i) => {
          const prev = replies[i - 1];
          const isGrouped =
            prev &&
            (prev.sender?.id ?? prev.senderId) === (reply.sender?.id ?? reply.senderId) &&
            new Date(reply.createdAt) - new Date(prev.createdAt) < 5 * 60 * 1000;

          return (
            <Message
              key={reply.id}
              message={reply}
              isGrouped={isGrouped}
              channelId={channelId}
              onReply={null} // no nested threading
            />
          );
        })}
      </div>

      {/* Reply composer */}
      <div className="border-t border-gray-200 pt-2">
        <MessageComposer
          channelId={channelId}
          parentMessageId={parentMessage.id}
          placeholder={`Reply to ${parentMessage.sender?.displayName ?? 'thread'}…`}
        />
      </div>
    </aside>
  );
}
