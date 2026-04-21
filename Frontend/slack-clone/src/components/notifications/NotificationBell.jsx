// ─────────────────────────────────────────────────────────────────────────────
// NotificationBell — badge icon + dropdown list of recent notifications.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';

function getNotificationBody(notification) {
  const { type, payload } = notification;
  const from = payload?.fromDisplayName ?? 'Someone';
  const channel = payload?.channelName ? `#${payload.channelName}` : 'a channel';
  switch (type) {
    case 'mention':  return `${from} mentioned you in ${channel}: "${payload?.preview ?? ''}"`;
    case 'reply':    return `${from} replied to your message in ${channel}`;
    case 'reaction': return `${from} reacted ${payload?.preview ?? ''} to your message`;
    case 'dm':       return `${from}: ${payload?.preview ?? ''}`;
    case 'call_missed': return `Missed call from ${from}`;
    case 'channel_invite':   return `You were invited to ${channel}`;
    case 'workspace_invite': return 'You were invited to a workspace';
    default: return 'New notification';
  }
}

function getNotificationLink(notification) {
  const { payload } = notification;
  if (payload?.workspaceId && payload?.channelId) {
    return `/workspaces/${payload.workspaceId}/channels/${payload.channelId}`;
  }
  return null;
}

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NotificationItem({ notification, onRead }) {
  const navigate = useNavigate();
  const body = getNotificationBody(notification);
  const link = getNotificationLink(notification);

  const handleClick = () => {
    onRead(notification.id);
    if (link) navigate(link);
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 ${
        !notification.isRead ? 'bg-blue-50/50' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {!notification.isRead && (
          <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
        )}
        <div className={`flex-1 min-w-0 ${notification.isRead ? 'ml-4' : ''}`}>
          <p className="text-sm text-gray-800 leading-snug">{body}</p>
          <p className="text-xs text-gray-400 mt-0.5">{timeAgo(notification.createdAt)}</p>
        </div>
      </div>
    </button>
  );
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const {
    notifications,
    unreadCount,
    isLoading,
    markReadViaSocket,
    markAllRead,
  } = useNotifications();

  // Compute dropdown position from button's bounding rect
  const openDropdown = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 6,
        left: rect.left,
      });
    }
    setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleMarkRead = (id) => {
    markReadViaSocket(id);
  };

  const handleMarkAll = async () => {
    await markAllRead().catch(() => {});
  };

  const dropdown = open && (
    <div
      ref={dropdownRef}
      style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
      className="w-80 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm">Notifications</h3>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            className="text-xs text-blue-600 hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Notification list */}
      <div className="max-h-96 overflow-y-auto scrollable">
        {isLoading && (
          <p className="text-center text-gray-400 text-sm py-8">Loading…</p>
        )}
        {!isLoading && notifications.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">No notifications yet.</p>
        )}
        {notifications.map((n) => (
          <NotificationItem
            key={n.id}
            notification={n}
            onRead={handleMarkRead}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className="relative p-1.5 rounded text-sidebar-text hover:bg-sidebar-hover hover:text-white transition-colors"
        title="Notifications"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {createPortal(dropdown, document.body)}
    </div>
  );
}
