import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useInviteWorkspace } from '@/hooks/useWorkspaces';
import { api } from '@/lib/api';

function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-surface-raised">
      <div className="text-gray-400 text-sm">Loading…</div>
    </div>
  );
}

export default function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  const { data: workspace, isLoading, error } = useInviteWorkspace(token);

  const [joinError, setJoinError] = useState('');
  const [joined, setJoined] = useState(false);

  const acceptMutation = useMutation({
    mutationFn: () => api.post(`/workspaces/invites/${token}/accept`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      setJoined(true);
      setTimeout(() => navigate(`/workspaces/${data.workspace.id}`, { replace: true }), 1200);
    },
    onError: (err) => {
      setJoinError(err.message ?? 'Could not join workspace.');
    },
  });

  if (!isHydrated) return <LoadingScreen />;

  // Not authenticated — show prompt to log in / register
  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 overflow-y-auto flex flex-col items-center justify-center bg-surface-raised px-4">
        <div className="w-full max-w-sm sm:max-w-md text-center space-y-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-sidebar-bg rounded-xl">
            <span className="text-white font-extrabold text-2xl">T</span>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">You've been invited!</h1>
            <p className="text-gray-500 text-sm mt-1">
              Sign in or create an account to accept this workspace invite.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              to={`/login?next=/invite/${token}`}
              className="btn btn-primary w-full text-center"
            >
              Sign in
            </Link>
            <Link
              to={`/register?next=/invite/${token}`}
              className="btn btn-secondary w-full text-center"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated — show workspace invite card
  return (
    <div className="fixed inset-0 overflow-y-auto flex flex-col items-center justify-center bg-surface-raised px-4">
      <div className="w-full max-w-sm sm:max-w-md bg-white rounded-lg shadow border border-gray-200 p-8 text-center space-y-5">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-sidebar-bg rounded-xl">
          <span className="text-white font-extrabold text-2xl">T</span>
        </div>

        {isLoading && (
          <p className="text-gray-400 text-sm">Loading invite…</p>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">
            This invite link is invalid or has expired.
          </div>
        )}

        {workspace && !joined && (
          <>
            <div>
              <p className="text-gray-500 text-sm">You've been invited to join</p>
              <h2 className="text-2xl font-extrabold text-gray-900 mt-1">{workspace.name}</h2>
            </div>

            {joinError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">
                {joinError}
              </div>
            )}

            <button
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
              className="btn btn-primary w-full"
            >
              {acceptMutation.isPending ? 'Joining…' : `Join ${workspace.name}`}
            </button>
          </>
        )}

        {joined && (
          <div className="text-green-600 font-semibold">
            Joined! Redirecting to workspace…
          </div>
        )}

        <Link to="/workspaces" className="block text-sm text-gray-400 hover:text-gray-600">
          Back to workspaces
        </Link>
      </div>
    </div>
  );
}
