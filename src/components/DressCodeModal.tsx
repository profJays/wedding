import React, { useEffect } from 'react';
import { X, AlertTriangle, Sparkles } from 'lucide-react';

interface DressCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DressCodeModal: React.FC<DressCodeModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dresscode-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-pop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-[#FFFDF8] p-5 sm:p-7 shadow-2xl border border-[#C5A04A]/40 text-[#262820]"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center text-[#262820]/60 hover:text-[#07543E] transition-colors rounded-lg cursor-pointer"
          aria-label="Close attire guide"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#07543E] mb-1.5 pr-10">
          <Sparkles className="w-4 h-4 text-[#C5A04A]" />
          <span>Attire &amp; Colours of the Day</span>
        </div>

        <h3 id="dresscode-modal-title" className="font-serif text-2xl sm:text-3xl font-bold text-[#07543E] mb-4 pr-8">
          Mary &amp; Joseph&apos;s Celebration Palette
        </h3>

        <div className="space-y-3.5 text-sm sm:text-base text-[#262820]/85 leading-relaxed mb-5">
          <div className="p-4 rounded-xl bg-[#FAF7F0] border border-[#C5A04A]/35">
            <strong className="block text-xs font-bold uppercase tracking-wider text-[#07543E] mb-2.5">
              Official Celebration Colours:
            </strong>
            <div className="flex flex-col gap-2.5">
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

          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-sm leading-relaxed">
            <strong className="flex items-center gap-1.5 text-sm font-bold text-red-950 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              Challenge Etiquette Reminder:
            </strong>
            Come dressed to celebrate in elegant style! Just remember: in the playful Wedding Challenge, picking an all-white bridal gown is strictly reserved for Mary.
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-[#07543E] text-white font-semibold text-xs sm:text-sm uppercase tracking-wider hover:bg-[#073B2B] transition-colors cursor-pointer border border-[#C5A04A]/40 shadow-xs"
        >
          Got It — Ready to Celebrate
        </button>
      </div>
    </div>
  );
};
