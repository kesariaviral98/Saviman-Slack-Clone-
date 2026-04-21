// ─────────────────────────────────────────────────────────────────────────────
// VideoGrid — displays local + remote video tiles in a responsive grid.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallStore } from '@/stores/callStore';
import { useAuthStore } from '@/stores/authStore';
import VideoTile from './VideoTile';

/** Pick a CSS grid class based on participant count. */
function gridCols(count) {
  if (count <= 1) return 'grid-cols-1';
  if (count <= 2) return 'grid-cols-2';
  if (count <= 4) return 'grid-cols-2';
  return 'grid-cols-3';
}

export default function VideoGrid({ activeCall }) {
  const currentUser = useAuthStore((s) => s.user);
  const localStream = useCallStore((s) => s.localStream);
  const remoteStreams = useCallStore((s) => s.remoteStreams);

  const participants = activeCall?.participants ?? [];
  const remoteParticipants = participants.filter((p) => p.userId !== currentUser?.id);
  const total = 1 + remoteParticipants.length;

  return (
    <div className={`flex-1 grid ${gridCols(total)} gap-2 p-3 bg-gray-950`}>
      {/* Local tile */}
      <VideoTile
        stream={localStream}
        user={currentUser}
        isLocal
        size={total === 1 ? 'lg' : 'md'}
      />

      {/* Remote tiles */}
      {remoteParticipants.map((p) => (
        <VideoTile
          key={p.userId}
          stream={remoteStreams[p.userId] ?? null}
          user={p.user}
          isLocal={false}
          size={total <= 2 ? 'lg' : 'md'}
        />
      ))}
    </div>
  );
}
