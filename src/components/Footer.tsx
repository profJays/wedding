import React from 'react';
import { Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-[#0F5132]/10 py-6 sm:py-8 px-4 text-center text-xs text-[#18261D]/60 mt-auto">
      <div className="max-w-4xl mx-auto flex flex-col items-center gap-2.5">
        <p className="font-serif italic text-sm text-[#0F5132]">
          Celebrating the Wedding of Damilola &amp; Joseph
        </p>

        <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
          <span>Official Wedding Registry &amp; Venue Details:</span>
          <a
            href="https://withjoy.com/joseph-and-damilola"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0F5132] font-semibold underline underline-offset-4 hover:text-[#0B4627] transition-colors"
          >
            withjoy.com/joseph-and-damilola
          </a>
        </div>

        <p className="text-[11px] text-[#18261D]/45 flex items-center gap-1">
          Crafted with love <Heart className="w-3 h-3 fill-[#D4AF37] text-[#D4AF37]" /> for our beloved guests &amp; family
        </p>
      </div>
    </footer>
  );
};
