import React, { useState, useRef } from 'react';
import { ArrowLeft, ArrowRight, Check, Sparkles, AlertCircle, Ban } from 'lucide-react';
import { Question, AnswerOption } from '../types';

interface QuizScreenProps {
  currentQuestion: Question;
  currentIndex: number;
  totalQuestions: number;
  selectedOptionId: string | undefined;
  onSelectOption: (option: AnswerOption) => void;
  onNext: () => void;
  onBack: () => void;
  canGoBack: boolean;
}

export const QuizScreen: React.FC<QuizScreenProps> = ({
  currentQuestion,
  currentIndex,
  totalQuestions,
  selectedOptionId,
  onSelectOption,
  onNext,
  onBack,
  canGoBack
}) => {
  const optionLetters = ['A', 'B', 'C', 'D', 'E'];

  // Runaway button state for Question 1
  const [runawayOffset, setRunawayOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [escapeCount, setEscapeCount] = useState<number>(0);
  const [showMakeItBanner, setShowMakeItBanner] = useState<boolean>(false);
  const runawayButtonRef = useRef<HTMLButtonElement>(null);

  const currentSelectedOption = currentQuestion.options.find(
    (opt) => opt.id === selectedOptionId
  );

  const progressPercentage = Math.round(((currentIndex + 1) / totalQuestions) * 100);

  // Playful dodging logic for the "No" button on Question 1
  const dodgeRunawayButton = () => {
    // Provide haptic feedback if available on mobile
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.(50);
      } catch {
        // Ignore if vibration fails
      }
    }

    setEscapeCount((prev) => prev + 1);
    setShowMakeItBanner(true);

    // Random dodge within safe mobile boundaries
    const randomX = (Math.random() - 0.5) * 160;
    const randomY = (Math.random() - 0.5) * 80;
    setRunawayOffset({ x: randomX, y: randomY });
  };

  const getRunawayLabel = () => {
    if (escapeCount === 0) return "No, unfortunately I won't be there";
    if (escapeCount === 1) return "🏃💨 Too slow! You CANNOT click this!";
    if (escapeCount === 2) return "😂 Damilola disabled this option!";
    if (escapeCount === 3) return "🙅 Joseph said: ABSOLUTELY NOT!";
    return "✨ You better MAKE IT here if you want to MAKE IT! ✨";
  };

  return (
    <div className="w-full max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-8 animate-pop">
      {/* Top Navigation & Progress */}
      <div className="mb-4 sm:mb-6 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-xs font-semibold tracking-wider uppercase text-[#0F5132]">
          <div className="flex items-center gap-1">
            {canGoBack ? (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1 text-[#0F5132] hover:text-[#0B4627] transition-colors py-1 px-2 -ml-2 rounded-md hover:bg-[#0F5132]/5 cursor-pointer"
                title="Go to previous question"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            ) : (
              <span className="text-[#556B2F] text-[11px] font-medium tracking-wide">
                Damilola &amp; Joseph Challenge
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px] text-[#18261D]/75">
            <span>QUESTION {currentIndex + 1} OF {totalQuestions}</span>
            <span className="text-[#D4AF37] font-bold">({progressPercentage}%)</span>
          </div>
        </div>

        {/* Emerald & Gold Progress Bar */}
        <div className="w-full h-2 rounded-full bg-[#0F5132]/10 overflow-hidden relative shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-[#556B2F] via-[#D4AF37] to-[#0F5132] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Main Question Card */}
      <div className="stationery-card rounded-2xl p-4 sm:p-7 border border-[#D4AF37]/35 relative shadow-md">
        {/* Subtle top header strip */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#0F5132]/10 text-xs text-[#0F5132]/75">
          <span className="font-serif italic tracking-wide text-xs sm:text-sm">
            Damilola &amp; Joseph · Wedding Readiness
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold">
            Step {currentIndex + 1}
          </span>
        </div>

        {/* Question Header */}
        <div className="mb-5">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#0F5132] leading-snug mb-1.5">
            {currentQuestion.question}
          </h2>
          {currentQuestion.subtitle && (
            <p className="text-xs sm:text-sm text-[#18261D]/70 italic">
              {currentQuestion.subtitle}
            </p>
          )}
        </div>

        {/* Options List */}
        <div className="space-y-2.5 sm:space-y-3 mb-5">
          {currentQuestion.options.map((option, idx) => {
            const isSelected = selectedOptionId === option.id;
            const letter = optionLetters[idx] || String(idx + 1);

            return (
              <button
                key={option.id}
                onClick={() => onSelectOption(option)}
                className={`w-full text-left p-3 sm:p-3.5 rounded-xl border transition-all duration-150 flex items-start gap-3 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132] active:scale-[0.99] ${
                  isSelected
                    ? 'border-[#0F5132] bg-[#0F5132]/8 text-[#18261D] shadow-xs ring-1 ring-[#0F5132]/40'
                    : 'border-[#0F5132]/15 bg-white hover:border-[#D4AF37] hover:bg-[#FAF8F5]/80 text-[#18261D]/90'
                }`}
              >
                {/* Letter Indicator */}
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-semibold shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-[#0F5132] text-white shadow-xs'
                      : 'bg-[#FAF8F5] text-[#0F5132] border border-[#0F5132]/20 group-hover:border-[#D4AF37]'
                  }`}
                >
                  {isSelected ? <Check className="w-4 h-4 text-[#F3E5AB]" /> : letter}
                </div>

                {/* Option Text */}
                <div className="flex-1 pt-0.5">
                  <span className="text-sm sm:text-base font-medium leading-relaxed block">
                    {option.text}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* PLAYFUL RUNAWAY / UNCLICKABLE "NO" BUTTON (Only on Question 1) */}
        {currentIndex === 0 && (
          <div className="relative my-4 pt-2 border-t border-dashed border-[#0F5132]/15 text-center">
            <p className="text-[10px] text-[#18261D]/50 uppercase tracking-widest font-mono mb-2">
              (Thinking of saying no? Try your luck below 👇)
            </p>

            <div className="relative py-2 min-h-[50px] flex items-center justify-center overflow-visible">
              <button
                ref={runawayButtonRef}
                type="button"
                onMouseEnter={dodgeRunawayButton}
                onTouchStart={dodgeRunawayButton}
                onClick={dodgeRunawayButton}
                style={{
                  transform: `translate(${runawayOffset.x}px, ${runawayOffset.y}px)`,
                  transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)'
                }}
                className="group relative inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-500 text-xs font-medium cursor-not-allowed select-none shadow-xs active:animate-runaway"
              >
                <Ban className="w-3.5 h-3.5 text-stone-400 group-hover:text-red-500 transition-colors" />
                <span className="text-xs truncate max-w-[280px]">
                  {getRunawayLabel()}
                </span>
              </button>
            </div>

            {/* Playful encouraging "MAKE IT" banner when they attempt to tap No */}
            {showMakeItBanner && (
              <div className="mt-2 p-3 rounded-xl bg-gradient-to-r from-[#0F5132]/10 via-[#D4AF37]/20 to-[#0F5132]/10 border border-[#D4AF37]/50 text-left animate-pop shadow-xs">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-[#0F5132] shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed text-[#18261D]">
                    <strong className="block text-[#0F5132] font-serif text-sm">
                      🚨 Listen to wisdom!
                    </strong>
                    You better make it to <strong>Damilola &amp; Joseph's</strong> wedding if you want to <strong>"MAKE IT"</strong> in life! ✨
                    The jollof is blessed and attendance is destiny. Pick an approved option above!
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Funny Reaction Callout */}
        {currentSelectedOption && (
          <div className="mb-5 p-3.5 rounded-xl bg-gradient-to-r from-[#FAF8F5] via-[#F4F6F0] to-[#FAF8F5] border border-[#0F5132]/20 animate-pop">
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#0F5132]/10 text-[#0F5132] flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              </div>
              <div>
                <p className="text-[11px] font-bold tracking-wider uppercase text-[#0F5132] mb-0.5">
                  Damilola &amp; Joseph's Reaction:
                </p>
                <p className="text-xs sm:text-sm italic text-[#18261D] leading-relaxed">
                  "{currentSelectedOption.verdict}"
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation & Action Controls */}
        <div className="pt-3.5 border-t border-[#0F5132]/10 flex items-center justify-between gap-3">
          <div>
            {canGoBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#0F5132] hover:text-[#0B4627] transition-colors rounded-lg hover:bg-[#0F5132]/5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
            )}
          </div>

          <button
            onClick={onNext}
            disabled={!selectedOptionId}
            className={`inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold tracking-wider uppercase transition-all duration-150 cursor-pointer border ${
              selectedOptionId
                ? 'bg-[#0F5132] text-white hover:bg-[#0B4627] border-[#D4AF37]/40 shadow-xs active:scale-[0.98]'
                : 'bg-[#0F5132]/20 text-[#18261D]/40 border-transparent cursor-not-allowed'
            }`}
          >
            <span>
              {currentIndex === totalQuestions - 1
                ? 'Finish & Get Pass'
                : 'Next Question'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
