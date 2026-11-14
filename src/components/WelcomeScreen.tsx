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
      <div className="stationery-card rounded-2xl p-5 sm:p-9 text-center relative overflow-hidden border border-[#D4AF37]/30">
        {/* Subtle decorative gold corner flourishes */}
        <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-[#D4AF37]/60 rounded-tl-xs pointer-events-none" />
        <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-[#D4AF37]/60 rounded-tr-xs pointer-events-none" />
        <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-[#D4AF37]/60 rounded-bl-xs pointer-events-none" />
        <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-[#D4AF37]/60 rounded-br-xs pointer-events-none" />

        {/* Inner bordered enclosure */}
        <div className="p-4 sm:p-6 rounded-xl border border-[#0F5132]/15 bg-gradient-to-b from-white via-[#FAF8F5]/60 to-white">
          {/* Monogram Crest */}
          <div className="mb-3 sm:mb-4 flex justify-center">
            <Crest size="lg" className="animate-float" />
          </div>

          {/* Invitation Kicker */}
          <p className="font-serif italic text-sm sm:text-base text-[#556B2F] tracking-wide mb-1">
            You're invited. But first...
          </p>

          {/* Couple Names: Damilola & Joseph */}
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold tracking-[0.12em] text-[#0F5132] uppercase mb-2">
            Damilola &amp; Joseph
          </h1>

          {/* Subtitle / Challenge Hook */}
          <div className="inline-flex items-center justify-center gap-2 mb-4">
            <span className="h-[1px] w-6 sm:w-10 bg-[#D4AF37]/50" />
            <p className="font-sans text-xs sm:text-sm font-semibold text-[#556B2F] tracking-wider uppercase">
              Let's see if you're wedding-ready!
            </p>
            <span className="h-[1px] w-6 sm:w-10 bg-[#D4AF37]/50" />
          </div>

          {/* Colors of the Day Banner */}
          <div className="mb-5 inline-flex flex-wrap items-center justify-center gap-2 px-3 py-1.5 rounded-full bg-[#FAF8F5] border border-[#D4AF37]/40 shadow-2xs">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[#18261D]/70">
              Colors of the Day:
            </span>
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <span className="inline-flex items-center gap-1 text-[#0F5132] font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0F5132] inline-block shadow-xs" />
                Emerald
              </span>
              <span className="text-[#D4AF37]">·</span>
              <span className="inline-flex items-center gap-1 text-[#556B2F] font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-[#556B2F] inline-block shadow-xs" />
                Olive
              </span>
              <span className="text-[#D4AF37]">·</span>
              <span className="inline-flex items-center gap-1 text-[#B38F37] font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] inline-block shadow-xs" />
                Gold
              </span>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-[#18261D]/75 leading-relaxed max-w-sm mx-auto mb-5 sm:mb-6">
            Before we assign your seat and pour the chilled palm wine &amp; champagne,
            prove you understand the etiquette, enthusiasm, and cardinal rules of Damilola &amp; Joseph's celebration!
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
            <p className="text-[10px] text-[#18261D]/50 mt-1 italic text-center">
              Leave blank to proceed as "Honored Guest"
            </p>
          </div>

          {/* Animated Start Button */}
          <div className="relative flex justify-center mb-5">
            <button
              onClick={onStart}
              className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 text-sm sm:text-base font-semibold tracking-wider uppercase text-white bg-[#0F5132] hover:bg-[#0B4627] active:scale-[0.98] transition-all rounded-xl shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132] focus-visible:ring-offset-2 overflow-hidden cursor-pointer border border-[#D4AF37]/40"
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
              <HeartHandshake className="w-3.5 h-3.5 text-[#D4AF37]" />
              Verified Guest Pass
            </span>
          </div>
        </div>

        {/* Link back to withjoy.com */}
        <div className="mt-3.5 pt-2 text-center">
          <p className="text-[11px] text-[#18261D]/60">
            Official Wedding Registry &amp; Details on{' '}
            <a
              href="https://withjoy.com/joseph-and-damilola"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0F5132] font-semibold underline underline-offset-2 hover:text-[#0B4627]"
            >
              withjoy.com/joseph-and-damilola
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
