import React from 'react';
import { Heart, Lock } from 'lucide-react';

interface FooterProps {
  coupleNames: string;
  hashtag: string;
  weddingDateDisplay: string;
  footerNote: string;
  puzzleEnabled?: boolean;
  onNavigateSection?: (sectionId: string) => void;
  onGoInvitation?: () => void;
  onGoChallenge?: () => void;
  onGoAdmin?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  coupleNames,
  hashtag,
  weddingDateDisplay,
  footerNote,
  puzzleEnabled = true,
  onNavigateSection,
  onGoInvitation,
  onGoChallenge,
  onGoAdmin
}) => {
  return (
    <footer className="w-full border-t border-[#C5A04A]/25 bg-[#FAF7F0] py-10 sm:py-12 px-4 text-center text-sm text-[#262820]/75 mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
        <p className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E] tracking-wide">
          {coupleNames}
        </p>

        <p className="text-sm text-[#262820]/80 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>{weddingDateDisplay}</span>
          <span className="text-[#C5A04A]" aria-hidden="true">·</span>
          <span>Abuja, Nigeria</span>
          <span className="text-[#C5A04A]" aria-hidden="true">·</span>
          <span className="font-semibold text-[#07543E]">{hashtag}</span>
        </p>

        {onNavigateSection && (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 text-sm font-medium text-[#07543E]">
            <button type="button" onClick={() => onNavigateSection('welcome')} className="min-h-[44px] inline-flex items-center px-1.5 hover:underline underline-offset-4 cursor-pointer">
              Welcome
            </button>
            <button type="button" onClick={() => onNavigateSection('story')} className="min-h-[44px] inline-flex items-center px-1.5 hover:underline underline-offset-4 cursor-pointer">
              Our Story
            </button>
            <button type="button" onClick={() => onNavigateSection('schedule')} className="min-h-[44px] inline-flex items-center px-1.5 hover:underline underline-offset-4 cursor-pointer">
              Schedule
            </button>
            {puzzleEnabled && (
              <button type="button" onClick={() => onNavigateSection('puzzle')} className="min-h-[44px] inline-flex items-center px-1.5 hover:underline underline-offset-4 cursor-pointer">
                Photo Puzzle
              </button>
            )}
            <button type="button" onClick={() => onNavigateSection('faq')} className="min-h-[44px] inline-flex items-center px-1.5 hover:underline underline-offset-4 cursor-pointer">
              Q&amp;A
            </button>
            <button type="button" onClick={() => onNavigateSection('rsvp')} className="min-h-[44px] inline-flex items-center px-1.5 hover:underline underline-offset-4 cursor-pointer">
              RSVP
            </button>
            <button type="button" onClick={() => onNavigateSection('gallery')} className="min-h-[44px] inline-flex items-center px-1.5 hover:underline underline-offset-4 cursor-pointer">
              Gallery
            </button>
            {onGoInvitation && (
              <button type="button" onClick={onGoInvitation} className="min-h-[44px] inline-flex items-center px-1.5 hover:underline underline-offset-4 cursor-pointer">
                Digital Invite
              </button>
            )}
            {onGoChallenge && (
              <button type="button" onClick={onGoChallenge} className="min-h-[44px] inline-flex items-center px-1.5 hover:underline underline-offset-4 cursor-pointer">
                Guest Challenge
              </button>
            )}
          </div>
        )}

        <div className="h-[1px] w-24 bg-[#C5A04A]/35 my-1" />

        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-xs sm:text-sm text-[#262820]/65">
          <span className="inline-flex items-center gap-1.5">
            {footerNote} <Heart className="w-3.5 h-3.5 fill-[#C5A04A] text-[#C5A04A]" />
          </span>
          {onGoAdmin && (
            <>
              <span className="hidden sm:inline text-[#C5A04A]" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onGoAdmin}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-2 text-[#262820]/70 hover:text-[#07543E] underline underline-offset-4 cursor-pointer transition-colors"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Couple Admin</span>
              </button>
            </>
          )}
        </div>
      </div>
    </footer>
  );
};
