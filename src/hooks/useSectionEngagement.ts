import { useEffect, useRef } from 'react';
import type { AnalyticsSectionKey } from '../types';
import {
  setSectionTrackingDiagnosticState,
  trackSectionEngagement,
  trackSectionView
} from '../services/analytics';

const IDLE_TIMEOUT_MS = 45_000;
const VIEW_CONFIRM_DELAY_MS = 700;
const TICK_INTERVAL_MS = 1000;

export const WEBSITE_SECTION_DOM_MAP: Array<{
  elementId: string;
  sectionKey: AnalyticsSectionKey;
}> = [
  { elementId: 'welcome', sectionKey: 'welcome' },
  { elementId: 'story', sectionKey: 'our_story' },
  { elementId: 'schedule', sectionKey: 'schedule' },
  { elementId: 'puzzle', sectionKey: 'wedding_photo_puzzle' },
  { elementId: 'gifting', sectionKey: 'gifting' },
  { elementId: 'faq', sectionKey: 'qa' },
  { elementId: 'rsvp', sectionKey: 'rsvp' },
  { elementId: 'gallery', sectionKey: 'gallery' }
];

/**
 * Observes mounted public sections inside the single-page wedding website and
 * measures genuine active foreground engagement time per section while ignoring
 * background tabs and idle periods.
 */
export function useWebsiteSectionEngagement(
  enabled: boolean,
  visibilitySignature: string
): void {
  const viewedSectionsRef = useRef<Set<AnalyticsSectionKey>>(new Set());

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const ratios = new Map<AnalyticsSectionKey, number>();
    let currentSection: AnalyticsSectionKey | null = null;
    let accumulatedMs = 0;
    let lastTickMs = Date.now();
    let lastActivityMs = Date.now();
    let windowFocused = document.hasFocus();
    let viewConfirmTimer: number | null = null;

    const clearViewConfirmTimer = () => {
      if (viewConfirmTimer !== null) {
        window.clearTimeout(viewConfirmTimer);
        viewConfirmTimer = null;
      }
    };

    const flushCurrentEngagement = () => {
      if (currentSection && accumulatedMs >= 1000) {
        trackSectionEngagement(currentSection, accumulatedMs);
      }
      accumulatedMs = 0;
      lastTickMs = Date.now();
    };

    const isActivelyEngaged = (nowMs: number): boolean => {
      if (document.visibilityState !== 'visible') return false;
      if (!windowFocused) return false;
      return nowMs - lastActivityMs <= IDLE_TIMEOUT_MS;
    };

    const selectDominantSection = () => {
      let bestKey: AnalyticsSectionKey | null = null;
      let bestRatio = 0.22;

      for (const [key, ratio] of ratios.entries()) {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestKey = key;
        }
      }

      if (bestKey !== currentSection) {
        flushCurrentEngagement();
        clearViewConfirmTimer();
        currentSection = bestKey;
        lastTickMs = Date.now();

        if (bestKey && !viewedSectionsRef.current.has(bestKey)) {
          const candidate = bestKey;
          viewConfirmTimer = window.setTimeout(() => {
            if (currentSection === candidate && document.visibilityState === 'visible') {
              viewedSectionsRef.current.add(candidate);
              trackSectionView(candidate);
            }
          }, VIEW_CONFIRM_DELAY_MS);
        }
      }
    };

    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                const sectionKey = entry.target.getAttribute(
                  'data-analytics-section'
                ) as AnalyticsSectionKey | null;
                if (!sectionKey) continue;
                ratios.set(sectionKey, entry.isIntersecting ? entry.intersectionRatio : 0);
              }
              selectDominantSection();
            },
            {
              threshold: [0, 0.15, 0.25, 0.4, 0.6, 0.8]
            }
          )
        : null;

    const observedElements: Element[] = [];
    if (observer) {
      for (const { elementId, sectionKey } of WEBSITE_SECTION_DOM_MAP) {
        const el = document.getElementById(elementId);
        if (!el) continue;
        el.setAttribute('data-analytics-section', sectionKey);
        observer.observe(el);
        observedElements.push(el);
      }
    }
    setSectionTrackingDiagnosticState(observedElements.length > 0, observedElements.length);

    const markActivity = () => {
      lastActivityMs = Date.now();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushCurrentEngagement();
      } else {
        lastTickMs = Date.now();
        lastActivityMs = Date.now();
      }
    };

    const onFocus = () => {
      windowFocused = true;
      lastTickMs = Date.now();
      lastActivityMs = Date.now();
    };

    const onBlur = () => {
      windowFocused = false;
      flushCurrentEngagement();
    };

    const onPageHide = () => {
      flushCurrentEngagement();
    };

    const tickId = window.setInterval(() => {
      const nowMs = Date.now();
      const delta = Math.min(nowMs - lastTickMs, 2500);
      lastTickMs = nowMs;

      if (currentSection && isActivelyEngaged(nowMs)) {
        accumulatedMs += delta;
      }
    }, TICK_INTERVAL_MS);

    const activityEvents: Array<keyof WindowEventMap> = [
      'scroll',
      'pointerdown',
      'keydown',
      'touchstart',
      'mousemove'
    ];
    for (const evt of activityEvents) {
      window.addEventListener(evt, markActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.clearInterval(tickId);
      clearViewConfirmTimer();
      flushCurrentEngagement();
      observer?.disconnect();
      setSectionTrackingDiagnosticState(false, 0);
      for (const el of observedElements) {
        el.removeAttribute('data-analytics-section');
      }
      for (const evt of activityEvents) {
        window.removeEventListener(evt, markActivity);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [enabled, visibilitySignature]);
}

/**
 * Tracks active foreground view & engagement time for a standalone experience
 * (such as the Wedding Challenge views outside the main scrolling page).
 */
export function useStandaloneSectionEngagement(
  sectionKey: AnalyticsSectionKey,
  active: boolean
): void {
  const viewedRef = useRef(false);

  useEffect(() => {
    if (!active || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    if (!viewedRef.current) {
      viewedRef.current = true;
      trackSectionView(sectionKey);
    }
    setSectionTrackingDiagnosticState(true, 1);

    let accumulatedMs = 0;
    let lastTickMs = Date.now();
    let lastActivityMs = Date.now();
    let windowFocused = document.hasFocus();

    const flush = () => {
      if (accumulatedMs >= 1000) {
        trackSectionEngagement(sectionKey, accumulatedMs);
      }
      accumulatedMs = 0;
      lastTickMs = Date.now();
    };

    const markActivity = () => {
      lastActivityMs = Date.now();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
      else {
        lastTickMs = Date.now();
        lastActivityMs = Date.now();
      }
    };
    const onFocus = () => {
      windowFocused = true;
      lastTickMs = Date.now();
      lastActivityMs = Date.now();
    };
    const onBlur = () => {
      windowFocused = false;
      flush();
    };

    const timer = window.setInterval(() => {
      const nowMs = Date.now();
      const delta = Math.min(nowMs - lastTickMs, 2500);
      lastTickMs = nowMs;
      if (
        document.visibilityState === 'visible' &&
        windowFocused &&
        nowMs - lastActivityMs <= IDLE_TIMEOUT_MS
      ) {
        accumulatedMs += delta;
      }
    }, TICK_INTERVAL_MS);

    const events: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'touchstart',
      'mousemove',
      'scroll'
    ];
    for (const evt of events) {
      window.addEventListener(evt, markActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', flush);

    return () => {
      window.clearInterval(timer);
      flush();
      setSectionTrackingDiagnosticState(false, 0);
      for (const evt of events) {
        window.removeEventListener(evt, markActivity);
      }
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', flush);
    };
  }, [sectionKey, active]);
}
