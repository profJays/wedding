import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar,
  MapPin,
  Clock,
  ChevronDown,
  Search,
  Sparkles,
  MailOpen,
  ExternalLink,
  Navigation,
  Palette,
  Heart,
  Download
} from 'lucide-react';
import {
  AUTHORITATIVE_QA_INTRO,
  WEDDING_PHOTOS
} from '../data/weddingSite';
import { MusicTrack, SiteContentData } from '../types';
import { Crest } from './Crest';
import { RsvpSection } from './RsvpSection';
import { GallerySection } from './GallerySection';
import { WeddingPhotoPuzzleSection } from './WeddingPhotoPuzzleSection';
import { GiftingSection } from './GiftingSection';
import { getSectionTypographyProps } from '../utils/typography';
import {
  getHeroOverlayGradient,
  getImageFitClass,
  getImageObjectPositionClass,
  resolveWebsiteImageSlot
} from '../utils/websiteImages';
import {
  buildMapSearchUrl,
  buildDirectionsUrl,
  buildGoogleCalendarUrl,
  downloadIcsFile
} from '../utils/calendar';

interface WeddingWebsiteProps {
  siteContent: SiteContentData;
  guestName: string;
  isChallengePassed: boolean;
  availableSongs: MusicTrack[];
  activeSongId: string;
  onSelectSong: (
    track: MusicTrack
  ) => Promise<{ startedPlaying: boolean; respectPaused: boolean }>;
  onGoInvitation: () => void;
  onGoChallenge: () => void;
  onOpenDressCode: () => void;
}

interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
}

function getCountdown(targetIso: string): CountdownTime {
  const targetMs = new Date(targetIso).getTime();
  if (Number.isNaN(targetMs)) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
  }
  const diff = targetMs - Date.now();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds, isPast: false };
}

interface EditorialPhotoProps {
  src: string;
  alt: string;
  coupleNames: string;
  className?: string;
  imgClassName?: string;
}

const EditorialPhoto: React.FC<EditorialPhotoProps> = ({
  src,
  alt,
  coupleNames,
  className = '',
  imgClassName = 'w-full h-full object-cover'
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-[#C5A04A]/25 bg-[#F2EBDD] ${className}`}
    >
      {hasError ? (
        <div className="w-full h-full min-h-[260px] flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#07543E]/10 via-[#FAF7F0] to-[#C5A04A]/15">
          <Crest size="md" className="mb-3" />
          <p className="font-serif text-xl font-semibold text-[#07543E]">
            {coupleNames}
          </p>
          <p className="text-sm text-[#262820]/70 mt-1">{alt}</p>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
          className={imgClassName}
        />
      )}
    </div>
  );
};

export const WeddingWebsite: React.FC<WeddingWebsiteProps> = ({
  siteContent,
  guestName,
  isChallengePassed,
  availableSongs,
  activeSongId,
  onSelectSong,
  onGoInvitation,
  onGoChallenge,
  onOpenDressCode
}) => {
  const welcomeTypoProps = getSectionTypographyProps('welcome', siteContent.sectionTypography?.welcome);
  const storyTypoProps = getSectionTypographyProps('story', siteContent.sectionTypography?.story);
  const scheduleTypoProps = getSectionTypographyProps('schedule', siteContent.sectionTypography?.schedule);
  const faqTypoProps = getSectionTypographyProps('faq', siteContent.sectionTypography?.faq);

  const heroImage = resolveWebsiteImageSlot(siteContent, 'hero');
  const storyImage = resolveWebsiteImageSlot(siteContent, 'story');
  const scheduleImage = resolveWebsiteImageSlot(siteContent, 'schedule');
  const puzzleImage = resolveWebsiteImageSlot(siteContent, 'puzzle');
  const qaImage = resolveWebsiteImageSlot(siteContent, 'qa');

  const [countdown, setCountdown] = useState<CountdownTime>(() =>
    getCountdown(siteContent.ceremonyTargetISO)
  );
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'dec-11' | 'dec-12'>('all');
  const [faqQuery, setFaqQuery] = useState('');
  const [openFaqIds, setOpenFaqIds] = useState<Record<string, boolean>>({
    'faq-1': true,
    'faq-3': true
  });
  const [openCoupleQaIds, setOpenCoupleQaIds] = useState<Record<string, boolean>>({
    'cqa-1': true,
    'cqa-2': true
  });
  const [openCalendarMenuId, setOpenCalendarMenuId] = useState<string | null>(null);
  const calendarContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCountdown(getCountdown(siteContent.ceremonyTargetISO));
    const timer = window.setInterval(() => {
      setCountdown(getCountdown(siteContent.ceremonyTargetISO));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [siteContent.ceremonyTargetISO]);

  useEffect(() => {
    if (!openCalendarMenuId) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('[data-calendar-menu-root="true"]')) {
        setOpenCalendarMenuId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenCalendarMenuId(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openCalendarMenuId]);

  const filteredEvents = useMemo(() => {
    if (scheduleFilter === 'all') return siteContent.scheduleEvents;
    return siteContent.scheduleEvents.filter((event) => event.dayKey === scheduleFilter);
  }, [scheduleFilter, siteContent.scheduleEvents]);

  // Group events chronologically under clear day subheadings
  const groupedSchedule = useMemo(() => {
    const groups: Array<{ heading: string; dayKey: string; events: typeof filteredEvents }> = [];
    for (const ev of filteredEvents) {
      const existing = groups.find((g) => g.heading === ev.dayHeading);
      if (existing) {
        existing.events.push(ev);
      } else {
        groups.push({ heading: ev.dayHeading, dayKey: ev.dayKey, events: [ev] });
      }
    }
    return groups;
  }, [filteredEvents]);

  const filteredFaqs = useMemo(() => {
    const q = faqQuery.trim().toLowerCase();
    if (!q) return siteContent.guestFaqs;
    return siteContent.guestFaqs.filter(
      (item) =>
        item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)
    );
  }, [faqQuery, siteContent.guestFaqs]);

  const toggleFaq = (id: string) => {
    setOpenFaqIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleCoupleQa = (id: string) => {
    setOpenCoupleQaIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div id="top" className="w-full bg-[#FAF7F0] text-[#262820]">
      {/* ====================================================================
          1. HERO SECTION (Editorial Full-Bleed Portrait & Deep Forest Scrim)
      ==================================================================== */}
      <section className="relative w-full min-h-[78vh] sm:min-h-[84vh] flex items-end overflow-hidden bg-[#073B2B]">
        <img
          src={heroImage.fileUrl}
          alt={heroImage.altText || WEDDING_PHOTOS.hero.alt}
          referrerPolicy="no-referrer"
          className={`absolute inset-0 w-full h-full ${getImageFitClass(heroImage.fitMode)} ${getImageObjectPositionClass(heroImage.focalPosition, 'hero')}`}
        />

        {/* Editorial Contrast Scrim (#073B2B forest green gradient) */}
        <div
          className="absolute inset-0"
          style={{
            background: getHeroOverlayGradient(heroImage.overlayIntensity)
          }}
        />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-8 pt-24 pb-12 sm:pb-16 text-center text-[#FAF7F0]">
          <p className="font-sans text-xs sm:text-sm tracking-[0.18em] sm:tracking-[0.24em] uppercase text-[#F3E5AB] mb-3 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
            <span>{siteContent.weddingDateDisplay}</span>
            <span className="text-[#C5A04A]" aria-hidden="true">·</span>
            <span>Abuja, Nigeria</span>
            <span className="text-[#C5A04A]" aria-hidden="true">·</span>
            <span className="lowercase font-mono tracking-widest">{siteContent.hashtag}</span>
          </p>

          <h1 className="font-serif text-[42px] min-[375px]:text-5xl sm:text-7xl lg:text-8xl font-semibold tracking-wide text-white leading-[1.05] text-balance mb-4">
            {siteContent.brideName}{' '}
            <span className="font-script text-[#E8CA6B] font-normal text-[44px] min-[375px]:text-5xl sm:text-7xl lg:text-8xl">
              &amp;
            </span>{' '}
            {siteContent.groomName}
          </h1>

          <p className="font-serif italic text-base sm:text-xl text-[#FAF7F0]/90 max-w-2xl mx-auto mb-8 break-words">
            {siteContent.mainVenue}
          </p>

          {/* Hero Ceremony Countdown (Targets 12 Dec 2026 10:00 AM Africa/Lagos) */}
          {countdown.isPast ? (
            <div className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#073B2B]/80 border border-[#C5A04A]/50 text-[#F3E5AB] font-serif italic text-lg sm:text-xl mb-8">
              <Sparkles className="w-4 h-4 text-[#C5A04A]" />
              <span>Today we celebrate {siteContent.coupleNames} forever!</span>
            </div>
          ) : (
            <div
              aria-label="Countdown to the wedding ceremony"
              className="grid grid-cols-4 gap-2 sm:gap-7 px-3.5 sm:px-7 py-4 rounded-xl bg-[#073B2B]/75 backdrop-blur-md border border-[#C5A04A]/40 mb-8 w-full max-w-md mx-auto"
            >
              {[
                { label: 'Days', value: countdown.days },
                { label: 'Hours', value: countdown.hours },
                { label: 'Minutes', value: countdown.minutes },
                { label: 'Seconds', value: countdown.seconds }
              ].map((unit) => (
                <div key={unit.label} className="text-center min-w-0">
                  <div className="font-serif text-2xl sm:text-3xl font-semibold text-[#F3E5AB] tabular-nums leading-none">
                    {String(unit.value).padStart(2, '0')}
                  </div>
                  <div className="mt-1.5 text-[11px] sm:text-xs uppercase tracking-[0.08em] sm:tracking-[0.16em] text-[#FAF7F0]/85 truncate">
                    {unit.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Hero Action Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 w-full max-w-sm sm:max-w-none mx-auto">
            <button
              type="button"
              onClick={() => scrollToSection('rsvp')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 min-h-[48px] rounded-xl bg-[#C5A04A] hover:bg-[#D4B05B] text-[#073B2B] text-xs sm:text-sm font-bold uppercase tracking-[0.16em] transition-colors shadow-lg cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>RSVP Now</span>
            </button>

            <button
              type="button"
              onClick={onGoChallenge}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] rounded-xl bg-[#07543E]/85 hover:bg-[#07543E] text-white border border-[#C5A04A]/55 text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] backdrop-blur-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-4 h-4 text-[#F3E5AB]" />
              <span>
                {isChallengePassed
                  ? `View Pass (${guestName.trim() || 'Cleared'})`
                  : `${siteContent.hashtag} Challenge`}
              </span>
            </button>

            <button
              type="button"
              onClick={onGoInvitation}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] text-xs sm:text-sm font-medium tracking-[0.12em] uppercase text-[#F3E5AB] hover:text-white underline underline-offset-8 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <MailOpen className="w-4 h-4" />
              <span>Digital Invite</span>
            </button>
          </div>
        </div>
      </section>

      {/* ====================================================================
          2. WELCOME SECTION (Ivory #FAF7F0 — Single Column Luxury Letter)
      ==================================================================== */}
      <section
        id="welcome"
        {...welcomeTypoProps}
        className="scroll-mt-20 py-16 sm:py-24 px-4 sm:px-6 border-b border-[#07543E]/10 bg-[#FAF7F0]"
      >
        <div className="max-w-2xl mx-auto text-center">
          <div className="flex justify-center mb-5">
            <Crest size="md" />
          </div>

          <p
            data-typo="label"
            className="text-xs sm:text-sm uppercase tracking-[0.24em] text-[#737746] font-semibold mb-3"
          >
            Welcome · {siteContent.hashtag}
          </p>

          <h2
            data-typo="heading"
            className="font-serif text-[34px] sm:text-5xl lg:text-[52px] font-semibold text-[#07543E] text-balance leading-tight mb-8"
          >
            {siteContent.welcomeHeading}
          </h2>

          <div className="h-[1px] w-24 mx-auto bg-gradient-to-r from-transparent via-[#C5A04A] to-transparent mb-8" />

          <div className="space-y-6 text-left sm:text-center text-base sm:text-lg text-[#262820]/85 leading-[1.75] sm:leading-loose font-serif">
            {siteContent.welcomeParagraphs.map((para, idx) => (
              <p
                key={idx}
                data-typo="body"
                className={
                  idx === 0
                    ? 'first-letter:text-5xl first-letter:font-serif first-letter:font-semibold first-letter:text-[#07543E] first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:leading-none sm:first-letter:float-none sm:first-letter:text-lg sm:first-letter:font-normal sm:first-letter:mr-0 sm:first-letter:mt-0'
                    : ''
                }
              >
                {para}
              </p>
            ))}
          </div>

          <p
            data-typo="caption"
            className="mt-9 font-serif italic text-xl sm:text-2xl text-[#07543E] whitespace-pre-line"
          >
            {siteContent.welcomeSignOff}
          </p>

          <div className="mt-10 h-[1px] w-24 mx-auto bg-gradient-to-r from-transparent via-[#C5A04A] to-transparent" />
        </div>
      </section>

      {/* ====================================================================
          3. OUR STORY + COUPLE Q&AS (Soft Cream #F2EBDD)
      ==================================================================== */}
      <section
        id="story"
        {...storyTypoProps}
        className="scroll-mt-20 py-16 sm:py-24 px-4 sm:px-6 border-b border-[#07543E]/10 bg-[#F2EBDD]"
      >
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-10 sm:mb-14">
            <p
              data-typo="label"
              className="text-xs sm:text-sm uppercase tracking-[0.22em] text-[#737746] font-semibold mb-2"
            >
              Our Story
            </p>
            <h2
              data-typo="heading"
              className="font-serif text-[34px] sm:text-5xl lg:text-[52px] font-semibold text-[#07543E] text-balance leading-tight"
            >
              {siteContent.storyHeading}
            </h2>
          </div>

          {/* Story Spread: Natural Photo Presentation + Comfortable Reading Width */}
          {storyImage.hidden ? (
            <div className="max-w-3xl mb-16 sm:mb-20">
              <div className="p-5 min-[360px]:p-6 sm:p-10 rounded-xl bg-[#FAF7F0] border border-[#07543E]/12 space-y-6">
                <div className="space-y-5 text-base sm:text-lg leading-[1.75] sm:leading-loose text-[#262820]/85 font-serif max-w-prose">
                  {siteContent.storyParagraphs.map((para, idx) => (
                    <p
                      key={idx}
                      data-typo="body"
                      className={
                        idx === 0
                          ? 'first-letter:text-5xl first-letter:font-serif first-letter:font-semibold first-letter:text-[#07543E] first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:leading-none'
                          : ''
                      }
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start mb-16 sm:mb-20">
              <div className="lg:col-span-5">
                <EditorialPhoto
                  src={storyImage.fileUrl}
                  alt={storyImage.altText || WEDDING_PHOTOS.story.alt}
                  coupleNames={siteContent.coupleNames}
                  imgClassName={`w-full h-80 sm:h-96 lg:h-[480px] ${getImageFitClass(storyImage.fitMode)} ${getImageObjectPositionClass(storyImage.focalPosition, 'story')}`}
                />
              </div>

              <div className="lg:col-span-7">
                <div className="p-5 min-[360px]:p-6 sm:p-10 rounded-xl bg-[#FAF7F0] border border-[#07543E]/12 space-y-6">
                  <div className="space-y-5 text-base sm:text-lg leading-[1.75] sm:leading-loose text-[#262820]/85 font-serif max-w-prose">
                    {siteContent.storyParagraphs.map((para, idx) => (
                      <p
                        key={idx}
                        data-typo="body"
                        className={
                          idx === 0
                            ? 'first-letter:text-5xl first-letter:font-serif first-letter:font-semibold first-letter:text-[#07543E] first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:leading-none'
                            : ''
                        }
                      >
                        {para}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Couple Q&As (Refined Editorial Interactive Accordion Spread — Distinct from Guest Q&A) */}
          {siteContent.coupleQas.length > 0 && (
            <div className="pt-8 border-t border-[#07543E]/12">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                <div>
                  <p
                    data-typo="label"
                    className="text-xs sm:text-sm uppercase tracking-[0.22em] text-[#737746] font-semibold mb-1.5"
                  >
                    Between the Two of Us
                  </p>
                  <h3
                    data-typo="subheading"
                    className="font-serif text-2xl sm:text-4xl font-semibold text-[#07543E]"
                  >
                    Couple Q&amp;A
                  </h3>
                </div>
                <p
                  data-typo="caption"
                  className="text-sm sm:text-base text-[#262820]/70 font-serif italic"
                >
                  A few light-hearted notes from {siteContent.coupleNames}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                {siteContent.coupleQas.map((qa, idx) => {
                  const isOpen = Boolean(openCoupleQaIds[qa.id]);
                  const panelId = `couple-qa-panel-${qa.id}`;
                  return (
                    <article
                      key={qa.id}
                      className="rounded-xl bg-[#FAF7F0] border border-[#07543E]/12 overflow-hidden transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => toggleCoupleQa(qa.id)}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        className="w-full min-h-[52px] px-5 sm:px-6 py-4 sm:py-5 flex items-start justify-between gap-4 text-left cursor-pointer group"
                      >
                        <div className="flex items-baseline gap-3">
                          <span className="font-mono text-xs text-[#C5A04A] font-semibold shrink-0 tabular-nums">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <h4
                            data-typo="subheading"
                            className="font-serif text-lg sm:text-xl font-semibold text-[#07543E] group-hover:text-[#073B2B] leading-snug"
                          >
                            {qa.question}
                          </h4>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-[#07543E]/70 shrink-0 mt-1 transition-transform duration-200 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      {isOpen && (
                        <div
                          id={panelId}
                          data-typo="body"
                          className="px-5 sm:px-6 pb-5 pt-0 sm:pl-12 text-base sm:text-[17px] text-[#262820]/85 leading-relaxed font-serif"
                        >
                          {qa.answer}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ====================================================================
          4. SCHEDULE SECTION (Ivory #FAF7F0 — Chronological Day Grouping)
      ==================================================================== */}
      <section
        id="schedule"
        {...scheduleTypoProps}
        className="scroll-mt-20 py-16 sm:py-24 px-4 sm:px-6 border-b border-[#07543E]/10 bg-[#FAF7F0]"
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10 sm:mb-12">
            <div className="max-w-2xl">
              <p
                data-typo="label"
                className="text-xs sm:text-sm uppercase tracking-[0.22em] text-[#737746] font-semibold mb-2"
              >
                Schedule of Events
              </p>
              <h2
                data-typo="heading"
                className="font-serif text-[34px] sm:text-5xl lg:text-[52px] font-semibold text-[#07543E] text-balance leading-tight mb-3"
              >
                December 11 – 12, 2026
              </h2>
              <p data-typo="caption" className="text-base sm:text-lg text-[#262820]/80">
                All event times are in West Africa Time (Africa/Lagos).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div
                role="tablist"
                aria-label="Filter schedule by wedding day"
                className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#F2EBDD] border border-[#07543E]/10 w-full sm:w-auto"
              >
                {[
                  { id: 'all', label: `All Events (${siteContent.scheduleEvents.length})` },
                  { id: 'dec-11', label: 'Fri, Dec 11' },
                  { id: 'dec-12', label: 'Sat, Dec 12' }
                ].map((tab) => {
                  const active = scheduleFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      data-typo="button"
                      onClick={() => setScheduleFilter(tab.id as 'all' | 'dec-11' | 'dec-12')}
                      className={`px-3 min-h-[44px] flex-1 sm:flex-initial text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-[#07543E] text-white'
                          : 'text-[#262820]/80 hover:text-[#07543E]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                data-typo="button"
                onClick={onOpenDressCode}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 min-h-[44px] text-xs sm:text-sm font-semibold text-[#07543E] border border-[#C5A04A]/50 bg-[#FFFDF8] hover:bg-[#F2EBDD] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Palette className="w-4 h-4 text-[#C5A04A]" />
                <span>Attire Guide</span>
              </button>
            </div>
          </div>

          {/* Venue Editorial Photo (Natural framing, no artificial "Fig." caption) */}
          {!scheduleImage.hidden && (
            <div className="mb-12">
              <EditorialPhoto
                src={scheduleImage.fileUrl}
                alt={scheduleImage.altText || WEDDING_PHOTOS.schedule.alt}
                coupleNames={siteContent.coupleNames}
                imgClassName={`w-full h-64 sm:h-80 lg:h-[380px] ${getImageFitClass(scheduleImage.fitMode)} ${getImageObjectPositionClass(scheduleImage.focalPosition, 'schedule')}`}
              />
            </div>
          )}

          {/* Chronological Day Groups */}
          <div className="space-y-12" ref={calendarContainerRef}>
            {groupedSchedule.map((group) => (
              <div key={group.heading} className="space-y-5">
                <div className="flex items-center gap-3 pb-3 border-b border-[#C5A04A]/35">
                  <Calendar className="w-4 h-4 text-[#C5A04A] shrink-0" />
                  <h3
                    data-typo="label"
                    className="font-sans text-xs sm:text-sm font-bold tracking-[0.18em] sm:tracking-[0.2em] uppercase text-[#07543E]"
                  >
                    {group.heading}
                  </h3>
                </div>

                <div className="divide-y divide-[#07543E]/12 rounded-xl bg-[#FFFDF8] border border-[#07543E]/12">
                  {group.events.map((ev) => {
                    const mapUrl = buildMapSearchUrl(ev.venueQuery);
                    const directionsUrl = buildDirectionsUrl(ev.venueQuery);
                    const gcalUrl = buildGoogleCalendarUrl(ev, siteContent.coupleNames);
                    const isCalMenuOpen = openCalendarMenuId === ev.id;

                    return (
                      <article
                        key={ev.id}
                        className="p-5 min-[360px]:p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start"
                      >
                        {/* Left Column: Time & Quick Attributes */}
                        <div className="lg:col-span-4 space-y-2.5">
                          <div className="inline-flex items-center gap-2 text-sm sm:text-base font-mono font-semibold tabular-nums text-[#07543E]">
                            <Clock className="w-4 h-4 text-[#C5A04A] shrink-0" />
                            <span>{ev.timeLabel}</span>
                          </div>

                          {ev.dressCode && (
                            <p data-typo="caption" className="text-sm text-[#737746] font-medium">
                              Dress Code: <span className="text-[#262820]">{ev.dressCode}</span>
                            </p>
                          )}

                          {ev.coloursOfDay && (
                            <p data-typo="caption" className="text-sm text-[#737746] font-medium">
                              Colours of the day:{' '}
                              <span className="text-[#262820]">{ev.coloursOfDay}</span>
                            </p>
                          )}
                        </div>

                        {/* Right Column: Title, Description, Venue & Interactive Map / Calendar Actions */}
                        <div className="lg:col-span-8 space-y-4 min-w-0">
                          <h4
                            data-typo="subheading"
                            className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E] leading-snug break-words"
                          >
                            {ev.title}
                          </h4>

                          <p
                            data-typo="body"
                            className="text-base sm:text-[17px] text-[#262820]/85 leading-relaxed whitespace-pre-line max-w-2xl break-words"
                          >
                            {ev.description}
                          </p>

                          <div className="flex items-start gap-2.5 text-sm sm:text-base pt-1">
                            <MapPin className="w-4 h-4 text-[#07543E] shrink-0 mt-1" />
                            <p data-typo="caption" className="font-medium text-[#262820] break-words">
                              {ev.venueName}
                            </p>
                          </div>

                          {/* Action Buttons: Map, Directions, Add to Calendar */}
                          <div className="pt-2 flex flex-wrap items-center gap-2.5">
                            <a
                              href={mapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] text-xs sm:text-sm font-semibold text-[#07543E] transition-colors"
                            >
                              <MapPin className="w-3.5 h-3.5 text-[#C5A04A]" />
                              <span>Map</span>
                              <ExternalLink className="w-3 h-3 opacity-60" />
                            </a>

                            <a
                              href={directionsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] text-xs sm:text-sm font-semibold text-[#07543E] transition-colors"
                            >
                              <Navigation className="w-3.5 h-3.5 text-[#737746]" />
                              <span>Directions</span>
                            </a>

                            <div className="relative" data-calendar-menu-root="true">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenCalendarMenuId(isCalMenuOpen ? null : ev.id)
                                }
                                aria-expanded={isCalMenuOpen}
                                aria-haspopup="menu"
                                className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                              >
                                <Calendar className="w-3.5 h-3.5 text-[#F3E5AB]" />
                                <span>Add to Calendar</span>
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>

                              {isCalMenuOpen && (
                                <div
                                  role="menu"
                                  className="absolute left-0 mt-1.5 w-52 max-w-[calc(100vw-2.5rem)] rounded-lg bg-white border border-[#07543E]/15 shadow-lg z-20 py-1 text-sm"
                                >
                                  <a
                                    role="menuitem"
                                    href={gcalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setOpenCalendarMenuId(null)}
                                    className="flex items-center justify-between px-3.5 min-h-[44px] text-[#262820] hover:bg-[#FAF7F0] font-medium"
                                  >
                                    <span>Google Calendar</span>
                                    <ExternalLink className="w-3.5 h-3.5 text-[#07543E]" />
                                  </a>
                                  <button
                                    role="menuitem"
                                    type="button"
                                    onClick={() => {
                                      downloadIcsFile(ev, siteContent.coupleNames);
                                      setOpenCalendarMenuId(null);
                                    }}
                                    className="w-full flex items-center justify-between px-3.5 min-h-[44px] text-[#262820] hover:bg-[#FAF7F0] font-medium text-left cursor-pointer"
                                  >
                                    <span>Apple / Outlook (.ics)</span>
                                    <Download className="w-3.5 h-3.5 text-[#07543E]" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====================================================================
          4B. INTERACTIVE 3×3 WEDDING PHOTO PUZZLE (Optional Admin Toggle)
      ==================================================================== */}
      {siteContent.puzzleEnabled !== false && (
        <WeddingPhotoPuzzleSection
          puzzleImageUrl={puzzleImage.fileUrl}
          coupleNames={siteContent.coupleNames}
          musicEnabled={siteContent.musicEnabled !== false}
          availableSongs={availableSongs}
          activeSongId={activeSongId}
          onSelectSong={onSelectSong}
          typography={siteContent.sectionTypography?.puzzle}
        />
      )}

      {/* ====================================================================
          4C. GIFTING & SUPPORT SECTION (Immediately After Puzzle, Before Q&A)
      ==================================================================== */}
      {siteContent.giftingEnabled !== false && (
        <GiftingSection
          heading={siteContent.giftingHeading || 'Gifting & Support'}
          intro={
            siteContent.giftingIntro ||
            'Your presence, prayers, and warm wishes mean the world to us. For family and friends who would like to bless our new home with a monetary gift, our details are shared below with heartfelt gratitude.'
          }
          closing={siteContent.giftingClosing || 'Thank you for celebrating with us.'}
          accountName={siteContent.giftingAccountName || 'Joseph John'}
          bankName={siteContent.giftingBankName || 'Opay'}
          accountNumber={siteContent.giftingAccountNumber || '8065013009'}
          typography={siteContent.sectionTypography?.gifting}
        />
      )}

      {/* ====================================================================
          5. GUEST Q&A SECTION (Soft Cream #F2EBDD)
      ==================================================================== */}
      <section
        id="faq"
        {...faqTypoProps}
        className="scroll-mt-20 py-16 sm:py-24 px-4 sm:px-6 border-b border-[#07543E]/10 bg-[#F2EBDD]"
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left Column: Heading, Intro & Natural Portrait */}
            <div className="lg:col-span-5 lg:sticky lg:top-24">
              <p
                data-typo="label"
                className="text-xs sm:text-sm uppercase tracking-[0.22em] text-[#737746] font-semibold mb-2"
              >
                Q &amp; A
              </p>
              <h2
                data-typo="heading"
                className="font-serif text-[34px] sm:text-5xl lg:text-[52px] font-semibold text-[#07543E] text-balance leading-tight mb-4"
              >
                Guest Information
              </h2>
              <p
                data-typo="body"
                className="text-base sm:text-lg text-[#262820]/80 leading-relaxed mb-6"
              >
                {AUTHORITATIVE_QA_INTRO}
              </p>

              {!qaImage.hidden && (
                <EditorialPhoto
                  src={qaImage.fileUrl}
                  alt={qaImage.altText || WEDDING_PHOTOS.qa.alt}
                  coupleNames={siteContent.coupleNames}
                  imgClassName={`w-full h-80 sm:h-96 lg:h-[440px] ${getImageFitClass(qaImage.fitMode)} ${getImageObjectPositionClass(qaImage.focalPosition, 'qa')}`}
                />
              )}
            </div>

            {/* Right Column: Accessible Accordion with Search */}
            <div className="lg:col-span-7 space-y-5">
              <div className="relative">
                <Search className="w-4 h-4 text-[#07543E]/55 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={faqQuery}
                  onChange={(e) => setFaqQuery(e.target.value)}
                  placeholder="Search questions (e.g. arrive, dress code, photos, venues)..."
                  aria-label="Search guest questions"
                  className="w-full pl-10 pr-4 py-3 min-h-[48px] text-base sm:text-sm rounded-xl bg-[#FAF7F0] border border-[#07543E]/20 text-[#262820] placeholder-[#262820]/45 focus:outline-none focus:border-[#07543E] focus:ring-2 focus:ring-[#07543E]/15"
                />
              </div>

              {filteredFaqs.length === 0 ? (
                <div className="p-8 rounded-xl bg-[#FAF7F0] border border-[#07543E]/12 text-center">
                  <p data-typo="body" className="text-base text-[#262820]/75 mb-2">
                    No questions matched &ldquo;{faqQuery}&rdquo;.
                  </p>
                  <button
                    type="button"
                    data-typo="button"
                    onClick={() => setFaqQuery('')}
                    className="min-h-[44px] inline-flex items-center text-sm font-semibold text-[#07543E] underline underline-offset-4 cursor-pointer"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[#07543E]/12 rounded-xl bg-[#FAF7F0] border border-[#07543E]/12 overflow-hidden">
                  {filteredFaqs.map((faq, idx) => {
                    const isOpen = faqQuery.trim().length > 0 || Boolean(openFaqIds[faq.id]);
                    const panelId = `guest-faq-panel-${faq.id}`;
                    return (
                      <div key={faq.id} className="px-5 sm:px-7 py-4 sm:py-5">
                        <button
                          type="button"
                          onClick={() => toggleFaq(faq.id)}
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          className="w-full min-h-[48px] flex items-center justify-between gap-4 text-left cursor-pointer group"
                        >
                          <div className="flex items-baseline gap-3">
                            <span className="font-mono text-xs text-[#C5A04A] font-semibold shrink-0 tabular-nums">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <h3
                              data-typo="subheading"
                              className="font-serif text-lg sm:text-xl font-semibold text-[#07543E] group-hover:text-[#073B2B] transition-colors"
                            >
                              {faq.question}
                            </h3>
                          </div>
                          <ChevronDown
                            className={`w-4 h-4 text-[#07543E]/70 shrink-0 transition-transform duration-200 ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {isOpen && (
                          <div
                            id={panelId}
                            data-typo="body"
                            className="mt-3 pl-0 sm:pl-9 text-base sm:text-[17px] text-[#262820]/85 leading-relaxed whitespace-pre-line break-words"
                          >
                            {faq.answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================
          6. LIVE RSVP SECTION (Ivory #FAF7F0 — Real Firestore Submission)
      ==================================================================== */}
      <RsvpSection
        coupleNames={siteContent.coupleNames}
        rsvpOpen={siteContent.rsvpOpen}
        maxGuestsPerRsvp={siteContent.maxGuestsPerRsvp}
        contactName={siteContent.contactName}
        contactPhone={siteContent.contactPhone}
        typography={siteContent.sectionTypography?.rsvp}
      />

      {/* ====================================================================
          7. WEDDING HIGHLIGHTS SLIDESHOW + SERVER-LOCKED GUEST GALLERY
      ==================================================================== */}
      <GallerySection
        galleryPublicEnabled={siteContent.galleryPublicEnabled}
        galleryUnlockISO={siteContent.galleryUnlockISO}
        coupleNames={siteContent.coupleNames}
        slideshowItems={siteContent.slideshowItems}
        slideshowAutoplay={siteContent.slideshowAutoplay}
        slideshowIntervalMs={siteContent.slideshowIntervalMs}
        typography={siteContent.sectionTypography?.gallery}
      />

      {/* ====================================================================
          8. INTERACTIVE INVITATION & WEDDING CHALLENGE EXPERIENCE
      ==================================================================== */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-[#073B2B] text-[#FAF7F0]">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs sm:text-sm uppercase tracking-[0.24em] text-[#F3E5AB] font-semibold mb-3">
            {siteContent.hashtag} · Guest Experience
          </p>

          <h2 className="font-serif text-[34px] sm:text-5xl font-semibold text-white text-balance leading-tight mb-4">
            Unseal Our Digital Invitation
          </h2>

          <p className="font-serif italic text-base sm:text-xl text-[#FAF7F0]/85 max-w-2xl mx-auto mb-8 leading-relaxed">
            Open our emerald &amp; gold wax-sealed digital invitation and take our playful 5-question Wedding Challenge to claim your official {siteContent.hashtag} guest pass.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3.5 sm:gap-4 max-w-sm sm:max-w-none mx-auto">
            <button
              type="button"
              onClick={onGoInvitation}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 min-h-[48px] rounded-xl bg-[#C5A04A] hover:bg-[#D4B05B] text-[#073B2B] text-xs sm:text-sm font-bold uppercase tracking-[0.14em] transition-colors shadow-lg cursor-pointer whitespace-nowrap shrink-0"
            >
              <MailOpen className="w-4 h-4" />
              <span>Open Digital Invitation</span>
            </button>

            <button
              type="button"
              onClick={onGoChallenge}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] rounded-xl border border-[#F3E5AB]/50 hover:bg-white/10 text-white text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Heart className="w-4 h-4 text-[#F3E5AB]" />
              <span>Play Wedding Challenge</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
