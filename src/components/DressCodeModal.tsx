import React from 'react';
import { X, AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';

interface DressCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DressCodeModal: React.FC<DressCodeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-xs animate-pop">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 sm:p-7 shadow-2xl border border-[#D4AF37]/40 text-[#18261D]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-[#18261D]/50 hover:text-[#0F5132] transition-colors rounded-lg cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0F5132] mb-1.5">
          <Sparkles className="w-4 h-4 text-[#D4AF37]" />
          <span>Colors of the Day &amp; Dress Code</span>
        </div>

        <h3 className="font-serif text-2xl font-bold text-[#0F5132] mb-3">
          Damilola &amp; Joseph's Palette
        </h3>

        <div className="space-y-3 text-xs sm:text-sm text-[#18261D]/80 leading-relaxed mb-5">
          {/* Official Colors */}
          <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#D4AF37]/35">
            <strong className="block text-xs font-bold uppercase tracking-wider text-[#0F5132] mb-2">
              ✨ The Colors of the Day:
            </strong>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#0F5132] shrink-0 border border-black/10" />
                <span className="font-medium text-[#18261D]"><strong>Emerald Green</strong> — Rich, regal, majestic</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#556B2F] shrink-0 border border-black/10" />
                <span className="font-medium text-[#18261D]"><strong>Olive Green</strong> — Organic elegance &amp; warmth</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#D4AF37] shrink-0 border border-black/10" />
                <span className="font-medium text-[#18261D]"><strong>Gold</strong> — Shimmering celebration &amp; luxury</span>
              </div>
            </div>
          </div>

          {/* White Ban */}
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs">
            <strong className="flex items-center gap-1.5 text-xs font-bold text-red-950 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
              Cardinal Rule: Zero White
            </strong>
            White, ivory, cream, or eggshell are reserved exclusively for the gorgeous bride, Damilola! Wearing white will trigger immediate security intervention.
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 px-4 rounded-xl bg-[#0F5132] text-white font-semibold text-xs uppercase tracking-wider hover:bg-[#0B4627] transition-colors cursor-pointer border border-[#D4AF37]/40 shadow-xs"
        >
          Understood! Dressing in Emerald, Olive &amp; Gold!
        </button>
      </div>
    </div>
  );
};
