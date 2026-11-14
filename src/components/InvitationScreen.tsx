import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Crest } from './Crest';

interface InvitationScreenProps {
  onContinue: () => void;
}

type EnvelopePhase = 'sealed' | 'breaking' | 'opened';

interface GoldParticle {
  id: number;
  left: string;
  bottom: string;
  size: number;
  duration: string;
  delay: string;
  driftX: string;
}

const BotanicalPatternSvg: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const isRight = side === 'right';
  return (
    <svg
      viewBox="0 0 220 520"
      className={`w-full h-full pointer-events-none select-none ${isRight ? '-scale-x-100' : ''}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`goldEmbossed-${side}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F3E5AB" stopOpacity="0.34" />
          <stop offset="50%" stopColor="#D4AF37" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#0B4627" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id={`emeraldHighlight-${side}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34D399" stopOpacity="0.13" />
          <stop offset="100%" stopColor="#02190E" stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* Top Botanical Floral Cluster */}
      <g stroke={`url(#goldEmbossed-${side})`} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Main sweeping vine */}
        <path d="M 18 24 C 65 40, 108 82, 130 148 C 142 184, 136 226, 118 260" />
        <path d="M 30 96 C 68 90, 96 112, 118 142" />
        <path d="M 42 54 C 84 42, 128 54, 158 84" />

        {/* Embossed Rose / Peony Blossom Top */}
        <g transform="translate(76, 72)">
          <circle cx="0" cy="0" r="18" fill={`url(#emeraldHighlight-${side})`} />
          <path d="M -8 -6 C -2 -14, 10 -12, 12 -2 C 14 8, 2 14, -8 10 C -15 6, -14 -2, -8 -6 Z" />
          <path d="M -4 -2 C 0 -8, 6 -5, 5 2 C 4 7, -3 6, -4 -2 Z" />
          <path d="M -18 2 C -22 -12, -8 -24, 4 -20" />
          <path d="M 18 -2 C 24 10, 12 24, -2 20" />
        </g>

        {/* Olive & Laurel Leaves */}
        <path d="M 122 128 C 142 114, 166 118, 174 134 C 154 142, 136 140, 122 128 Z" fill={`url(#emeraldHighlight-${side})`} />
        <path d="M 128 164 C 150 156, 174 166, 178 184 C 156 188, 138 178, 128 164 Z" fill={`url(#emeraldHighlight-${side})`} />
        <path d="M 96 116 C 98 138, 86 156, 68 162 C 66 140, 78 122, 96 116 Z" fill={`url(#emeraldHighlight-${side})`} />
        <path d="M 142 68 C 158 50, 180 48, 192 60 C 178 76, 158 78, 142 68 Z" fill={`url(#emeraldHighlight-${side})`} />
        <path d="M 52 146 C 36 164, 34 188, 48 202 C 62 186, 64 164, 52 146 Z" fill={`url(#emeraldHighlight-${side})`} />

        {/* Delicate Berry Dots */}
        <circle cx="154" cy="102" r="2.5" fill="#D4AF37" fillOpacity="0.28" />
        <circle cx="164" cy="112" r="2" fill="#D4AF37" fillOpacity="0.24" />
        <circle cx="102" cy="176" r="2.2" fill="#D4AF37" fillOpacity="0.24" />
      </g>

      {/* Bottom Symmetrical Botanical Vine */}
      <g stroke={`url(#goldEmbossed-${side})`} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 16 496 C 68 476, 114 434, 134 368 C 144 334, 136 296, 116 266" />
        <path d="M 32 424 C 74 428, 102 404, 122 374" />
        <path d="M 46 464 C 90 476, 132 462, 162 432" />

        {/* Embossed Rose / Peony Blossom Bottom */}
        <g transform="translate(82, 446)">
          <circle cx="0" cy="0" r="16" fill={`url(#emeraldHighlight-${side})`} />
          <path d="M -7 -5 C -2 -12, 9 -10, 10 -1 C 12 7, 2 12, -7 8 C -13 4, -12 -2, -7 -5 Z" />
          <path d="M -3 -1 C 0 -6, 5 -4, 4 2 C 3 6, -2 5, -3 -1 Z" />
        </g>

        {/* Bottom Leaves */}
        <path d="M 124 388 C 144 402, 168 398, 176 382 C 156 374, 138 376, 124 388 Z" fill={`url(#emeraldHighlight-${side})`} />
        <path d="M 130 352 C 152 360, 174 348, 178 332 C 156 328, 140 338, 130 352 Z" fill={`url(#emeraldHighlight-${side})`} />
        <path d="M 96 402 C 98 380, 84 362, 66 356 C 64 378, 76 396, 96 402 Z" fill={`url(#emeraldHighlight-${side})`} />
        <path d="M 52 372 C 34 356, 32 332, 46 318 C 60 334, 62 356, 52 372 Z" fill={`url(#emeraldHighlight-${side})`} />

        <circle cx="156" cy="414" r="2.5" fill="#D4AF37" fillOpacity="0.28" />
        <circle cx="106" cy="340" r="2" fill="#D4AF37" fillOpacity="0.22" />
      </g>
    </svg>
  );
};

export const InvitationScreen: React.FC<InvitationScreenProps> = ({ onContinue }) => {
  const [phase, setPhase] = useState<EnvelopePhase>('sealed');
  const [isLeaving, setIsLeaving] = useState(false);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const particles: GoldParticle[] = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: `${8 + ((i * 19) % 84)}%`,
        bottom: `${10 + ((i * 13) % 55)}%`,
        size: 3 + (i % 4) * 1.5,
        duration: `${2.6 + (i % 5) * 0.55}s`,
        delay: `${(i % 6) * 0.25}s`,
        driftX: `${(i % 2 === 0 ? 1 : -1) * (12 + (i % 4) * 8)}px`
      })),
    []
  );

  useEffect(() => {
    if (phase !== 'breaking') return;
    const delayMs = prefersReducedMotion ? 150 : 340;
    const timer = setTimeout(() => {
      setPhase('opened');
    }, delayMs);
    return () => clearTimeout(timer);
  }, [phase, prefersReducedMotion]);

  const handleOpenEnvelope = () => {
    if (phase !== 'sealed') return;
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.(35);
      } catch {
        // Ignore
      }
    }
    if (prefersReducedMotion) {
      setPhase('opened');
    } else {
      setPhase('breaking');
    }
  };

  const handleContinueClick = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onContinue();
    }, prefersReducedMotion ? 120 : 320);
  };

  const isFlapsOpen = phase === 'opened';

  return (
    <section
      aria-label="Digital Wedding Invitation"
      className={`relative min-h-screen w-full overflow-hidden emerald-linen flex flex-col items-center justify-center px-4 py-6 sm:py-10 transition-opacity duration-300 ${
        isLeaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Ambient Emerald Spotlight & Vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 45%, rgba(212, 175, 55, 0.12) 0%, rgba(15, 81, 50, 0.28) 38%, rgba(2, 18, 10, 0.85) 100%)'
        }}
      />

      {/* Full-Screen Subtle Embossed Botanical Backdrop Pattern */}
      <div className="pointer-events-none absolute inset-0 opacity-20 overflow-hidden">
        <div className="absolute -left-16 top-0 h-full w-64 sm:w-80">
          <BotanicalPatternSvg side="left" />
        </div>
        <div className="absolute -right-16 top-0 h-full w-64 sm:w-80">
          <BotanicalPatternSvg side="right" />
        </div>
      </div>

      {/* Subtle Floating Gold Dust Particles (Enhanced on open) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((p) => (
          <span
            key={p.id}
            className="animate-gold-particle absolute rounded-full"
            style={
              {
                left: p.left,
                bottom: p.bottom,
                width: `${p.size}px`,
                height: `${p.size}px`,
                background:
                  'radial-gradient(circle, #FFF8D6 0%, #D4AF37 60%, rgba(212,175,55,0) 100%)',
                boxShadow: '0 0 8px rgba(243, 229, 171, 0.7)',
                opacity: phase === 'opened' ? 0.9 : 0.35,
                '--duration': p.duration,
                '--delay': p.delay,
                '--drift-x': p.driftX
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Main 3D Physical Envelope Container */}
      <div className="relative z-10 w-full max-w-[440px] sm:max-w-[500px] envelope-perspective">
        <div
          className="relative w-full min-h-[530px] sm:min-h-[590px] rounded-2xl envelope-3d-stage"
          style={{
            boxShadow:
              '0 30px 70px -15px rgba(0, 0, 0, 0.78), 0 0 40px rgba(212, 175, 55, 0.14)'
          }}
        >
          {/* =========================================================
              INNER IVORY INVITATION CARD (Revealed when flaps open)
          ========================================================= */}
          <div
            className={`absolute inset-0 rounded-2xl bg-[#FAF7F0] p-3.5 sm:p-5 flex flex-col justify-between overflow-hidden transition-all duration-700 ${
              isFlapsOpen
                ? 'opacity-100 scale-100 animate-invitation-emerge'
                : 'opacity-90 scale-[0.98]'
            }`}
            style={{
              backgroundImage:
                'radial-gradient(circle at 50% 25%, #FFFFFF 0%, #FAF7F0 65%, #F2ECE0 100%)',
              boxShadow: 'inset 0 0 24px rgba(15, 81, 50, 0.08)'
            }}
          >
            {/* Gold Foil Outer & Inner Borders */}
            <div className="relative flex-1 rounded-xl border-2 border-[#D4AF37]/65 p-4 sm:p-7 flex flex-col items-center justify-center text-center">
              {/* Hairline Secondary Inner Border */}
              <div className="pointer-events-none absolute inset-2 rounded-lg border border-[#0F5132]/20" />

              {/* Corner Gold Botanical Filigree Accents */}
              <div className="pointer-events-none absolute top-2.5 left-2.5 w-6 h-6 border-t-2 border-l-2 border-[#D4AF37]" />
              <div className="pointer-events-none absolute top-2.5 right-2.5 w-6 h-6 border-t-2 border-r-2 border-[#D4AF37]" />
              <div className="pointer-events-none absolute bottom-2.5 left-2.5 w-6 h-6 border-b-2 border-l-2 border-[#D4AF37]" />
              <div className="pointer-events-none absolute bottom-2.5 right-2.5 w-6 h-6 border-b-2 border-r-2 border-[#D4AF37]" />

              {/* Monogram Crest */}
              <div className="mb-3 sm:mb-4">
                <Crest size="md" />
              </div>

              {/* #MJ2026 Tag */}
              <span className="font-mono text-[11px] font-semibold tracking-[0.26em] uppercase text-[#556B2F] mb-2">
                #MJ2026
              </span>

              {/* Exact Required Message: "YOU ARE CORDIALLY INVITED" */}
              <p className="font-sans text-xs sm:text-sm font-semibold tracking-[0.22em] uppercase text-[#B08A2E] mb-3">
                YOU ARE CORDIALLY INVITED
              </p>

              {/* Exact Required Couple Title: "Joseph & Damilola" */}
              <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-wide text-[#0F5132] leading-tight mb-3">
                Joseph <span className="font-script text-[#C59B27] font-normal text-4xl sm:text-5xl">&amp;</span> Damilola
              </h1>

              {/* Gold Divider */}
              <div className="flex items-center justify-center gap-3 w-full max-w-[220px] my-3">
                <span className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#D4AF37]" />
                <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#D4AF37]" />
              </div>

              {/* Exact Required Sub-Message */}
              <p className="font-serif italic text-base sm:text-lg text-[#18261D]/85 leading-relaxed max-w-xs sm:max-w-sm mb-7">
                Before you explore our celebration, we have a little challenge for you!
              </p>

              {/* Beautiful CONTINUE Button */}
              <button
                type="button"
                onClick={handleContinueClick}
                disabled={!isFlapsOpen}
                className="group relative inline-flex items-center justify-center gap-2.5 px-8 py-3.5 min-h-[48px] text-sm font-bold tracking-[0.2em] uppercase text-white bg-[#0F5132] hover:bg-[#0A3D24] active:scale-[0.98] transition-all rounded-xl shadow-lg border border-[#D4AF37]/70 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 overflow-hidden"
              >
                <span className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-[#F3E5AB]/25 to-transparent skew-x-12 -translate-x-full group-hover:translate-x-[300%] transition-transform duration-1000 ease-out" />
                <span>CONTINUE</span>
                <ArrowRight className="w-4 h-4 text-[#F3E5AB] group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* =========================================================
              LEFT & RIGHT 3D ENVELOPE FLAPS (Gatefold Doors)
          ========================================================= */}
          {/* LEFT FLAP */}
          <div
            className={`envelope-flap envelope-flap-left absolute top-0 left-0 w-1/2 h-full z-20 ${
              isFlapsOpen ? 'is-open' : ''
            }`}
          >
            {/* Front Face (Emerald + Embossed Botanical + Gold Foil Border) */}
            <div
              className="flap-face absolute inset-0 rounded-l-2xl overflow-hidden border-y border-l border-[#D4AF37]/55"
              style={{
                background:
                  'linear-gradient(135deg, #0E4D2F 0%, #07331E 55%, #042214 100%)',
                boxShadow:
                  'inset -10px 0 22px rgba(0, 0, 0, 0.35), inset 1px 1px 0 rgba(243, 229, 171, 0.25)'
              }}
            >
              {/* Gold Foil Trim on Center Seam */}
              <div className="absolute top-0 right-0 bottom-0 w-[2px] bg-gradient-to-b from-[#9E7B23] via-[#F3E5AB] to-[#9E7B23]" />
              {/* Inner Gold Decorative Frame */}
              <div className="absolute inset-3 sm:inset-4 right-2 rounded-l-xl border border-[#D4AF37]/35 pointer-events-none" />
              {/* Embossed Botanical SVG */}
              <BotanicalPatternSvg side="left" />
            </div>

            {/* Back Face (Gold Leaf Inner Envelope Lining visible during 3D swing) */}
            <div
              className="flap-back absolute inset-0 rounded-r-2xl overflow-hidden border border-[#D4AF37]/60"
              style={{
                background:
                  'linear-gradient(135deg, #E8D59B 0%, #C6A246 50%, #9E7B23 100%)',
                boxShadow: 'inset 0 0 30px rgba(15, 81, 50, 0.25)'
              }}
            >
              <div className="absolute inset-3 rounded-r-xl border border-[#0F5132]/25" />
            </div>
          </div>

          {/* RIGHT FLAP */}
          <div
            className={`envelope-flap envelope-flap-right absolute top-0 right-0 w-1/2 h-full z-20 ${
              isFlapsOpen ? 'is-open' : ''
            }`}
          >
            {/* Front Face (Emerald + Embossed Botanical + Gold Foil Border) */}
            <div
              className="flap-face absolute inset-0 rounded-r-2xl overflow-hidden border-y border-r border-[#D4AF37]/55"
              style={{
                background:
                  'linear-gradient(225deg, #0E4D2F 0%, #07331E 55%, #042214 100%)',
                boxShadow:
                  'inset 10px 0 22px rgba(0, 0, 0, 0.35), inset -1px 1px 0 rgba(243, 229, 171, 0.25)'
              }}
            >
              {/* Gold Foil Trim on Center Seam */}
              <div className="absolute top-0 left-0 bottom-0 w-[2px] bg-gradient-to-b from-[#9E7B23] via-[#F3E5AB] to-[#9E7B23]" />
              {/* Inner Gold Decorative Frame */}
              <div className="absolute inset-3 sm:inset-4 left-2 rounded-r-xl border border-[#D4AF37]/35 pointer-events-none" />
              {/* Embossed Botanical SVG */}
              <BotanicalPatternSvg side="right" />
            </div>

            {/* Back Face (Gold Leaf Inner Envelope Lining visible during 3D swing) */}
            <div
              className="flap-back absolute inset-0 rounded-l-2xl overflow-hidden border border-[#D4AF37]/60"
              style={{
                background:
                  'linear-gradient(225deg, #E8D59B 0%, #C6A246 50%, #9E7B23 100%)',
                boxShadow: 'inset 0 0 30px rgba(15, 81, 50, 0.25)'
              }}
            >
              <div className="absolute inset-3 rounded-l-xl border border-[#0F5132]/25" />
            </div>
          </div>

          {/* =========================================================
              CLOSED ENVELOPE TOP/BOTTOM MONOGRAM DETAILING & WAX SEAL
          ========================================================= */}
          {phase !== 'opened' && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-between py-9 sm:py-11 px-6 pointer-events-none">
              {/* Top Envelope Gold Foil Header */}
              <div className="text-center">
                <p className="font-sans text-[10px] sm:text-xs font-semibold tracking-[0.28em] uppercase text-[#F3E5AB]/85 mb-1">
                  Wedding Celebration
                </p>
                <p className="font-serif italic text-lg sm:text-xl text-[#FCF6BA] tracking-wide drop-shadow">
                  Joseph &amp; Damilola
                </p>
              </div>

              {/* CENTRAL CLICKABLE GOLD WAX SEAL (#MJ2026) */}
              <div className="pointer-events-auto flex flex-col items-center">
                <button
                  type="button"
                  onClick={handleOpenEnvelope}
                  aria-label="Tap the #MJ2026 gold wax seal to open your wedding invitation"
                  className={`group relative w-32 h-32 sm:w-36 sm:h-36 flex items-center justify-center rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#F3E5AB]/70 transition-transform active:scale-95 ${
                    phase === 'breaking'
                      ? 'animate-seal-break pointer-events-none'
                      : 'animate-seal-pulse'
                  }`}
                >
                  {/* Organic Hand-Pressed Gold Wax Perimeter SVG */}
                  <svg
                    viewBox="0 0 140 140"
                    className="w-full h-full"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <defs>
                      <radialGradient id="waxGoldOuter" cx="38%" cy="32%" r="68%">
                        <stop offset="0%" stopColor="#FFF2B2" />
                        <stop offset="28%" stopColor="#E4BE58" />
                        <stop offset="68%" stopColor="#B88926" />
                        <stop offset="100%" stopColor="#7C5810" />
                      </radialGradient>
                      <radialGradient id="waxGoldInner" cx="42%" cy="35%" r="65%">
                        <stop offset="0%" stopColor="#D4AF37" />
                        <stop offset="55%" stopColor="#AA7D1E" />
                        <stop offset="100%" stopColor="#7E5911" />
                      </radialGradient>
                    </defs>

                    {/* Organic melted wax contour */}
                    <path
                      d="M 70 6 C 84 5, 96 12, 108 18 C 120 25, 131 37, 133 52 C 136 66, 132 80, 128 94 C 124 108, 113 121, 100 128 C 86 135, 70 135, 55 132 C 40 129, 24 121, 16 108 C 8 94, 7 78, 8 62 C 9 47, 15 32, 26 22 C 37 12, 54 7, 70 6 Z"
                      fill="url(#waxGoldOuter)"
                    />

                    {/* Raised rim bevel */}
                    <circle
                      cx="70"
                      cy="70"
                      r="51"
                      fill="none"
                      stroke="#FFF6CC"
                      strokeOpacity="0.45"
                      strokeWidth="1.8"
                    />

                    {/* Recessed stamped seal bed */}
                    <circle
                      cx="70"
                      cy="70"
                      r="45"
                      fill="url(#waxGoldInner)"
                      stroke="#6E4D0C"
                      strokeWidth="1.5"
                    />

                    {/* Fine beaded inner ring */}
                    <circle
                      cx="70"
                      cy="70"
                      r="40"
                      fill="none"
                      stroke="#F7E39C"
                      strokeOpacity="0.55"
                      strokeWidth="0.9"
                      strokeDasharray="2.5 2.5"
                    />
                  </svg>

                  {/* Embossed #MJ2026 Text & Subtle Ornamental Detail Inside Seal */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none">
                    <span className="h-[1px] w-8 bg-gradient-to-r from-transparent via-[#FFF2B2]/80 to-transparent mb-1" />
                    <span className="font-serif text-lg sm:text-xl font-bold tracking-[0.09em] text-[#FFF8DC] drop-shadow-[0_1px_2px_rgba(65,42,3,0.9)]">
                      #MJ2026
                    </span>
                    <span className="mt-1 h-[1px] w-8 bg-gradient-to-r from-transparent via-[#FFF2B2]/80 to-transparent" />
                  </div>
                </button>
              </div>

              {/* Bottom Instruction Prompt */}
              <div className="text-center">
                <p className="inline-block px-4 py-1.5 rounded-full bg-[#031B10]/70 border border-[#D4AF37]/40 font-sans text-[11px] sm:text-xs font-semibold tracking-[0.18em] uppercase text-[#F3E5AB] shadow-md backdrop-blur-xs">
                  TAP THE SEAL TO OPEN YOUR INVITATION
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
