import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNotificationStore } from '@/stores/notificationStore';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { socketEmit } from '@/lib/socket';
import { CLIENT_EVENTS } from '@/lib/events';

export function useNotifications() {
  const qc = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { setNotifications, markRead, markAllRead, setUnreadCount } =
    useNotificationStore();

  // Fetch initial list
  const listQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const data = await api.get('/notifications?limit=20');
      setNotifications(data.notifications ?? [], data.hasMore ?? false);
      return data;
    },
    enabled: isAuthenticated,
  });

  // Fetch unread count (fast Redis-backed endpoint)
  const countQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const data = await api.get('/notifications/unread-count');
      setUnreadCount(data.count ?? 0);
      return data.count ?? 0;
    },
    enabled: isAuthenticated,
    refetchInterval: 60_000, // Poll every minute as a safety net
  });

  // Mark single notification read — optimistic + server
  const markReadMutation = useMutation({
    mutationFn: (notificationId) =>
      api.patch(`/notifications/${notificationId}/read`),
    onMutate: (notificationId) => {
      markRead(notificationId); // Optimistic
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
    onError: () => {
      // Revert by refetching
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Mark all read
  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onMutate: () => {
      markAllRead(); // Optimistic
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  /** Mark a notification read via socket (lower latency). */
  const markReadViaSocket = (notificationId) => {
    socketEmit(CLIENT_EVENTS.NOTIFICATION_READ, { notificationId }).catch(
      () => markReadMutation.mutate(notificationId), // Fallback to REST
    );
    markRead(notificationId); // Optimistic
  };

  return {
    notifications: useNotificationStore((s) => s.notifications),
    unreadCount: useNotificationStore((s) => s.unreadCount),
    hasMore: useNotificationStore((s) => s.hasMore),
    isLoading: listQuery.isLoading,
    markRead: markReadMutation.mutateAsync,
    markReadViaSocket,
    markAllRead: markAllReadMutation.mutateAsync,
    refetch: listQuery.refetch,
  };
}
