import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useChannelStore } from '@/stores/channelStore';
import { api } from '@/lib/api';
import { socketEmit } from '@/lib/socket';
import { CLIENT_EVENTS } from '@/lib/events';

export function useChannels(workspaceId) {
  const qc = useQueryClient();
  const { setChannels, addChannel } = useChannelStore();

  const query = useQuery({
    queryKey: ['channels', workspaceId],
    queryFn: async () => {
      const data = await api.get(`/workspaces/${workspaceId}/channels`);
      return data.channels ?? [];
    },
    enabled: !!workspaceId,
  });

  // Sync → Zustand store
  useEffect(() => {
    if (query.data && workspaceId) {
      setChannels(workspaceId, query.data);
    }
  }, [query.data, workspaceId]);

  const createMutation = useMutation({
    mutationFn: (input) =>
      api.post(`/workspaces/${workspaceId}/channels`, input),
    onSuccess: (data) => {
      addChannel(workspaceId, data.channel);
      qc.invalidateQueries({ queryKey: ['channels', workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ channelId, ...input }) =>
      api.patch(`/channels/${channelId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (channelId) => api.delete(`/channels/${channelId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', workspaceId] });
    },
  });

  const joinChannel = (channelId) =>
    socketEmit(CLIENT_EVENTS.CHANNEL_JOIN, { channelId });

  const leaveChannel = (channelId) =>
    socketEmit(CLIENT_EVENTS.CHANNEL_LEAVE, { channelId });

  const syncChannel = (channelId) =>
    socketEmit(CLIENT_EVENTS.CHANNEL_SYNC, { channelId, lastSeenSequence: 0 });

  return {
    channels: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createChannel: createMutation.mutateAsync,
    updateChannel: updateMutation.mutateAsync,
    deleteChannel: deleteMutation.mutateAsync,
    joinChannel,
    leaveChannel,
    syncChannel,
    refetch: query.refetch,
  };
}

export function useChannelMembers(channelId) {
  return useQuery({
    queryKey: ['channels', channelId, 'members'],
    queryFn: async () => {
      const data = await api.get(`/channels/${channelId}/members`);
      return data.members ?? [];
    },
    enabled: !!channelId,
  });
}

export function useDm(workspaceId) {
  const qc = useQueryClient();
  const { addChannel } = useChannelStore();

  const openDm = useMutation({
    mutationFn: (targetUserId) =>
      api.post(`/workspaces/${workspaceId}/dm`, { targetUserId }),
    onSuccess: (data) => {
      if (workspaceId) addChannel(workspaceId, data.channel);
      qc.invalidateQueries({ queryKey: ['channels', workspaceId] });
    },
  });

  return { openDm: openDm.mutateAsync };
}
