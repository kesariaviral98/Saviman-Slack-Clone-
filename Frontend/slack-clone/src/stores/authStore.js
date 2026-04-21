import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Only the safe public user shape is persisted (no tokens).
// accessToken lives in memory only — refreshed from the HttpOnly cookie on load.

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null, // memory-only — NOT written to localStorage
      isAuthenticated: false,
      isHydrated: false, // true after Zustand rehydrates from storage

      // Called once the persist middleware has finished rehydrating
      setHydrated: () => set({ isHydrated: true }),

      // Set the in-memory access token (called after /auth/refresh succeeds)
      setAccessToken: (accessToken) => set({ accessToken }),

      // Full session establishment (login / register / session-restore)
      setSession: (user, accessToken) =>
        set({ user, accessToken, isAuthenticated: true }),

      // Partial user update (e.g., profile edit)
      updateUser: (partial) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        })),

      // Wipe everything — called on logout or expired cookie
      clear: () =>
        set({ user: null, accessToken: null, isAuthenticated: false }),
    }),
    {
      name: 'teamchat-auth',
      // Only persist non-sensitive data; accessToken is excluded
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        // Mark hydration complete regardless of whether storage had data
        state?.setHydrated();
        // If user was persisted, mark as authenticated so RequireAuth doesn't
        // immediately redirect — useSessionRestore will verify the cookie.
        if (state?.user) {
          state.isAuthenticated = true;
        }
      },
    },
  ),
);
