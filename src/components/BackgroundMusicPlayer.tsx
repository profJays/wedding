import React, { useEffect, useRef, useState } from 'react';
import { Disc3, Music2, Pause, Play, Volume2, VolumeX } from 'lucide-react';

interface BackgroundMusicPlayerProps {
  enabled: boolean;
  title: string;
  artist: string;
  audioUrl: string;
  visible: boolean;
  shouldPause?: boolean;
}

const MUTED_STORAGE_KEY = 'mjay2026_music_muted';

export const BackgroundMusicPlayer: React.FC<BackgroundMusicPlayerProps> = ({
  enabled,
  title,
  artist,
  audioUrl,
  visible,
  shouldPause = false
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(MUTED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const cleanUrl = (audioUrl || '').trim();
  const hasPlayableAudio = Boolean(enabled && cleanUrl && !cleanUrl.startsWith('blob:'));
  const displayTitle = (title || '').trim() || 'Perfect';
  const displayArtist = (artist || '').trim() || 'Ed Sheeran';

  // Sync mute state to audio element & sessionStorage
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.muted = isMuted;
      audio.volume = 0.65;
    }
    try {
      window.sessionStorage.setItem(MUTED_STORAGE_KEY, isMuted ? '1' : '0');
    } catch {
      // Ignore storage quota errors
    }
  }, [isMuted]);

  // Clear and stop playback completely when disabled by admin or audioUrl removed
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!enabled || !hasPlayableAudio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      setIsPlaying(false);
      setStatusNotice(null);
      return;
    }

    if (audio.getAttribute('src') !== cleanUrl) {
      const wasPlaying = !audio.paused;
      audio.pause();
      audio.src = cleanUrl;
      audio.load();
      setStatusNotice(null);
      if (wasPlaying && !shouldPause) {
        void audio.play().then(
          () => setIsPlaying(true),
          () => setIsPlaying(false)
        );
      } else {
        setIsPlaying(false);
      }
    }
  }, [enabled, hasPlayableAudio, cleanUrl, shouldPause]);

  // Pause automatically when entering Admin view
  useEffect(() => {
    const audio = audioRef.current;
    if (shouldPause && audio && !audio.paused) {
      audio.pause();
      setIsPlaying(false);
    }
  }, [shouldPause]);

  // Auto-dismiss transient notices
  useEffect(() => {
    if (!statusNotice) return;
    const timer = window.setTimeout(() => setStatusNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusNotice]);

  if (!enabled) {
    return <audio ref={audioRef} preload="none" className="hidden" aria-hidden="true" />;
  }

  const handleTogglePlay = async () => {
    if (!hasPlayableAudio) {
      setStatusNotice('Wedding song audio has not been uploaded yet.');
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
      setStatusNotice(null);
      return;
    }

    try {
      setStatusNotice(null);
      if (audio.getAttribute('src') !== cleanUrl) {
        audio.src = cleanUrl;
      }
      audio.muted = isMuted;
      audio.volume = 0.65;
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      setStatusNotice('Tap Play to start the wedding music.');
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  };

  return (
    <>
      <audio
        ref={audioRef}
        loop
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => {
          setIsPlaying(false);
          if (hasPlayableAudio) {
            setStatusNotice('Music stream temporarily unavailable.');
          }
        }}
        className="hidden"
        aria-hidden="true"
      />

      {visible && (
        <aside
          aria-label="Wedding Background Music Player"
          className="fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-20 max-w-[calc(100vw-24px)]"
        >
          {statusNotice && (
            <div
              role="status"
              className="mb-2 px-3 py-1.5 rounded-lg bg-[#073B2B] border border-[#C5A04A]/45 text-[11px] text-[#FAF7F0] shadow-lg text-right"
            >
              {statusNotice}
            </div>
          )}

          <div className="flex items-center gap-2 sm:gap-2.5 pl-2.5 pr-1.5 py-1.5 rounded-xl bg-[#073B2B]/95 backdrop-blur-md border border-[#C5A04A]/55 shadow-[0_12px_32px_rgba(7,59,43,0.34)] text-[#FAF7F0]">
            {/* Emblem / Record Icon */}
            <div
              className="w-9 h-9 rounded-lg bg-[#07543E] border border-[#C5A04A]/45 flex items-center justify-center text-[#F3E5AB] shrink-0"
              aria-hidden="true"
            >
              {isPlaying && !isMuted ? (
                <Disc3 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Music2 className="w-4 h-4" />
              )}
            </div>

            {/* Song Metadata */}
            <div className="min-w-0 max-w-[138px] sm:max-w-[175px] pr-1">
              <p className="font-serif text-[13px] sm:text-sm font-semibold text-[#FAF7F0] leading-tight truncate">
                {displayTitle}
              </p>
              <p className="text-[11px] text-[#E6CE8A]/85 leading-tight truncate">
                {hasPlayableAudio ? displayArtist : `${displayArtist} · Not loaded`}
              </p>
            </div>

            {/* Play / Pause Button */}
            <button
              type="button"
              onClick={() => void handleTogglePlay()}
              aria-label={isPlaying ? `Pause ${displayTitle}` : `Play ${displayTitle}`}
              aria-pressed={isPlaying}
              className="w-11 h-11 rounded-lg bg-[#C5A04A] hover:bg-[#D4B05B] text-[#073B2B] flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3E5AB]"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            {/* Mute / Unmute Button */}
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={isMuted ? 'Unmute background music' : 'Mute background music'}
              aria-pressed={isMuted}
              className="w-11 h-11 rounded-lg border border-[#C5A04A]/35 bg-[#07543E]/70 hover:bg-[#07543E] text-[#FAF7F0] flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3E5AB]"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-[#F3E5AB]" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </aside>
      )}
    </>
  );
};
