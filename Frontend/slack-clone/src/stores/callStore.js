import { create } from 'zustand';

// callState mirrors the server's CallState:
//   idle → ringing (incoming) → active → ended → idle

export const useCallStore = create((set, get) => ({
  // Active call the local user is participating in
  activeCall: null,

  // Incoming call invitation (shown in modal until accepted/rejected)
  incomingCall: null,   // { call: Call, initiator: UserPublic }

  // Local media stream (audio/video)
  localStream: null,

  // Map of remote streams: userId → MediaStream
  remoteStreams: {},

  // Map of RTCPeerConnections: userId → RTCPeerConnection
  peerConnections: {},

  // ── Incoming call ──────────────────────────────────────────────────────────

  setIncomingCall: (call, initiator) =>
    set({ incomingCall: { call, initiator } }),

  clearIncomingCall: () => set({ incomingCall: null }),

  // ── Active call ────────────────────────────────────────────────────────────

  setActiveCall: (call) =>
    set({ activeCall: call, incomingCall: null }),

  updateActiveCall: (partial) =>
    set((state) => ({
      activeCall: state.activeCall ? { ...state.activeCall, ...partial } : null,
    })),

  addParticipant: (participant) =>
    set((state) => {
      if (!state.activeCall) return state;
      const existing = state.activeCall.participants ?? [];
      if (existing.some((p) => p.userId === participant.userId)) return state;
      return {
        activeCall: {
          ...state.activeCall,
          participants: [...existing, participant],
        },
      };
    }),

  removeParticipant: (userId) =>
    set((state) => {
      if (!state.activeCall) return state;
      return {
        activeCall: {
          ...state.activeCall,
          participants: (state.activeCall.participants ?? []).filter(
            (p) => p.userId !== userId,
          ),
        },
      };
    }),

  // ── Media ──────────────────────────────────────────────────────────────────

  setLocalStream: (stream) => set({ localStream: stream }),

  addRemoteStream: (userId, stream) =>
    set((state) => ({
      remoteStreams: { ...state.remoteStreams, [userId]: stream },
    })),

  removeRemoteStream: (userId) =>
    set((state) => {
      const { [userId]: _removed, ...rest } = state.remoteStreams;
      return { remoteStreams: rest };
    }),

  addPeerConnection: (userId, pc) =>
    set((state) => ({
      peerConnections: { ...state.peerConnections, [userId]: pc },
    })),

  removePeerConnection: (userId) =>
    set((state) => {
      const { [userId]: _removed, ...rest } = state.peerConnections;
      return { peerConnections: rest };
    }),

  // ── Full reset ─────────────────────────────────────────────────────────────

  clearCall: () => {
    // Stop all peer connections gracefully
    const { peerConnections, localStream } = get();
    Object.values(peerConnections).forEach((pc) => {
      try { pc.close(); } catch { /* ignore */ }
    });
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    set({
      activeCall: null,
      incomingCall: null,
      localStream: null,
      remoteStreams: {},
      peerConnections: {},
    });
  },
}));
