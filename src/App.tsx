import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User } from 'firebase/auth';
import { Header } from './components/Header';
import { WeddingWebsite } from './components/WeddingWebsite';
import { InvitationScreen } from './components/InvitationScreen';
import { WelcomeScreen } from './components/WelcomeScreen';
import { QuizScreen } from './components/QuizScreen';
import { UninvitedScreen } from './components/UninvitedScreen';
import { ApprovedScreen } from './components/ApprovedScreen';
import { MaintenanceScreen } from './components/MaintenanceScreen';
import { DressCodeModal } from './components/DressCodeModal';
import { AdminDashboard } from './components/AdminDashboard';
import { Footer } from './components/Footer';
import {
  BackgroundMusicHandle,
  BackgroundMusicPlayer
} from './components/BackgroundMusicPlayer';
import { isPlayableMusicUrl } from './services/musicPlayback';
import { WEDDING_QUESTIONS } from './data/questions';
import { DEFAULT_SITE_CONTENT } from './data/weddingSite';
import { subscribeToAuth } from './services/firebase';
import {
  subscribeSiteContent,
  subscribeVisibilitySettings,
  subscribeEnabledMusicTracks,
  checkCurrentUserIsAdmin
} from './services/weddingRepository';
import {
  DEFAULT_VISIBILITY_SETTINGS,
  resolveInitialVisitorView,
  resolveNextViewAfterInvitation,
  resolveSafeViewForSettings
} from './utils/visibilitySettings';
import {
  AppView,
  AnswerOption,
  MusicTrack,
  SiteContentData,
  VisibilitySettingsData
} from './types';
import {
  initializeAnalytics,
  isAdminDebugModeEnabled,
  setAnalyticsAdminExclusion,
  trackChallengeCompleted,
  trackChallengeStarted,
  trackVirtualPageView
} from './services/analytics';
import { useStandaloneSectionEngagement } from './hooks/useSectionEngagement';

export default function App() {
  const isInitialAdminHash =
    typeof window !== 'undefined' && window.location.hash === '#admin';

  const [view, setView] = useState<AppView>(() =>
    isInitialAdminHash ? 'admin' : 'invitation'
  );
  const [hasEnteredWebsite, setHasEnteredWebsite] = useState<boolean>(false);
  const [siteContent, setSiteContent] = useState<SiteContentData>(DEFAULT_SITE_CONTENT);
  const [visibilitySettings, setVisibilitySettings] = useState<VisibilitySettingsData>(
    DEFAULT_VISIBILITY_SETTINGS
  );
  const [visibilityReady, setVisibilityReady] = useState<boolean>(isInitialAdminHash);
  const initialViewResolvedRef = useRef<boolean>(isInitialAdminHash);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [guestName, setGuestName] = useState<string>('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isChallengePassed, setIsChallengePassed] = useState<boolean>(false);
  const [isFaqOpen, setIsFaqOpen] = useState<boolean>(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState<boolean>(false);
  const [enabledMusicTracks, setEnabledMusicTracks] = useState<MusicTrack[]>([]);
  const [selectedSongId, setSelectedSongId] = useState<string>('');
  const musicControllerRef = useRef<BackgroundMusicHandle | null>(null);

  // Firebase Auth & Admin Verification
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthorizedAdmin, setIsAuthorizedAdmin] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [analyticsReady, setAnalyticsReady] = useState<boolean>(false);
  const [authReadyForAnalytics, setAuthReadyForAnalytics] = useState<boolean>(false);

  useEffect(() => {
    const unsubSite = subscribeSiteContent((data) => {
      setSiteContent(data);
    });
    const unsubMusic = subscribeEnabledMusicTracks((tracks) => {
      setEnabledMusicTracks(tracks);
    });

    // Brief fallback so slow/offline networks never block rendering
    const readyFallbackTimer = window.setTimeout(() => {
      setVisibilityReady(true);
    }, 1500);

    const unsubVisibility = subscribeVisibilitySettings(
      (settings) => {
        setVisibilitySettings(settings);
        if (!initialViewResolvedRef.current) {
          initialViewResolvedRef.current = true;
          const initialHash =
            typeof window !== 'undefined' ? window.location.hash : '';
          const resolvedInitial = resolveInitialVisitorView(settings, initialHash);
          setView(resolvedInitial);
          if (resolvedInitial === 'website') {
            setHasEnteredWebsite(true);
          }
        }
      },
      () => {
        window.clearTimeout(readyFallbackTimer);
        setVisibilityReady(true);
      }
    );

    return () => {
      window.clearTimeout(readyFallbackTimer);
      unsubSite();
      unsubMusic();
      unsubVisibility();
    };
  }, []);

  // Keep active visitor views consistent whenever live visibility settings change
  useEffect(() => {
    if (!visibilityReady) return;
    const safeView = resolveSafeViewForSettings(
      view,
      visibilitySettings,
      hasEnteredWebsite
    );
    if (safeView !== view) {
      setView(safeView);
      if (safeView === 'website') {
        setHasEnteredWebsite(true);
      }
    }
  }, [visibilityReady, view, visibilitySettings, hasEnteredWebsite]);

  // Initialize Google Analytics 4 once (coordinated with index.html official Google tag)
  useEffect(() => {
    let active = true;
    void initializeAnalytics().then((ok) => {
      if (active && ok) setAnalyticsReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Wait briefly for Firebase Auth resolution so signed-in admins never leak an initial page_view,
  // while ensuring normal visitors are never blocked by slow/offline auth connections.
  useEffect(() => {
    if (!authLoading) {
      setAuthReadyForAnalytics(true);
      return;
    }
    const timer = window.setTimeout(() => {
      setAuthReadyForAnalytics(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [authLoading]);

  // Exclude administrator & dashboard sessions from public visitor statistics
  useEffect(() => {
    setAnalyticsAdminExclusion(isAuthorizedAdmin || view === 'admin');
  }, [isAuthorizedAdmin, view]);

  // Deduplicated SPA virtual page_view tracking for public views
  useEffect(() => {
    if (!analyticsReady || !visibilityReady || !authReadyForAnalytics) return;
    if (view === 'admin') return;
    trackVirtualPageView(view);
  }, [analyticsReady, visibilityReady, authReadyForAnalytics, view, isAuthorizedAdmin]);

  // Active foreground engagement tracking for standalone Wedding Challenge views
  const isChallengeExperienceActive =
    analyticsReady &&
    visibilityReady &&
    authReadyForAnalytics &&
    (!isAuthorizedAdmin || isAdminDebugModeEnabled()) &&
    (view === 'welcome' || view === 'quiz' || view === 'uninvited' || view === 'approved');
  useStandaloneSectionEngagement('wedding_challenge', isChallengeExperienceActive);

  // Combined effective feature toggles (preserving legacy siteContent toggles seamlessly)
  const effectiveMusicEnabled =
    siteContent.musicEnabled !== false &&
    visibilitySettings.experience.backgroundMusic &&
    visibilitySettings.experience.mainWebsite;
  const effectivePuzzleEnabled =
    siteContent.puzzleEnabled !== false && visibilitySettings.experience.photoPuzzle;
  const effectiveGiftingEnabled =
    siteContent.giftingEnabled !== false && visibilitySettings.sections.gifting;

  const effectiveSongs = useMemo<MusicTrack[]>(() => {
    const validTracks = enabledMusicTracks.filter(
      (track) => track.enabled && isPlayableMusicUrl(track.fileUrl)
    );
    if (validTracks.length > 0) return validTracks;

    // Seamless backward compatibility for sites configured with the legacy single-song fields
    if (isPlayableMusicUrl(siteContent.musicAudioUrl)) {
      return [
        {
          id: 'legacy-site-music',
          title: (siteContent.musicTitle || 'Perfect').trim() || 'Perfect',
          artist: (siteContent.musicArtist || 'Ed Sheeran').trim() || 'Ed Sheeran',
          fileUrl: (siteContent.musicAudioUrl || '').trim(),
          driveFileId: siteContent.musicAudioFileId || '',
          fileName: siteContent.musicAudioFileName || '',
          storageProvider: siteContent.musicAudioFileId ? 'google_drive' : 'site_asset',
          enabled: true,
          isDefault: true,
          order: 0,
          createdAt: null,
          updatedAt: null,
          updatedByUid: ''
        }
      ];
    }
    return [];
  }, [
    enabledMusicTracks,
    siteContent.musicAudioUrl,
    siteContent.musicTitle,
    siteContent.musicArtist,
    siteContent.musicAudioFileId,
    siteContent.musicAudioFileName
  ]);

  const activeSong = useMemo<MusicTrack | null>(() => {
    if (effectiveSongs.length === 0) return null;
    if (selectedSongId) {
      const chosen = effectiveSongs.find((t) => t.id === selectedSongId);
      if (chosen) return chosen;
    }
    return effectiveSongs.find((t) => t.isDefault) || effectiveSongs[0];
  }, [effectiveSongs, selectedSongId]);

  const activeAudioUrl = activeSong?.fileUrl || '';
  const resolvedActiveSongId = activeSong?.id || '';

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
        setVisibilityReady(true);
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
    if (!visibilitySettings.experience.mainWebsite) {
      setView('maintenance');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (view !== 'website') {
      setHasEnteredWebsite(true);
      setView('website');
      if (effectiveMusicEnabled) {
        musicControllerRef.current?.attemptStartOnWebsiteEntry();
      }
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
    const nextView = resolveNextViewAfterInvitation(visibilitySettings);
    if (nextView === 'website') {
      setHasEnteredWebsite(true);
      setView('website');
      if (effectiveMusicEnabled) {
        musicControllerRef.current?.attemptStartOnWebsiteEntry();
      }
    } else {
      setView(nextView);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExploreWebsite = () => {
    clearAdminHash();
    if (!visibilitySettings.experience.mainWebsite) {
      setView('maintenance');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setHasEnteredWebsite(true);
    setView('website');
    if (effectiveMusicEnabled) {
      musicControllerRef.current?.attemptStartOnWebsiteEntry();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Skips the challenge directly to the main wedding website without marking challenge passed or unlocking puzzle rewards
  const handleSkipChallenge = () => {
    clearAdminHash();
    if (!visibilitySettings.experience.mainWebsite) {
      setView('maintenance');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setHasEnteredWebsite(true);
    setView('website');
    if (effectiveMusicEnabled) {
      musicControllerRef.current?.attemptStartOnWebsiteEntry();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectRewardSong = async (
    track: MusicTrack
  ): Promise<{ startedPlaying: boolean; respectPaused: boolean }> => {
    if (
      !effectivePuzzleEnabled ||
      !visibilitySettings.interactions.puzzleSongRewards ||
      !effectiveMusicEnabled
    ) {
      return { startedPlaying: false, respectPaused: true };
    }
    setSelectedSongId(track.id);
    if (!musicControllerRef.current) {
      return { startedPlaying: false, respectPaused: false };
    }
    return musicControllerRef.current.selectSongTrack(track.fileUrl);
  };

  const handleStart = () => {
    if (!visibilitySettings.experience.challenge) {
      handleExploreWebsite();
      return;
    }
    trackChallengeStarted();
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
      trackChallengeCompleted(false);
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
      trackChallengeCompleted(true);
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
    if (!visibilitySettings.experience.mainWebsite) {
      setView('maintenance');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!visibilitySettings.experience.digitalInvitation) return;
    setView('invitation');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoChallenge = () => {
    clearAdminHash();
    if (!visibilitySettings.experience.mainWebsite) {
      setView('maintenance');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!visibilitySettings.experience.challenge) return;
    setView(isChallengePassed ? 'approved' : 'welcome');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoAdmin = () => {
    if (typeof window !== 'undefined') {
      window.location.hash = 'admin';
    }
    setVisibilityReady(true);
    setView('admin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F0] text-[#262820] selection:bg-[#07543E]/20 selection:text-[#07543E]">
      {!visibilityReady && view !== 'admin' ? (
        <div
          aria-busy="true"
          aria-label="Loading celebration website"
          className="min-h-screen w-full bg-[#FAF7F0] flex items-center justify-center"
        >
          <div className="w-8 h-8 rounded-full border-2 border-[#07543E]/20 border-t-[#07543E] animate-spin" />
        </div>
      ) : view === 'maintenance' ? (
        <MaintenanceScreen
          coupleNames={siteContent.coupleNames}
          hashtag={siteContent.hashtag}
          weddingDateDisplay={siteContent.weddingDateDisplay}
          onGoAdmin={handleGoAdmin}
        />
      ) : view === 'invitation' ? (
        <InvitationScreen
          onContinue={handleContinueFromInvitation}
          onExploreWebsite={handleExploreWebsite}
          canReturnToWebsite={hasEnteredWebsite}
          challengeEnabled={visibilitySettings.experience.challenge}
        />
      ) : (
        <>
          <Header
            coupleNames={siteContent.coupleNames}
            activeView={view}
            puzzleEnabled={effectivePuzzleEnabled}
            giftingEnabled={effectiveGiftingEnabled}
            visibilitySettings={visibilitySettings}
            showMusicToggle={effectiveMusicEnabled && view !== 'admin'}
            isMusicPlaying={isMusicPlaying}
            hasMusicTrack={Boolean(isPlayableMusicUrl(activeAudioUrl))}
            onToggleMusic={() => {
              void musicControllerRef.current?.togglePlayPause();
            }}
            onNavigateSection={handleNavigateSection}
            onGoInvitation={handleGoInvitation}
            onGoChallenge={handleGoChallenge}
          />

          {view === 'website' ? (
            <main className="flex-1 w-full">
              <WeddingWebsite
                siteContent={siteContent}
                visibilitySettings={visibilitySettings}
                guestName={guestName}
                isChallengePassed={isChallengePassed}
                availableSongs={effectiveSongs}
                activeSongId={resolvedActiveSongId}
                onSelectSong={handleSelectRewardSong}
                onGoInvitation={handleGoInvitation}
                onGoChallenge={handleGoChallenge}
                onOpenDressCode={() => setIsFaqOpen(true)}
              />
            </main>
          ) : view === 'admin' ? (
            <main className="flex-1 w-full bg-[#FAF7F0]">
              <AdminDashboard
                siteContent={siteContent}
                visibilitySettings={visibilitySettings}
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
                  onSkipChallenge={handleSkipChallenge}
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
                  onSkipChallenge={handleSkipChallenge}
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
            puzzleEnabled={effectivePuzzleEnabled}
            giftingEnabled={effectiveGiftingEnabled}
            visibilitySettings={visibilitySettings}
            typography={siteContent.sectionTypography?.footer}
            onNavigateSection={handleNavigateSection}
            onGoInvitation={handleGoInvitation}
            onGoChallenge={handleGoChallenge}
            onGoAdmin={handleGoAdmin}
          />
        </>
      )}

      <BackgroundMusicPlayer
        ref={musicControllerRef}
        enabled={effectiveMusicEnabled}
        audioUrl={activeAudioUrl}
        isWebsiteView={view === 'website'}
        onPlayingChange={setIsMusicPlaying}
      />
    </div>
  );
}

