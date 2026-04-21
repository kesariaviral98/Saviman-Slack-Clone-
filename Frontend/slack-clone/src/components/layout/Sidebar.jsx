// ─────────────────────────────────────────────────────────────────────────────
// Sidebar — left column: workspace name, channel list, DM list, user bar.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useChannels, useDm } from '@/hooks/useChannels';
import { useWorkspace, useWorkspaceMembers, useWorkspaceInvite } from '@/hooks/useWorkspaces';
import { useUserPresence, usePresence } from '@/hooks/usePresence';
import { useNotifications } from '@/hooks/useNotifications';
import Avatar from '@/components/ui/Avatar';
import PresenceDot from '@/components/ui/PresenceDot';
import NotificationBell from '@/components/notifications/NotificationBell';
import WorkspaceMembersModal from '@/components/workspace/WorkspaceMembersModal';
import CreateChannelModal from '@/components/workspace/CreateChannelModal';

// ── Channel item ──────────────────────────────────────────────────────────────

function ChannelItem({ channel, isActive, isAdmin, onClick, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = (e) => {
    e.stopPropagation();
    setConfirmDelete(true);
  };

  const handleConfirm = (e) => {
    e.stopPropagation();
    setConfirmDelete(false);
    onDelete(channel.id);
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    setConfirmDelete(false);
  };

  return (
    <div className="group relative flex items-center">
      <button
        onClick={onClick}
        className={`flex-1 flex items-center gap-1.5 px-2 py-0.5 rounded text-left text-sm transition-colors
          ${isActive
            ? 'bg-sidebar-active text-white'
            : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
          }`}
      >
        {channel.isPrivate ? (
          <svg className="w-3 h-3 flex-shrink-0 text-sidebar-text/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        ) : (
          <span className="text-sidebar-text/60 text-xs leading-none flex-shrink-0">#</span>
        )}
        <span className="truncate">{channel.name}</span>
      </button>

      {isAdmin && !confirmDelete && (
        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 p-0.5 mr-1 rounded text-sidebar-text/40 hover:text-red-400 transition-all flex-shrink-0"
          title="Delete channel"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}

      {isAdmin && confirmDelete && (
        <div className="flex items-center gap-1 mr-1 flex-shrink-0">
          <button
            onClick={handleConfirm}
            className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded hover:bg-red-600 transition-colors"
          >
            Del
          </button>
          <button
            onClick={handleCancel}
            className="text-[10px] text-sidebar-text/60 hover:text-white px-1 py-0.5 transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ── DM item ───────────────────────────────────────────────────────────────────

function DmItem({ channel, currentUserId, members, isActive, onClick }) {
  // channel.name is "uuidA-dm-uuidB" — extract the other user's ID
  const otherUserId = (() => {
    const parts = (channel.name ?? '').split('-dm-');
    if (parts.length === 2) {
      return parts[0] === currentUserId ? parts[1] : parts[0];
    }
    return null;
  })();

  // Look up the other user's display name from workspace members
  const otherMember = members?.find((m) => m.userId === otherUserId || m.user?.id === otherUserId);
  const displayName = otherMember?.user?.displayName ?? otherMember?.displayName ?? channel.name ?? '?';

  const presence = useUserPresence(otherUserId);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-0.5 rounded text-left text-sm transition-colors
        ${isActive
          ? 'bg-sidebar-active text-white'
          : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
        }`}
    >
      <span className="relative flex-shrink-0">
        <span className="w-4 h-4 rounded-sm bg-sidebar-hover flex items-center justify-center text-[10px] text-sidebar-text font-bold">
          {displayName[0].toUpperCase()}
        </span>
        {otherUserId && (
          <PresenceDot
            isOnline={presence.isOnline}
            status={presence.status}
            size="sm"
            className="absolute -bottom-0.5 -right-0.5"
          />
        )}
      </span>
      <span className="truncate">{displayName}</span>
    </button>
  );
}


// ── Status menu ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active',       dot: 'bg-green-500' },
  { value: 'away',   label: 'Away',         dot: 'bg-yellow-400' },
  { value: 'dnd',    label: 'Do not disturb', dot: 'bg-red-500' },
];

function StatusMenu({ status, onSetStatus }) {
  const [open, setOpen] = useState(false);
  const label = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? 'Active';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sidebar-text/60 text-[10px] hover:text-white transition-colors truncate w-full text-left"
        title="Change status"
      >
        {label}
      </button>
      {open && (
        <div className="absolute bottom-6 left-0 bg-gray-800 border border-white/10 rounded shadow-xl z-50 py-1 w-40">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onSetStatus(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors ${
                status === opt.value ? 'text-white' : 'text-sidebar-text'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${opt.dot}`} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export default function Sidebar({ onOpenSearch, isOpen = false, onClose }) {
  const { workspaceId, channelId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();

  const { data: workspace } = useWorkspace(workspaceId);
  const { channels, joinChannel, deleteChannel } = useChannels(workspaceId);
  const { openDm } = useDm(workspaceId);
  const { createInvite, isCreating: isInviting, sendEmailInvite, isSendingEmail } = useWorkspaceInvite(workspaceId);
  const { setStatus } = usePresence();
  const myPresence = useUserPresence(user?.id);

  const [showAddChannel, setShowAddChannel] = useState(false);
  const [showDmSearch, setShowDmSearch] = useState(false);
  const [dmQuery, setDmQuery] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteEmailSent, setInviteEmailSent] = useState(false);
  const [inviteEmailError, setInviteEmailError] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const { data: members = [] } = useWorkspaceMembers(workspaceId);

  const currentMember = members.find((m) => m.userId === user?.id);
  const isAdmin = currentMember?.role === 'admin';

  const publicChannels = channels.filter((c) => !c.isDm && !c.isPrivate);
  const privateChannels = channels.filter((c) => !c.isDm && c.isPrivate);
  const dmChannels = channels.filter((c) => c.isDm);

  const handleOpenInviteModal = async () => {
    setInviteEmail('');
    setInviteEmailSent(false);
    setInviteEmailError('');
    setInviteLink(''); // Clear old link — always generate a fresh one-time token
    setShowInviteModal(true);
    try {
      const { token } = await createInvite();
      setInviteLink(`${window.location.origin}/invite/${token}`);
    } catch (err) {
      // Non-fatal — user can still generate via the button
    }
  };

  const handleRefreshInviteLink = async () => {
    try {
      const { token } = await createInvite();
      setInviteLink(`${window.location.origin}/invite/${token}`);
    } catch (err) {
      alert(err.message ?? 'Could not generate invite link.');
    }
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(inviteLink).catch(() => {});
  };

  const handleSendEmailInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.includes('@')) return;
    setInviteEmailError('');
    setInviteEmailSent(false);
    try {
      await sendEmailInvite(inviteEmail);
      setInviteEmailSent(true);
      setInviteEmail('');
    } catch (err) {
      setInviteEmailError(err.message ?? 'Failed to send invite email.');
    }
  };

  const handleChannelClick = async (ch) => {
    await joinChannel(ch.id).catch(() => {});
    navigate(`/workspaces/${workspaceId}/channels/${ch.id}`, { replace: true });
    onClose?.();
  };

  const handleDeleteChannel = async (deletedChannelId) => {
    try {
      await deleteChannel(deletedChannelId);
      // If the deleted channel was active, navigate to another channel
      if (deletedChannelId === channelId) {
        const remaining = channels.filter((c) => !c.isDm && c.id !== deletedChannelId);
        if (remaining.length > 0) {
          navigate(`/workspaces/${workspaceId}/channels/${remaining[0].id}`, { replace: true });
        }
      }
    } catch (err) {
      alert(err.message ?? 'Could not delete channel.');
    }
  };

  const handleChannelCreated = (newChannelId) => {
    setShowAddChannel(false);
    if (newChannelId) navigate(`/workspaces/${workspaceId}/channels/${newChannelId}`, { replace: true });
  };

  const handleOpenDm = async (targetUserId) => {
    try {
      const data = await openDm(targetUserId);
      setShowDmSearch(false);
      setDmQuery('');
      navigate(`/workspaces/${workspaceId}/channels/${data.channel.id}`, { replace: true });
      onClose?.();
    } catch {}
  };

  const filteredMembers = dmQuery
    ? members.filter(
        (m) =>
          m.user.id !== user?.id &&
          m.user.displayName.toLowerCase().includes(dmQuery.toLowerCase()),
      )
    : [];

  return (
    <aside className={`
      bg-sidebar-bg flex flex-col h-full overflow-hidden select-none
      fixed inset-y-0 left-0 z-30 w-72 transition-transform duration-200 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      md:static md:inset-auto md:z-auto md:w-60 md:translate-x-0 md:transition-none md:flex-shrink-0
    `}>
      {/* ── Workspace header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/10">
        <button
          onClick={() => navigate('/workspaces', { replace: true })}
          className="flex-1 text-left"
        >
          <h1 className="text-sidebar-heading font-extrabold truncate text-sm leading-tight">
            {workspace?.name ?? 'Saviman'}
          </h1>
        </button>
        <div className="flex items-center gap-1">
          {isAdmin && (
            <button
              onClick={handleOpenInviteModal}
              disabled={isInviting}
              className="p-1 rounded text-sidebar-text hover:bg-sidebar-hover hover:text-white transition-colors"
              title="Invite members"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowMembers(true)}
            className="p-1 rounded text-sidebar-text hover:bg-sidebar-hover hover:text-white transition-colors"
            title="Members"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 5.87a4 4 0 100-8 4 4 0 000 8zm6-10a4 4 0 10-8 0 4 4 0 008 0z" />
            </svg>
          </button>
          <button
            onClick={onOpenSearch}
            className="p-1 rounded text-sidebar-text hover:bg-sidebar-hover hover:text-white transition-colors"
            title="Search (Ctrl+K)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </button>
          <div className="relative">
            <NotificationBell />
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded text-sidebar-text hover:bg-sidebar-hover hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Invite modal overlay — portaled to body so sidebar transform doesn't break fixed ── */}
      {showInviteModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Invite people to {workspace?.name}</h2>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >✕</button>
            </div>

            {/* Send invite via email */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Send invite link by email
              </label>
              <form onSubmit={handleSendEmailInvite} className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setInviteEmailSent(false); setInviteEmailError(''); }}
                  placeholder="colleague@company.com"
                  className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <button
                  type="submit"
                  disabled={isSendingEmail || !inviteEmail.includes('@')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
                >
                  {isSendingEmail ? 'Sending…' : 'Send'}
                </button>
              </form>
              {inviteEmailSent && (
                <p className="mt-2 text-sm text-green-600">Invite email sent successfully!</p>
              )}
              {inviteEmailError && (
                <p className="mt-2 text-sm text-red-600">{inviteEmailError}</p>
              )}
            </div>

            {/* Divider */}
            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400">or share a link</span>
              </div>
            </div>

            {/* Copyable link */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Invite link <span className="font-normal text-gray-400">(expires in 24 hours)</span>
              </label>
              {inviteLink ? (
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm text-gray-600 bg-gray-50 truncate"
                    onClick={(e) => e.target.select()}
                  />
                  <button
                    onClick={handleCopyInvite}
                    className="px-3 py-2 border border-gray-300 hover:bg-gray-50 text-sm rounded transition-colors"
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleRefreshInviteLink}
                  disabled={isInviting}
                  className="w-full py-2 border border-gray-300 hover:bg-gray-50 text-sm rounded text-gray-600 transition-colors"
                >
                  {isInviting ? 'Generating…' : 'Generate link'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Scrollable nav ───────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto scrollable py-2 space-y-4">

        {/* Public channels section */}
        <section>
          <div className="flex items-center justify-between px-3 mb-1">
            <span className="text-xs font-semibold text-sidebar-text/60 uppercase tracking-wide">
              Channels
            </span>
            <button
              onClick={() => setShowAddChannel(true)}
              className="text-sidebar-text/60 hover:text-white transition-colors"
              title="Add channel"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          <div className="space-y-0.5 px-1">
            {publicChannels.map((ch) => (
              <ChannelItem
                key={ch.id}
                channel={ch}
                isActive={ch.id === channelId}
                isAdmin={isAdmin}
                onClick={() => handleChannelClick(ch)}
                onDelete={handleDeleteChannel}
              />
            ))}
            {publicChannels.length === 0 && (
              <p className="text-sidebar-text/40 text-xs px-2 py-0.5">No public channels</p>
            )}
          </div>
        </section>

        {/* Private channels section */}
        {privateChannels.length > 0 && (
          <section>
            <div className="flex items-center justify-between px-3 mb-1">
              <span className="text-xs font-semibold text-sidebar-text/60 uppercase tracking-wide">
                Private
              </span>
            </div>
            <div className="space-y-0.5 px-1">
              {privateChannels.map((ch) => (
                <ChannelItem
                  key={ch.id}
                  channel={ch}
                  isActive={ch.id === channelId}
                  isAdmin={isAdmin}
                  onClick={() => handleChannelClick(ch)}
                  onDelete={handleDeleteChannel}
                />
              ))}
            </div>
          </section>
        )}

        {/* Direct messages section */}
        <section>
          <div className="flex items-center justify-between px-3 mb-1">
            <span className="text-xs font-semibold text-sidebar-text/60 uppercase tracking-wide">
              Direct Messages
            </span>
            <button
              onClick={() => setShowDmSearch((v) => !v)}
              className="text-sidebar-text/60 hover:text-white transition-colors"
              title="New DM"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {showDmSearch && (
            <div className="px-2 mb-1 space-y-1">
              <input
                autoFocus
                value={dmQuery}
                onChange={(e) => setDmQuery(e.target.value)}
                placeholder="Find a teammate…"
                className="w-full bg-sidebar-hover text-white placeholder-sidebar-text/50 text-sm rounded px-2 py-1 outline-none focus:ring-1 focus:ring-white/30"
              />
              {filteredMembers.slice(0, 8).map((m) => (
                <button
                  key={m.user.id}
                  onClick={() => handleOpenDm(m.user.id)}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded text-sm text-sidebar-text hover:bg-sidebar-hover hover:text-white transition-colors text-left"
                >
                  <Avatar user={m.user} size="xs" />
                  <span className="truncate">{m.user.displayName}</span>
                </button>
              ))}
              {dmQuery && filteredMembers.length === 0 && (
                <p className="text-sidebar-text/50 text-xs px-2">No results</p>
              )}
            </div>
          )}

          <div className="space-y-0.5 px-1">
            {dmChannels.map((ch) => (
              <DmItem
                key={ch.id}
                channel={ch}
                currentUserId={user?.id}
                members={members}
                isActive={ch.id === channelId}
                onClick={() => handleChannelClick(ch)}
              />
            ))}
          </div>
        </section>
      </nav>

      {/* ── Create channel modal ─────────────────────────────────────────── */}
      {showAddChannel && (
        <CreateChannelModal
          workspaceId={workspaceId}
          onCreated={handleChannelCreated}
          onClose={() => setShowAddChannel(false)}
        />
      )}

      {/* ── Members modal ───────────────────────────────────────────────── */}
      {showMembers && (
        <WorkspaceMembersModal
          workspaceId={workspaceId}
          onClose={() => setShowMembers(false)}
        />
      )}

      {/* ── User bar ─────────────────────────────────────────────────────── */}
      <div className="px-2 py-2 border-t border-white/10 flex items-center gap-2">
        <div className="relative flex-shrink-0">
          <Avatar user={user} size="sm" />
          <PresenceDot
            isOnline={myPresence.isOnline}
            status={myPresence.status}
            size="sm"
            className="absolute -bottom-0.5 -right-0.5"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-semibold truncate">{user?.displayName}</p>
          <StatusMenu status={myPresence.status} onSetStatus={setStatus} />
        </div>
        <button
          onClick={logout}
          className="text-sidebar-text/60 hover:text-white transition-colors p-1 rounded"
          title="Sign out"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012 2v1" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
