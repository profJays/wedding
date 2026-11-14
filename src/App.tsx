import React, { useState } from 'react';
import { Header } from './components/Header';
import { WelcomeScreen } from './components/WelcomeScreen';
import { QuizScreen } from './components/QuizScreen';
import { UninvitedScreen } from './components/UninvitedScreen';
import { ApprovedScreen } from './components/ApprovedScreen';
import { DressCodeModal } from './components/DressCodeModal';
import { Footer } from './components/Footer';
import { WEDDING_QUESTIONS } from './data/questions';
import { QuizStep, AnswerOption } from './types';

export default function App() {
  const [step, setStep] = useState<QuizStep>('welcome');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [guestName, setGuestName] = useState<string>('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isFaqOpen, setIsFaqOpen] = useState<boolean>(false);

  const currentQuestion = WEDDING_QUESTIONS[currentQuestionIndex];
  const selectedOptionId = currentQuestion ? answers[currentQuestion.id] : undefined;

  // Handlers
  const handleStart = () => {
    setCurrentQuestionIndex(0);
    setStep('quiz');
  };

  const handleSelectOption = (option: AnswerOption) => {
    // If White in Question 5 is selected, trigger dramatic warning screen immediately!
    if (option.isFatal) {
      setAnswers((prev) => ({
        ...prev,
        [currentQuestion.id]: option.id
      }));
      setStep('uninvited');
      return;
    }

    // Save answer
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: option.id
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < WEDDING_QUESTIONS.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      // Completed all 5 questions
      setStep('approved');
    }
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    } else {
      setStep('welcome');
    }
  };

  const handleTryAgain = () => {
    // Return safely to Question 5 (index 4) with White unselected
    setAnswers((prev) => {
      const updated = { ...prev };
      delete updated[5]; // clear Q5 answer
      return updated;
    });
    setCurrentQuestionIndex(4);
    setStep('quiz');
  };

  const handlePlayAgain = () => {
    setAnswers({});
    setCurrentQuestionIndex(0);
    setStep('welcome');
  };

  const handleGoHome = () => {
    setStep('welcome');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-[#18261D] selection:bg-[#0F5132]/20 selection:text-[#0F5132]">
      {/* Top Bar navigation */}
      <Header
        onGoHome={handleGoHome}
        onOpenFaq={() => setIsFaqOpen(true)}
      />

      {/* Main Dynamic Viewport */}
      <main className="flex-1 flex items-center justify-center py-6 sm:py-10">
        {step === 'welcome' && (
          <WelcomeScreen
            guestName={guestName}
            onGuestNameChange={setGuestName}
            onStart={handleStart}
          />
        )}

        {step === 'quiz' && (
          <QuizScreen
            currentQuestion={currentQuestion}
            currentIndex={currentQuestionIndex}
            totalQuestions={WEDDING_QUESTIONS.length}
            selectedOptionId={selectedOptionId}
            onSelectOption={handleSelectOption}
            onNext={handleNext}
            onBack={handleBack}
            canGoBack={currentQuestionIndex > 0}
          />
        )}

        {step === 'uninvited' && (
          <UninvitedScreen
            guestName={guestName}
            onTryAgain={handleTryAgain}
          />
        )}

        {step === 'approved' && (
          <ApprovedScreen
            guestName={guestName}
            answers={answers}
            onPlayAgain={handlePlayAgain}
          />
        )}
      </main>

      {/* Dress Code Explainer Modal */}
      <DressCodeModal
        isOpen={isFaqOpen}
        onClose={() => setIsFaqOpen(false)}
      />

      {/* Tasteful editorial footer */}
      <Footer />
    </div>
  );
}
