import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAuth } from '@/hooks/useAuth';
import Avatar from '@/components/ui/Avatar';
import { useAuthStore } from '@/stores/authStore';

export default function WorkspaceSelectPage() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { workspaces, isLoading, createWorkspace, deleteWorkspace } = useWorkspaces();
  const myUserId = useAuthStore((s) => s.user?.id);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // workspaceId

  const handleSelect = (workspaceId) => {
    navigate(`/workspaces/${workspaceId}`, { replace: true });
  };

  const handleDeleteWorkspace = async (workspaceId) => {
    try {
      await deleteWorkspace(workspaceId);
      setConfirmDelete(null);
    } catch (err) {
      alert(err.message ?? 'Could not delete workspace.');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreateError('');
    setCreateLoading(true);
    try {
      const { workspace } = await createWorkspace({ name: newName.trim() });
      navigate(`/workspaces/${workspace.id}`, { replace: true });
    } catch (err) {
      setCreateError(err.message ?? 'Failed to create workspace.');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-raised px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-sidebar-bg rounded-xl mb-3">
            <span className="text-white font-extrabold text-2xl">S</span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">
            {user?.displayName ? `Welcome back, ${user.displayName.split(' ')[0]}!` : 'Your workspaces'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Select a workspace to open.</p>
        </div>

        {/* Workspace list */}
        <div className="bg-white rounded-lg shadow border border-gray-200 divide-y divide-gray-100">
          {isLoading && (
            <div className="py-10 text-center text-gray-400 text-sm">Loading workspaces…</div>
          )}

          {!isLoading && workspaces.length === 0 && !creating && (
            <div className="py-10 text-center text-gray-400 text-sm">
              You have no workspaces yet.
            </div>
          )}

          {workspaces.map((ws) => {
            const isOwner = ws.ownerId === myUserId;
            return (
              <div key={ws.id} className="flex items-center group">
                <button
                  onClick={() => handleSelect(ws.id)}
                  className="flex-1 flex items-center gap-4 px-5 py-4 hover:bg-surface-raised text-left transition-colors"
                >
                  <div className="w-11 h-11 rounded-lg bg-sidebar-bg flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                    {ws.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{ws.name}</p>
                    {isOwner && (
                      <p className="text-xs text-blue-500">Owner</p>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {isOwner && (
                  <div className="pr-4 flex-shrink-0">
                    {confirmDelete === ws.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500">Delete?</span>
                        <button
                          onClick={() => handleDeleteWorkspace(ws.id)}
                          className="text-xs bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600 transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs text-gray-500 hover:text-gray-700 px-1"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(ws.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="Delete workspace"
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
          })}

          {/* Create workspace inline form */}
          {creating ? (
            <form onSubmit={handleCreate} className="px-5 py-4 space-y-3">
              {createError && (
                <p className="text-red-600 text-xs">{createError}</p>
              )}
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Workspace name"
                className="input w-full"
                maxLength={80}
              />
              <div className="flex gap-2">
                <button type="submit" disabled={createLoading || !newName.trim()} className="btn btn-primary flex-1">
                  {createLoading ? 'Creating…' : 'Create'}
                </button>
                <button type="button" onClick={() => setCreating(false)} className="btn btn-secondary flex-1">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-raised text-left transition-colors text-blue-600"
            >
              <div className="w-11 h-11 rounded-lg border-2 border-dashed border-blue-200 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="font-medium">Create a new workspace</span>
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Avatar user={user} size="sm" />
            <span className="text-sm text-gray-600 truncate max-w-[180px]">
              {user?.email}
            </span>
          </div>
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
