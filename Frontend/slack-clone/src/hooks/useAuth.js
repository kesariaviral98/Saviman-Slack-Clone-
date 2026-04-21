// ─────────────────────────────────────────────────────────────────────────────
// useAuth  — login, register, logout, and session-restore.
//
// useSessionRestore() is called once in App.jsx.  It fires /auth/refresh on
// mount so the access token is populated from the HttpOnly cookie before any
// data-fetching hooks run.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useMessageStore } from '@/stores/messageStore';
import { useChannelStore } from '@/stores/channelStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useCallStore } from '@/stores/callStore';
import { api } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { queryClient } from '@/lib/queryClient';

// ── Session restore (mount-once effect) ──────────────────────────────────────

export function useSessionRestore() {
  const { isHydrated, isAuthenticated, accessToken, setSession, clear } =
    useAuthStore();
  const hasTriedRef = useRef(false);

  useEffect(() => {
    // Only attempt once, and only after Zustand has rehydrated from localStorage
    if (!isHydrated || hasTriedRef.current) return;
    hasTriedRef.current = true;

    // If we already have an in-memory token (e.g., hot-reload) — nothing to do
    if (isAuthenticated && accessToken) {
      connectSocket(accessToken);
      return;
    }

    // Try to get a fresh access token from the HttpOnly cookie
    void (async () => {
      try {
        const data = await api.post('/auth/refresh', null, { skipAuth: true });
        if (data?.accessToken) {
          const userData = await api.get('/auth/me', {
            headers: { Authorization: `Bearer ${data.accessToken}` },
          });
          setSession(userData.user, data.accessToken);
          connectSocket(data.accessToken);
        } else {
          clear();
        }
      } catch {
        // Cookie expired or absent — show login page
        clear();
      }
    })();
  }, [isHydrated]);
}

// ── useAuth hook ──────────────────────────────────────────────────────────────

export function useAuth() {
  const { user, isAuthenticated, isHydrated, setSession, updateUser, clear } =
    useAuthStore();

  const clearAllStores = useCallback(() => {
    usePresenceStore.getState().clearAll();
    useNotificationStore.getState().clearAll();
    useMessageStore.setState({ channels: {} });
    useChannelStore.setState({ channelsByWorkspace: {}, activeChannelId: null });
    useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: null });
    useCallStore.getState().clearCall();
    queryClient.clear();
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.post(
      '/auth/login',
      { email, password },
      { skipAuth: true },
    );
    setSession(data.user, data.accessToken);
    connectSocket(data.accessToken);
    return data.user;
  }, [setSession]);

  const register = useCallback(async (email, password, displayName) => {
    const data = await api.post(
      '/auth/register',
      { email, password, displayName },
      { skipAuth: true },
    );
    setSession(data.user, data.accessToken);
    connectSocket(data.accessToken);
    return data.user;
  }, [setSession]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', null);
    } finally {
      disconnectSocket();
      clear();
      clearAllStores();
    }
  }, [clear, clearAllStores]);

  const loginWithGoogle = useCallback(async (idToken) => {
    const data = await api.post(
      '/auth/oauth/google',
      { idToken },
      { skipAuth: true },
    );
    setSession(data.user, data.accessToken);
    connectSocket(data.accessToken);
    return data.user;
  }, [setSession]);

  const updateProfile = useCallback(async (partial) => {
    const data = await api.patch('/auth/me', partial);
    updateUser(data.user);
    return data.user;
  }, [updateUser]);

  return {
    user,
    isAuthenticated,
    isHydrated,
    login,
    register,
    logout,
    loginWithGoogle,
    updateProfile,
  };
}
