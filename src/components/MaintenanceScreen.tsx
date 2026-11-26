import React from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { Crest } from './Crest';

interface MaintenanceScreenProps {
  coupleNames: string;
  hashtag: string;
  weddingDateDisplay: string;
  onGoAdmin: () => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({
  coupleNames,
  hashtag,
  weddingDateDisplay,
  onGoAdmin
}) => {
  return (
    <div className="min-h-screen w-full bg-[#FAF7F0] text-[#262820] flex flex-col items-center justify-between px-4 py-10 sm:py-16">
      <div className="flex-1 w-full flex items-center justify-center">
        <div className="w-full max-w-xl rounded-2xl bg-[#FFFDF8] border border-[#C5A04A]/45 shadow-[0_18px_48px_-16px_rgba(7,59,43,0.16)] p-7 sm:p-12 text-center relative overflow-hidden">
          {/* Subtle inner editorial hairline border */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-3 rounded-xl border border-[#07543E]/12"
          />

          <div className="relative z-10 flex flex-col items-center">
            <div className="mb-5">
              <Crest size="md" />
            </div>

            <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-[#737746] mb-2">
              {hashtag}
            </p>

            <h1 className="font-serif text-3xl sm:text-5xl font-semibold text-[#07543E] tracking-wide leading-tight mb-3">
              {coupleNames}
            </h1>

            <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-[#9A741B] font-semibold mb-6">
              {weddingDateDisplay} · Abuja, Nigeria
            </p>

            <div className="flex items-center justify-center gap-3 w-full max-w-[200px] mb-6">
              <span className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#C5A04A]" />
              <Sparkles className="w-3.5 h-3.5 text-[#C5A04A]" aria-hidden="true" />
              <span className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#C5A04A]" />
            </div>

            <h2 className="font-serif text-xl sm:text-2xl font-semibold text-[#07543E] mb-3">
              Our Celebration Website Will Be Open Shortly
            </h2>

            <p className="font-serif italic text-base sm:text-lg text-[#262820]/80 leading-relaxed max-w-md">
              We are currently preparing a few special details for our wedding celebration. Please check back soon — we cannot wait to celebrate with you.
            </p>
          </div>
        </div>
      </div>

      <footer className="pt-8 text-center">
        <button
          type="button"
          onClick={onGoAdmin}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-xs sm:text-sm text-[#262820]/65 hover:text-[#07543E] underline underline-offset-4 cursor-pointer transition-colors"
        >
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Couple Admin</span>
        </button>
      </footer>
    </div>
  );
};
