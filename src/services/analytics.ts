import type {
  AdminDiagnosticTestResult,
  AnalyticsSectionKey,
  AppView,
  FrontendAnalyticsDiagnostics,
  PublicAnalyticsConfig
} from '../types';

interface MjayGa4TagState {
  measurementId?: string;
  configuredIds?: string[];
  scriptLoaded?: boolean;
  scriptError?: string | null;
  initialized?: boolean;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    google_tag_manager?: Record<string, unknown>;
    __MJAY_GA4_TAG__?: MjayGa4TagState;
    [key: string]: unknown;
  }
}

const DEFAULT_MEASUREMENT_ID = 'G-0TPFK9B9Y5';
const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{6,20}$/i;
const ADMIN_DEBUG_STORAGE_KEY = 'mjay2026_ga4_admin_debug_mode';

const SAFE_PARAM_KEYS = new Set([
  'page_path',
  'page_title',
  'page_location',
  'section_name',
  'interaction_type',
  'interaction_status',
  'value',
  'engagement_seconds',
  'engagement_time_msec',
  'destination',
  'move_count',
  'moves_total',
  'copy_field',
  'file_count',
  'media_kind',
  'succeeded_count',
  'failed_count',
  'track_id',
  'traffic_type',
  'debug_mode',
  'send_to'
]);

const FORBIDDEN_PII_SUBSTRINGS = [
  'name',
  'email',
  'phone',
  'account',
  'bank',
  'message',
  'caption',
  'address',
  'rsvp_answer'
];

let initializedMeasurementId: string | null = null;
const configuredMeasurementIds = new Set<string>();
let initPromise: Promise<boolean> | null = null;
let suppressTrackingForAdmin = false;
let lastTrackedPageKey: string | null = null;
let scriptLoadListenersAttached = false;
let sectionTrackingActive = false;
let observedSectionCount = 0;
let pageViewDispatched = false;
let lastPageViewPath: string | null = null;
let lastPageViewAt: string | null = null;
let dispatchedEventCount = 0;
let lastDispatchedEvent: { name: string; at: string; debugMode: boolean } | null = null;
const trackingErrors: string[] = [];
const diagnosticListeners = new Set<(state: FrontendAnalyticsDiagnostics) => void>();

function recordTrackingError(message: string): void {
  const trimmed = message.trim();
  if (!trimmed) return;
  if (!trackingErrors.includes(trimmed)) {
    trackingErrors.push(trimmed);
    if (trackingErrors.length > 10) {
      trackingErrors.shift();
    }
    notifyDiagnosticListeners();
  }
}

function isLocalhostHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isAdminHashActive(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hash.toLowerCase().startsWith('#admin');
}

export function isAdminDebugModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage?.getItem(ADMIN_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function syncGaDisableFlags(): void {
  if (typeof window === 'undefined') return;
  const shouldDisable = isAdminSessionActive() && !isAdminDebugModeEnabled();
  const ids = new Set<string>(configuredMeasurementIds);
  if (initializedMeasurementId) ids.add(initializedMeasurementId);
  if (window.__MJAY_GA4_TAG__?.measurementId) {
    ids.add(window.__MJAY_GA4_TAG__.measurementId);
  }
  ids.add(DEFAULT_MEASUREMENT_ID);

  for (const id of ids) {
    window[`ga-disable-${id}`] = shouldDisable;
  }
}

function isAdminSessionActive(): boolean {
  if (typeof window === 'undefined') return true;
  return suppressTrackingForAdmin || isAdminHashActive();
}

export function setAdminDebugModeEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      window.sessionStorage?.setItem(ADMIN_DEBUG_STORAGE_KEY, '1');
    } else {
      window.sessionStorage?.removeItem(ADMIN_DEBUG_STORAGE_KEY);
    }
  } catch {
    // Ignore restricted storage contexts
  }
  // Reset page_view dedupe key when toggling test mode so returning to the website dispatches a debug page_view
  lastTrackedPageKey = null;
  syncGaDisableFlags();
  notifyDiagnosticListeners();
}

export function setAnalyticsAdminExclusion(isAdminOrInternal: boolean): void {
  suppressTrackingForAdmin = Boolean(isAdminOrInternal);
  syncGaDisableFlags();
  notifyDiagnosticListeners();
}

function isTrackingSuppressed(): boolean {
  if (typeof window === 'undefined') return true;
  // Permanent rule: admin sessions are excluded from normal visitor analytics.
  // Only when the admin explicitly enables temporary tab-scoped DebugView Mode
  // are events dispatched (and always tagged with debug_mode: true & traffic_type: 'internal').
  if (isAdminSessionActive() && !isAdminDebugModeEnabled()) {
    return true;
  }
  return false;
}

function shouldMarkDebugInternal(): boolean {
  return isAdminSessionActive() && isAdminDebugModeEnabled();
}

function ensureOfficialGtagQueue(): void {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    // CRITICAL: Google's gtag.js strictly requires pushing the `arguments` object
    // into `window.dataLayer` — NOT a plain Array from rest parameters (`...args`).
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };
  }
}

function getCollectBeaconCount(): number {
  if (typeof window === 'undefined' || typeof performance === 'undefined') return 0;
  try {
    const entries = performance.getEntriesByType('resource');
    return entries.filter((entry) => {
      const url = entry.name || '';
      return (
        url.includes('google-analytics.com/g/collect') ||
        url.includes('analytics.google.com/g/collect') ||
        url.includes('google-analytics.com/j/collect')
      );
    }).length;
  } catch {
    return 0;
  }
}

function detectGtagScriptLoaded(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__MJAY_GA4_TAG__?.scriptLoaded) return true;
  if (
    typeof window.google_tag_manager === 'object' &&
    window.google_tag_manager !== null
  ) {
    return true;
  }
  try {
    const entries = performance.getEntriesByType('resource');
    const found = entries.some((entry) =>
      (entry.name || '').includes('googletagmanager.com/gtag/js')
    );
    if (found && !window.__MJAY_GA4_TAG__?.scriptError) {
      return true;
    }
  } catch {
    // Ignore unsupported performance API
  }
  return false;
}

function attachScriptListenersIfPresent(): void {
  if (typeof document === 'undefined' || scriptLoadListenersAttached) return;
  const scriptEl = document.getElementById('mjay2026-ga4-gtag-js') as HTMLScriptElement | null;
  if (!scriptEl) return;
  scriptLoadListenersAttached = true;

  scriptEl.addEventListener('load', () => {
    if (window.__MJAY_GA4_TAG__) {
      window.__MJAY_GA4_TAG__.scriptLoaded = true;
    }
    notifyDiagnosticListeners();
  });

  scriptEl.addEventListener('error', () => {
    const errMsg =
      'gtag.js failed to load (blocked by browser ad blocker, privacy shield, or network).';
    if (window.__MJAY_GA4_TAG__) {
      window.__MJAY_GA4_TAG__.scriptError = errMsg;
    }
    recordTrackingError(errMsg);
  });
}

function sanitizeEventParams(
  rawParams?: Record<string, string | number | boolean | undefined>
): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {};
  if (!rawParams) return clean;

  for (const [key, value] of Object.entries(rawParams)) {
    if (value === undefined || value === null) continue;
    if (!SAFE_PARAM_KEYS.has(key)) continue;

    // Extra defense-in-depth check (allow explicit non-PII 'section_name' only)
    const lowerKey = key.toLowerCase();
    if (
      lowerKey !== 'section_name' &&
      FORBIDDEN_PII_SUBSTRINGS.some((forbidden) => lowerKey.includes(forbidden))
    ) {
      continue;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim().slice(0, 200);
      if (trimmed) clean[key] = trimmed;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      clean[key] = value;
    } else if (typeof value === 'boolean') {
      clean[key] = value;
    }
  }

  if (isLocalhostHost()) {
    clean.traffic_type = 'internal';
  }
  if (shouldMarkDebugInternal()) {
    clean.debug_mode = true;
    clean.traffic_type = 'internal';
  }
  return clean;
}

function configureMeasurementId(measurementId: string): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const normalizedId = measurementId.trim().toUpperCase();
  if (!MEASUREMENT_ID_PATTERN.test(normalizedId)) {
    recordTrackingError(`Invalid GA4 Measurement ID format: ${normalizedId}`);
    return;
  }

  ensureOfficialGtagQueue();
  attachScriptListenersIfPresent();

  // Check if index.html already booted this exact Measurement ID
  const bootState = window.__MJAY_GA4_TAG__;
  if (bootState?.initialized && bootState.configuredIds?.includes(normalizedId)) {
    configuredMeasurementIds.add(normalizedId);
    initializedMeasurementId = normalizedId;
    if (bootState.scriptError) {
      recordTrackingError(bootState.scriptError);
    }
    syncGaDisableFlags();
    notifyDiagnosticListeners();
    return;
  }

  if (configuredMeasurementIds.has(normalizedId)) {
    initializedMeasurementId = normalizedId;
    syncGaDisableFlags();
    notifyDiagnosticListeners();
    return;
  }

  const scriptId = 'mjay2026-ga4-gtag-js';
  if (!document.getElementById(scriptId)) {
    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(normalizedId)}`;
    document.head.appendChild(script);
    scriptLoadListenersAttached = false;
    attachScriptListenersIfPresent();
  }

  const isFirstConfig = configuredMeasurementIds.size === 0 && !bootState?.initialized;
  if (isFirstConfig) {
    window.gtag?.('js', new Date());
  }

  // Disable automatic initial page_view so SPA virtual page_view calls never double-count
  window.gtag?.('config', normalizedId, {
    send_page_view: false,
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ...(isLocalhostHost() ? { traffic_type: 'internal' } : {})
  });

  configuredMeasurementIds.add(normalizedId);
  initializedMeasurementId = normalizedId;
  if (window.__MJAY_GA4_TAG__) {
    window.__MJAY_GA4_TAG__.measurementId = normalizedId;
    window.__MJAY_GA4_TAG__.initialized = true;
    if (!window.__MJAY_GA4_TAG__.configuredIds?.includes(normalizedId)) {
      window.__MJAY_GA4_TAG__.configuredIds = [
        ...(window.__MJAY_GA4_TAG__.configuredIds || []),
        normalizedId
      ];
    }
  }
  syncGaDisableFlags();
  notifyDiagnosticListeners();
}

/**
 * Coordinates with the official Google tag in index.html (G-0TPFK9B9Y5),
 * verifies runtime `/api/analytics/config` without blocking initial tracking,
 * and prevents duplicate initialization.
 */
export async function initializeAnalytics(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (initializedMeasurementId) {
    attachScriptListenersIfPresent();
    syncGaDisableFlags();
    return true;
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // 1. Immediately adopt the official Google tag from index.html or build-time env
      const bootId = (window.__MJAY_GA4_TAG__?.measurementId || '').trim();
      const buildTimeId = (
        (import.meta.env?.VITE_GA4_MEASUREMENT_ID as string | undefined) || ''
      ).trim();

      const immediateId =
        (buildTimeId && MEASUREMENT_ID_PATTERN.test(buildTimeId) ? buildTimeId : '') ||
        (bootId && MEASUREMENT_ID_PATTERN.test(bootId) ? bootId : '') ||
        DEFAULT_MEASUREMENT_ID;

      configureMeasurementId(immediateId);

      // 2. Non-blocking check against runtime `/api/analytics/config` in case server overrides ID
      try {
        const res = await fetch('/api/analytics/config', {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const cfg = (await res.json()) as PublicAnalyticsConfig;
          if (
            cfg.enabled &&
            cfg.measurementId &&
            MEASUREMENT_ID_PATTERN.test(cfg.measurementId) &&
            cfg.measurementId.toUpperCase() !== initializedMeasurementId
          ) {
            configureMeasurementId(cfg.measurementId);
          }
        }
      } catch {
        // Non-fatal: official Google tag in index.html is already active
      }

      // Check shortly after boot whether gtag.js was blocked by an extension or network
      window.setTimeout(() => {
        if (!detectGtagScriptLoaded() && !window.__MJAY_GA4_TAG__?.scriptError) {
          notifyDiagnosticListeners();
        } else {
          notifyDiagnosticListeners();
        }
      }, 2500);

      return Boolean(initializedMeasurementId);
    } catch (err) {
      recordTrackingError(
        err instanceof Error ? err.message : 'Unexpected GA4 initialization error.'
      );
      return false;
    }
  })();

  return initPromise;
}

export function setSectionTrackingDiagnosticState(active: boolean, count: number): void {
  sectionTrackingActive = active;
  observedSectionCount = active ? count : 0;
  notifyDiagnosticListeners();
}

export function getFrontendAnalyticsDiagnostics(): FrontendAnalyticsDiagnostics {
  const scriptError = window.__MJAY_GA4_TAG__?.scriptError || null;
  const loaded = detectGtagScriptLoaded();
  const collectCount = getCollectBeaconCount();
  const adminExcluded = isAdminSessionActive() && !isAdminDebugModeEnabled();
  const allErrors = [...trackingErrors];
  if (scriptError && !allErrors.includes(scriptError)) {
    allErrors.unshift(scriptError);
  }

  let gtagScriptStatus: FrontendAnalyticsDiagnostics['gtagScriptStatus'] = 'loading';
  if (scriptError) {
    gtagScriptStatus = 'blocked_or_failed';
  } else if (loaded) {
    gtagScriptStatus = 'loaded';
  }

  let pageViewStatus: FrontendAnalyticsDiagnostics['pageViewStatus'] = 'not_yet_dispatched';
  if (pageViewDispatched) {
    pageViewStatus = 'dispatched';
  } else if (adminExcluded) {
    pageViewStatus = 'suppressed_admin';
  }

  return {
    gtagScriptLoaded: loaded,
    gtagScriptStatus,
    measurementId:
      initializedMeasurementId || window.__MJAY_GA4_TAG__?.measurementId || DEFAULT_MEASUREMENT_ID,
    initialized: Boolean(initializedMeasurementId || window.__MJAY_GA4_TAG__?.initialized),
    pageViewDispatched,
    pageViewStatus,
    lastPageViewPath,
    lastPageViewAt,
    browserHostname: typeof window !== 'undefined' ? window.location.hostname : '',
    sectionTrackingActive,
    observedSectionCount,
    collectBeaconObserved: collectCount > 0,
    collectBeaconCount: collectCount,
    adminExcluded,
    debugModeEnabled: isAdminDebugModeEnabled(),
    dispatchedEventCount,
    lastDispatchedEvent,
    errors: allErrors
  };
}

function notifyDiagnosticListeners(): void {
  if (diagnosticListeners.size === 0 || typeof window === 'undefined') return;
  const snapshot = getFrontendAnalyticsDiagnostics();
  for (const listener of diagnosticListeners) {
    try {
      listener(snapshot);
    } catch {
      // Ignore subscriber errors
    }
  }
}

export function subscribeFrontendAnalyticsDiagnostics(
  listener: (state: FrontendAnalyticsDiagnostics) => void
): () => void {
  diagnosticListeners.add(listener);
  listener(getFrontendAnalyticsDiagnostics());
  return () => {
    diagnosticListeners.delete(listener);
  };
}

export function refreshFrontendAnalyticsDiagnostics(): FrontendAnalyticsDiagnostics {
  const snapshot = getFrontendAnalyticsDiagnostics();
  notifyDiagnosticListeners();
  return snapshot;
}

export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>
): void {
  if (isTrackingSuppressed()) return;
  if (!initializedMeasurementId || typeof window.gtag !== 'function') return;

  const sanitized = sanitizeEventParams({
    ...params,
    send_to: initializedMeasurementId
  });

  window.gtag('event', eventName, sanitized);
  dispatchedEventCount += 1;
  lastDispatchedEvent = {
    name: eventName,
    at: new Date().toISOString(),
    debugMode: Boolean(sanitized.debug_mode)
  };
  notifyDiagnosticListeners();
}

const VIEW_ROUTE_MAP: Record<Exclude<AppView, 'admin'>, { path: string; title: string }> = {
  invitation: {
    path: '/invitation',
    title: 'Digital Invitation · Mary & Joseph (#mjay2026)'
  },
  welcome: {
    path: '/challenge',
    title: 'Wedding Challenge · Mary & Joseph (#mjay2026)'
  },
  quiz: {
    path: '/challenge/quiz',
    title: 'Wedding Challenge Questions · Mary & Joseph (#mjay2026)'
  },
  approved: {
    path: '/challenge/approved',
    title: 'Guest Pass Approved · Mary & Joseph (#mjay2026)'
  },
  uninvited: {
    path: '/challenge/uninvited',
    title: 'Wedding Challenge Outcome · Mary & Joseph (#mjay2026)'
  },
  website: {
    path: '/',
    title: 'Mary & Joseph · #mjay2026 Wedding Website'
  },
  maintenance: {
    path: '/coming-soon',
    title: 'Coming Soon · Mary & Joseph (#mjay2026)'
  }
};

/**
 * Tracks a deduplicated SPA virtual page_view for public visitor views.
 * Never fires for Admin Dashboard views and prevents duplicate page_view calls.
 */
export function trackVirtualPageView(view: AppView): void {
  if (view === 'admin') {
    lastTrackedPageKey = null;
    notifyDiagnosticListeners();
    return;
  }
  if (isTrackingSuppressed()) {
    notifyDiagnosticListeners();
    return;
  }
  if (!initializedMeasurementId || typeof window.gtag !== 'function') return;

  const meta = VIEW_ROUTE_MAP[view];
  if (!meta) return;

  const debugInternal = shouldMarkDebugInternal();
  const dedupeKey = `${view}:${meta.path}:${debugInternal ? 'debug' : 'public'}`;
  if (lastTrackedPageKey === dedupeKey) return;
  lastTrackedPageKey = dedupeKey;

  const locationUrl = `${window.location.origin}${meta.path}`;
  window.gtag('event', 'page_view', {
    send_to: initializedMeasurementId,
    page_path: meta.path,
    page_title: meta.title,
    page_location: locationUrl,
    ...(isLocalhostHost() ? { traffic_type: 'internal' } : {}),
    ...(debugInternal ? { debug_mode: true, traffic_type: 'internal' } : {})
  });

  const nowIso = new Date().toISOString();
  pageViewDispatched = true;
  lastPageViewPath = meta.path;
  lastPageViewAt = nowIso;
  dispatchedEventCount += 1;
  lastDispatchedEvent = {
    name: 'page_view',
    at: nowIso,
    debugMode: debugInternal
  };
  notifyDiagnosticListeners();

  // Re-check PerformanceResourceTiming shortly after dispatch to update collect beacon indicator
  window.setTimeout(() => {
    notifyDiagnosticListeners();
  }, 900);
}

/**
 * Dispatches a single GA4 DebugView-compatible diagnostic event for administrators
 * without counting it as normal visitor traffic (`debug_mode: true`, `traffic_type: 'internal'`).
 * Restores strict `ga-disable-*` exclusion immediately afterward when temporary DebugView Mode is off.
 */
export async function sendAdminDiagnosticTestEvent(
  kind: 'diagnostic' | 'page_view' = 'diagnostic'
): Promise<AdminDiagnosticTestResult> {
  const timestamp = new Date().toISOString();
  const eventName = kind === 'page_view' ? 'page_view' : 'admin_tag_diagnostic_test';

  if (typeof window === 'undefined') {
    return {
      dispatched: false,
      collectBeaconObserved: false,
      eventName,
      timestamp,
      error: 'Browser window is unavailable.'
    };
  }

  await initializeAnalytics();
  const measurementId = initializedMeasurementId || DEFAULT_MEASUREMENT_ID;

  if (!detectGtagScriptLoaded()) {
    const errMsg =
      window.__MJAY_GA4_TAG__?.scriptError ||
      'gtag.js has not loaded in this browser (check for ad blockers or privacy extensions).';
    return {
      dispatched: false,
      collectBeaconObserved: false,
      eventName,
      timestamp,
      error: errMsg
    };
  }

  if (typeof window.gtag !== 'function') {
    return {
      dispatched: false,
      collectBeaconObserved: false,
      eventName,
      timestamp,
      error: 'window.gtag is not defined.'
    };
  }

  const priorDisableFlag = Boolean(window[`ga-disable-${measurementId}`]);
  const beaconCountBefore = getCollectBeaconCount();

  // Temporarily allow gtag to send ONLY this explicit DebugView diagnostic hit
  window[`ga-disable-${measurementId}`] = false;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const fallbackTimer = window.setTimeout(finish, 1400);

    const baseParams: Record<string, unknown> = {
      send_to: measurementId,
      debug_mode: true,
      traffic_type: 'internal',
      interaction_type: 'diagnostic',
      interaction_status: 'completed',
      event_callback: () => {
        window.clearTimeout(fallbackTimer);
        finish();
      },
      event_timeout: 1200
    };

    if (kind === 'page_view') {
      window.gtag?.('event', 'page_view', {
        ...baseParams,
        page_path: '/admin-diagnostic-test',
        page_title: 'GA4 Tag Diagnostic Test · Mary & Joseph (#mjay2026)',
        page_location: `${window.location.origin}/admin-diagnostic-test`
      });
      pageViewDispatched = true;
      lastPageViewPath = '/admin-diagnostic-test (DebugView)';
      lastPageViewAt = timestamp;
    } else {
      window.gtag?.('event', 'admin_tag_diagnostic_test', {
        ...baseParams,
        section_name: 'welcome'
      });
    }

    dispatchedEventCount += 1;
    lastDispatchedEvent = {
      name: eventName,
      at: timestamp,
      debugMode: true
    };
  });

  // Restore strict permanent admin exclusion if temporary DebugView Mode is off
  if (!isAdminDebugModeEnabled()) {
    window[`ga-disable-${measurementId}`] = priorDisableFlag || isAdminSessionActive();
  }

  // Brief wait for PerformanceResourceTiming entry to register
  await new Promise((r) => window.setTimeout(r, 350));
  const beaconCountAfter = getCollectBeaconCount();
  const beaconObserved = beaconCountAfter > beaconCountBefore || beaconCountAfter > 0;

  notifyDiagnosticListeners();

  return {
    dispatched: true,
    collectBeaconObserved: beaconObserved,
    eventName,
    timestamp,
    error: null
  };
}

// ---------------------------------------------------------------------------
// Section View & Active Engagement Helpers
// ---------------------------------------------------------------------------
export function trackSectionView(sectionName: AnalyticsSectionKey): void {
  trackEvent('section_view', {
    section_name: sectionName,
    interaction_type: 'view',
    interaction_status: 'completed'
  });

  if (sectionName === 'gifting') {
    trackEvent('gifting_viewed', {
      section_name: 'gifting',
      interaction_type: 'view',
      interaction_status: 'completed'
    });
  } else if (sectionName === 'gallery') {
    trackEvent('gallery_viewed', {
      section_name: 'gallery',
      interaction_type: 'view',
      interaction_status: 'completed'
    });
  }
}

export function trackSectionEngagement(
  sectionName: AnalyticsSectionKey,
  activeDurationMs: number
): void {
  const seconds = Math.round(activeDurationMs / 1000);
  if (seconds < 1) return;
  // Cap single flush at 30 minutes to avoid skewed background outliers
  const boundedSeconds = Math.min(seconds, 1800);
  trackEvent('section_engagement', {
    section_name: sectionName,
    interaction_type: 'engagement',
    interaction_status: 'completed',
    engagement_seconds: boundedSeconds,
    engagement_time_msec: boundedSeconds * 1000,
    value: boundedSeconds
  });
}

// ---------------------------------------------------------------------------
// Wedding Experience Interaction Helpers (100% PII-Free)
// ---------------------------------------------------------------------------
export function trackInvitationOpened(): void {
  trackEvent('invitation_opened', {
    section_name: 'welcome',
    interaction_type: 'open',
    interaction_status: 'completed'
  });
}

export function trackInvitationEntryClick(destination: 'challenge' | 'website'): void {
  trackEvent('invitation_entry_click', {
    section_name: 'welcome',
    interaction_type: 'click',
    interaction_status: 'completed',
    destination
  });
}

export function trackChallengeStarted(): void {
  trackEvent('wedding_challenge_started', {
    section_name: 'wedding_challenge',
    interaction_type: 'start',
    interaction_status: 'started'
  });
}

export function trackChallengeCompleted(passed: boolean): void {
  trackEvent('wedding_challenge_completed', {
    section_name: 'wedding_challenge',
    interaction_type: 'complete',
    interaction_status: passed ? 'completed' : 'failed'
  });
}

export function trackPuzzleStarted(): void {
  trackEvent('puzzle_started', {
    section_name: 'wedding_photo_puzzle',
    interaction_type: 'start',
    interaction_status: 'started'
  });
}

export function trackPuzzleMove(moveCount: number): void {
  trackEvent('puzzle_move', {
    section_name: 'wedding_photo_puzzle',
    interaction_type: 'move',
    interaction_status: 'completed',
    move_count: moveCount
  });
}

export function trackPuzzleCompleted(movesTotal: number): void {
  trackEvent('puzzle_completed', {
    section_name: 'wedding_photo_puzzle',
    interaction_type: 'complete',
    interaction_status: 'completed',
    moves_total: movesTotal
  });
}

export function trackPuzzleRewardSongSelected(trackId: string, succeeded: boolean): void {
  trackEvent('puzzle_reward_song_selected', {
    section_name: 'wedding_photo_puzzle',
    interaction_type: 'select',
    interaction_status: succeeded ? 'completed' : 'failed',
    track_id: trackId.slice(0, 64)
  });
}

export function trackSongSuggestionSubmitted(succeeded: boolean): void {
  trackEvent('song_suggestion_submitted', {
    section_name: 'wedding_photo_puzzle',
    interaction_type: 'submit',
    interaction_status: succeeded ? 'completed' : 'failed'
  });
}

export function trackGiftingAccountCopied(
  field: 'account_name' | 'bank_name' | 'account_number',
  succeeded: boolean
): void {
  trackEvent('gifting_account_copied', {
    section_name: 'gifting',
    interaction_type: 'copy',
    interaction_status: succeeded ? 'completed' : 'failed',
    copy_field: field
  });
}

export function trackRsvpFormOpened(): void {
  trackEvent('rsvp_form_opened', {
    section_name: 'rsvp',
    interaction_type: 'open',
    interaction_status: 'started'
  });
}

export function trackRsvpSubmitted(succeeded: boolean): void {
  trackEvent('rsvp_submitted', {
    section_name: 'rsvp',
    interaction_type: 'submit',
    interaction_status: succeeded ? 'completed' : 'failed'
  });
}

export function trackGuestUploadInitiated(
  fileCount: number,
  mediaKind: 'image' | 'video' | 'mixed'
): void {
  trackEvent('guest_upload_initiated', {
    section_name: 'gallery',
    interaction_type: 'upload_start',
    interaction_status: 'started',
    file_count: fileCount,
    media_kind: mediaKind
  });
}

export function trackGuestUploadCompleted(
  succeededCount: number,
  failedCount: number
): void {
  trackEvent('guest_upload_completed', {
    section_name: 'gallery',
    interaction_type: 'upload_complete',
    interaction_status: succeededCount > 0 && failedCount === 0 ? 'completed' : 'failed',
    succeeded_count: succeededCount,
    failed_count: failedCount
  });
}
