import React from 'react';
import { Heart, Lock } from 'lucide-react';

interface FooterProps {
  coupleNames: string;
  hashtag: string;
  weddingDateDisplay: string;
  footerNote: string;
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
  onNavigateSection,
  onGoInvitation,
  onGoChallenge,
  onGoAdmin
}) => {
  return (
    <footer className="w-full border-t border-[#C5A04A]/25 bg-[#FAF7F0] py-10 sm:py-12 px-4 text-center text-xs text-[#262820]/70 mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
        <p className="font-serif text-2xl font-semibold text-[#07543E] tracking-wide">
          {coupleNames}
        </p>

        <p className="text-xs text-[#262820]/75">
          <span>{weddingDateDisplay}</span>
          <span className="mx-2 text-[#C5A04A]" aria-hidden="true">·</span>
          <span>Abuja, Nigeria</span>
          <span className="mx-2 text-[#C5A04A]" aria-hidden="true">·</span>
          <span className="font-semibold text-[#07543E]">{hashtag}</span>
        </p>

        {onNavigateSection && (
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-1 text-xs font-medium text-[#07543E]">
            <button type="button" onClick={() => onNavigateSection('welcome')} className="hover:underline underline-offset-4 cursor-pointer">
              Welcome
            </button>
            <button type="button" onClick={() => onNavigateSection('story')} className="hover:underline underline-offset-4 cursor-pointer">
              Our Story
            </button>
            <button type="button" onClick={() => onNavigateSection('schedule')} className="hover:underline underline-offset-4 cursor-pointer">
              Schedule
            </button>
            <button type="button" onClick={() => onNavigateSection('faq')} className="hover:underline underline-offset-4 cursor-pointer">
              Q&amp;A
            </button>
            <button type="button" onClick={() => onNavigateSection('rsvp')} className="hover:underline underline-offset-4 cursor-pointer">
              RSVP
            </button>
            <button type="button" onClick={() => onNavigateSection('gallery')} className="hover:underline underline-offset-4 cursor-pointer">
              Gallery
            </button>
            {onGoInvitation && (
              <button type="button" onClick={onGoInvitation} className="hover:underline underline-offset-4 cursor-pointer">
                Digital Invite
              </button>
            )}
            {onGoChallenge && (
              <button type="button" onClick={onGoChallenge} className="hover:underline underline-offset-4 cursor-pointer">
                Guest Challenge
              </button>
            )}
          </div>
        )}

        <div className="h-[1px] w-24 bg-[#C5A04A]/35 my-1" />

        <div className="flex flex-col sm:flex-row items-center gap-3 text-[11px] text-[#262820]/55">
          <span className="inline-flex items-center gap-1">
            {footerNote} <Heart className="w-3 h-3 fill-[#C5A04A] text-[#C5A04A]" />
          </span>
          {onGoAdmin && (
            <>
              <span className="hidden sm:inline text-[#C5A04A]" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onGoAdmin}
                className="inline-flex items-center gap-1 text-[#262820]/60 hover:text-[#07543E] underline underline-offset-4 cursor-pointer transition-colors"
              >
                <Lock className="w-3 h-3" />
                <span>Couple Admin</span>
              </button>
            </>
          )}
        </div>
      </div>
    </footer>
  );
};
