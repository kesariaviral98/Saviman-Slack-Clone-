// ─────────────────────────────────────────────────────────────────────────────
// IncomingCallModal — shown when another user rings you.
// Displayed globally; cleared by accepting or rejecting.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useCallStore } from '@/stores/callStore';
import { useCall } from '@/hooks/useCall';
import Avatar from '@/components/ui/Avatar';

// Ring for at most 30 seconds then auto-dismiss (the server will auto-end it)
const RING_TIMEOUT_MS = 30_000;

export default function IncomingCallModal() {
  const incomingCall = useCallStore((s) => s.incomingCall);
  const { acceptCall, rejectCall } = useCall();
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  // Reset loading states whenever a new call arrives (component never unmounts)
  useEffect(() => {
    setAccepting(false);
    setRejecting(false);
  }, [incomingCall?.call?.id]);

  // Auto-dismiss after timeout (call will already have ended server-side)
  useEffect(() => {
    if (!incomingCall) return;
    const t = setTimeout(() => {
      useCallStore.getState().clearIncomingCall();
    }, RING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [incomingCall]);

  if (!incomingCall) return null;

  const { call, initiator } = incomingCall;
  const isVideoCall = call?.callType !== 'audio';

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await acceptCall(call.id);
    } catch (err) {
      console.warn('[call] accept failed', err);
      setAccepting(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      await rejectCall(call.id);
    } catch {
      useCallStore.getState().clearIncomingCall();
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* Backdrop (non-blocking — you can still use the app) */}
      <div className="pointer-events-auto absolute bottom-6 right-6 bg-gray-900 rounded-2xl shadow-2xl border border-white/10 w-72 overflow-hidden">
        {/* Header bar with pulsing ring animation */}
        <div className="bg-green-600 px-4 py-2 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          {isVideoCall ? (
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.893L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          )}
          <span className="text-white text-xs font-semibold uppercase tracking-wide">
            Incoming {isVideoCall ? 'video' : 'audio'} call
          </span>
        </div>

        {/* Caller info */}
        <div className="px-5 py-4 flex items-center gap-3">
          <Avatar user={initiator} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">
              {initiator?.displayName ?? 'Someone'}
            </p>
            <p className="text-white/50 text-xs">is calling you…</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-5 pb-5 flex gap-3">
          {/* Reject */}
          <button
            onClick={handleReject}
            disabled={rejecting || accepting}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-full bg-red-500 hover:bg-red-600 text-white font-medium text-sm transition-colors disabled:opacity-60"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
            </svg>
            {rejecting ? 'Declining…' : 'Decline'}
          </button>

          {/* Accept */}
          <button
            onClick={handleAccept}
            disabled={accepting || rejecting}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-full bg-green-500 hover:bg-green-600 text-white font-medium text-sm transition-colors disabled:opacity-60"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            {accepting ? 'Joining…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
