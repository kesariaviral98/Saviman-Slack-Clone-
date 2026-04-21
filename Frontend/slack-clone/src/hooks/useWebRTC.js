// ─────────────────────────────────────────────────────────────────────────────
// useWebRTC — manages RTCPeerConnections for every remote participant.
//
// Topology: mesh (every participant ↔ every other participant, ≤8 peers).
//
// Negotiation model:
//   Uses the "perfect negotiation" pattern so offer collisions are handled
//   deterministically and renegotiation is no longer timing-based.
//   We derive the polite peer from userId ordering so exactly one side is
//   polite for every pair.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCallStore } from '@/stores/callStore';
import { getSocket, socketEmit } from '@/lib/socket';
import { SERVER_EVENTS, CLIENT_EVENTS } from '@/lib/events';
import { config } from '@/lib/config';

function buildIceServers() {
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  if (config.turn?.url) {
    servers.push({
      urls: config.turn.url,
      username: config.turn.username,
      credential: config.turn.credential,
    });
  }
  return servers;
}

function waitForLocalStream(timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const current = useCallStore.getState().localStream;
    if (current) return resolve(current);

    let unsub;
    const timer = setTimeout(() => {
      unsub?.();
      reject(new Error('[webrtc] timed out waiting for local media'));
    }, timeoutMs);

    unsub = useCallStore.subscribe((state) => {
      if (state.localStream) {
        clearTimeout(timer);
        unsub();
        resolve(state.localStream);
      }
    });
  });
}

function addMissingTracks(pc, stream) {
  if (!stream || pc.signalingState === 'closed') return;
  const existing = new Set(
    pc.getSenders().map((sender) => sender.track?.id).filter(Boolean),
  );

  stream.getTracks().forEach((track) => {
    if (!existing.has(track.id)) {
      try {
        pc.addTrack(track, stream);
      } catch (err) {
        console.warn('[webrtc] addTrack failed', err);
      }
    }
  });
}

export function useWebRTC() {
  const currentUserId = useAuthStore((s) => s.user?.id);

  const pcsRef = useRef(new Map()); // remoteUserId -> RTCPeerConnection
  const peerMetaRef = useRef(new Map()); // remoteUserId -> perfect negotiation state
  const iceQueuesRef = useRef(new Map()); // remoteUserId -> RTCIceCandidate[]
  const remoteStreamsRef = useRef(new Map()); // remoteUserId -> MediaStream
  const seenParticipantsRef = useRef(new Set());

  const flushIceQueue = useCallback(async (remoteUserId, pc) => {
    const queued = iceQueuesRef.current.get(remoteUserId) ?? [];
    iceQueuesRef.current.delete(remoteUserId);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('[webrtc] queued addIceCandidate failed', err);
      }
    }
  }, []);

  const createPeerConnection = useCallback((remoteUserId, callId, localStream) => {
    const existing = pcsRef.current.get(remoteUserId);
    if (existing) {
      if (localStream) addMissingTracks(existing, localStream);
      return existing;
    }

    const polite = Boolean(currentUserId && currentUserId < remoteUserId);
    const pc = new RTCPeerConnection({ iceServers: buildIceServers() });

    const meta = {
      polite,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
    };
    peerMetaRef.current.set(remoteUserId, meta);

    pc.ontrack = (event) => {
      const remoteStream =
        event.streams?.[0] ??
        remoteStreamsRef.current.get(remoteUserId) ??
        new MediaStream();

      if (!event.streams?.[0]) {
        const exists = remoteStream.getTracks().some((track) => track.id === event.track.id);
        if (!exists) remoteStream.addTrack(event.track);
      }

      remoteStreamsRef.current.set(remoteUserId, remoteStream);
      useCallStore.getState().addRemoteStream(remoteUserId, remoteStream);

      event.track.onended = () => {
        const current = remoteStreamsRef.current.get(remoteUserId);
        if (!current) return;
        current.removeTrack(event.track);
        if (current.getTracks().length === 0) {
          remoteStreamsRef.current.delete(remoteUserId);
          useCallStore.getState().removeRemoteStream(remoteUserId);
        } else {
          useCallStore.getState().addRemoteStream(remoteUserId, current);
        }
      };
    };

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      socketEmit(CLIENT_EVENTS.CALL_ICE_CANDIDATE, {
        callId,
        targetUserId: remoteUserId,
        candidate: candidate.toJSON(),
      }).catch(() => {});
    };

    pc.onnegotiationneeded = () => {
      void (async () => {
        try {
          meta.makingOffer = true;
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await pc.setLocalDescription(offer);
          if (!pc.localDescription) return;
          await socketEmit(CLIENT_EVENTS.CALL_SDP_OFFER, {
            callId,
            targetUserId: remoteUserId,
            sdp: pc.localDescription,
          });
        } catch (err) {
          console.warn('[webrtc] negotiationneeded offer failed', err);
        } finally {
          meta.makingOffer = false;
        }
      })();
    };

    let disconnectTimer = null;
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected') {
        disconnectTimer = setTimeout(() => {
          if (pc.connectionState !== 'disconnected') return;
          void (async () => {
            try {
              meta.makingOffer = true;
              const offer = await pc.createOffer({ iceRestart: true });
              await pc.setLocalDescription(offer);
              if (!pc.localDescription) return;
              await socketEmit(CLIENT_EVENTS.CALL_SDP_OFFER, {
                callId,
                targetUserId: remoteUserId,
                sdp: pc.localDescription,
              });
            } catch (err) {
              console.warn('[webrtc] ICE restart failed', err);
            } finally {
              meta.makingOffer = false;
            }
          })();
        }, 5_000);
        return;
      }

      clearTimeout(disconnectTimer);

      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        useCallStore.getState().removeRemoteStream(remoteUserId);
        useCallStore.getState().removePeerConnection(remoteUserId);
        pcsRef.current.delete(remoteUserId);
        peerMetaRef.current.delete(remoteUserId);
        iceQueuesRef.current.delete(remoteUserId);
        remoteStreamsRef.current.delete(remoteUserId);
      }
    };

    if (localStream) {
      addMissingTracks(pc, localStream);
    }

    pcsRef.current.set(remoteUserId, pc);
    useCallStore.getState().addPeerConnection(remoteUserId, pc);
    return pc;
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;

    const unsub = useCallStore.subscribe((state) => {
      const participants = state.activeCall?.participants ?? [];
      const callId = state.activeCall?.id;
      if (!callId) return;

      for (const participant of participants) {
        if (participant.userId === currentUserId) continue;
        if (seenParticipantsRef.current.has(participant.userId)) continue;

        seenParticipantsRef.current.add(participant.userId);
        createPeerConnection(
          participant.userId,
          callId,
          useCallStore.getState().localStream,
        );
      }
    });

    return unsub;
  }, [currentUserId, createPeerConnection]);

  useEffect(() => {
    const unsub = useCallStore.subscribe((state, prev) => {
      const stream = state.localStream;
      if (!stream || stream === prev.localStream) return;

      pcsRef.current.forEach((pc) => {
        addMissingTracks(pc, stream);
      });
    });

    return unsub;
  }, []);

  useEffect(() => {
    const unsub = useCallStore.subscribe((state) => {
      if (!state.activeCall) {
        pcsRef.current.forEach((pc) => {
          try { pc.close(); } catch { /* ignore */ }
        });
        pcsRef.current.clear();
        peerMetaRef.current.clear();
        iceQueuesRef.current.clear();
        remoteStreamsRef.current.clear();
        seenParticipantsRef.current.clear();
      }
    });

    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    const socket = getSocket();
    if (!socket) return;

    const handleOffer = ({ callId, fromUserId, sdp }) => {
      void (async () => {
        try {
          let localStream;
          try {
            localStream = await waitForLocalStream();
          } catch {
            localStream = null;
          }

          const pc = createPeerConnection(fromUserId, callId, localStream);
          const meta = peerMetaRef.current.get(fromUserId);
          if (!meta) return;

          const description = new RTCSessionDescription(sdp);
          const readyForOffer =
            !meta.makingOffer &&
            (pc.signalingState === 'stable' || meta.isSettingRemoteAnswerPending);
          const offerCollision = description.type === 'offer' && !readyForOffer;

          meta.ignoreOffer = !meta.polite && offerCollision;
          if (meta.ignoreOffer) return;

          if (description.type === 'answer') {
            meta.isSettingRemoteAnswerPending = true;
          }

          await pc.setRemoteDescription(description);
          meta.isSettingRemoteAnswerPending = false;
          await flushIceQueue(fromUserId, pc);

          if (description.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (!pc.localDescription) return;
            await socketEmit(CLIENT_EVENTS.CALL_SDP_ANSWER, {
              callId,
              targetUserId: fromUserId,
              sdp: pc.localDescription,
            });
          }
        } catch (err) {
          console.warn('[webrtc] handling offer failed', err);
        }
      })();
    };

    const handleAnswer = ({ fromUserId, sdp }) => {
      void (async () => {
        try {
          const pc = pcsRef.current.get(fromUserId);
          const meta = peerMetaRef.current.get(fromUserId);
          if (!pc || !meta) return;
          if (pc.signalingState !== 'have-local-offer') return;

          meta.isSettingRemoteAnswerPending = true;
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          meta.isSettingRemoteAnswerPending = false;
          await flushIceQueue(fromUserId, pc);
        } catch (err) {
          console.warn('[webrtc] handling answer failed', err);
        }
      })();
    };

    const handleIce = ({ fromUserId, candidate }) => {
      void (async () => {
        try {
          const pc = pcsRef.current.get(fromUserId);
          const iceCandidate = new RTCIceCandidate(candidate);

          if (pc?.connectionState === 'closed') return;

          if (!pc || !pc.remoteDescription) {
            const queue = iceQueuesRef.current.get(fromUserId) ?? [];
            queue.push(iceCandidate);
            iceQueuesRef.current.set(fromUserId, queue);
            return;
          }

          await pc.addIceCandidate(iceCandidate);
        } catch (err) {
          console.warn('[webrtc] addIceCandidate failed', err);
        }
      })();
    };

    socket.on(SERVER_EVENTS.CALL_SDP_OFFER, handleOffer);
    socket.on(SERVER_EVENTS.CALL_SDP_ANSWER, handleAnswer);
    socket.on(SERVER_EVENTS.CALL_ICE_CANDIDATE, handleIce);

    const reRegister = () => {
      socket.off(SERVER_EVENTS.CALL_SDP_OFFER, handleOffer);
      socket.off(SERVER_EVENTS.CALL_SDP_ANSWER, handleAnswer);
      socket.off(SERVER_EVENTS.CALL_ICE_CANDIDATE, handleIce);
      socket.on(SERVER_EVENTS.CALL_SDP_OFFER, handleOffer);
      socket.on(SERVER_EVENTS.CALL_SDP_ANSWER, handleAnswer);
      socket.on(SERVER_EVENTS.CALL_ICE_CANDIDATE, handleIce);
    };
    socket.on('connect', reRegister);

    return () => {
      socket.off('connect', reRegister);
      socket.off(SERVER_EVENTS.CALL_SDP_OFFER, handleOffer);
      socket.off(SERVER_EVENTS.CALL_SDP_ANSWER, handleAnswer);
      socket.off(SERVER_EVENTS.CALL_ICE_CANDIDATE, handleIce);
    };
  }, [currentUserId, createPeerConnection, flushIceQueue]);
}
