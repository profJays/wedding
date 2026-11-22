import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Pause, Play, Sparkles } from 'lucide-react';
import { SlideshowSlideItem } from '../types';

interface GallerySlideshowProps {
  slides: SlideshowSlideItem[];
  autoplay?: boolean;
  intervalMs?: number;
  coupleNames?: string;
  compactPreview?: boolean;
}

export const GallerySlideshow: React.FC<GallerySlideshowProps> = ({
  slides,
  autoplay = true,
  intervalMs = 5000,
  coupleNames = 'Mary & Joseph',
  compactPreview = false
}) => {
  const enabledSlides = slides.filter(
    (s) => s.enabled !== false && Boolean((s.fileUrl || '').trim())
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(autoplay);
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  useEffect(() => {
    setIsPlaying(autoplay);
  }, [autoplay]);

  useEffect(() => {
    if (currentIndex >= enabledSlides.length && enabledSlides.length > 0) {
      setCurrentIndex(0);
    }
  }, [currentIndex, enabledSlides.length]);

  const safeLength = enabledSlides.length;

  const goNext = useCallback(() => {
    if (safeLength <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % safeLength);
  }, [safeLength]);

  const goPrev = useCallback(() => {
    if (safeLength <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + safeLength) % safeLength);
  }, [safeLength]);

  // Automatic playback timer (respects prefers-reduced-motion)
  useEffect(() => {
    if (!isPlaying || safeLength <= 1) return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const clampedInterval = Math.max(2000, Math.min(30000, intervalMs || 5000));
    const timer = window.setInterval(goNext, clampedInterval);
    return () => window.clearInterval(timer);
  }, [isPlaying, safeLength, intervalMs, goNext]);

  if (safeLength === 0) {
    return null;
  }

  const activeSlide = enabledSlides[currentIndex] || enabledSlides[0];
  const hasError = Boolean(failedIds[activeSlide.id]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
    const endY = e.changedTouches[0]?.clientY ?? touchStartYRef.current;
    const dx = endX - touchStartXRef.current;
    const dy = endY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) {
        goNext();
      } else {
        goPrev();
      }
    }
  };

  return (
    <div
      className={compactPreview ? 'w-full' : 'mb-14 sm:mb-16'}
      aria-roledescription="carousel"
      aria-label="Wedding Highlights Slideshow"
    >
      {!compactPreview && (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
          <div>
            <p
              data-typo="label"
              className="text-xs uppercase tracking-[0.22em] text-[#737746] font-semibold mb-1"
            >
              Curated Memories
            </p>
            <h3
              data-typo="subheading"
              className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E]"
            >
              Wedding Highlights
            </h3>
          </div>

          {safeLength > 1 && (
            <div className="flex items-center gap-3 text-xs text-[#262820]/70">
              <span className="font-mono tabular-nums">
                {String(currentIndex + 1).padStart(2, '0')} / {String(safeLength).padStart(2, '0')}
              </span>
              <button
                type="button"
                data-typo="button"
                onClick={() => setIsPlaying((prev) => !prev)}
                aria-label={isPlaying ? 'Pause slideshow' : 'Resume slideshow'}
                aria-pressed={!isPlaying}
                className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg border border-[#07543E]/20 bg-[#FAF7F0] hover:bg-white text-[#07543E] font-semibold uppercase tracking-[0.12em] transition-colors cursor-pointer"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 ml-0.5" aria-hidden="true" />
                    <span>Play</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Slideshow Viewport */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') goNext();
          if (e.key === 'ArrowLeft') goPrev();
        }}
        tabIndex={0}
        className={`relative w-full overflow-hidden rounded-2xl border border-[#C5A04A]/40 bg-[#073B2B] shadow-[0_18px_42px_-16px_rgba(7,59,43,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#07543E] ${
          compactPreview
            ? 'aspect-[16/10] max-h-[340px]'
            : 'aspect-[4/3] sm:aspect-[16/9] max-h-[520px]'
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSlide.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 w-full h-full"
          >
            {hasError ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#07543E] via-[#073B2B] to-[#05291E] text-[#FAF7F0]">
                <Sparkles className="w-7 h-7 text-[#F3E5AB] mb-2" />
                <p className="font-serif text-2xl font-semibold text-[#F3E5AB]">
                  {activeSlide.title || coupleNames}
                </p>
                {activeSlide.caption && (
                  <p className="text-sm text-[#FAF7F0]/80 mt-1 max-w-md">{activeSlide.caption}</p>
                )}
              </div>
            ) : (
              <img
                src={activeSlide.fileUrl}
                alt={activeSlide.title || `${coupleNames} wedding highlight`}
                referrerPolicy="no-referrer"
                onError={() =>
                  setFailedIds((prev) => ({ ...prev, [activeSlide.id]: true }))
                }
                className="w-full h-full object-cover object-[50%_24%] select-none"
                draggable={false}
              />
            )}

            {/* Measured contrast scrim at bottom for caption legibility */}
            {(activeSlide.title || activeSlide.caption) && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#05261C]/90 via-[#05261C]/45 to-transparent px-5 sm:px-8 pt-14 pb-5 sm:pb-6 text-[#FAF7F0]">
                {activeSlide.title && (
                  <p className="font-serif text-xl sm:text-2xl font-semibold text-white leading-snug">
                    {activeSlide.title}
                  </p>
                )}
                {activeSlide.caption && (
                  <p
                    data-typo="caption"
                    className="text-xs sm:text-sm text-[#F3E5AB]/95 mt-0.5 line-clamp-2"
                  >
                    {activeSlide.caption}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Previous / Next Navigation Arrows */}
        {safeLength > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous highlight picture"
              className="absolute left-2.5 sm:left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-[#073B2B]/70 hover:bg-[#073B2B]/90 border border-[#C5A04A]/45 text-[#FAF7F0] flex items-center justify-center transition-colors cursor-pointer backdrop-blur-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3E5AB]"
            >
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={goNext}
              aria-label="Next highlight picture"
              className="absolute right-2.5 sm:right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-[#073B2B]/70 hover:bg-[#073B2B]/90 border border-[#C5A04A]/45 text-[#FAF7F0] flex items-center justify-center transition-colors cursor-pointer backdrop-blur-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3E5AB]"
            >
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      {/* Subtle Slide Indicators & Compact Preview Play/Pause */}
      {safeLength > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
          {enabledSlides.map((slide, idx) => {
            const active = idx === currentIndex;
            return (
              <button
                key={slide.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                aria-label={`View slide ${idx + 1}: ${slide.title || 'Wedding Highlight'}`}
                aria-current={active ? 'true' : undefined}
                className="p-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#07543E] rounded-full"
              >
                <span
                  className={`block h-2 rounded-full transition-all duration-300 ${
                    active ? 'w-7 bg-[#07543E]' : 'w-2 bg-[#07543E]/30 hover:bg-[#C5A04A]'
                  }`}
                />
              </button>
            );
          })}

          {compactPreview && (
            <button
              type="button"
              onClick={() => setIsPlaying((prev) => !prev)}
              aria-label={isPlaying ? 'Pause slideshow preview' : 'Play slideshow preview'}
              className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#07543E]/20 bg-white text-[11px] font-semibold text-[#07543E] cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
