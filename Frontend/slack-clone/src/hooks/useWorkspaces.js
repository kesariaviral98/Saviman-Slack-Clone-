import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export function useWorkspaceInvite(workspaceId) {
  const createInviteMutation = useMutation({
    mutationFn: () => api.post(`/workspaces/${workspaceId}/invites`, {}),
  });

  const sendEmailInviteMutation = useMutation({
    mutationFn: (email) => api.post(`/workspaces/${workspaceId}/invites/email`, { email }),
  });

  return {
    createInvite: createInviteMutation.mutateAsync,
    isCreating: createInviteMutation.isPending,
    sendEmailInvite: sendEmailInviteMutation.mutateAsync,
    isSendingEmail: sendEmailInviteMutation.isPending,
  };
}

export function useInviteWorkspace(token) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ['invite', token],
    queryFn: async () => {
      const data = await api.get(`/workspaces/invites/${token}`);
      return data.workspace;
    },
    enabled: !!token && isAuthenticated,
    retry: false,
  });
}

export function useWorkspaces() {
  const qc = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { setWorkspaces, addWorkspace, updateWorkspace, removeWorkspace } =
    useWorkspaceStore();

  const query = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const data = await api.get('/workspaces');
      return data.workspaces ?? [];
    },
    enabled: isAuthenticated,
  });

  // Sync React Query cache → Zustand store
  useEffect(() => {
    if (query.data) setWorkspaces(query.data);
  }, [query.data]);

  const createMutation = useMutation({
    mutationFn: (input) => api.post('/workspaces', input),
    onSuccess: (data) => {
      addWorkspace(data.workspace);
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...input }) => api.patch(`/workspaces/${id}`, input),
    onSuccess: (data) => {
      updateWorkspace(data.workspace.id, data.workspace);
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/workspaces/${id}`),
    onSuccess: (_, id) => {
      removeWorkspace(id);
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });

  return {
    workspaces: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createWorkspace: createMutation.mutateAsync,
    updateWorkspace: updateMutation.mutateAsync,
    deleteWorkspace: deleteMutation.mutateAsync,
    refetch: query.refetch,
  };
}

export function useWorkspace(workspaceId) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: ['workspaces', workspaceId],
    queryFn: async () => {
      const data = await api.get(`/workspaces/${workspaceId}`);
      return data.workspace;
    },
    enabled: isAuthenticated && !!workspaceId,
  });
}

export function useWorkspaceMembers(workspaceId) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: ['workspaces', workspaceId, 'members'],
    queryFn: async () => {
      const data = await api.get(`/workspaces/${workspaceId}/members`);
      return data.members ?? [];
    },
    enabled: isAuthenticated && !!workspaceId,
  });
}

/** Returns the current user's role in the workspace ('guest'|'member'|'admin'|null). */
export function useMyWorkspaceRole(workspaceId) {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: members = [] } = useWorkspaceMembers(workspaceId);
  if (!userId || !workspaceId) return null;
  return members.find((m) => m.userId === userId)?.role ?? null;
}

export function useRemoveWorkspaceMember(workspaceId) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (userId) =>
      api.delete(`/workspaces/${workspaceId}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'members'] });
    },
  });
}

export function useChangeMemberRole(workspaceId) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }) =>
      api.patch(`/workspaces/${workspaceId}/members/${userId}/role`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'members'] });
    },
  });
}

/**
 * Fetches presence for all workspace members in one request and seeds
 * the presence store. Called once when the workspace layout mounts.
 */
export function useWorkspacePresence(workspaceId) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setBatchPresence = usePresenceStore((s) => s.setBatchPresence);

  const query = useQuery({
    queryKey: ['workspaces', workspaceId, 'presence'],
    queryFn: async () => {
      const data = await api.get(`/workspaces/${workspaceId}/presence`);
      return data.presence ?? {};
    },
    enabled: isAuthenticated && !!workspaceId,
    // Re-fetch when the tab regains focus so presence is fresh after Alt-Tab
    refetchOnWindowFocus: true,
    staleTime: 30_000, // 30 s — socket events keep it fresh in between
  });

  useEffect(() => {
    if (query.data) setBatchPresence(query.data);
  }, [query.data, setBatchPresence]);
}
