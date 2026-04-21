// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceLayout — three-column shell: Sidebar | Main | (optional) ThreadPanel
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import Sidebar from './Sidebar';
import SearchModal from '@/components/search/SearchModal';
import { useWorkspacePresence } from '@/hooks/useWorkspaces';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

export default function WorkspaceLayout() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();

  // Seed the presence store with all workspace members' online state on load
  useWorkspacePresence(workspaceId);

  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Keyboard shortcut Ctrl/Cmd+K → open search
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSearchClose = useCallback(() => setSearchOpen(false), []);
  const handleSidebarClose = useCallback(() => setSidebarOpen(false), []);
  const handleSidebarOpen = useCallback(() => setSidebarOpen(true), []);

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Mobile sidebar backdrop — only rendered below md */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={handleSidebarClose}
        />
      )}

      {/* Left sidebar */}
      <ErrorBoundary>
        <Sidebar
          onOpenSearch={() => setSearchOpen(true)}
          isOpen={sidebarOpen}
          onClose={handleSidebarClose}
        />
      </ErrorBoundary>

      {/* Main content area — renders the nested route (ChannelPage or redirect) */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <ErrorBoundary>
          <Outlet context={{ onOpenSidebar: handleSidebarOpen }} />
        </ErrorBoundary>
      </main>

      {/* Global modals */}
      <SearchModal
        workspaceId={workspaceId}
        isOpen={searchOpen}
        onClose={handleSearchClose}
      />
    </div>
  );
}
