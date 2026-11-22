import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  RotateCcw,
  Shuffle,
  Sparkles,
  CheckCircle2,
  Move,
  Music2,
  Send,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { WEDDING_PHOTOS } from '../data/weddingSite';
import {
  MusicTrack,
  SectionTypographyElements
} from '../types';
import {
  normalizeSongSuggestionKey,
  submitGuestSongSuggestion
} from '../services/weddingRepository';
import { getSectionTypographyProps } from '../utils/typography';
import {
  PUZZLE_GRID_SIZE,
  PUZZLE_TILE_COUNT,
  countCorrectPieces,
  createSolvableShuffle,
  isPuzzleSolved,
  swapTiles
} from '../utils/puzzleLogic';

export const PUZZLE_REWARD_SESSION_KEY = 'mjay2026_puzzle_reward_unlocked';
const SUBMITTED_SUGGESTIONS_SESSION_KEY = 'mjay2026_song_suggestions_submitted';

interface ProcessedPuzzleImage {
  squareSrc: string | null;
  originalSrc: string;
  naturalWidth: number;
  naturalHeight: number;
  loading: boolean;
  failed: boolean;
}

function playGentleTileSound(kind: 'select' | 'swap' | 'solved'): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (kind === 'solved') {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);
        gain.gain.setValueAtTime(0.001, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.06, now + idx * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.38);
      });
      window.setTimeout(() => void ctx.close().catch(() => undefined), 900);
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(kind === 'select' ? 420 : 540, now);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
    window.setTimeout(() => void ctx.close().catch(() => undefined), 220);
  } catch {
    // Graceful no-op when Web Audio is restricted
  }
}

function useSquarePuzzleImage(
  preferredUrl?: string,
  fallbackUrl: string = WEDDING_PHOTOS.story.src
): ProcessedPuzzleImage {
  const cleanPreferred = (preferredUrl || '').trim();
  const targetUrl = cleanPreferred || fallbackUrl;

  const [state, setState] = useState<ProcessedPuzzleImage>({
    squareSrc: null,
    originalSrc: targetUrl,
    naturalWidth: 4,
    naturalHeight: 5,
    loading: true,
    failed: false
  });

  useEffect(() => {
    let active = true;
    setState((prev) => ({
      ...prev,
      originalSrc: targetUrl,
      loading: true,
      failed: false
    }));

    const loadCandidate = (src: string, canFallback: boolean) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        if (!active) return;
        const w = img.naturalWidth || 900;
        const h = img.naturalHeight || 900;

        try {
          const size = Math.min(w, h);
          const canvasSize = Math.min(960, Math.max(600, size));
          const canvas = document.createElement('canvas');
          canvas.width = canvasSize;
          canvas.height = canvasSize;
          const ctx = canvas.getContext('2d');

          if (ctx) {
            const sx = w > h ? Math.round((w - size) * 0.5) : 0;
            // Gentle upper-center portrait bias so couple faces stay framed nicely inside 1:1
            const sy = h > w ? Math.round((h - size) * 0.22) : 0;
            ctx.drawImage(img, sx, sy, size, size, 0, 0, canvasSize, canvasSize);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            setState({
              squareSrc: dataUrl,
              originalSrc: src,
              naturalWidth: w,
              naturalHeight: h,
              loading: false,
              failed: false
            });
            return;
          }
        } catch {
          // Cross-origin canvas security fallback: use original image with CSS crop directly
        }

        setState({
          squareSrc: src,
          originalSrc: src,
          naturalWidth: w,
          naturalHeight: h,
          loading: false,
          failed: false
        });
      };

      img.onerror = () => {
        if (!active) return;
        if (canFallback && src !== fallbackUrl) {
          loadCandidate(fallbackUrl, false);
          return;
        }
        setState({
          squareSrc: null,
          originalSrc: src,
          naturalWidth: 1,
          naturalHeight: 1,
          loading: false,
          failed: true
        });
      };

      img.src = src;
    };

    loadCandidate(targetUrl, true);

    return () => {
      active = false;
    };
  }, [targetUrl, fallbackUrl]);

  return state;
}

export interface WeddingPuzzleBoardProps {
  imageUrl?: string;
  coupleNames: string;
  isPreviewModal?: boolean;
  onSolved?: () => void;
}

export const WeddingPuzzleBoard: React.FC<WeddingPuzzleBoardProps> = ({
  imageUrl,
  coupleNames,
  isPreviewModal = false,
  onSolved
}) => {
  const processed = useSquarePuzzleImage(imageUrl, WEDDING_PHOTOS.story.src);

  const [initialShuffle, setInitialShuffle] = useState<number[]>(() =>
    createSolvableShuffle(2)
  );
  const [tiles, setTiles] = useState<number[]>(() => [...initialShuffle]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [draggedSlot, setDraggedSlot] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [moves, setMoves] = useState<number>(0);
  const celebrationFiredRef = useRef(false);

  const correctCount = countCorrectPieces(tiles);
  const solved = isPuzzleSolved(tiles);
  const progressPercent = Math.round((correctCount / PUZZLE_TILE_COUNT) * 100);

  const triggerCelebration = useCallback(() => {
    playGentleTileSound('solved');
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    try {
      confetti({
        particleCount: 55,
        spread: 68,
        origin: { y: 0.65 },
        colors: ['#07543E', '#C5A04A', '#F3E5AB', '#737746']
      });
    } catch {
      // Graceful fallback
    }
  }, []);

  useEffect(() => {
    if (solved && !celebrationFiredRef.current) {
      celebrationFiredRef.current = true;
      triggerCelebration();
      onSolved?.();
    } else if (!solved) {
      celebrationFiredRef.current = false;
    }
  }, [solved, triggerCelebration, onSolved]);

  const performSwap = useCallback(
    (slotA: number, slotB: number) => {
      if (solved || slotA === slotB) return;
      setTiles((prev) => {
        const next = swapTiles(prev, slotA, slotB);
        if (!isPuzzleSolved(next)) {
          playGentleTileSound('swap');
        }
        return next;
      });
      setMoves((m) => m + 1);
      setSelectedSlot(null);
      setDraggedSlot(null);
      setDragOverSlot(null);
    },
    [solved]
  );

  const handleTileActivate = (slotIndex: number) => {
    if (solved) return;
    if (selectedSlot === null) {
      setSelectedSlot(slotIndex);
      playGentleTileSound('select');
      return;
    }
    if (selectedSlot === slotIndex) {
      setSelectedSlot(null);
      return;
    }
    performSwap(selectedSlot, slotIndex);
  };

  const handleResetRound = () => {
    setTiles([...initialShuffle]);
    setSelectedSlot(null);
    setDraggedSlot(null);
    setDragOverSlot(null);
    setMoves(0);
    celebrationFiredRef.current = false;
  };

  const handlePlayAgain = () => {
    const fresh = createSolvableShuffle(2);
    setInitialShuffle(fresh);
    setTiles([...fresh]);
    setSelectedSlot(null);
    setDraggedSlot(null);
    setDragOverSlot(null);
    setMoves(0);
    celebrationFiredRef.current = false;
  };

  // Keyboard Escape clears active tile selection
  useEffect(() => {
    if (selectedSlot === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedSlot(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedSlot]);

  return (
    <div
      className={`rounded-2xl bg-[#FFFDF8] border border-[#C5A04A]/40 shadow-[0_14px_40px_-14px_rgba(7,59,43,0.14)] overflow-hidden ${
        isPreviewModal ? 'p-4 sm:p-6' : 'p-5 min-[360px]:p-6 sm:p-9'
      }`}
    >
      {/* Card Header & Live Typographic Progress Readout */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 mb-5 border-b border-[#07543E]/12">
        <div>
          <h3
            data-typo="subheading"
            className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E] leading-tight"
          >
            Complete the puzzle
          </h3>
          <p
            data-typo="caption"
            className="text-xs sm:text-sm text-[#262820]/75 mt-1"
          >
            Move the nine square pieces to rebuild the picture.
          </p>
        </div>

        <div className="sm:text-right shrink-0">
          <p
            aria-live="polite"
            className="text-xs sm:text-sm font-semibold text-[#07543E] tabular-nums"
          >
            {correctCount} of 9 pieces correct
          </p>
          <p className="text-xs text-[#737746] tabular-nums mt-0.5">
            {solved
              ? `Solved in ${moves} ${moves === 1 ? 'move' : 'moves'}`
              : selectedSlot !== null
              ? 'Tap another square to swap'
              : 'Drag or tap two pieces to swap'}
          </p>
        </div>
      </div>

      {/* Subtle Hairline Progress Meter */}
      <div
        className="w-full h-1.5 rounded-full bg-[#07543E]/10 overflow-hidden mb-6"
        role="progressbar"
        aria-valuenow={correctCount}
        aria-valuemin={0}
        aria-valuemax={PUZZLE_TILE_COUNT}
        aria-label="Puzzle completion progress"
      >
        <div
          className="h-full bg-gradient-to-r from-[#07543E] to-[#C5A04A] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Interactive 3x3 Puzzle Arena OR Full Uncropped Solved Photo Reveal */}
      <AnimatePresence mode="wait">
        {solved ? (
          <motion.div
            key="puzzle-solved-reveal"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center space-y-5"
          >
            <div className="w-full max-w-[min(92vw,440px)] mx-auto rounded-xl overflow-hidden border-2 border-[#C5A04A] bg-[#073B2B] shadow-[0_18px_40px_-12px_rgba(7,59,43,0.3)] p-1.5">
              {processed.failed ? (
                <div className="aspect-square flex flex-col items-center justify-center p-8 bg-[#073B2B] text-[#FAF7F0] rounded-lg">
                  <Sparkles className="w-8 h-8 text-[#F3E5AB] mb-3" />
                  <p className="font-serif text-2xl font-semibold text-[#F3E5AB]">
                    {coupleNames}
                  </p>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#FAF7F0]/75 mt-1">
                    #mjay2026
                  </p>
                </div>
              ) : (
                <img
                  src={processed.originalSrc}
                  alt={`${coupleNames} wedding celebration portrait`}
                  className="w-full max-h-[480px] object-contain rounded-lg mx-auto"
                />
              )}
            </div>

            <div className="space-y-2 max-w-md">
              <div className="inline-flex items-center justify-center gap-2 text-[#07543E]">
                <CheckCircle2 className="w-5 h-5 text-[#C5A04A]" />
                <h4 className="font-serif text-2xl sm:text-3xl font-semibold">
                  Beautiful! You completed the puzzle.
                </h4>
              </div>
              <p className="text-xs sm:text-sm text-[#262820]/75">
                Solved cleanly in {moves} {moves === 1 ? 'move' : 'moves'}.
              </p>
            </div>

            <button
              type="button"
              onClick={handlePlayAgain}
              className="inline-flex items-center justify-center gap-2 px-7 py-3 min-h-[48px] rounded-xl bg-[#07543E] hover:bg-[#073B2B] text-white text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] transition-colors shadow-md cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-[#F3E5AB]" />
              <span>Play Again</span>
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="puzzle-active-grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {processed.loading ? (
              <div className="w-full max-w-[min(88vw,420px)] aspect-square mx-auto rounded-xl bg-[#F2EBDD] border border-[#07543E]/15 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-[#07543E]/25 border-t-[#07543E] animate-spin" />
                <span className="text-xs uppercase tracking-[0.18em] text-[#07543E]/70 font-semibold">
                  Preparing Puzzle...
                </span>
              </div>
            ) : processed.failed || !processed.squareSrc ? (
              <div className="w-full max-w-[min(88vw,420px)] aspect-square mx-auto rounded-xl bg-[#073B2B] border border-[#C5A04A]/40 flex flex-col items-center justify-center p-6 text-center text-[#FAF7F0] space-y-2">
                <Sparkles className="w-7 h-7 text-[#F3E5AB]" />
                <p className="font-serif text-2xl text-[#F3E5AB]">{coupleNames}</p>
                <p className="text-xs text-[#FAF7F0]/75">
                  Puzzle photograph preview is temporarily unavailable.
                </p>
              </div>
            ) : (
              <div
                role="grid"
                aria-label="3 by 3 wedding photograph puzzle"
                className="w-full max-w-[min(88vw,420px)] aspect-square mx-auto p-1.5 sm:p-2 rounded-xl bg-[#073B2B] border border-[#C5A04A]/50 shadow-inner grid grid-cols-3 grid-rows-3 gap-1 sm:gap-1.5 select-none"
              >
                {tiles.map((pieceId, slotIndex) => {
                  const sourceRow = Math.floor(pieceId / PUZZLE_GRID_SIZE);
                  const sourceCol = pieceId % PUZZLE_GRID_SIZE;
                  const isCorrect = pieceId === slotIndex;
                  const isSelected = selectedSlot === slotIndex;
                  const isDragOver = dragOverSlot === slotIndex && draggedSlot !== slotIndex;

                  return (
                    <motion.div
                      key={`piece-${pieceId}`}
                      layout
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="w-full h-full"
                    >
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          setDraggedSlot(slotIndex);
                          setSelectedSlot(null);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', String(slotIndex));
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragOverSlot !== slotIndex) {
                            setDragOverSlot(slotIndex);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverSlot === slotIndex) {
                            setDragOverSlot(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromText = Number(e.dataTransfer.getData('text/plain'));
                          const sourceIndex =
                            draggedSlot !== null
                              ? draggedSlot
                              : Number.isFinite(fromText)
                              ? fromText
                              : null;
                          if (sourceIndex !== null && sourceIndex !== slotIndex) {
                            performSwap(sourceIndex, slotIndex);
                          } else {
                            setDraggedSlot(null);
                            setDragOverSlot(null);
                          }
                        }}
                        onDragEnd={() => {
                          setDraggedSlot(null);
                          setDragOverSlot(null);
                        }}
                        onClick={() => handleTileActivate(slotIndex)}
                        aria-label={`Puzzle square ${slotIndex + 1}, piece ${pieceId + 1}${
                          isCorrect ? ', in correct position' : ''
                        }${isSelected ? ', selected' : ''}`}
                        aria-pressed={isSelected}
                        data-slot-index={slotIndex}
                        data-piece-id={pieceId}
                        style={{
                          backgroundImage: `url("${processed.squareSrc}")`,
                          backgroundSize: '300% 300%',
                          backgroundPosition: `${sourceCol * 50}% ${sourceRow * 50}%`,
                          backgroundRepeat: 'no-repeat'
                        }}
                        className={`relative w-full h-full min-h-[44px] rounded-[5px] sm:rounded-md overflow-hidden cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3E5AB] transition-all ${
                          isSelected
                            ? 'ring-3 ring-[#F3E5AB] shadow-[0_0_0_2px_#07543E,0_10px_20px_rgba(0,0,0,0.4)] z-10 scale-[0.97]'
                            : isDragOver
                            ? 'ring-2 ring-[#C5A04A] brightness-110 z-10'
                            : isCorrect
                            ? 'ring-1 ring-[#C5A04A]/85'
                            : 'ring-1 ring-white/15 hover:brightness-105'
                        }`}
                      >
                        {/* Subtle gold corner glint when a tile sits in its rightful position */}
                        {isCorrect && (
                          <span
                            aria-hidden="true"
                            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#F3E5AB] shadow-[0_0_6px_rgba(243,229,171,0.9)] pointer-events-none"
                          />
                        )}
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Concise Action Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 max-w-[min(88vw,420px)] mx-auto">
              <p className="text-xs text-[#262820]/65 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-[#737746] shrink-0" />
                <span>
                  {moves === 0
                    ? 'Tap two squares or drag to swap'
                    : `${moves} ${moves === 1 ? 'move' : 'moves'}`}
                </span>
              </p>

              <div className="flex items-center gap-2">
                {moves > 0 && (
                  <button
                    type="button"
                    onClick={handleResetRound}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] text-xs font-semibold text-[#07543E] transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handlePlayAgain}
                  className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-lg border border-[#C5A04A]/55 bg-[#F2EBDD]/60 hover:bg-[#F2EBDD] text-xs font-semibold text-[#07543E] transition-colors cursor-pointer"
                >
                  <Shuffle className="w-3.5 h-3.5 text-[#C5A04A]" />
                  <span>Shuffle</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface WeddingPhotoPuzzleSectionProps {
  puzzleImageUrl?: string;
  coupleNames: string;
  musicEnabled?: boolean;
  availableSongs?: MusicTrack[];
  activeSongId?: string;
  onSelectSong?: (track: MusicTrack) => Promise<{ startedPlaying: boolean; respectPaused: boolean }>;
  typography?: SectionTypographyElements;
}

function readPuzzleUnlockedSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(PUZZLE_REWARD_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function readSubmittedSuggestionsSession(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(SUBMITTED_SUGGESTIONS_SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export const WeddingPhotoPuzzleSection: React.FC<WeddingPhotoPuzzleSectionProps> = ({
  puzzleImageUrl,
  coupleNames,
  musicEnabled = true,
  availableSongs = [],
  activeSongId = '',
  onSelectSong,
  typography
}) => {
  const [rewardUnlocked, setRewardUnlocked] = useState<boolean>(() =>
    readPuzzleUnlockedSession()
  );
  const [selectedNotice, setSelectedNotice] = useState<string | null>(null);
  const [showSuggestForm, setShowSuggestForm] = useState(false);
  const [suggestTitle, setSuggestTitle] = useState('');
  const [suggestArtist, setSuggestArtist] = useState('');
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestSuccess, setSuggestSuccess] = useState<string | null>(null);
  const [lastSuggestionAt, setLastSuggestionAt] = useState<number>(0);

  const sectionTypoProps = getSectionTypographyProps('puzzle', typography);

  const handlePuzzleSolved = useCallback(() => {
    setRewardUnlocked(true);
    try {
      window.sessionStorage.setItem(PUZZLE_REWARD_SESSION_KEY, '1');
    } catch {
      // Ignore private mode storage limits
    }
  }, []);

  const handleSongSelectChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const chosenId = e.target.value;
    const track = availableSongs.find((s) => s.id === chosenId);
    if (!track || !onSelectSong) return;

    const outcome = await onSelectSong(track);
    if (outcome.respectPaused) {
      setSelectedNotice(
        `Queued "${track.title}" by ${track.artist}. Music is currently paused — tap Play in the top bar whenever you're ready.`
      );
    } else if (outcome.startedPlaying) {
      setSelectedNotice(`Now playing "${track.title}" — ${track.artist}.`);
    } else {
      setSelectedNotice(
        `Selected "${track.title}" — ${track.artist}. Tap Play in the top bar if your browser paused audio.`
      );
    }
  };

  const handleSubmitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuggestError(null);
    setSuggestSuccess(null);

    const cleanTitle = suggestTitle.trim();
    const cleanArtist = suggestArtist.trim();
    if (!cleanTitle) {
      setSuggestError('Please enter a song title before submitting.');
      return;
    }

    const now = Date.now();
    if (now - lastSuggestionAt < 4000) {
      setSuggestError('Please wait a moment before sending another suggestion.');
      return;
    }

    const normalizedKey = normalizeSongSuggestionKey(cleanTitle, cleanArtist);
    const prevSubmitted = readSubmittedSuggestionsSession();
    if (prevSubmitted.includes(normalizedKey)) {
      setSuggestSuccess("Thank you! We've added your song suggestion to our list.");
      setSuggestTitle('');
      setSuggestArtist('');
      return;
    }

    setSuggestSubmitting(true);
    try {
      await submitGuestSongSuggestion({
        title: cleanTitle,
        artist: cleanArtist
      });
      setLastSuggestionAt(Date.now());
      try {
        const nextList = [...prevSubmitted.slice(-24), normalizedKey];
        window.sessionStorage.setItem(
          SUBMITTED_SUGGESTIONS_SESSION_KEY,
          JSON.stringify(nextList)
        );
      } catch {
        // Ignore storage error
      }
      setSuggestTitle('');
      setSuggestArtist('');
      setSuggestSuccess("Thank you! We've added your song suggestion to our list.");
    } catch (err) {
      setSuggestError(
        err instanceof Error
          ? err.message
          : 'We could not record your suggestion right now. Please try again.'
      );
    } finally {
      setSuggestSubmitting(false);
    }
  };

  const enabledSongs = availableSongs.filter((s) => s.enabled !== false && Boolean(s.fileUrl));

  return (
    <section
      id="puzzle"
      {...sectionTypoProps}
      className="scroll-mt-20 py-16 sm:py-24 px-4 sm:px-6 border-b border-[#07543E]/10 bg-[#FFFDF8]"
    >
      <div className="max-w-3xl mx-auto">
        <div className="text-center max-w-xl mx-auto mb-9 sm:mb-12">
          <p
            data-typo="label"
            className="text-xs sm:text-sm uppercase tracking-[0.22em] text-[#737746] font-semibold mb-2"
          >
            A LITTLE WEDDING FUN
          </p>
          <h2
            data-typo="heading"
            className="font-serif text-[34px] sm:text-5xl font-semibold text-[#07543E] text-balance leading-tight mb-4"
          >
            Put Our Love Story Together
          </h2>
          <p
            data-typo="body"
            className="text-base sm:text-lg text-[#262820]/80 leading-relaxed"
          >
            Take a moment to play this special part of our celebration. Piece together our photograph and reveal the beautiful picture.
          </p>
          <div className="mt-6 h-[1px] w-24 mx-auto bg-gradient-to-r from-transparent via-[#C5A04A] to-transparent" />
        </div>

        <WeddingPuzzleBoard
          imageUrl={puzzleImageUrl}
          coupleNames={coupleNames}
          onSolved={handlePuzzleSolved}
        />

        {/* Session-Persisted Musical Reward — Unlocked ONLY after completing the puzzle */}
        <AnimatePresence>
          {rewardUnlocked && (
            <motion.div
              key="puzzle-music-reward"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 rounded-2xl border border-[#C5A04A]/50 bg-[#FAF7F0] p-5 min-[360px]:p-6 sm:p-8 shadow-[0_14px_36px_-14px_rgba(7,59,43,0.16)] space-y-5"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#07543E] text-[#F3E5AB] flex items-center justify-center shrink-0 border border-[#C5A04A]/45">
                  <Music2 className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p
                    data-typo="label"
                    className="text-xs uppercase tracking-[0.2em] text-[#737746] font-semibold"
                  >
                    Puzzle Reward Unlocked
                  </p>
                  <h3
                    data-typo="subheading"
                    className="font-serif text-xl sm:text-2xl font-semibold text-[#07543E] leading-snug"
                  >
                    You did it! 🎉 You&apos;ve unlocked a little musical treat. Choose the next song for our celebration!
                  </h3>
                </div>
              </div>

              {musicEnabled && enabledSongs.length > 0 ? (
                <div className="space-y-3">
                  <label
                    htmlFor="puzzle-song-selector"
                    data-typo="label"
                    className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#07543E]"
                  >
                    Select the Next Celebration Song
                  </label>

                  <select
                    id="puzzle-song-selector"
                    value={activeSongId}
                    onChange={(e) => void handleSongSelectChange(e)}
                    className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-[#07543E]/25 bg-white text-sm sm:text-base font-medium text-[#262820] focus:outline-none focus:border-[#07543E] focus:ring-2 focus:ring-[#07543E]/15 cursor-pointer"
                  >
                    {!enabledSongs.some((s) => s.id === activeSongId) && (
                      <option value="">Choose a song from our celebration playlist...</option>
                    )}
                    {enabledSongs.map((song) => (
                      <option key={song.id} value={song.id}>
                        {song.title} — {song.artist}
                      </option>
                    ))}
                  </select>

                  {selectedNotice && (
                    <p
                      role="status"
                      data-typo="caption"
                      className="text-xs sm:text-sm text-[#07543E] bg-[#07543E]/8 border border-[#07543E]/15 rounded-lg px-3.5 py-2.5 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#C5A04A] shrink-0" />
                      <span>{selectedNotice}</span>
                    </p>
                  )}
                </div>
              ) : (
                <p data-typo="caption" className="text-sm text-[#262820]/75">
                  {musicEnabled
                    ? 'Our playlist tracks are being curated by the couple — you can still suggest a favourite song below!'
                    : 'Background music is currently paused by the couple, but you can still suggest a song below!'}
                </p>
              )}

              {/* Discreet Song Suggestion Trigger & Expandable Form */}
              <div className="pt-3 border-t border-[#07543E]/12">
                <button
                  type="button"
                  data-typo="button"
                  onClick={() => {
                    setShowSuggestForm((prev) => !prev);
                    setSuggestError(null);
                  }}
                  aria-expanded={showSuggestForm}
                  className="inline-flex items-center min-h-[44px] text-xs sm:text-sm font-semibold text-[#07543E] hover:text-[#073B2B] underline underline-offset-4 cursor-pointer"
                >
                  Can&apos;t find your song? Suggest one!
                </button>

                {showSuggestForm && (
                  <form
                    onSubmit={(e) => void handleSubmitSuggestion(e)}
                    noValidate
                    className="mt-3 p-4 sm:p-5 rounded-xl bg-white border border-[#07543E]/15 space-y-4"
                  >
                    {suggestError && (
                      <div
                        role="alert"
                        className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900 flex items-start gap-2"
                      >
                        <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                        <span>{suggestError}</span>
                      </div>
                    )}

                    {suggestSuccess && (
                      <div
                        role="status"
                        className="p-3 rounded-lg bg-[#07543E]/8 border border-[#07543E]/25 text-xs sm:text-sm text-[#07543E] flex items-start gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#07543E] shrink-0 mt-0.5" />
                        <span>{suggestSuccess}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label
                          htmlFor="song-suggest-title"
                          className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
                        >
                          Song Title <span className="text-red-700">*</span>
                        </label>
                        <input
                          id="song-suggest-title"
                          type="text"
                          required
                          maxLength={120}
                          value={suggestTitle}
                          disabled={suggestSubmitting}
                          onChange={(e) => setSuggestTitle(e.target.value)}
                          placeholder="e.g. All of Me"
                          className="w-full px-3.5 py-2.5 min-h-[44px] text-base sm:text-sm rounded-lg border border-[#07543E]/20 bg-[#FAF7F0]/50 focus:outline-none focus:border-[#07543E]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="song-suggest-artist"
                          className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
                        >
                          Artist Name (Optional)
                        </label>
                        <input
                          id="song-suggest-artist"
                          type="text"
                          maxLength={120}
                          value={suggestArtist}
                          disabled={suggestSubmitting}
                          onChange={(e) => setSuggestArtist(e.target.value)}
                          placeholder="e.g. John Legend"
                          className="w-full px-3.5 py-2.5 min-h-[44px] text-base sm:text-sm rounded-lg border border-[#07543E]/20 bg-[#FAF7F0]/50 focus:outline-none focus:border-[#07543E]"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-[#262820]/65">
                        Sent privately to Mary &amp; Joseph for review.
                      </p>
                      <button
                        type="submit"
                        disabled={suggestSubmitting}
                        className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-60 text-white text-xs font-semibold uppercase tracking-[0.14em] transition-colors cursor-pointer"
                      >
                        {suggestSubmitting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Sending...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5 text-[#F3E5AB]" />
                            <span>Submit Suggestion</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};
