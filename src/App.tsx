import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Header } from './components/Header';
import { WeddingWebsite } from './components/WeddingWebsite';
import { InvitationScreen } from './components/InvitationScreen';
import { WelcomeScreen } from './components/WelcomeScreen';
import { QuizScreen } from './components/QuizScreen';
import { UninvitedScreen } from './components/UninvitedScreen';
import { ApprovedScreen } from './components/ApprovedScreen';
import { DressCodeModal } from './components/DressCodeModal';
import { AdminDashboard } from './components/AdminDashboard';
import { Footer } from './components/Footer';
import { BackgroundMusicPlayer } from './components/BackgroundMusicPlayer';
import { WEDDING_QUESTIONS } from './data/questions';
import { DEFAULT_SITE_CONTENT } from './data/weddingSite';
import { subscribeToAuth } from './services/firebase';
import {
  subscribeSiteContent,
  checkCurrentUserIsAdmin
} from './services/weddingRepository';
import { AppView, AnswerOption, SiteContentData } from './types';

export default function App() {
  const [view, setView] = useState<AppView>(() =>
    typeof window !== 'undefined' && window.location.hash === '#admin' ? 'admin' : 'invitation'
  );
  const [hasEnteredWebsite, setHasEnteredWebsite] = useState<boolean>(false);
  const [siteContent, setSiteContent] = useState<SiteContentData>(DEFAULT_SITE_CONTENT);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [guestName, setGuestName] = useState<string>('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isChallengePassed, setIsChallengePassed] = useState<boolean>(false);
  const [isFaqOpen, setIsFaqOpen] = useState<boolean>(false);

  // Firebase Auth & Admin Verification
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthorizedAdmin, setIsAuthorizedAdmin] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubSite = subscribeSiteContent((data) => {
      setSiteContent(data);
    });
    return () => unsubSite();
  }, []);

  useEffect(() => {
    const unsubAuth = subscribeToAuth(async (user) => {
      setCurrentUser(user);
      if (user) {
        const ok = await checkCurrentUserIsAdmin();
        setIsAuthorizedAdmin(ok);
      } else {
        setIsAuthorizedAdmin(false);
      }
      setAuthLoading(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#admin') {
        setView('admin');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const currentQuestion = WEDDING_QUESTIONS[currentQuestionIndex];
  const selectedOptionId = currentQuestion ? answers[currentQuestion.id] : undefined;

  const clearAdminHash = () => {
    if (typeof window !== 'undefined' && window.location.hash === '#admin') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  const handleNavigateSection = (sectionId: string) => {
    clearAdminHash();
    if (view !== 'website') {
      setHasEnteredWebsite(true);
      setView('website');
      let attempts = 0;
      const attemptScroll = () => {
        if (sectionId === 'top') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        const el = document.getElementById(sectionId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (attempts < 10) {
          attempts += 1;
          window.setTimeout(attemptScroll, 40);
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      };
      window.setTimeout(attemptScroll, 40);
      return;
    }

    if (sectionId === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleContinueFromInvitation = () => {
    clearAdminHash();
    setView('welcome');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExploreWebsite = () => {
    clearAdminHash();
    setHasEnteredWebsite(true);
    setView('website');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStart = () => {
    setCurrentQuestionIndex(0);
    setView('quiz');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectOption = (option: AnswerOption) => {
    if (option.isFatal) {
      setAnswers((prev) => ({
        ...prev,
        [currentQuestion.id]: option.id
      }));
      setIsChallengePassed(false);
      setView('uninvited');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: option.id
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < WEDDING_QUESTIONS.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      setIsChallengePassed(true);
      setHasEnteredWebsite(true);
      setView('approved');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    } else {
      setView('welcome');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTryAgain = () => {
    setAnswers((prev) => {
      const updated = { ...prev };
      delete updated[5];
      return updated;
    });
    setCurrentQuestionIndex(4);
    setView('quiz');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePlayAgain = () => {
    setAnswers({});
    setCurrentQuestionIndex(0);
    setIsChallengePassed(false);
    setView('welcome');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoInvitation = () => {
    clearAdminHash();
    setView('invitation');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoChallenge = () => {
    clearAdminHash();
    setView(isChallengePassed ? 'approved' : 'welcome');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoAdmin = () => {
    if (typeof window !== 'undefined') {
      window.location.hash = 'admin';
    }
    setView('admin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F0] text-[#262820] selection:bg-[#07543E]/20 selection:text-[#07543E]">
      {view === 'invitation' ? (
        <InvitationScreen
          onContinue={handleContinueFromInvitation}
          onExploreWebsite={handleExploreWebsite}
          canReturnToWebsite={hasEnteredWebsite}
        />
      ) : (
        <>
          <Header
            coupleNames={siteContent.coupleNames}
            activeView={view}
            puzzleEnabled={siteContent.puzzleEnabled !== false}
            onNavigateSection={handleNavigateSection}
            onGoInvitation={handleGoInvitation}
            onGoChallenge={handleGoChallenge}
          />

      {view === 'website' ? (
        <main className="flex-1 w-full">
          <WeddingWebsite
            siteContent={siteContent}
            guestName={guestName}
            isChallengePassed={isChallengePassed}
            onGoInvitation={handleGoInvitation}
            onGoChallenge={handleGoChallenge}
            onOpenDressCode={() => setIsFaqOpen(true)}
          />
        </main>
      ) : view === 'admin' ? (
        <main className="flex-1 w-full bg-[#FAF7F0]">
          <AdminDashboard
            siteContent={siteContent}
            currentUser={currentUser}
            isAuthorizedAdmin={isAuthorizedAdmin}
            authLoading={authLoading}
            onReturnToWebsite={handleExploreWebsite}
          />
        </main>
      ) : (
        <main className="flex-1 flex items-center justify-center py-6 sm:py-10">
          {view === 'welcome' && (
            <WelcomeScreen
              guestName={guestName}
              onGuestNameChange={setGuestName}
              onStart={handleStart}
              onReturnToWebsite={handleExploreWebsite}
              canReturnToWebsite={hasEnteredWebsite}
            />
          )}

          {view === 'quiz' && (
            <QuizScreen
              currentQuestion={currentQuestion}
              currentIndex={currentQuestionIndex}
              totalQuestions={WEDDING_QUESTIONS.length}
              selectedOptionId={selectedOptionId}
              onSelectOption={handleSelectOption}
              onNext={handleNext}
              onBack={handleBack}
              canGoBack={currentQuestionIndex > 0}
              onReturnToWebsite={handleExploreWebsite}
              canReturnToWebsite={hasEnteredWebsite}
            />
          )}

          {view === 'uninvited' && (
            <UninvitedScreen
              guestName={guestName}
              onTryAgain={handleTryAgain}
              onReturnToWebsite={handleExploreWebsite}
              canReturnToWebsite={hasEnteredWebsite}
            />
          )}

          {view === 'approved' && (
            <ApprovedScreen
              guestName={guestName}
              answers={answers}
              onPlayAgain={handlePlayAgain}
              onExploreWebsite={handleExploreWebsite}
            />
          )}
        </main>
      )}

      <DressCodeModal
        isOpen={isFaqOpen}
        onClose={() => setIsFaqOpen(false)}
      />

          <Footer
            coupleNames={siteContent.coupleNames}
            hashtag={siteContent.hashtag}
            weddingDateDisplay={siteContent.weddingDateDisplay}
            footerNote={siteContent.footerNote}
            puzzleEnabled={siteContent.puzzleEnabled !== false}
            onNavigateSection={handleNavigateSection}
            onGoInvitation={handleGoInvitation}
            onGoChallenge={handleGoChallenge}
            onGoAdmin={handleGoAdmin}
          />
        </>
      )}

      <BackgroundMusicPlayer
        enabled={siteContent.musicEnabled !== false}
        title={siteContent.musicTitle || 'Perfect'}
        artist={siteContent.musicArtist || 'Ed Sheeran'}
        audioUrl={siteContent.musicAudioUrl || ''}
        visible={view !== 'invitation' && view !== 'admin'}
        shouldPause={view === 'admin'}
      />
    </div>
  );
}
