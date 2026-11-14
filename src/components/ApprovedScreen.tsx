import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { 
  Sparkles, 
  ExternalLink, 
  RotateCcw, 
  CheckCircle, 
  Heart, 
  Award, 
  Share2, 
  Check 
} from 'lucide-react';
import { Crest } from './Crest';
import { WEDDING_QUESTIONS } from '../data/questions';

interface ApprovedScreenProps {
  guestName: string;
  answers: Record<number, string>;
  onPlayAgain: () => void;
}

export const ApprovedScreen: React.FC<ApprovedScreenProps> = ({
  guestName,
  answers,
  onPlayAgain
}) => {
  const [copied, setCopied] = useState(false);
  const displayName = guestName.trim() || 'Honored Guest';

  // Fire confetti on mount
  useEffect(() => {
    fireCelebrationConfetti();
  }, []);

  const fireCelebrationConfetti = () => {
    // Wedding color palette: Emerald Green, Olive Green, and Gold!
    const colors = ['#0F5132', '#14532D', '#556B2F', '#D4AF37', '#E5C365', '#FAF8F5', '#F3E5AB'];

    try {
      // First burst
      confetti({
        particleCount: 85,
        spread: 70,
        origin: { y: 0.6 },
        colors: colors
      });

      // Side fireworks burst
      setTimeout(() => {
        confetti({
          particleCount: 55,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: colors
        });
        confetti({
          particleCount: 55,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: colors
        });
      }, 250);
    } catch {
      // Fallback gracefully if canvas is unavailable
    }
  };

  // Derive persona tags from answers
  const tags: string[] = [];
  WEDDING_QUESTIONS.forEach((q) => {
    const selectedOptId = answers[q.id];
    const option = q.options.find((o) => o.id === selectedOptId);
    if (option?.personaTag) {
      tags.push(option.personaTag);
    }
  });

  const primaryPersona = tags[1] || tags[0] || 'Celebrated Guest';
  const secondaryPersona = tags[3] || tags[4] || 'Vibe Specialist';

  const handleShare = async () => {
    const shareText = `I just took The Damilola & Joseph Wedding Challenge and got officially approved as a "${primaryPersona}"! Check if you're wedding-ready: ${window.location.href}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'The Damilola & Joseph Wedding Challenge',
          text: shareText,
          url: window.location.href
        });
      } catch {
        // User cancelled share
      }
    } else {
      navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-8 animate-pop">
      {/* Celebratory Banner Card */}
      <div className="stationery-card rounded-2xl p-5 sm:p-9 text-center relative overflow-hidden border border-[#D4AF37]/40 shadow-xl">
        {/* Floating Confetti trigger button */}
        <button
          onClick={fireCelebrationConfetti}
          className="absolute top-3.5 right-3.5 p-2 rounded-full text-[#D4AF37] hover:bg-[#0F5132]/10 active:scale-95 transition-all cursor-pointer"
          title="More celebratory confetti!"
        >
          <Sparkles className="w-5 h-5 text-[#D4AF37] animate-pulse" />
        </button>

        {/* Celebratory Icon & Crest */}
        <div className="mb-3 sm:mb-4 flex justify-center">
          <div className="relative">
            <Crest size="lg" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#0F5132] text-white flex items-center justify-center shadow-md border-2 border-white">
              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#F3E5AB]" />
            </div>
          </div>
        </div>

        {/* Mandatory exact phrasing: "YOU HAVE OFFICIALLY BEEN APPROVED!" */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0F5132]/10 text-[#0F5132] text-[11px] sm:text-xs font-bold tracking-widest uppercase mb-2 sm:mb-3">
          <Award className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>Etiquette Test: 100% Passed</span>
        </div>

        <h1 className="font-serif text-2xl sm:text-4xl font-black tracking-tight text-[#0F5132] uppercase leading-tight mb-2">
          YOU HAVE OFFICIALLY BEEN APPROVED!
        </h1>

        {/* Mandatory exact phrasing: "Joseph & Damilola can't wait to celebrate with you!" */}
        <p className="font-serif italic text-base sm:text-xl text-[#18261D] mb-5">
          “Damilola &amp; Joseph can't wait to celebrate with you!”
        </p>

        {/* VIP PASS TICKET KEEPSAKE (Emerald & Gold) */}
        <div className="mb-6 sm:mb-7 text-left rounded-xl border-2 border-dashed border-[#D4AF37]/50 bg-gradient-to-b from-[#FAF8F5] to-white p-4 sm:p-5 relative shadow-inner">
          <div className="flex items-start justify-between gap-3 border-b border-[#0F5132]/15 pb-3 mb-3">
            <div>
              <p className="font-mono text-[10px] tracking-widest uppercase text-[#556B2F] font-bold">
                OFFICIAL WEDDING GUEST PASS
              </p>
              <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#0F5132] tracking-wide">
                {displayName}
              </h2>
            </div>
            <div className="text-right">
              <div className="inline-block px-2.5 py-1 rounded bg-[#0F5132] text-white font-mono text-[10px] tracking-wider uppercase font-semibold border border-[#D4AF37]">
                CLEARED VIP
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs mb-3.5">
            <div>
              <span className="text-[#18261D]/60 block text-[10px] uppercase tracking-wider font-semibold">
                Guest Persona
              </span>
              <span className="font-serif text-sm font-bold text-[#0F5132]">
                {primaryPersona}
              </span>
            </div>
            <div>
              <span className="text-[#18261D]/60 block text-[10px] uppercase tracking-wider font-semibold">
                Wardrobe Clearance
              </span>
              <span className="font-medium text-[#0F5132] flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                Zero White (Safe!)
              </span>
            </div>
            <div>
              <span className="text-[#18261D]/60 block text-[10px] uppercase tracking-wider font-semibold">
                Colors of the Day
              </span>
              <span className="font-serif text-xs font-semibold text-[#556B2F]">
                Emerald, Olive &amp; Gold
              </span>
            </div>
            <div>
              <span className="text-[#18261D]/60 block text-[10px] uppercase tracking-wider font-semibold">
                Official Registry
              </span>
              <span className="font-medium text-[#0F5132]">
                withjoy.com
              </span>
            </div>
          </div>

          <div className="pt-2.5 border-t border-[#0F5132]/10 flex items-center justify-between text-[10px] sm:text-[11px] text-[#18261D]/70 font-mono">
            <span>PASS #DJ-2026-CONFIRMED</span>
            <span className="flex items-center gap-1 text-[#0F5132]">
              <Heart className="w-3 h-3 fill-[#D4AF37] text-[#D4AF37]" /> D &amp; J
            </span>
          </div>
        </div>

        {/* TWO PRIMARY BUTTONS AS EXPLICITLY REQUESTED */}
        <div className="space-y-2.5 sm:space-y-3">
          {/* Button 1: VISIT OUR WEDDING WEBSITE (opens https://withjoy.com/joseph-and-damilola) */}
          <a
            href="https://withjoy.com/joseph-and-damilola"
            target="_blank"
            rel="noopener noreferrer"
            className="group w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 sm:py-4 text-xs sm:text-sm font-bold tracking-wider uppercase text-white bg-[#0F5132] hover:bg-[#0B4627] active:scale-[0.99] transition-all rounded-xl shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132] cursor-pointer border border-[#D4AF37]/50"
          >
            <span>VISIT OUR WEDDING WEBSITE</span>
            <ExternalLink className="w-4 h-4 text-[#F3E5AB] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>

          {/* Button 2: PLAY AGAIN */}
          <button
            onClick={onPlayAgain}
            className="group w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-xs sm:text-sm font-semibold tracking-wider uppercase text-[#0F5132] bg-white hover:bg-[#FAF8F5] border border-[#0F5132]/25 active:scale-[0.99] transition-all rounded-xl cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 group-hover:-rotate-90 transition-transform" />
            <span>PLAY AGAIN</span>
          </button>
        </div>

        {/* Secondary share/copy link button */}
        <div className="mt-4 pt-3 border-t border-[#0F5132]/10 flex items-center justify-center gap-3">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 text-xs text-[#0F5132] hover:text-[#0B4627] font-medium transition-colors py-1 px-3 rounded-md hover:bg-[#0F5132]/5 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-semibold">Link &amp; Pass Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Share Challenge With Other Guests</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
