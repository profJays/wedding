import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { AppView } from '../types';

interface HeaderProps {
  coupleNames: string;
  activeView: AppView;
  onNavigateSection: (sectionId: string) => void;
  onGoInvitation: () => void;
  onGoChallenge: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  coupleNames,
  activeView,
  onNavigateSection,
  onGoInvitation,
  onGoChallenge
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      <div className="max-w-6xl mx-auto px-3 min-[360px]:px-4 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-6">
        {/* Zone 1: Single-line serif brand wordmark */}
        <button
          type="button"
          onClick={() => handleSectionClick('top')}
          className="font-serif text-base min-[360px]:text-lg sm:text-xl font-semibold tracking-[0.08em] sm:tracking-[0.14em] text-[#07543E] uppercase hover:text-[#073B2B] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#07543E] rounded-sm min-h-[44px] inline-flex items-center"
        >
          {coupleNames}
        </button>

        {/* Zone 2: Clean typographic navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden lg:flex items-center gap-6 text-xs lg:text-[13px] font-medium tracking-[0.14em] uppercase text-[#262820]/80"
        >
          {[
            { id: 'welcome', label: 'Welcome' },
            { id: 'story', label: 'Our Story' },
            { id: 'schedule', label: 'Schedule' },
            { id: 'faq', label: 'Q&A' },
            { id: 'rsvp', label: 'RSVP' },
            { id: 'gallery', label: 'Gallery' }
          ].map((item) => (
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

        {/* Zone 3: Single primary CTA + Mobile Drawer Button */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              onGoInvitation();
            }}
            className="inline-flex items-center justify-center px-3 sm:px-4 min-h-[44px] text-xs font-semibold tracking-[0.1em] sm:tracking-[0.14em] uppercase text-white bg-[#07543E] hover:bg-[#073B2B] transition-colors rounded-lg whitespace-nowrap shrink-0 border border-[#C5A04A]/45 cursor-pointer"
          >
            Digital Invite
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="lg:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg text-[#07543E] hover:bg-[#07543E]/8 transition-colors cursor-pointer"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Collapsible Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-[#C5A04A]/20 bg-[#FAF7F0] px-4 py-3 shadow-md">
          <nav
            aria-label="Mobile Navigation"
            className="grid grid-cols-2 gap-2 text-sm font-medium uppercase tracking-wider text-[#262820]"
          >
            {[
              { id: 'welcome', label: 'Welcome' },
              { id: 'story', label: 'Our Story' },
              { id: 'schedule', label: 'Schedule' },
              { id: 'faq', label: 'Q&A' },
              { id: 'rsvp', label: 'RSVP' },
              { id: 'gallery', label: 'Gallery' }
            ].map((item) => (
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
