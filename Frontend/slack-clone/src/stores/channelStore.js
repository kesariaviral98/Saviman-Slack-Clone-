import { create } from 'zustand';

export const useChannelStore = create((set, get) => ({
  // workspaceId → Channel[]
  channelsByWorkspace: {},
  activeChannelId: null,

  setChannels: (workspaceId, channels) =>
    set((state) => ({
      channelsByWorkspace: {
        ...state.channelsByWorkspace,
        [workspaceId]: channels,
      },
    })),

  addChannel: (workspaceId, channel) =>
    set((state) => {
      const existing = state.channelsByWorkspace[workspaceId] ?? [];
      // Avoid duplicates
      if (existing.some((c) => c.id === channel.id)) return state;
      return {
        channelsByWorkspace: {
          ...state.channelsByWorkspace,
          [workspaceId]: [...existing, channel],
        },
      };
    }),

  updateChannel: (channelId, partial) =>
    set((state) => ({
      channelsByWorkspace: Object.fromEntries(
        Object.entries(state.channelsByWorkspace).map(([wsId, channels]) => [
          wsId,
          channels.map((c) => (c.id === channelId ? { ...c, ...partial } : c)),
        ]),
      ),
    })),

  removeChannel: (channelId) =>
    set((state) => ({
      channelsByWorkspace: Object.fromEntries(
        Object.entries(state.channelsByWorkspace).map(([wsId, channels]) => [
          wsId,
          channels.filter((c) => c.id !== channelId),
        ]),
      ),
      activeChannelId:
        state.activeChannelId === channelId ? null : state.activeChannelId,
    })),

  setActiveChannel: (id) => set({ activeChannelId: id }),

  // Selectors
  getChannels: (workspaceId) =>
    get().channelsByWorkspace[workspaceId] ?? [],

  getActiveChannel: () => {
    const { channelsByWorkspace, activeChannelId } = get();
    if (!activeChannelId) return null;
    return (
      Object.values(channelsByWorkspace)
        .flat()
        .find((c) => c.id === activeChannelId) ?? null
    );
  },

  getChannel: (channelId) => {
    const { channelsByWorkspace } = get();
    return (
      Object.values(channelsByWorkspace)
        .flat()
        .find((c) => c.id === channelId) ?? null
    );
  },
}));
