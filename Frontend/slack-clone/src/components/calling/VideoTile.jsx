// Individual video tile — renders one participant's stream.

import { useEffect, useRef, useState } from 'react';
import Avatar from '@/components/ui/Avatar';

export default function VideoTile({ stream, user, isMuted = false, isLocal = false, size = 'md' }) {
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (!stream) {
      el.srcObject = null;
      setHasVideo(false);
      return;
    }

    el.srcObject = stream;
    console.log(`[VideoTile] stream set user=${user?.displayName} tracks=${stream.getTracks().map(t => `${t.kind}(${t.readyState},muted=${t.muted})`).join(',')}`);
    let cancelled = false;

    const tryPlay = async () => {
      if (cancelled || el.srcObject !== stream) return;
      // Browsers frequently block autoplay for remote media when audio is
      // present. Start muted to satisfy autoplay policies, then restore audio
      // for remote peers once playback has begun.
      el.muted = true;
      try {
        await el.play();
        if (cancelled || el.srcObject !== stream) return;
        if (!isLocal) {
          el.muted = false;
        }
      } catch (err) {
        // Ignore the common AbortError caused by a newer srcObject replacing
        // this one before playback settles.
        if (err?.name !== 'AbortError') {
          console.warn('[VideoTile] autoplay failed', err);
        }
      }
    };

    const checkVideo = () => {
      const videoTracks = stream.getVideoTracks();
      const has = videoTracks.some((t) => t.readyState !== 'ended');
      console.log(`[VideoTile] checkVideo user=${user?.displayName} videoTracks=${videoTracks.map(t=>`${t.readyState},muted=${t.muted}`)} hasVideo=${has}`);
      setHasVideo(has);
    };

    checkVideo();
    stream.addEventListener('addtrack',    checkVideo);
    stream.addEventListener('removetrack', checkVideo);

    const onLoadedMetadata = () => {
      void tryPlay();
    };
    el.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
      cancelled = true;
      stream.removeEventListener('addtrack',    checkVideo);
      stream.removeEventListener('removetrack', checkVideo);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.muted = isLocal;
    };
  }, [stream]);

  const sizeClasses =
    size === 'sm' ? 'w-32 h-24' :
    size === 'lg' ? 'w-full h-full' :
    'w-48 h-36';

  return (
    <div className={`relative bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center ${sizeClasses}`}>
      {/* Video element always mounted so srcObject is ready before tracks arrive */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${hasVideo ? '' : 'hidden'}`}
      />

      {/* Avatar fallback when no active video */}
      {!hasVideo && (
        <div className="flex flex-col items-center gap-2">
          <Avatar user={user} size="lg" />
          {isMuted && (
            <span className="text-gray-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            </span>
          )}
        </div>
      )}

      {/* Name badge */}
      <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
        {isLocal ? 'You' : (user?.displayName ?? 'Participant')}
      </div>

      {/* Muted mic indicator */}
      {isMuted && (
        <div className="absolute top-1 right-1 bg-red-500 rounded-full p-0.5">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        </div>
      )}
    </div>
  );
}
