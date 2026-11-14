import React from 'react';
import { ExternalLink } from 'lucide-react';

interface HeaderProps {
  onGoHome: () => void;
  onOpenFaq?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onGoHome, onOpenFaq }) => {
  return (
    <header className="w-full border-b border-[#0F5132]/10 bg-[#FAF8F5]/90 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Brand wordmark in editorial serif */}
        <button
          onClick={onGoHome}
          className="text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132] rounded-sm shrink-0"
        >
          <span className="font-serif text-base sm:text-xl font-bold tracking-[0.16em] text-[#0F5132] uppercase transition-colors group-hover:text-[#0B4627] whitespace-nowrap">
            Damilola &amp; Joseph
          </span>
        </button>

        {/* Zone 2: 4 single-line links with subtle hover underlines */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium tracking-wider uppercase text-[#18261D]/75">
          <button
            onClick={onGoHome}
            className="hover:text-[#0F5132] transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-8"
          >
            Invitation
          </button>
          <a
            href="#challenge"
            onClick={(e) => {
              e.preventDefault();
              onGoHome();
            }}
            className="hover:text-[#0F5132] transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-8"
          >
            The Challenge
          </a>
          {onOpenFaq && (
            <button
              onClick={onOpenFaq}
              className="hover:text-[#0F5132] transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-8"
            >
              Colors &amp; Dress Code
            </button>
          )}
          <a
            href="https://withjoy.com/joseph-and-damilola"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#0F5132] transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-8 inline-flex items-center gap-1"
          >
            Registry &amp; RSVP
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="https://withjoy.com/joseph-and-damilola"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-xs font-semibold tracking-wider uppercase text-white bg-[#0F5132] hover:bg-[#0B4627] active:bg-[#06301A] transition-all rounded-md shadow-xs whitespace-nowrap shrink-0 border border-[#D4AF37]/30"
          >
            <span className="hidden xs:inline">Wedding</span>
            <span>Website</span>
            <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-80" />
          </a>
        </div>
      </div>
    </header>
  );
};
