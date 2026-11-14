import React from 'react';
import { AlertOctagon, RotateCcw, XCircle, ShieldAlert } from 'lucide-react';

interface UninvitedScreenProps {
  guestName: string;
  onTryAgain: () => void;
}

export const UninvitedScreen: React.FC<UninvitedScreenProps> = ({
  guestName,
  onTryAgain
}) => {
  const displayName = guestName.trim() || 'Guest';

  return (
    <div className="w-full max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-8 animate-dramatic-shake">
      {/* Alert Card Container */}
      <div className="bg-[#FFF5F5] rounded-2xl p-5 sm:p-9 text-center relative overflow-hidden border-2 border-red-500 shadow-2xl">
        {/* Caution stripe decoration top & bottom */}
        <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-red-600 via-rose-500 to-red-600" />
        <div className="absolute bottom-0 inset-x-0 h-2 bg-gradient-to-r from-red-600 via-rose-500 to-red-600" />

        {/* Warning Icon Badge */}
        <div className="mx-auto mb-3 sm:mb-4 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-100 border-2 border-red-400 flex items-center justify-center text-red-600 animate-pulse">
          <AlertOctagon className="w-8 h-8 sm:w-9 sm:h-9" />
        </div>

        {/* ✕ WHITE DRESS Alert */}
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-red-600 text-white font-mono text-xs font-bold tracking-widest uppercase mb-3 shadow-xs">
          <XCircle className="w-4 h-4" />
          <span>✕ WHITE DRESS DETECTED</span>
        </div>

        {/* YOU FAILED! */}
        <h1 className="font-serif text-3xl sm:text-5xl font-black tracking-tight text-red-900 uppercase mb-1">
          YOU FAILED!
        </h1>

        {/* YOU'RE UNINVITED. */}
        <h2 className="font-serif text-xl sm:text-3xl font-extrabold tracking-wider text-red-700 uppercase mb-4">
          YOU'RE UNINVITED.
        </h2>

        {/* White at MY wedding? quote */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-white/90 border border-red-200 mb-5 max-w-md mx-auto shadow-xs">
          <p className="font-serif italic text-base sm:text-xl font-semibold text-red-950 mb-1">
            “White at MY wedding? Are you serious?”
          </p>
          <p className="text-[11px] sm:text-xs text-red-800 font-medium">
            — Damilola &amp; Joseph (Aesthetic Enforcement Unit)
          </p>
        </div>

        {/* DRAMATIC STAMP: GUEST STATUS: REVOKED */}
        <div className="my-5 relative flex justify-center">
          <div className="animate-stamp inline-block px-5 py-2 sm:px-6 sm:py-2.5 rounded-md border-3 sm:border-4 border-dashed border-red-700 text-red-700 font-mono font-black text-lg sm:text-2xl tracking-[0.16em] uppercase bg-red-50/95 shadow-md transform -rotate-6">
            GUEST STATUS: REVOKED
          </div>
        </div>

        {/* Humorous description */}
        <div className="max-w-md mx-auto mb-6 text-xs sm:text-sm text-red-900/80 leading-relaxed bg-red-100/60 p-3.5 rounded-lg border border-red-200">
          <div className="flex items-start gap-2 text-left">
            <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 shrink-0 mt-0.5" />
            <p>
              <strong className="text-red-950">{displayName}</strong>, the bridal squad, ushers, and Joseph's aunties
              have placed security on red alert! Please choose Emerald Green, Olive Green, or Gold instead!
            </p>
          </div>
        </div>

        {/* TRY AGAIN BUTTON */}
        <div className="flex justify-center">
          <button
            onClick={onTryAgain}
            className="group inline-flex items-center justify-center gap-2.5 px-8 py-3.5 text-sm sm:text-base font-bold tracking-widest uppercase text-white bg-red-700 hover:bg-red-800 active:scale-[0.98] transition-all rounded-xl shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 cursor-pointer"
          >
            <RotateCcw className="w-5 h-5 group-hover:-rotate-90 transition-transform" />
            <span>TRY AGAIN (CHOOSE WISELY)</span>
          </button>
        </div>

        <p className="text-[11px] text-red-700/60 mt-4 italic">
          Returns you safely to Question 5 for immediate redemption.
        </p>
      </div>
    </div>
  );
};
