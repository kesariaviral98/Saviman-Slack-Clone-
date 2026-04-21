// ─────────────────────────────────────────────────────────────────────────────
// CallBar — persistent banner shown at the top while in an active call.
// Provides mute, camera, and hang-up controls plus a fullscreen toggle that
// opens the VideoGrid in an overlay.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react';
import { useCallStore } from '@/stores/callStore';
import { useCall } from '@/hooks/useCall';
import VideoGrid from './VideoGrid';
import AudioCallPanel from './AudioCallPanel';

// ── Control button ─────────────────────────────────────────────────────────────

function ControlButton({ onClick, active, danger, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors
        ${danger
          ? 'bg-red-500 hover:bg-red-600 text-white'
          : active
          ? 'bg-white/20 text-white'
          : 'bg-white/10 hover:bg-white/20 text-white/70 hover:text-white'
        }`}
    >
      {children}
    </button>
  );
}

// ── Timer ──────────────────────────────────────────────────────────────────────

function CallTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = startTime ? new Date(startTime).getTime() : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return <span className="text-white/70 text-xs tabular-nums">{mm}:{ss}</span>;
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function CallBar() {
  const activeCall = useCallStore((s) => s.activeCall);
  const { endCall, leaveCall, toggleMute, toggleCamera } = useCall();

  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  const callId = activeCall?.id;
  const isAudio = activeCall?.callType === 'audio';

  // Reset controls when a new call starts
  useEffect(() => {
    if (callId) {
      setMuted(false);
      setCameraOff(false);
      // Audio calls: keep panel hidden. Video calls: open immediately.
      setShowPanel(!isAudio);
    }
  }, [callId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMute = useCallback(() => {
    const nowMuted = toggleMute();
    setMuted(nowMuted);
  }, [toggleMute]);

  const handleCamera = useCallback(() => {
    const nowOff = toggleCamera();
    setCameraOff(nowOff);
  }, [toggleCamera]);

  const handleEnd = useCallback(() => {
    if (!activeCall?.id) return;
    const participantCount = activeCall.participants?.length ?? 0;
    if (participantCount > 2) {
      leaveCall(activeCall.id);
    } else {
      endCall(activeCall.id);
    }
  }, [activeCall, endCall, leaveCall]);

  if (!activeCall) return null;

  const participantCount = activeCall.participants?.length ?? 0;

  return (
    <>
      {/* ── Persistent top bar ────────────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-green-700 flex items-center justify-between px-4 py-2 shadow-lg">
        <div className="flex items-center gap-3">
          {/* Green pulse dot */}
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-300" />
          </span>
          {isAudio ? (
            <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.893L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
          <span className="text-white font-medium text-sm">
            {isAudio ? 'Audio call' : 'Video call'}
          </span>
          <CallTimer startTime={activeCall.acceptedAt ?? activeCall.startedAt} />
          <span className="text-white/60 text-xs">
            {participantCount} {participantCount === 1 ? 'participant' : 'participants'}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Toggle panel — participants for audio, video grid for video */}
          <ControlButton
            onClick={() => setShowPanel((v) => !v)}
            active={showPanel}
            title={isAudio
              ? (showPanel ? 'Hide participants' : 'Show participants')
              : (showPanel ? 'Hide video'        : 'Show video')}
          >
            {isAudio ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 5.87a4 4 0 100-8 4 4 0 000 8zm6-10a4 4 0 10-8 0 4 4 0 008 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.893L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </ControlButton>

          {/* Mute */}
          <ControlButton onClick={handleMute} active={muted} title={muted ? 'Unmute' : 'Mute'}>
            {muted ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </ControlButton>

          {/* Camera toggle — only for video calls */}
          {!isAudio && (
            <ControlButton onClick={handleCamera} active={cameraOff} title={cameraOff ? 'Turn camera on' : 'Turn camera off'}>
              {cameraOff ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.893L15 14M3 8.87V17a2 2 0 002 2h8M3 8.87L3 7a2 2 0 012-2h8a2 2 0 012 2v1.13M3 8.87l18 9.26M3 3l18 18" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.893L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </ControlButton>
          )}

          {/* Hang up */}
          <ControlButton onClick={handleEnd} danger title="End call">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
            </svg>
          </ControlButton>
        </div>
      </div>

      {/* ── Floating panel overlay ────────────────────────────────────────── */}
      {showPanel && (
        <div className="fixed inset-0 z-30 flex flex-col bg-gray-950 pt-12">
          {isAudio
            ? <AudioCallPanel activeCall={activeCall} />
            : <VideoGrid activeCall={activeCall} />
          }

          {/* Close overlay */}
          <button
            onClick={() => setShowPanel(false)}
            className="absolute top-14 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors"
            title="Minimise"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
