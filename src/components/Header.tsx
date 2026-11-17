import React, { useState, useEffect } from 'react';
import { Menu, Pause, Play, X } from 'lucide-react';
import { AppView } from '../types';

interface HeaderProps {
  coupleNames: string;
  activeView: AppView;
  puzzleEnabled?: boolean;
  showMusicToggle?: boolean;
  isMusicPlaying?: boolean;
  hasMusicTrack?: boolean;
  onToggleMusic?: () => void;
  onNavigateSection: (sectionId: string) => void;
  onGoInvitation: () => void;
  onGoChallenge: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  coupleNames,
  activeView,
  puzzleEnabled = true,
  showMusicToggle = false,
  isMusicPlaying = false,
  hasMusicTrack = false,
  onToggleMusic,
  onNavigateSection,
  onGoInvitation,
  onGoChallenge
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const leftNavItems = [
    { id: 'welcome', label: 'Welcome' },
    { id: 'story', label: 'Our Story' },
    { id: 'schedule', label: 'Schedule' }
  ];

  const rightNavItems = [
    ...(puzzleEnabled ? [{ id: 'puzzle', label: 'Puzzle' }] : []),
    { id: 'faq', label: 'Q&A' },
    { id: 'rsvp', label: 'RSVP' },
    { id: 'gallery', label: 'Gallery' }
  ];

  const navItems = [...leftNavItems, ...rightNavItems];

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  const handleSectionClick = (sectionId: string) => {
    setMobileMenuOpen(false);
    onNavigateSection(sectionId);
  };

  return (
    <header className="w-full border-b border-[#C5A04A]/25 bg-[#FAF7F0]/95 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-2.5 min-[380px]:px-4 sm:px-6 h-16 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-3">
        {/* Left Track: Single-line serif brand wordmark + Left Desktop Navigation */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <button
            type="button"
            onClick={() => handleSectionClick('top')}
            className="font-serif text-sm min-[380px]:text-base sm:text-xl lg:text-base xl:text-xl font-semibold tracking-[0.04em] min-[380px]:tracking-[0.08em] sm:tracking-[0.12em] lg:tracking-[0.08em] xl:tracking-[0.14em] text-[#07543E] uppercase hover:text-[#073B2B] transition-colors whitespace-nowrap truncate min-w-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#07543E] rounded-sm min-h-[44px] inline-flex items-center"
          >
            {coupleNames}
          </button>

          <nav
            aria-label="Primary Navigation Left"
            className="hidden lg:flex items-center gap-3 xl:gap-5 text-[11px] xl:text-[13px] font-medium tracking-[0.08em] xl:tracking-[0.14em] uppercase text-[#262820]/80 shrink-0"
          >
            {leftNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSectionClick(item.id)}
                className="hover:text-[#07543E] transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-8 cursor-pointer py-2"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Center Track: Discreet, centered background music Play/Pause icon */}
        <div className="flex items-center justify-center shrink-0">
          {showMusicToggle ? (
            <button
              type="button"
              onClick={onToggleMusic}
              aria-label={
                isMusicPlaying
                  ? 'Pause background music'
                  : hasMusicTrack
                  ? 'Play background music'
                  : 'Background music (no track uploaded)'
              }
              aria-pressed={isMusicPlaying}
              title={
                isMusicPlaying
                  ? 'Pause music'
                  : hasMusicTrack
                  ? 'Play music'
                  : 'Wedding track not uploaded yet'
              }
              className={`inline-flex items-center justify-center w-11 h-11 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#07543E] ${
                hasMusicTrack
                  ? 'text-[#07543E]/80 hover:text-[#07543E] hover:bg-[#07543E]/8 active:bg-[#07543E]/12'
                  : 'text-[#07543E]/40 hover:text-[#07543E]/65'
              }`}
            >
              {isMusicPlaying ? (
                <Pause className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          ) : (
            <span aria-hidden="true" className="w-0 h-11" />
          )}
        </div>

        {/* Right Track: Right Desktop Navigation + Puzzle CTA + Mobile Drawer Button */}
        <div className="flex items-center justify-end lg:justify-between gap-1 sm:gap-2 min-w-0">
          <nav
            aria-label="Primary Navigation Right"
            className="hidden lg:flex items-center gap-3 xl:gap-5 text-[11px] xl:text-[13px] font-medium tracking-[0.08em] xl:tracking-[0.14em] uppercase text-[#262820]/80 shrink-0"
          >
            {rightNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSectionClick(item.id)}
                className="hover:text-[#07543E] transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-8 cursor-pointer py-2"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto lg:ml-0">
            {puzzleEnabled && (
              <button
                type="button"
                onClick={() => handleSectionClick('puzzle')}
                className="inline-flex items-center justify-center px-2.5 min-[460px]:px-3 sm:px-4 min-h-[44px] text-[11px] sm:text-xs font-semibold tracking-[0.06em] min-[460px]:tracking-[0.1em] sm:tracking-[0.14em] uppercase text-white bg-[#07543E] hover:bg-[#073B2B] transition-colors rounded-lg whitespace-nowrap shrink-0 border border-[#C5A04A]/45 cursor-pointer"
              >
                <span className="min-[460px]:hidden">Puzzle</span>
                <span className="hidden min-[460px]:inline">Solve a puzzle</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lg:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg text-[#07543E] hover:bg-[#07543E]/8 transition-colors cursor-pointer shrink-0"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-[#C5A04A]/20 bg-[#FAF7F0] px-4 py-3 shadow-md">
          <nav
            aria-label="Mobile Navigation"
            className="grid grid-cols-2 gap-2 text-sm font-medium uppercase tracking-wider text-[#262820]"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSectionClick(item.id)}
                className="text-left px-3 min-h-[44px] flex items-center rounded-md hover:bg-[#07543E]/8 text-[#07543E] cursor-pointer"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onGoInvitation();
              }}
              className="text-left px-3 min-h-[44px] flex items-center rounded-md hover:bg-[#07543E]/8 text-[#07543E] cursor-pointer"
            >
              Digital Invite
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onGoChallenge();
              }}
              className={`col-span-2 text-left px-3 min-h-[46px] flex items-center rounded-md font-semibold cursor-pointer ${
                activeView === 'welcome' || activeView === 'quiz'
                  ? 'bg-[#07543E] text-white'
                  : 'bg-[#F2EBDD] text-[#07543E]'
              }`}
            >
              Wedding Guest Challenge
            </button>
          </nav>
        </div>
      )}
    </header>
  );
};
