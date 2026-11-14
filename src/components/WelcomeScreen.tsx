import React from 'react';
import { Sparkles, ArrowRight, ShieldCheck, HeartHandshake, CheckCircle2 } from 'lucide-react';
import { Crest } from './Crest';

interface WelcomeScreenProps {
  guestName: string;
  onGuestNameChange: (name: string) => void;
  onStart: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  guestName,
  onGuestNameChange,
  onStart
}) => {
  return (
    <div className="w-full max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-8 animate-pop">
      {/* Stationery Outer Card */}
      <div className="stationery-card rounded-2xl p-5 sm:p-9 text-center relative overflow-hidden border border-[#D4AF37]/40">
        {/* Subtle decorative gold corner flourishes */}
        <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-[#D4AF37]/75 rounded-tl-xs pointer-events-none" />
        <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-[#D4AF37]/75 rounded-tr-xs pointer-events-none" />
        <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-[#D4AF37]/75 rounded-bl-xs pointer-events-none" />
        <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-[#D4AF37]/75 rounded-br-xs pointer-events-none" />

        {/* Inner bordered enclosure */}
        <div className="p-4 sm:p-6 rounded-xl border border-[#0F5132]/15 bg-gradient-to-b from-[#FFFDF8] via-[#FAF7F0]/70 to-[#FFFDF8]">
          {/* Monogram Crest */}
          <div className="mb-3 sm:mb-4 flex justify-center">
            <Crest size="lg" className="animate-float" />
          </div>

          {/* Kicker */}
          <p className="font-mono text-[11px] font-semibold tracking-[0.24em] uppercase text-[#556B2F] mb-1">
            #MJ2026 · Wedding Guest Check-In
          </p>

          {/* Couple Names */}
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold tracking-[0.1em] text-[#0F5132] uppercase mb-2">
            Joseph &amp; Damilola
          </h1>

          {/* Subtitle / Challenge Hook */}
          <div className="inline-flex items-center justify-center gap-2 mb-4">
            <span className="h-[1px] w-6 sm:w-10 bg-[#D4AF37]/60" />
            <p className="font-sans text-xs sm:text-sm font-semibold text-[#556B2F] tracking-wider uppercase">
              Let's see if you're wedding-ready!
            </p>
            <span className="h-[1px] w-6 sm:w-10 bg-[#D4AF37]/60" />
          </div>

          {/* Unboxed Colors of the Day Metadata */}
          <div className="mb-5 flex flex-wrap items-center justify-center gap-2 text-[11px] sm:text-xs text-[#18261D]/75">
            <span className="uppercase tracking-wider font-semibold text-[#556B2F]">Palette:</span>
            <span className="inline-flex items-center gap-1 text-[#0F5132] font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#0F5132] inline-block" />
              Emerald
            </span>
            <span className="text-[#D4AF37]" aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-[#556B2F] font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#556B2F] inline-block" />
              Olive
            </span>
            <span className="text-[#D4AF37]" aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-[#A47E22] font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#D4AF37] inline-block" />
              Gold
            </span>
          </div>

          <p className="text-xs sm:text-sm text-[#18261D]/75 leading-relaxed max-w-sm mx-auto mb-5 sm:mb-6">
            Before we unlock our wedding celebration details and reserve your seat,
            prove your wedding etiquette, enthusiasm, and dress code readiness!
          </p>

          {/* Personalized Guest Name Input */}
          <div className="max-w-xs mx-auto mb-6 text-left">
            <label
              htmlFor="guestName"
              className="block text-[11px] font-semibold tracking-wider uppercase text-[#0F5132] mb-1.5"
            >
              Guest Name (For your official pass)
            </label>
            <input
              id="guestName"
              type="text"
              placeholder="e.g. Auntie Sarah, Tunde, Amanda"
              value={guestName}
              onChange={(e) => onGuestNameChange(e.target.value)}
              maxLength={40}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#0F5132]/25 bg-white text-[#18261D] placeholder-[#18261D]/35 focus:outline-none focus:border-[#0F5132] focus:ring-2 focus:ring-[#0F5132]/15 transition-all shadow-2xs"
            />
            <p className="text-[10px] text-[#18261D]/55 mt-1 italic text-center">
              Leave blank to proceed as "Honored Guest"
            </p>
          </div>

          {/* Animated Start Button */}
          <div className="relative flex justify-center mb-5">
            <button
              onClick={onStart}
              className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 min-h-[48px] text-sm sm:text-base font-semibold tracking-wider uppercase text-white bg-[#0F5132] hover:bg-[#0B4627] active:scale-[0.98] transition-all rounded-xl shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 overflow-hidden cursor-pointer border border-[#D4AF37]/60"
            >
              {/* Subtle gold shimmer sweep */}
              <span className="absolute inset-0 w-1/2 h-full bg-white/15 skew-x-12 -translate-x-full group-hover:translate-x-[300%] transition-transform duration-1000 ease-out" />
              
              <Sparkles className="w-4 h-4 text-[#F3E5AB] group-hover:rotate-12 transition-transform" />
              <span>Start The Challenge</span>
              <ArrowRight className="w-4 h-4 text-[#F3E5AB] group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Quick Etiquette Highlights */}
          <div className="pt-3.5 border-t border-[#0F5132]/10 flex flex-wrap items-center justify-center gap-3 text-[11px] text-[#18261D]/70">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#0F5132]" />
              5 Quick Questions
            </span>
            <span className="text-[#D4AF37]">·</span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#556B2F]" />
              1 Cardinal Wardrobe Rule
            </span>
            <span className="text-[#D4AF37]">·</span>
            <span className="inline-flex items-center gap-1">
              <HeartHandshake className="w-3.5 h-3.5 text-[#B38F37]" />
              Verified Guest Pass
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
