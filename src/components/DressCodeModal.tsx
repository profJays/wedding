import React from 'react';
import { X, AlertTriangle, Sparkles } from 'lucide-react';

interface DressCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DressCodeModal: React.FC<DressCodeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-pop">
      <div className="relative w-full max-w-md rounded-2xl bg-[#FFFDF8] p-5 sm:p-7 shadow-2xl border border-[#C5A04A]/40 text-[#262820]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-[#262820]/50 hover:text-[#07543E] transition-colors rounded-lg cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#07543E] mb-1.5">
          <Sparkles className="w-4 h-4 text-[#C5A04A]" />
          <span>Attire &amp; Colours of the Day</span>
        </div>

        <h3 className="font-serif text-2xl font-bold text-[#07543E] mb-3">
          Mary &amp; Joseph's Celebration Palette
        </h3>

        <div className="space-y-3 text-xs sm:text-sm text-[#262820]/80 leading-relaxed mb-5">
          <div className="p-3.5 rounded-xl bg-[#FAF7F0] border border-[#C5A04A]/35">
            <strong className="block text-xs font-bold uppercase tracking-wider text-[#07543E] mb-2">
              Official Celebration Colours:
            </strong>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#FFFFFF] shrink-0 border border-black/15" />
                <span className="font-medium text-[#262820]"><strong>White</strong> — Crisp elegance (Traditional accent)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#CC5500] shrink-0 border border-black/10" />
                <span className="font-medium text-[#262820]"><strong>Burnt Orange</strong> — Warm festive glow</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#07543E] shrink-0 border border-black/10" />
                <span className="font-medium text-[#262820]"><strong>Emerald Green</strong> — Regal celebration tone</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs">
            <strong className="flex items-center gap-1.5 text-xs font-bold text-red-950 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
              Challenge Etiquette Reminder:
            </strong>
            Come dressed to celebrate in elegant style! Just remember: in the playful Wedding Challenge, picking an all-white bridal gown is strictly reserved for Mary.
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 px-4 rounded-xl bg-[#07543E] text-white font-semibold text-xs uppercase tracking-wider hover:bg-[#073B2B] transition-colors cursor-pointer border border-[#C5A04A]/40 shadow-xs"
        >
          Got It — Ready to Celebrate
        </button>
      </div>
    </div>
  );
};
