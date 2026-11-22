import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import {
  isPlayableMusicUrl,
  readUserPausedPreference,
  shouldAttemptWebsiteAutoPlay,
  writeUserPausedPreference
} from '../services/musicPlayback';

export interface BackgroundMusicHandle {
  attemptStartOnWebsiteEntry: () => void;
  selectSongTrack: (audioUrl: string) => Promise<{ startedPlaying: boolean; respectPaused: boolean }>;
  togglePlayPause: () => Promise<void>;
}

interface BackgroundMusicPlayerProps {
  enabled: boolean;
  audioUrl: string;
  isWebsiteView: boolean;
  onPlayingChange?: (playing: boolean) => void;
}

function getSessionStorageSafe(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const BackgroundMusicPlayer = forwardRef<
  BackgroundMusicHandle,
  BackgroundMusicPlayerProps
>(({ enabled, audioUrl, isWebsiteView, onPlayingChange }, ref) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const systemPausingRef = useRef(false);
  const entryAttemptedForUrlRef = useRef<string | null>(null);

  const cleanUrl = isPlayableMusicUrl(audioUrl);
  const hasPlayableAudio = Boolean(enabled && cleanUrl);

  const userPausedRef = useRef<boolean>(
    readUserPausedPreference(getSessionStorageSafe())
  );
  const enabledRef = useRef(enabled);
  const cleanUrlRef = useRef(cleanUrl);
  const hasPlayableAudioRef = useRef(hasPlayableAudio);
  const isWebsiteViewRef = useRef(isWebsiteView);

  enabledRef.current = enabled;
  cleanUrlRef.current = cleanUrl;
  hasPlayableAudioRef.current = hasPlayableAudio;
  isWebsiteViewRef.current = isWebsiteView;

  const notifyPlaying = useCallback(
    (playing: boolean) => {
      onPlayingChange?.(playing);
    },
    [onPlayingChange]
  );

  const setUserPaused = useCallback((paused: boolean) => {
    userPausedRef.current = paused;
    writeUserPausedPreference(getSessionStorageSafe(), paused);
  }, []);

  const pauseSilently = useCallback(
    (clearSource = false) => {
      const audio = audioRef.current;
      if (!audio) {
        notifyPlaying(false);
        return;
      }
      systemPausingRef.current = true;
      try {
        if (!audio.paused) {
          audio.pause();
        }
        if (clearSource) {
          audio.removeAttribute('src');
          audio.load();
        }
      } finally {
        systemPausingRef.current = false;
      }
      notifyPlaying(false);
    },
    [notifyPlaying]
  );

  const startPlayback = useCallback(
    async (url: string): Promise<boolean> => {
      const audio = audioRef.current;
      if (!audio || !url) return false;

      if (audio.getAttribute('src') !== url) {
        audio.src = url;
      }
      audio.muted = false;
      audio.volume = 0.65;

      try {
        await audio.play();
        notifyPlaying(true);
        return true;
      } catch {
        // Browser autoplay blocked or media not ready yet: stay silently ready for header Play click
        notifyPlaying(false);
        return false;
      }
    },
    [notifyPlaying]
  );

  // Sync audio source & admin enable/disable state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!hasPlayableAudio) {
      entryAttemptedForUrlRef.current = null;
      pauseSilently(true);
      return;
    }

    if (audio.getAttribute('src') !== cleanUrl) {
      const shouldPlaySwitchedTrack =
        isWebsiteViewRef.current && !userPausedRef.current;
      pauseSilently(false);
      audio.src = cleanUrl;
      audio.load();
      entryAttemptedForUrlRef.current = null;

      if (shouldPlaySwitchedTrack) {
        entryAttemptedForUrlRef.current = cleanUrl;
        void startPlayback(cleanUrl);
      }
    }
  }, [hasPlayableAudio, cleanUrl, pauseSilently, startPlayback]);

  // Auto-start when entering the main website view (and stop when leaving it)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!isWebsiteView) {
      entryAttemptedForUrlRef.current = null;
      if (!audio.paused) {
        pauseSilently(false);
      }
      return;
    }

    if (
      shouldAttemptWebsiteAutoPlay({
        enabled,
        audioUrl: cleanUrl,
        isWebsiteView: true,
        userPaused: userPausedRef.current
      }) &&
      entryAttemptedForUrlRef.current !== cleanUrl &&
      audio.paused
    ) {
      entryAttemptedForUrlRef.current = cleanUrl;
      void startPlayback(cleanUrl);
    }
  }, [isWebsiteView, enabled, cleanUrl, pauseSilently, startPlayback]);

  useImperativeHandle(
    ref,
    () => ({
      attemptStartOnWebsiteEntry: () => {
        userPausedRef.current = readUserPausedPreference(getSessionStorageSafe());
        const canAutoPlay = shouldAttemptWebsiteAutoPlay({
          enabled: enabledRef.current,
          audioUrl: cleanUrlRef.current,
          isWebsiteView: true,
          userPaused: userPausedRef.current
        });
        if (!canAutoPlay) return;

        const audio = audioRef.current;
        if (!audio) return;

        entryAttemptedForUrlRef.current = cleanUrlRef.current;
        if (!audio.paused) {
          notifyPlaying(true);
          return;
        }
        void startPlayback(cleanUrlRef.current);
      },
      selectSongTrack: async (nextAudioUrl: string) => {
        const cleanNext = isPlayableMusicUrl(nextAudioUrl);
        const audio = audioRef.current;
        userPausedRef.current = readUserPausedPreference(getSessionStorageSafe());
        if (!enabledRef.current || !cleanNext || !audio) {
          return { startedPlaying: false, respectPaused: userPausedRef.current };
        }

        if (audio.getAttribute('src') !== cleanNext) {
          pauseSilently(false);
          audio.src = cleanNext;
          audio.load();
        }
        cleanUrlRef.current = cleanNext;

        // Respect guest's deliberate pause preference
        if (userPausedRef.current) {
          return { startedPlaying: false, respectPaused: true };
        }

        entryAttemptedForUrlRef.current = cleanNext;
        const started = await startPlayback(cleanNext);
        return { startedPlaying: started, respectPaused: false };
      },
      togglePlayPause: async () => {
        const audio = audioRef.current;
        if (!audio || !hasPlayableAudioRef.current || !cleanUrlRef.current) {
          return;
        }

        if (!audio.paused) {
          setUserPaused(true);
          audio.pause();
          notifyPlaying(false);
          return;
        }

        setUserPaused(false);
        entryAttemptedForUrlRef.current = cleanUrlRef.current;
        await startPlayback(cleanUrlRef.current);
      }
    }),
    [notifyPlaying, pauseSilently, setUserPaused, startPlayback]
  );

  return (
    <audio
      ref={audioRef}
      loop
      preload={hasPlayableAudio ? 'metadata' : 'none'}
      onPlay={() => notifyPlaying(true)}
      onPause={() => {
        notifyPlaying(false);
        if (
          !systemPausingRef.current &&
          isWebsiteViewRef.current &&
          hasPlayableAudioRef.current
        ) {
          setUserPaused(true);
        }
      }}
      onError={() => notifyPlaying(false)}
      className="hidden"
      aria-hidden="true"
    />
  );
});

BackgroundMusicPlayer.displayName = 'BackgroundMusicPlayer';
