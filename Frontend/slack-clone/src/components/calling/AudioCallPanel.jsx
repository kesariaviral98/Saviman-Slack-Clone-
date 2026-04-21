// AudioCallPanel — shown instead of VideoGrid during audio-only calls.
// Displays each participant as a large avatar with their name.

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCallStore } from '@/stores/callStore';

// Same palette as Avatar.jsx so colours are consistent
const COLOR_PALETTE = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-cyan-500', 'bg-blue-500', 'bg-violet-500',
  'bg-fuchsia-500',
];

function colorForName(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function ParticipantAvatar({ user, isMe }) {
  const name = user?.displayName ?? '?';
  const color = colorForName(name);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        {/* Soft pulse ring */}
        <span className="absolute -inset-2 rounded-full bg-green-500/20 animate-pulse" />

        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={name}
            className="relative w-20 h-20 rounded-full object-cover ring-2 ring-green-500/60 ring-offset-2 ring-offset-gray-900"
          />
        ) : (
          <span className={`relative w-20 h-20 rounded-full ${color} flex items-center justify-center text-white text-2xl font-bold ring-2 ring-green-500/60 ring-offset-2 ring-offset-gray-900 select-none`}>
            {initials(name)}
          </span>
        )}

        {/* Mic icon at the bottom of the avatar */}
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gray-800 rounded-full p-0.5 ring-1 ring-gray-700">
          <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </span>
      </div>

      <p className="text-white/80 text-sm font-medium">
        {isMe ? 'You' : name}
      </p>
    </div>
  );
}

export default function AudioCallPanel({ activeCall }) {
  const currentUser = useAuthStore((s) => s.user);
  const remoteStreams = useCallStore((s) => s.remoteStreams);
  const participants = activeCall?.participants ?? [];

  // Audio elements for remote streams
  const audioRefs = useRef(new Map());

  useEffect(() => {
    participants.forEach((p) => {
      if (p.userId === currentUser?.id) return;
      const stream = remoteStreams[p.userId];
      const audioEl = audioRefs.current.get(p.userId);
      if (audioEl && stream) {
        audioEl.srcObject = stream;
      }
    });
  }, [participants, remoteStreams, currentUser]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 p-8 gap-10">
      {/* Hidden audio elements for remote streams */}
      {participants.map((p) => {
        if (p.userId === currentUser?.id) return null;
        return (
          <audio
            key={p.userId}
            ref={(el) => {
              if (el) audioRefs.current.set(p.userId, el);
              else audioRefs.current.delete(p.userId);
            }}
            autoPlay
            playsInline
          />
        );
      })}

      {/* Participants */}
      <div className="flex flex-wrap gap-12 items-center justify-center max-w-3xl">
        {participants.map((p) => (
          <ParticipantAvatar
            key={p.userId}
            user={p.user}
            isMe={p.userId === currentUser?.id}
          />
        ))}
      </div>

      {/* Label */}
      <p className="text-white/30 text-xs tracking-widest uppercase">Audio call in progress</p>
    </div>
  );
}
