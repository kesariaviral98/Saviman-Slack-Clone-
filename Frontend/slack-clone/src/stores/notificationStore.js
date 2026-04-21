import { create } from 'zustand';

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  hasMore: false,

  // ── Write operations ────────────────────────────────────────────────────────

  /** Replace the notification list (initial fetch). */
  setNotifications: (notifications, hasMore = false) =>
    set({ notifications, hasMore }),

  /** Prepend a newly-arrived notification from a socket event. */
  prependNotification: (notification) =>
    set((state) => {
      // Avoid duplicates
      if (state.notifications.some((n) => n.id === notification.id)) {
        return state;
      }
      return {
        notifications: [notification, ...state.notifications],
        unreadCount: state.unreadCount + (notification.isRead ? 0 : 1),
      };
    }),

  setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),

  markRead: (notificationId) =>
    set((state) => {
      const target = state.notifications.find((n) => n.id === notificationId);
      const wasUnread = target && !target.isRead;
      return {
        notifications: state.notifications.map((n) =>
          n.id === notificationId ? { ...n, isRead: true } : n,
        ),
        unreadCount: wasUnread
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount,
      };
    }),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    })),

  clearAll: () => set({ notifications: [], unreadCount: 0, hasMore: false }),
}));
