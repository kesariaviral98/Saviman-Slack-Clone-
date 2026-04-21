// ─────────────────────────────────────────────────────────────────────────────
// ChannelPage — message list + composer + optional thread panel.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { useChannels } from '@/hooks/useChannels';
import { useWorkspaceMembers } from '@/hooks/useWorkspaces';
import { useChannelStore } from '@/stores/channelStore';
import { useAuthStore } from '@/stores/authStore';
import { useCall } from '@/hooks/useCall';
import { useCallStore } from '@/stores/callStore';
import MessageList from '@/components/messages/MessageList';
import MessageComposer from '@/components/messages/MessageComposer';
import ThreadPanel from '@/components/messages/ThreadPanel';

function ChannelHeader({ channel, displayName, onStartAudioCall, onStartVideoCall, onOpenSidebar }) {
  if (!channel) return (
    <div className="h-12 border-b border-gray-200 bg-white px-4 flex items-center flex-shrink-0">
      <button
        onClick={onOpenSidebar}
        className="md:hidden -ml-1 mr-2 p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </div>
  );

  const isDm = channel.isDm;

  return (
    <div className="h-12 border-b border-gray-200 bg-white px-4 flex items-center gap-2 flex-shrink-0">
      {/* Hamburger — mobile only */}
      <button
        onClick={onOpenSidebar}
        className="md:hidden -ml-1 p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {!isDm && (
        <span className="text-gray-400 font-medium">#</span>
      )}
      <span className="font-bold text-gray-900">{displayName}</span>
      {channel.topic && (
        <>
          <span className="text-gray-200">|</span>
          <span className="text-sm text-gray-500 truncate">{channel.topic}</span>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Audio call button */}
      <button
        onClick={onStartAudioCall}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded text-gray-600 hover:bg-gray-100 transition-colors"
        title="Start audio call"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <span className="hidden sm:inline">Audio</span>
      </button>

      {/* Video call button */}
      <button
        onClick={onStartVideoCall}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded text-gray-600 hover:bg-gray-100 transition-colors"
        title="Start video call"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.893L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span className="hidden sm:inline">Video</span>
      </button>
    </div>
  );
}

export default function ChannelPage() {
  const { workspaceId, channelId } = useParams();
  const { onOpenSidebar } = useOutletContext() ?? {};
  const { joinChannel } = useChannels(workspaceId);
  const { initiateCall } = useCall();
  const currentUser = useAuthStore((s) => s.user);
  const { data: members = [] } = useWorkspaceMembers(workspaceId);
  const myMember = members.find((m) => m.userId === currentUser?.id);
  const isAdmin = myMember?.role === 'admin';
  const activeCall = useCallStore((s) => s.activeCall);
  const channel = useChannelStore((s) =>
    Object.values(s.channelsByWorkspace).flat().find((c) => c.id === channelId),
  );

  const [threadMessage, setThreadMessage] = useState(null);
  const [callError, setCallError] = useState('');

  // Join the socket room for this channel when navigating to it
  useEffect(() => {
    if (channelId) {
      joinChannel(channelId).catch(() => {});
    }
  }, [channelId]);

  const handleReply = useCallback((message) => {
    setThreadMessage(message);
  }, []);

  const handleCloseThread = useCallback(() => {
    setThreadMessage(null);
  }, []);

  const handleStartAudioCall = useCallback(async () => {
    if (activeCall) { setCallError('You are already in a call.'); return; }
    setCallError('');
    try {
      await initiateCall(channelId, 'audio');
    } catch (err) {
      setCallError(err.message ?? 'Could not start audio call.');
    }
  }, [channelId, initiateCall, activeCall]);

  const handleStartVideoCall = useCallback(async () => {
    if (activeCall) { setCallError('You are already in a call.'); return; }
    setCallError('');
    try {
      await initiateCall(channelId, 'video');
    } catch (err) {
      setCallError(err.message ?? 'Could not start video call.');
    }
  }, [channelId, initiateCall, activeCall]);

  // Resolve DM channel display name from member list
  const channelDisplayName = (() => {
    if (!channel) return '';
    if (!channel.isDm) return channel.name ?? '';
    const parts = (channel.name ?? '').split('-dm-');
    if (parts.length === 2) {
      const otherUserId = parts[0] === currentUser?.id ? parts[1] : parts[0];
      const otherMember = members.find((m) => m.userId === otherUserId || m.user?.id === otherUserId);
      return otherMember?.user?.displayName ?? otherMember?.displayName ?? channel.name ?? '';
    }
    return channel.name ?? '';
  })();

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main channel area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <ChannelHeader channel={channel} displayName={channelDisplayName} onStartAudioCall={handleStartAudioCall} onStartVideoCall={handleStartVideoCall} onOpenSidebar={onOpenSidebar} />
        {callError && (
          <div className="mx-4 mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-1.5 flex items-center justify-between">
            <span>{callError}</span>
            <button onClick={() => setCallError('')} className="ml-2 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        <MessageList
          channelId={channelId}
          onReply={handleReply}
        />

        <MessageComposer
          channelId={channelId}
          placeholder={channel ? `Message ${channel.isDm ? channelDisplayName : `#${channel.name}`}` : 'Message…'}
          channelType={channel?.type}
          isAdmin={isAdmin}
        />
      </div>

      {/* Thread panel */}
      {threadMessage && (
        <ThreadPanel
          parentMessage={threadMessage}
          channelId={channelId}
          onClose={handleCloseThread}
        />
      )}
    </div>
  );
}
