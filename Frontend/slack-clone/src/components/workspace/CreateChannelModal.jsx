// ─────────────────────────────────────────────────────────────────────────────
// CreateChannelModal — name + public/private toggle + member picker for private.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useChannels } from '@/hooks/useChannels';
import { useWorkspaceMembers } from '@/hooks/useWorkspaces';
import { useAuthStore } from '@/stores/authStore';
import Avatar from '@/components/ui/Avatar';

function slugify(value) {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
}

export default function CreateChannelModal({ workspaceId, onCreated, onClose }) {
  const { createChannel } = useChannels(workspaceId);
  const { data: members = [] } = useWorkspaceMembers(workspaceId);
  const myUserId = useAuthStore((s) => s.user?.id);

  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Members the current user can invite (exclude self)
  const invitableMembers = useMemo(
    () => members.filter((m) => m.userId !== myUserId),
    [members, myUserId],
  );

  const filteredMembers = memberSearch
    ? invitableMembers.filter((m) =>
        m.user?.displayName?.toLowerCase().includes(memberSearch.toLowerCase()),
      )
    : invitableMembers;

  const toggleMember = (userId) => {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const handleNameChange = (e) => {
    setName(slugify(e.target.value));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        isPrivate,
        type: 'text',
        ...(isPrivate && selectedIds.length > 0 ? { memberIds: selectedIds } : {}),
      };
      const data = await createChannel(payload);
      onCreated(data.channel?.id);
    } catch (err) {
      setError(err.message ?? 'Could not create channel.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Create a channel</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-5 py-4 space-y-5 overflow-y-auto flex-1">

            {/* Channel name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Channel name
              </label>
              <div className="flex items-center border border-gray-200 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-300 focus-within:border-blue-300">
                <span className="text-gray-400 mr-1 text-sm font-medium">#</span>
                <input
                  autoFocus
                  value={name}
                  onChange={handleNameChange}
                  placeholder="e.g. marketing-team"
                  maxLength={80}
                  className="flex-1 text-sm text-gray-800 outline-none placeholder-gray-400"
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Lowercase letters, numbers, hyphens, and underscores only.
              </p>
            </div>

            {/* Visibility toggle */}
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-2">Visibility</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setIsPrivate(false); setSelectedIds([]); }}
                  className={`flex items-start gap-2 p-3 rounded-lg border-2 text-left transition-colors ${
                    !isPrivate
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${!isPrivate ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
                  </svg>
                  <div>
                    <p className={`text-sm font-medium ${!isPrivate ? 'text-blue-700' : 'text-gray-700'}`}>
                      Public
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">All workspace members</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPrivate(true)}
                  className={`flex items-start gap-2 p-3 rounded-lg border-2 text-left transition-colors ${
                    isPrivate
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isPrivate ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <div>
                    <p className={`text-sm font-medium ${isPrivate ? 'text-blue-700' : 'text-gray-700'}`}>
                      Private
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Invite-only members</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Member picker — only shown for private channels */}
            {isPrivate && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Add members
                  <span className="ml-1 text-gray-400 font-normal">(optional)</span>
                </label>

                {/* Selected chips */}
                {selectedIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedIds.map((id) => {
                      const m = members.find((m) => m.userId === id);
                      const name = m?.user?.displayName ?? 'Unknown';
                      return (
                        <span
                          key={id}
                          className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full"
                        >
                          {name}
                          <button
                            type="button"
                            onClick={() => toggleMember(id)}
                            className="hover:text-blue-900"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search members…"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-1"
                />

                <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-36 overflow-y-auto">
                  {filteredMembers.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-3">No members found.</p>
                  )}
                  {filteredMembers.map((m) => {
                    const checked = selectedIds.includes(m.userId);
                    return (
                      <button
                        key={m.userId}
                        type="button"
                        onClick={() => toggleMember(m.userId)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors"
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          checked ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                        }`}>
                          {checked && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <Avatar user={m.user} size="xs" />
                        <span className="text-sm text-gray-800 truncate">{m.user?.displayName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="text-xs text-gray-400">
              {isPrivate
                ? selectedIds.length > 0
                  ? `${selectedIds.length} member${selectedIds.length > 1 ? 's' : ''} selected`
                  : 'Only you will be added initially'
                : 'All workspace members will be added'}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating…' : 'Create channel'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
