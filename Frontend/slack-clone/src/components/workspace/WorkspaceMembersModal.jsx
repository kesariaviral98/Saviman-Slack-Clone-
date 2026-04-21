// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceMembersModal — full member list with role badges.
// Admins can promote / demote any non-owner member.
// Owner is identified as the member whose userId matches workspace.ownerId.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspaceMembers, useChangeMemberRole, useRemoveWorkspaceMember } from '@/hooks/useWorkspaces';
import { useWorkspace } from '@/hooks/useWorkspaces';
import { useAuthStore } from '@/stores/authStore';
import Avatar from '@/components/ui/Avatar';

const ROLES = ['guest', 'member', 'admin'];

const ROLE_BADGE = {
  admin:  'bg-purple-100 text-purple-700',
  member: 'bg-blue-100 text-blue-700',
  guest:  'bg-gray-100 text-gray-500',
};

function RoleSelect({ memberId, currentRole, ownerId, isOwner, myRole, workspaceId, onClose }) {
  const { mutate: changeRole, isPending } = useChangeMemberRole(workspaceId);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isMe = memberId === currentUserId;

  // Guests/members cannot change roles; admins can promote to member/guest;
  // only the owner can grant or revoke admin.
  if (myRole !== 'admin' || isOwner || isMe) {
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_BADGE[currentRole] ?? ROLE_BADGE.member}`}>
        {isOwner ? 'owner' : currentRole}
      </span>
    );
  }

  const allowedRoles = myRole === 'admin' && currentUserId === ownerId
    ? ROLES                          // workspace owner can grant anything
    : ROLES.filter((r) => r !== 'admin'); // regular admins cannot grant admin

  return (
    <select
      value={currentRole}
      disabled={isPending}
      onChange={(e) => changeRole({ userId: memberId, role: e.target.value })}
      className="text-xs border border-gray-200 rounded px-2 py-0.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
    >
      {allowedRoles.map((r) => (
        <option key={r} value={r}>{r}</option>
      ))}
    </select>
  );
}

export default function WorkspaceMembersModal({ workspaceId, onClose }) {
  const { data: members = [], isLoading } = useWorkspaceMembers(workspaceId);
  const { data: workspace } = useWorkspace(workspaceId);
  const myUserId = useAuthStore((s) => s.user?.id);
  const myRole = members.find((m) => m.userId === myUserId)?.role ?? 'member';
  const { mutate: removeMember, isPending: isRemoving } = useRemoveWorkspaceMember(workspaceId);
  const [search, setSearch] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null); // userId to confirm

  const filtered = search
    ? members.filter((m) =>
        m.user?.displayName?.toLowerCase().includes(search.toLowerCase()),
      )
    : members;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Members</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members…"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Member list */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {isLoading && (
            <p className="text-center text-gray-400 text-sm py-8">Loading…</p>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">No members found.</p>
          )}
          {filtered.map((m) => {
            const isOwner = m.userId === workspace?.ownerId;
            const isMe = m.userId === myUserId;
            const canRemove = myRole === 'admin' && !isOwner && !isMe;
            return (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 group">
                <Avatar user={m.user} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {m.user?.displayName ?? 'Unknown'}
                    {isMe && (
                      <span className="ml-1.5 text-xs text-gray-400">(you)</span>
                    )}
                  </p>
                </div>
                <RoleSelect
                  memberId={m.userId}
                  currentRole={m.role}
                  ownerId={workspace?.ownerId}
                  isOwner={isOwner}
                  myRole={myRole}
                  workspaceId={workspaceId}
                />
                {canRemove && (
                  confirmRemove === m.userId ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { removeMember(m.userId); setConfirmRemove(null); }}
                        disabled={isRemoving}
                        className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-1"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(m.userId)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1 rounded"
                      title="Remove member"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                      </svg>
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* Role legend */}
        <div className="px-5 py-3 border-t border-gray-100 flex gap-3 flex-wrap">
          <span className="text-xs text-gray-400">Roles:</span>
          {[['admin', 'Can manage workspace, channels, and members'], ['member', 'Can create channels and send messages'], ['guest', 'Read-only access']].map(([role, tip]) => (
            <span key={role} title={tip} className={`text-xs font-medium px-2 py-0.5 rounded-full cursor-help ${ROLE_BADGE[role]}`}>
              {role}
            </span>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
