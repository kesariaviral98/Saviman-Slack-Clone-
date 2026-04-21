import { useEffect } from 'react';
import { Routes, Route, Navigate, useParams, useLocation, useSearchParams } from 'react-router-dom';

import { useAuthStore } from '@/stores/authStore';
import { useChannelStore } from '@/stores/channelStore';
import { useSocket } from '@/hooks/useSocket';
import { useSessionRestore } from '@/hooks/useAuth';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useChannels } from '@/hooks/useChannels';

import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import WorkspaceSelectPage from '@/pages/WorkspaceSelectPage';
import ChannelPage from '@/pages/ChannelPage';
import InvitePage from '@/pages/InvitePage';
import NotFoundPage from '@/pages/NotFoundPage';
import WorkspaceLayout from '@/components/layout/WorkspaceLayout';
import IncomingCallModal from '@/components/calling/IncomingCallModal';
import CallBar from '@/components/calling/CallBar';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

// ── Loading screen ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-sidebar-bg">
      <div className="text-sidebar-text text-sm">Loading…</div>
    </div>
  );
}

// ── Auth guards ───────────────────────────────────────────────────────────────

function RequireAuth({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const location = useLocation();

  if (!isHydrated) return <LoadingScreen />;
  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}

function RedirectIfAuthed({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');

  if (!isHydrated) return <LoadingScreen />;
  if (isAuthenticated) return <Navigate to={next ?? '/workspaces'} replace />;
  return children;
}

// ── Workspace redirect ────────────────────────────────────────────────────────
// /workspaces/:workspaceId  →  redirect to the first channel, or show "no channels"

function WorkspaceRedirect() {
  const { workspaceId } = useParams();
  const { channels, isLoading } = useChannels(workspaceId);

  if (isLoading) return <LoadingScreen />;

  const first = channels.find((c) => c.type !== 'dm') ?? channels[0];
  if (first) return <Navigate to={`/workspaces/${workspaceId}/channels/${first.id}`} replace />;

  return (
    <div className="flex flex-1 items-center justify-center text-gray-400">
      <div className="text-center">
        <p className="text-lg font-medium">No channels yet</p>
        <p className="text-sm mt-1">Create a channel in the sidebar to get started.</p>
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  // Restore session from HttpOnly refresh-token cookie on first load
  useSessionRestore();

  // Register all Socket.io → store event handlers
  useSocket();

  // Manage WebRTC peer connections (depends on socket being wired first)
  useWebRTC();

  return (
    <>
      {/* ── Global calling overlays ────────────────────────────────────────── */}
      <CallBar />
      <IncomingCallModal />
      <ErrorBoundary fullPage>
      <Routes>
      {/* ── Public ──────────────────────────────────────────────────────── */}
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthed>
            <RegisterPage />
          </RedirectIfAuthed>
        }
      />

      {/* ── Protected ───────────────────────────────────────────────────── */}
      <Route
        path="/workspaces"
        element={
          <RequireAuth>
            <WorkspaceSelectPage />
          </RequireAuth>
        }
      />

      {/* Workspace shell — Sidebar lives here; child routes render in <Outlet> */}
      <Route
        path="/workspaces/:workspaceId"
        element={
          <RequireAuth>
            <WorkspaceLayout />
          </RequireAuth>
        }
      >
        {/* Default: redirect to first channel */}
        <Route index element={<WorkspaceRedirect />} />

        {/* Channel view */}
        <Route path="channels/:channelId" element={<ChannelPage />} />
      </Route>

      {/* ── Invite ──────────────────────────────────────────────────────── */}
      <Route path="/invite/:token" element={<InvitePage />} />

      {/* ── Root + 404 ───────────────────────────────────────────────────── */}
      <Route path="/" element={<Navigate to="/workspaces" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
      </ErrorBoundary>
    </>
  );
}
