// ─────────────────────────────────────────────────────────────────────────────
// useCall — call lifecycle actions: initiate, accept, reject, end,
//           and local media controls (mute / camera toggle).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from 'react';
import { useCallStore } from '@/stores/callStore';
import { socketEmit } from '@/lib/socket';
import { CLIENT_EVENTS } from '@/lib/events';

// ── Media helper ──────────────────────────────────────────────────────────────

async function getUserMedia(callType = 'video') {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Camera and microphone access require a secure connection (HTTPS). ' +
      'Please use the app over HTTPS.',
    );
  }

  const wantVideo = callType === 'video';

  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo });
  } catch (err) {
    const name = err.name;

    // Camera not found / unavailable — fall back to audio-only
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }

    // Camera/mic in use by another app — try audio-only
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
        .catch(() => {
          throw new Error('Your camera and microphone are in use by another application.');
        });
    }

    // Permission denied for microphone (can't fall back further)
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      throw new Error(
        'Microphone access was denied. Please allow access in your browser settings and try again.',
      );
    }

    // Re-throw anything else (e.g. OverconstrainedError)
    throw err;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCall() {
  const {
    activeCall,
    incomingCall,
    localStream,
    setActiveCall,
    clearIncomingCall,
    setLocalStream,
    clearCall,
  } = useCallStore();

  /** Start an outgoing call in a channel. */
  const initiateCall = useCallback(async (channelId, callType = 'video') => {
    const stream = await getUserMedia(callType);
    setLocalStream(stream);

    try {
      const data = await socketEmit(CLIENT_EVENTS.CALL_INITIATE, { channelId, callType });
      setActiveCall(data.call); // data.call already includes callType from the server
      return data.call;
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
      throw err;
    }
  }, [setActiveCall, setLocalStream]);

  /** Accept an incoming call. */
  const acceptCall = useCallback(async (callId) => {
    // Read callType before the store clears incomingCall
    const incomingCallData = useCallStore.getState().incomingCall;
    const callType = incomingCallData?.call?.callType ?? 'video';
    const stream = await getUserMedia(callType);
    setLocalStream(stream);

    try {
      const data = await socketEmit(CLIENT_EVENTS.CALL_ACCEPT, { callId });
      // Server ack returns the DB call object which has no callType field.
      // Merge callType back in so the callee's CallBar shows the correct UI.
      const baseCall = data?.call ?? incomingCallData?.call;
      if (!baseCall) throw new Error('Call data unavailable');
      const call = { ...baseCall, callType, acceptedAt: new Date().toISOString() };
      setActiveCall(call);
      return call;
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
      throw err;
    }
  }, [setActiveCall, setLocalStream]);

  /** Reject an incoming call without joining. */
  const rejectCall = useCallback(async (callId) => {
    await socketEmit(CLIENT_EVENTS.CALL_REJECT, { callId }).catch(() => {});
    clearIncomingCall();
  }, [clearIncomingCall]);

  /** End the active call for everyone (initiator force-end). */
  const endCall = useCallback(async (callId) => {
    await socketEmit(CLIENT_EVENTS.CALL_END, { callId }).catch(() => {});
    clearCall();
  }, [clearCall]);

  /** Leave a group call without ending it for others. */
  const leaveCall = useCallback(async (callId) => {
    await socketEmit(CLIENT_EVENTS.CALL_LEAVE, { callId }).catch(() => {});
    clearCall();
  }, [clearCall]);

  /** Toggle local audio track on/off. Returns true when now muted. */
  const toggleMute = useCallback(() => {
    const stream = useCallStore.getState().localStream;
    if (!stream) return false;
    const track = stream.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return !track.enabled;
  }, []);

  /** Toggle local video track on/off. Returns true when camera is now off. */
  const toggleCamera = useCallback(() => {
    const stream = useCallStore.getState().localStream;
    if (!stream) return true;
    const track = stream.getVideoTracks()[0];
    if (!track) return true;
    track.enabled = !track.enabled;
    return !track.enabled;
  }, []);

  return {
    activeCall,
    incomingCall,
    localStream,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    leaveCall,
    toggleMute,
    toggleCamera,
  };
}
