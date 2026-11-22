import React from 'react';
import { Sparkles, ArrowRight, ArrowLeft, ShieldCheck, HeartHandshake, CheckCircle2 } from 'lucide-react';
import { Crest } from './Crest';

interface WelcomeScreenProps {
  guestName: string;
  onGuestNameChange: (name: string) => void;
  onStart: () => void;
  onSkipChallenge: () => void;
  onReturnToWebsite: () => void;
  canReturnToWebsite?: boolean;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  guestName,
  onGuestNameChange,
  onStart,
  onSkipChallenge,
  onReturnToWebsite,
  canReturnToWebsite = false
}) => {
  return (
    <div className="w-full max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-8 animate-pop">
      {/* Stationery Outer Card */}
      <div className="stationery-card rounded-2xl p-4 min-[380px]:p-5 sm:p-9 text-center relative overflow-hidden border border-[#C5A04A]/40">
        {/* Subtle decorative gold corner flourishes */}
        <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-[#C5A04A]/75 rounded-tl-xs pointer-events-none" />
        <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-[#C5A04A]/75 rounded-tr-xs pointer-events-none" />
        <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-[#C5A04A]/75 rounded-bl-xs pointer-events-none" />
        <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-[#C5A04A]/75 rounded-br-xs pointer-events-none" />

        {/* Inner bordered enclosure */}
        <div className="p-4 sm:p-6 rounded-xl border border-[#07543E]/15 bg-gradient-to-b from-[#FFFDF8] via-[#FAF7F0]/70 to-[#FFFDF8]">
          {/* Monogram Crest */}
          <div className="mb-3 sm:mb-4 flex justify-center">
            <Crest size="lg" className="animate-float" />
          </div>

          {/* Kicker */}
          <p className="font-mono text-xs font-semibold tracking-[0.16em] text-[#737746] mb-1">
            #mjay2026 · Wedding Guest Check-In
          </p>

          {/* Couple Names */}
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold tracking-[0.08em] text-[#07543E] uppercase mb-2">
            Mary &amp; Joseph
          </h1>

          {/* Subtitle / Challenge Hook */}
          <div className="inline-flex items-center justify-center gap-2 mb-4 max-w-full">
            <span className="h-[1px] w-5 sm:w-10 bg-[#C5A04A]/60 shrink-0" />
            <p className="font-sans text-xs sm:text-sm font-semibold text-[#737746] tracking-wider uppercase">
              Let's see if you're wedding-ready!
            </p>
            <span className="h-[1px] w-5 sm:w-10 bg-[#C5A04A]/60 shrink-0" />
          </div>

          {/* Unboxed Colors of the Day Metadata */}
          <div className="mb-5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-[#262820]/80">
            <span className="uppercase tracking-wider font-semibold text-[#737746]">Palette:</span>
            <span className="inline-flex items-center gap-1.5 text-[#07543E] font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-[#07543E] inline-block" />
              Emerald
            </span>
            <span className="text-[#C5A04A]" aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5 text-[#737746] font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-[#737746] inline-block" />
              Olive
            </span>
            <span className="text-[#C5A04A]" aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5 text-[#9A741B] font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C5A04A] inline-block" />
              Gold
            </span>
          </div>

          <p className="text-sm sm:text-base text-[#262820]/80 leading-relaxed max-w-sm mx-auto mb-5 sm:mb-6">
            Before we unlock your official celebration pass, prove your wedding etiquette, enthusiasm, and dress code readiness!
          </p>

          {/* Personalized Guest Name Input */}
          <div className="max-w-xs mx-auto mb-6 text-left">
            <label
              htmlFor="guestName"
              className="block text-xs sm:text-sm font-semibold tracking-wider uppercase text-[#07543E] mb-1.5"
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
              className="w-full px-3.5 py-3 text-base sm:text-sm rounded-lg border border-[#07543E]/25 bg-white text-[#262820] placeholder-[#262820]/40 focus:outline-none focus:border-[#07543E] focus:ring-2 focus:ring-[#07543E]/15 transition-all shadow-2xs min-h-[46px]"
            />
            <p className="text-xs text-[#262820]/65 mt-1.5 italic text-center">
              Leave blank to proceed as "Honored Guest"
            </p>
          </div>

          {/* Animated Start Button */}
          <div className="relative flex flex-col items-center gap-3 mb-5">
            <button
              onClick={onStart}
              className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 min-h-[50px] text-sm sm:text-base font-semibold tracking-wider uppercase text-white bg-[#07543E] hover:bg-[#073B2B] active:scale-[0.98] transition-all rounded-xl shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A04A] focus-visible:ring-offset-2 overflow-hidden cursor-pointer border border-[#C5A04A]/60"
            >
              <span className="absolute inset-0 w-1/2 h-full bg-white/15 skew-x-12 -translate-x-full group-hover:translate-x-[300%] transition-transform duration-1000 ease-out" />
              <Sparkles className="w-4 h-4 text-[#F3E5AB] group-hover:rotate-12 transition-transform" />
              <span>Start The Challenge</span>
              <ArrowRight className="w-4 h-4 text-[#F3E5AB] group-hover:translate-x-1 transition-transform" />
            </button>

            {canReturnToWebsite ? (
              <button
                type="button"
                onClick={onReturnToWebsite}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-xs sm:text-sm font-medium text-[#07543E] hover:underline underline-offset-4 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Wedding Website</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSkipChallenge}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-4 text-xs sm:text-sm font-medium text-[#262820]/70 hover:text-[#07543E] underline-offset-4 hover:underline transition-colors cursor-pointer"
              >
                <span>Skip Challenge</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-75" />
              </button>
            )}
          </div>

          {/* Quick Etiquette Highlights */}
          <div className="pt-3.5 border-t border-[#07543E]/10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-[#262820]/75">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#07543E]" />
              5 Quick Questions
            </span>
            <span className="text-[#C5A04A]" aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#737746]" />
              1 Cardinal Wardrobe Rule
            </span>
            <span className="text-[#C5A04A]" aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <HeartHandshake className="w-3.5 h-3.5 text-[#C5A04A]" />
              Verified Guest Pass
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
