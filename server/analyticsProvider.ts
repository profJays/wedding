import crypto from 'node:crypto';
import type {
  AnalyticsConnectionStatus,
  AnalyticsDateRange,
  AnalyticsDeviceMetric,
  AnalyticsErrorCode,
  AnalyticsLocationMetric,
  AnalyticsOverviewMetrics,
  AnalyticsPageMetric,
  AnalyticsRealtimeData,
  AnalyticsRealtimeDeviceItem,
  AnalyticsRealtimeEventItem,
  AnalyticsRealtimeLocationItem,
  AnalyticsRealtimePageItem,
  AnalyticsReportData,
  AnalyticsSectionKey,
  AnalyticsSectionMetric,
  AnalyticsTimeSeriesPoint,
  AnalyticsTrafficSourceMetric,
  AnalyticsWeddingExperienceMetric,
  AnalyticsWeeklySeriesPoint,
  PublicAnalyticsConfig
} from '../src/types.ts';

const GA4_READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GA4_DATA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta';
const CANONICAL_SITE_URL = 'https://mary-joseph.com';

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{6,20}$/i;
const PROPERTY_ID_PATTERN = /^\d{5,20}$/;

const REPORT_CACHE_TTL_MS = 60_000;
const REALTIME_CACHE_TTL_MS = 15_000;

interface ServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
  projectId: string | null;
  source: 'service_account_json' | 'email_and_private_key';
}

interface CredentialReadResult {
  credentials: ServiceAccountCredentials | null;
  invalidReason: string | null;
}

interface TokenCacheEntry {
  accessToken: string;
  expiresAtMs: number;
  clientEmail: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAtMs: number;
}

let cachedServiceToken: TokenCacheEntry | null = null;
const reportCache = new Map<AnalyticsDateRange, CacheEntry<AnalyticsReportData>>();
let realtimeCache: CacheEntry<AnalyticsRealtimeData> | null = null;

interface Ga4Row {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

interface Ga4ErrorDetail {
  '@type'?: string;
  reason?: string;
  domain?: string;
  metadata?: Record<string, string>;
  links?: Array<{ description?: string; url?: string }>;
}

interface Ga4ReportResponse {
  rows?: Ga4Row[];
  rowCount?: number;
  metadata?: {
    currencyCode?: string;
    timeZone?: string;
    subjectToThresholding?: boolean;
    dataLossFromOtherRow?: boolean;
  };
  error?: {
    code?: number;
    status?: string;
    message?: string;
    details?: Ga4ErrorDetail[];
  };
}

type Ga4InternalErrorCode =
  | 'invalid_credentials'
  | 'api_not_enabled'
  | 'permission_denied'
  | 'quota_exceeded'
  | 'invalid_argument'
  | 'api_error';

class Ga4ApiError extends Error {
  readonly code: Ga4InternalErrorCode;
  readonly httpStatus: number;
  readonly activationUrl: string | null;

  constructor(
    message: string,
    code: Ga4InternalErrorCode,
    httpStatus = 500,
    activationUrl: string | null = null
  ) {
    super(message);
    this.name = 'Ga4ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.activationUrl = activationUrl;
  }
}

const SECTION_CATALOG: Array<{ key: AnalyticsSectionKey; label: string }> = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'our_story', label: 'Our Story' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'wedding_challenge', label: 'Wedding Challenge' },
  { key: 'wedding_photo_puzzle', label: 'Wedding Photo Puzzle' },
  { key: 'gifting', label: 'Gifting' },
  { key: 'qa', label: 'Q&A' },
  { key: 'rsvp', label: 'RSVP' },
  { key: 'gallery', label: 'Gallery' }
];

const EVENT_FRIENDLY_LABELS: Record<string, string> = {
  page_view: 'Page Viewed',
  session_start: 'Session Started',
  first_visit: 'First-Time Visitor',
  user_engagement: 'Active Engagement',
  scroll: 'Scrolled Page',
  section_view: 'Section Viewed',
  section_engagement: 'Section Active Time',
  invitation_opened: 'Digital Invitation Opened',
  invitation_entry_click: 'Invitation Entry Clicked',
  wedding_challenge_started: 'Wedding Challenge Started',
  wedding_challenge_completed: 'Wedding Challenge Completed',
  puzzle_started: 'Photo Puzzle Started',
  puzzle_move: 'Photo Puzzle Move Made',
  puzzle_completed: 'Photo Puzzle Completed',
  puzzle_reward_song_selected: 'Puzzle Reward Song Selected',
  song_suggestion_submitted: 'Song Suggestion Submitted',
  gifting_viewed: 'Gifting Section Viewed',
  gifting_account_copied: 'Gifting Account Detail Copied',
  rsvp_form_opened: 'RSVP Form Opened',
  rsvp_submitted: 'RSVP Submitted',
  gallery_viewed: 'Gallery Viewed',
  guest_upload_initiated: 'Guest Upload Initiated',
  guest_upload_completed: 'Guest Upload Completed'
};

function maskIdentifier(raw: string | null, visiblePrefix = 4, visibleSuffix = 3): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length <= visiblePrefix + visibleSuffix + 2) {
    return `${trimmed.slice(0, 2)}••••`;
  }
  return `${trimmed.slice(0, visiblePrefix)}••••${trimmed.slice(-visibleSuffix)}`;
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const atIndex = email.indexOf('@');
  if (atIndex <= 2) return '••••@gserviceaccount.com';
  return `${email.slice(0, 4)}••••${email.slice(atIndex)}`;
}

function readMeasurementId(): string | null {
  const raw = (process.env.GA4_MEASUREMENT_ID || process.env.VITE_GA4_MEASUREMENT_ID || '').trim();
  if (!raw || !MEASUREMENT_ID_PATTERN.test(raw)) {
    return null;
  }
  return raw.toUpperCase();
}

function readPropertyId(): string | null {
  const raw = (process.env.GA4_PROPERTY_ID || '').trim().replace(/^properties\//i, '');
  if (!raw || !PROPERTY_ID_PATTERN.test(raw)) {
    return null;
  }
  return raw;
}

function normalizePrivateKeyPem(key: string): string {
  return key.replace(/\\n/g, '\n').trim();
}

function sanitizeConsoleActivationUrl(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'https:') return null;
    if (
      parsed.hostname !== 'console.developers.google.com' &&
      parsed.hostname !== 'console.cloud.google.com'
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function readServiceAccountCredentialsResult(): CredentialReadResult {
  const rawJson = (process.env.GA4_SERVICE_ACCOUNT_JSON || '').trim();
  if (rawJson) {
    try {
      const decoded = rawJson.startsWith('{')
        ? rawJson
        : Buffer.from(rawJson, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded) as {
        client_email?: string;
        private_key?: string;
        project_id?: string;
      };
      if (parsed.client_email && parsed.private_key) {
        return {
          credentials: {
            clientEmail: parsed.client_email.trim(),
            privateKey: normalizePrivateKeyPem(parsed.private_key),
            projectId: typeof parsed.project_id === 'string' && parsed.project_id.trim()
              ? parsed.project_id.trim()
              : null,
            source: 'service_account_json'
          },
          invalidReason: null
        };
      }
      return {
        credentials: null,
        invalidReason:
          'GA4_SERVICE_ACCOUNT_JSON is set, but it is missing client_email or private_key.'
      };
    } catch {
      // Fall through to individual env vars only if they are set; otherwise report invalid JSON
      const fallbackEmail = (process.env.GA4_SERVICE_ACCOUNT_EMAIL || '').trim();
      const fallbackKey = (process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY || '').trim();
      if (!fallbackEmail || !fallbackKey) {
        return {
          credentials: null,
          invalidReason:
            'GA4_SERVICE_ACCOUNT_JSON could not be parsed as valid JSON or Base64-encoded service account JSON.'
        };
      }
    }
  }

  const email = (process.env.GA4_SERVICE_ACCOUNT_EMAIL || '').trim();
  const privateKeyRaw = (process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY || '').trim();
  if (email && privateKeyRaw) {
    const inferredProjectMatch = email.match(/@([^.]+)\.iam\.gserviceaccount\.com$/i);
    return {
      credentials: {
        clientEmail: email,
        privateKey: normalizePrivateKeyPem(privateKeyRaw),
        projectId: inferredProjectMatch ? inferredProjectMatch[1] : null,
        source: 'email_and_private_key'
      },
      invalidReason: null
    };
  }

  return { credentials: null, invalidReason: null };
}

export function getPublicAnalyticsConfig(): PublicAnalyticsConfig {
  const measurementId = readMeasurementId();
  return {
    enabled: Boolean(measurementId),
    measurementId,
    siteUrl: CANONICAL_SITE_URL
  };
}

export function getAnalyticsConnectionStatus(overrides?: {
  customDimensionsRegistered?: boolean | null;
  errorCode?: AnalyticsErrorCode;
  errorMessage?: string | null;
  activationUrl?: string | null;
}): AnalyticsConnectionStatus {
  const measurementId = readMeasurementId();
  const propertyId = readPropertyId();
  const { credentials: creds, invalidReason } = readServiceAccountCredentialsResult();

  const missingEnvVars: string[] = [];
  if (!measurementId) missingEnvVars.push('GA4_MEASUREMENT_ID');
  if (!propertyId) missingEnvVars.push('GA4_PROPERTY_ID');
  if (!creds && !invalidReason) {
    missingEnvVars.push(
      'GA4_SERVICE_ACCOUNT_JSON (or GA4_SERVICE_ACCOUNT_EMAIL + GA4_SERVICE_ACCOUNT_PRIVATE_KEY)'
    );
  }

  const reportingConfigured = Boolean(propertyId && creds);
  const defaultErrorCode: AnalyticsErrorCode = reportingConfigured
    ? 'none'
    : invalidReason
    ? 'invalid_credentials'
    : 'not_configured';
  const defaultErrorMessage = reportingConfigured
    ? null
    : invalidReason ||
      'Add GA4_MEASUREMENT_ID, GA4_PROPERTY_ID, and read-only service account credentials in your server environment to load live Google Analytics reports.';

  return {
    trackingConfigured: Boolean(measurementId),
    reportingConfigured,
    measurementIdMasked: maskIdentifier(measurementId, 5, 3),
    propertyIdMasked: maskIdentifier(propertyId, 3, 3),
    serviceAccountEmailMasked: maskEmail(creds?.clientEmail || null),
    serviceAccountProjectId: creds?.projectId ?? null,
    credentialSource: creds?.source ?? 'none',
    missingEnvVars,
    customDimensionsRegistered: overrides?.customDimensionsRegistered ?? null,
    lastCheckedAt: new Date().toISOString(),
    errorCode: overrides?.errorCode ?? defaultErrorCode,
    errorMessage: overrides?.errorMessage !== undefined ? overrides.errorMessage : defaultErrorMessage,
    activationUrl: sanitizeConsoleActivationUrl(overrides?.activationUrl ?? null)
  };
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function getGa4AccessToken(creds: ServiceAccountCredentials): Promise<string> {
  if (
    cachedServiceToken &&
    cachedServiceToken.clientEmail === creds.clientEmail &&
    Date.now() < cachedServiceToken.expiresAtMs - 300_000
  ) {
    return cachedServiceToken.accessToken;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: creds.clientEmail,
      scope: GA4_READONLY_SCOPE,
      aud: GOOGLE_TOKEN_ENDPOINT,
      exp: nowSec + 3600,
      iat: nowSec
    })
  );

  const unsignedJwt = `${header}.${claimSet}`;
  let signature: Buffer;
  try {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedJwt);
    signer.end();
    signature = signer.sign(creds.privateKey);
  } catch {
    throw new Ga4ApiError(
      'Unable to sign GA4 service account token. Verify that GA4_SERVICE_ACCOUNT_JSON (or GA4_SERVICE_ACCOUNT_PRIVATE_KEY) contains a valid PEM private key.',
      'invalid_credentials',
      401
    );
  }

  const assertion = `${unsignedJwt}.${base64UrlEncode(signature)}`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });

  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokenJson.access_token) {
    const errCode = (tokenJson.error || '').toLowerCase();
    const desc = tokenJson.error_description || tokenJson.error || `HTTP ${tokenRes.status}`;
    const isCredentialError =
      tokenRes.status === 400 ||
      tokenRes.status === 401 ||
      errCode === 'invalid_grant' ||
      errCode === 'invalid_client' ||
      errCode === 'unauthorized_client';
    throw new Ga4ApiError(
      `GA4 service account authentication failed (${desc}). Verify the service account key is active and has not been revoked.`,
      isCredentialError ? 'invalid_credentials' : 'api_error',
      tokenRes.status
    );
  }

  const expiresInSec = Number(tokenJson.expires_in) || 3600;
  cachedServiceToken = {
    accessToken: tokenJson.access_token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
    clientEmail: creds.clientEmail
  };
  return tokenJson.access_token;
}

function mapGa4ErrorToPublicCode(err: Ga4ApiError | null): AnalyticsErrorCode {
  if (!err) return 'api_error';
  switch (err.code) {
    case 'api_not_enabled':
      return 'api_not_enabled';
    case 'invalid_credentials':
      return 'invalid_credentials';
    case 'permission_denied':
      return 'permission_denied';
    case 'quota_exceeded':
      return 'quota_exceeded';
    default:
      return 'api_error';
  }
}

async function runGa4Endpoint(
  propertyId: string,
  endpoint: 'runReport' | 'runRealtimeReport',
  payload: Record<string, unknown>,
  accessToken: string,
  serviceAccountProjectId: string | null = null
): Promise<Ga4ReportResponse> {
  const url = `${GA4_DATA_API_BASE}/properties/${encodeURIComponent(propertyId)}:${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = (await res.json().catch(() => ({}))) as Ga4ReportResponse;
  if (!res.ok) {
    const apiMsg = json.error?.message || `Google Analytics API returned HTTP ${res.status}`;
    const apiStatus = (json.error?.status || '').toUpperCase();
    const details = Array.isArray(json.error?.details) ? json.error.details : [];

    // 1. Distinguish Google Analytics Data API disabled (SERVICE_DISABLED) from GA4 property permissions
    const serviceDisabledDetail = details.find(
      (d) =>
        d.reason === 'SERVICE_DISABLED' ||
        d.metadata?.service === 'analyticsdata.googleapis.com'
    );
    const isApiDisabledByMessage =
      /has not been used in project .* before or it is disabled/i.test(apiMsg) ||
      /analyticsdata\.googleapis\.com.*(disabled|not enabled)/i.test(apiMsg);

    if (serviceDisabledDetail || isApiDisabledByMessage) {
      const helpLink = details
        .flatMap((d) => (Array.isArray(d.links) ? d.links : []))
        .find((l) => typeof l.url === 'string' && l.url.includes('analyticsdata.googleapis.com'));
      const rawActivationUrl =
        serviceDisabledDetail?.metadata?.activationUrl || helpLink?.url || null;
      const safeActivationUrl = sanitizeConsoleActivationUrl(rawActivationUrl);

      const projectNumberMatch = apiMsg.match(/project\s+(\d+)/i);
      const consumerRef = serviceDisabledDetail?.metadata?.consumer?.replace(/^projects\//, '') ||
        projectNumberMatch?.[1] ||
        null;
      const projectLabel = serviceAccountProjectId
        ? consumerRef
          ? `${serviceAccountProjectId} (project ${consumerRef})`
          : serviceAccountProjectId
        : consumerRef
        ? `project ${consumerRef}`
        : 'the service account Google Cloud project';

      throw new Ga4ApiError(
        `Google Analytics Data API (analyticsdata.googleapis.com) is not enabled in Google Cloud project ${projectLabel}. Your service account credentials authenticated successfully, but the API must be enabled in Google Cloud Console before GA4 reports can be queried. Once enabled, wait 1–2 minutes and click Refresh Now.`,
        'api_not_enabled',
        403,
        safeActivationUrl
      );
    }

    // 2. Authentication / invalid token
    if (res.status === 401 || apiStatus === 'UNAUTHENTICATED') {
      throw new Ga4ApiError(
        'Google rejected the GA4 service account access token. Verify the service account credentials are valid and active.',
        'invalid_credentials',
        401
      );
    }

    // 3. True GA4 Property Viewer permission error
    if (res.status === 403 || apiStatus === 'PERMISSION_DENIED') {
      throw new Ga4ApiError(
        `The analytics service account does not have sufficient read-only Viewer access to GA4 Property ${maskIdentifier(propertyId, 3, 3)}. Confirm the service account email has the Viewer role under GA4 Admin → Property Access Management (and allow a few minutes for newly granted roles to propagate).`,
        'permission_denied',
        403
      );
    }

    // 4. Quota limits
    if (res.status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
      throw new Ga4ApiError(
        'Google Analytics Data API quota limit was reached temporarily. Reports will resume automatically shortly.',
        'quota_exceeded',
        429
      );
    }

    // 5. Invalid argument (e.g. unregistered custom dimensions)
    if (res.status === 400 || apiStatus === 'INVALID_ARGUMENT') {
      throw new Ga4ApiError(apiMsg, 'invalid_argument', 400);
    }

    throw new Ga4ApiError(apiMsg, 'api_error', res.status);
  }

  return json;
}

function optionalNumVal(row: Ga4Row | undefined, metricIndex: number): number | null {
  if (!row || !Array.isArray(row.metricValues)) return null;
  const raw = row.metricValues[metricIndex]?.value;
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function numVal(row: Ga4Row | undefined, metricIndex: number): number {
  return optionalNumVal(row, metricIndex) ?? 0;
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function resolveDateRangeApplied(
  range: AnalyticsDateRange,
  timeZone: string
): {
  startDate: string;
  endDate: string;
  resolvedStartDate: string;
  resolvedEndDate: string;
} {
  const spec = getDateRangeSpec(range);
  const now = new Date();
  const todayStr = formatDateInTimeZone(now, timeZone);

  const shiftDays = (daysBack: number): string => {
    const base = new Date(`${todayStr}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() - daysBack);
    return base.toISOString().slice(0, 10);
  };

  let resolvedStartDate = todayStr;
  if (range === 'today') {
    resolvedStartDate = todayStr;
  } else if (range === '7d') {
    resolvedStartDate = shiftDays(6);
  } else if (range === '30d') {
    resolvedStartDate = shiftDays(29);
  } else {
    resolvedStartDate = spec.startDate;
  }

  return {
    startDate: spec.startDate,
    endDate: spec.endDate,
    resolvedStartDate,
    resolvedEndDate: todayStr
  };
}

function dimVal(row: Ga4Row | undefined, dimIndex: number, fallback = '(not set)'): string {
  const raw = (row?.dimensionValues?.[dimIndex]?.value || '').trim();
  return raw || fallback;
}

function formatGa4Date(yyyymmdd: string): { iso: string; label: string } {
  if (!/^\d{8}$/.test(yyyymmdd)) {
    return { iso: yyyymmdd, label: yyyymmdd };
  }
  const year = yyyymmdd.slice(0, 4);
  const month = yyyymmdd.slice(4, 6);
  const day = yyyymmdd.slice(6, 8);
  const iso = `${year}-${month}-${day}`;
  const d = new Date(`${iso}T00:00:00Z`);
  const label = Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return { iso, label };
}

function computeWeeklySeries(daily: AnalyticsTimeSeriesPoint[]): AnalyticsWeeklySeriesPoint[] {
  const buckets = new Map<string, { users: number; sessions: number; pageViews: number }>();
  for (const pt of daily) {
    const d = new Date(`${pt.date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const dayOfWeek = d.getUTCDay(); // 0=Sun..6=Sat
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStartDate = new Date(d);
    weekStartDate.setUTCDate(d.getUTCDate() + mondayOffset);
    const weekKey = weekStartDate.toISOString().slice(0, 10);

    const existing = buckets.get(weekKey) || { users: 0, sessions: 0, pageViews: 0 };
    existing.users += pt.users;
    existing.sessions += pt.sessions;
    existing.pageViews += pt.pageViews;
    buckets.set(weekKey, existing);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, agg]) => {
      const d = new Date(`${weekStart}T00:00:00Z`);
      const label = `Wk ${d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC'
      })}`;
      return {
        weekStart,
        label,
        users: agg.users,
        sessions: agg.sessions,
        pageViews: agg.pageViews
      };
    });
}

function getDateRangeSpec(range: AnalyticsDateRange): { startDate: string; endDate: string } {
  switch (range) {
    case 'today':
      return { startDate: 'today', endDate: 'today' };
    case '7d':
      return { startDate: '6daysAgo', endDate: 'today' };
    case '30d':
      return { startDate: '29daysAgo', endDate: 'today' };
    case 'all':
      return { startDate: '2025-01-01', endDate: 'today' };
  }
}

export function isValidAnalyticsDateRange(value: unknown): value is AnalyticsDateRange {
  return value === 'today' || value === '7d' || value === '30d' || value === 'all';
}

function buildEmptySections(): AnalyticsSectionMetric[] {
  return SECTION_CATALOG.map((item) => ({
    sectionKey: item.key,
    label: item.label,
    views: null,
    totalEngagementSeconds: null,
    avgEngagementSeconds: null
  }));
}

function buildEmptyWeddingExperience(
  noteOverride?: string
): AnalyticsWeddingExperienceMetric[] {
  return [
    {
      key: 'digital_invitation',
      category: 'Digital Invitation',
      label: 'Envelope Opened & Entry Clicked',
      clicksOrStarted: null,
      completed: null,
      failed: null,
      totalEvents: null,
      detailNote: noteOverride || 'Tracks wax-seal opens and entry button clicks'
    },
    {
      key: 'wedding_challenge',
      category: 'Wedding Challenge',
      label: 'Challenge Started & Completed',
      clicksOrStarted: null,
      completed: null,
      failed: null,
      totalEvents: null,
      detailNote: noteOverride || 'Started vs passed (approved) vs uninvited outcome'
    },
    {
      key: 'photo_puzzle',
      category: 'Wedding Photo Puzzle',
      label: 'Puzzle Started, Moves & Solved',
      clicksOrStarted: null,
      completed: null,
      failed: null,
      totalEvents: null,
      detailNote: noteOverride || 'Tracks starts, total tile moves, and completions'
    },
    {
      key: 'puzzle_song_reward',
      category: 'Music & Songs',
      label: 'Puzzle Reward Songs Selected',
      clicksOrStarted: null,
      completed: null,
      failed: null,
      totalEvents: null,
      detailNote: noteOverride || 'Songs selected from the post-puzzle reward player'
    },
    {
      key: 'song_suggestions',
      category: 'Music & Songs',
      label: 'Guest Song Suggestions Submitted',
      clicksOrStarted: null,
      completed: null,
      failed: null,
      totalEvents: null,
      detailNote: noteOverride || 'Successful submissions vs validation or network failures'
    },
    {
      key: 'gifting',
      category: 'Gifting',
      label: 'Gifting Viewed & Account Details Copied',
      clicksOrStarted: null,
      completed: null,
      failed: null,
      totalEvents: null,
      detailNote: noteOverride || 'Section views vs successful clipboard copies'
    },
    {
      key: 'rsvp',
      category: 'RSVP',
      label: 'RSVP Form Opened & Submitted',
      clicksOrStarted: null,
      completed: null,
      failed: null,
      totalEvents: null,
      detailNote: noteOverride || 'Form opens vs confirmed submissions vs failed attempts'
    },
    {
      key: 'gallery_uploads',
      category: 'Gallery & Uploads',
      label: 'Gallery Viewed & Guest Media Uploads',
      clicksOrStarted: null,
      completed: null,
      failed: null,
      totalEvents: null,
      detailNote: noteOverride || 'Upload batches initiated vs completed vs failed'
    }
  ];
}

function buildUnavailableReport(
  range: AnalyticsDateRange,
  status: AnalyticsConnectionStatus
): AnalyticsReportData {
  return {
    available: false,
    dataState: 'unavailable',
    dataStateMessage: status.errorMessage,
    propertyTimeZone: null,
    dateRangeApplied: null,
    hasIntradayLag: false,
    realtimeSummary: null,
    range,
    fetchedAt: new Date().toISOString(),
    cached: false,
    status,
    overview: {
      totalUsers: null,
      activeUsers: null,
      sessions: null,
      pageViews: null,
      avgEngagementSeconds: null,
      newUsers: null,
      returningUsers: null
    },
    dailySeries: [],
    weeklySeries: [],
    topPages: [],
    devices: [],
    locations: [],
    trafficSources: [],
    sections: buildEmptySections(),
    sectionMetricsAvailable: false,
    weddingExperience: buildEmptyWeddingExperience(),
    interactionStatusAvailable: false
  };
}

function normalizeSectionKey(raw: string): AnalyticsSectionKey | null {
  const clean = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const valid = SECTION_CATALOG.find((s) => s.key === clean);
  return valid ? valid.key : null;
}

function buildWeddingExperienceMetrics(
  eventTotals: Map<string, number>,
  eventStatusCounts: Map<string, { started: number; completed: number; failed: number }> | null
): AnalyticsWeddingExperienceMetric[] {
  const count = (eventName: string): number => eventTotals.get(eventName) ?? 0;
  const statusOf = (eventName: string, kind: 'started' | 'completed' | 'failed'): number | null => {
    if (!eventStatusCounts) return null;
    return eventStatusCounts.get(eventName)?.[kind] ?? 0;
  };

  const inviteOpens = count('invitation_opened');
  const inviteClicks = count('invitation_entry_click');

  const challengeStarts = count('wedding_challenge_started');
  const challengeCompleted =
    statusOf('wedding_challenge_completed', 'completed') ?? count('wedding_challenge_completed');
  const challengeFailed = statusOf('wedding_challenge_completed', 'failed');

  const puzzleStarts = count('puzzle_started');
  const puzzleMoves = count('puzzle_move');
  const puzzleSolved = count('puzzle_completed');

  const rewardSongTotal = count('puzzle_reward_song_selected');
  const rewardSongCompleted =
    statusOf('puzzle_reward_song_selected', 'completed') ?? rewardSongTotal;
  const rewardSongFailed = statusOf('puzzle_reward_song_selected', 'failed');

  const suggestionTotal = count('song_suggestion_submitted');
  const suggestionCompleted =
    statusOf('song_suggestion_submitted', 'completed') ?? suggestionTotal;
  const suggestionFailed = statusOf('song_suggestion_submitted', 'failed');

  const giftingViews = count('gifting_viewed');
  const giftingCopyTotal = count('gifting_account_copied');
  const giftingCopyCompleted =
    statusOf('gifting_account_copied', 'completed') ?? giftingCopyTotal;
  const giftingCopyFailed = statusOf('gifting_account_copied', 'failed');

  const rsvpOpened = count('rsvp_form_opened');
  const rsvpSubmitTotal = count('rsvp_submitted');
  const rsvpCompleted = statusOf('rsvp_submitted', 'completed') ?? rsvpSubmitTotal;
  const rsvpFailed = statusOf('rsvp_submitted', 'failed');

  const galleryViews = count('gallery_viewed');
  const uploadInitiated = count('guest_upload_initiated');
  const uploadTotal = count('guest_upload_completed');
  const uploadCompleted = statusOf('guest_upload_completed', 'completed') ?? uploadTotal;
  const uploadFailed = statusOf('guest_upload_completed', 'failed');

  return [
    {
      key: 'digital_invitation',
      category: 'Digital Invitation',
      label: 'Digital Invitation Opened & Entry Clicked',
      clicksOrStarted: inviteClicks,
      completed: inviteOpens,
      failed: 0,
      totalEvents: inviteOpens + inviteClicks,
      detailNote: `${inviteOpens.toLocaleString()} envelope opens · ${inviteClicks.toLocaleString()} entry button clicks`
    },
    {
      key: 'wedding_challenge',
      category: 'Wedding Challenge',
      label: 'Wedding Challenge Started & Completed',
      clicksOrStarted: challengeStarts,
      completed: challengeCompleted,
      failed: challengeFailed,
      totalEvents: challengeStarts + count('wedding_challenge_completed'),
      detailNote:
        challengeFailed !== null
          ? `${challengeStarts.toLocaleString()} started · ${challengeCompleted.toLocaleString()} passed · ${challengeFailed.toLocaleString()} uninvited`
          : `${challengeStarts.toLocaleString()} started · ${count('wedding_challenge_completed').toLocaleString()} finished`
    },
    {
      key: 'photo_puzzle',
      category: 'Wedding Photo Puzzle',
      label: 'Photo Puzzle Started, Moves & Completed',
      clicksOrStarted: puzzleStarts,
      completed: puzzleSolved,
      failed: 0,
      totalEvents: puzzleStarts + puzzleMoves + puzzleSolved,
      detailNote: `${puzzleStarts.toLocaleString()} started · ${puzzleMoves.toLocaleString()} tile moves · ${puzzleSolved.toLocaleString()} solved`
    },
    {
      key: 'puzzle_song_reward',
      category: 'Music & Songs',
      label: 'Puzzle Reward Songs Selected',
      clicksOrStarted: rewardSongTotal,
      completed: rewardSongCompleted,
      failed: rewardSongFailed,
      totalEvents: rewardSongTotal,
      detailNote: `${rewardSongTotal.toLocaleString()} reward track selections`
    },
    {
      key: 'song_suggestions',
      category: 'Music & Songs',
      label: 'Song Suggestions Submitted',
      clicksOrStarted: suggestionTotal,
      completed: suggestionCompleted,
      failed: suggestionFailed,
      totalEvents: suggestionTotal,
      detailNote:
        suggestionFailed !== null
          ? `${suggestionCompleted.toLocaleString()} succeeded · ${suggestionFailed.toLocaleString()} failed`
          : `${suggestionTotal.toLocaleString()} submissions recorded`
    },
    {
      key: 'gifting',
      category: 'Gifting',
      label: 'Gifting Viewed & Account Details Copied',
      clicksOrStarted: giftingViews,
      completed: giftingCopyCompleted,
      failed: giftingCopyFailed,
      totalEvents: giftingViews + giftingCopyTotal,
      detailNote: `${giftingViews.toLocaleString()} section views · ${giftingCopyCompleted.toLocaleString()} account copies`
    },
    {
      key: 'rsvp',
      category: 'RSVP',
      label: 'RSVP Form Opened & Submitted',
      clicksOrStarted: rsvpOpened,
      completed: rsvpCompleted,
      failed: rsvpFailed,
      totalEvents: rsvpOpened + rsvpSubmitTotal,
      detailNote:
        rsvpFailed !== null
          ? `${rsvpOpened.toLocaleString()} opened · ${rsvpCompleted.toLocaleString()} submitted · ${rsvpFailed.toLocaleString()} failed`
          : `${rsvpOpened.toLocaleString()} opened · ${rsvpSubmitTotal.toLocaleString()} submitted`
    },
    {
      key: 'gallery_uploads',
      category: 'Gallery & Uploads',
      label: 'Gallery Viewed & Guest Media Uploads',
      clicksOrStarted: uploadInitiated,
      completed: uploadCompleted,
      failed: uploadFailed,
      totalEvents: galleryViews + uploadInitiated + uploadTotal,
      detailNote: `${galleryViews.toLocaleString()} gallery views · ${uploadInitiated.toLocaleString()} upload batches started`
    }
  ];
}

export async function fetchAnalyticsRealtimeReport(forceRefresh = false): Promise<AnalyticsRealtimeData> {
  if (!forceRefresh && realtimeCache && Date.now() < realtimeCache.expiresAtMs) {
    return realtimeCache.value;
  }

  const propertyId = readPropertyId();
  const { credentials: creds, invalidReason } = readServiceAccountCredentialsResult();
  if (!propertyId || !creds) {
    return {
      available: false,
      fetchedAt: new Date().toISOString(),
      activeUsersNow: null,
      activeUsersLast30Min: null,
      recentEvents: [],
      activePages: [],
      locations: [],
      devices: [],
      errorCode: invalidReason ? 'invalid_credentials' : 'not_configured',
      errorMessage:
        invalidReason ||
        'Configure GA4_PROPERTY_ID and read-only service account credentials to stream real-time visitor data.',
      activationUrl: null
    };
  }

  try {
    const accessToken = await getGa4AccessToken(creds);
    const projectId = creds.projectId;

    const [activeNowRes, active30mRes, eventsRes, pagesRes, locationsRes, devicesRes] =
      await Promise.all([
        runGa4Endpoint(
          propertyId,
          'runRealtimeReport',
          {
            minuteRanges: [{ name: 'now', startMinutesAgo: 4, endMinutesAgo: 0 }],
            metrics: [{ name: 'activeUsers' }]
          },
          accessToken,
          projectId
        ),
        runGa4Endpoint(
          propertyId,
          'runRealtimeReport',
          {
            minuteRanges: [{ name: 'last30m', startMinutesAgo: 29, endMinutesAgo: 0 }],
            metrics: [
              { name: 'activeUsers' },
              { name: 'screenPageViews' },
              { name: 'eventCount' }
            ]
          },
          accessToken,
          projectId
        ),
        runGa4Endpoint(
          propertyId,
          'runRealtimeReport',
          {
            dimensions: [{ name: 'eventName' }, { name: 'minutesAgo' }],
            metrics: [{ name: 'eventCount' }],
            orderBys: [
              { dimension: { dimensionName: 'minutesAgo', orderType: 'NUMERIC' }, desc: false },
              { metric: { metricName: 'eventCount' }, desc: true }
            ],
            limit: 25
          },
          accessToken,
          projectId
        ),
        runGa4Endpoint(
          propertyId,
          'runRealtimeReport',
          {
            dimensions: [{ name: 'unifiedScreenName' }],
            metrics: [{ name: 'activeUsers' }],
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
            limit: 10
          },
          accessToken,
          projectId
        ),
        runGa4Endpoint(
          propertyId,
          'runRealtimeReport',
          {
            dimensions: [{ name: 'country' }, { name: 'city' }],
            metrics: [{ name: 'activeUsers' }],
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
            limit: 10
          },
          accessToken,
          projectId
        ),
        runGa4Endpoint(
          propertyId,
          'runRealtimeReport',
          {
            dimensions: [{ name: 'deviceCategory' }],
            metrics: [{ name: 'activeUsers' }],
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
            limit: 5
          },
          accessToken,
          projectId
        )
      ]);

    const activeUsersNow = numVal(activeNowRes.rows?.[0], 0);
    const activeUsersLast30Min = numVal(active30mRes.rows?.[0], 0);
    const pageViewsLast30Min = numVal(active30mRes.rows?.[0], 1);
    const eventsLast30Min = numVal(active30mRes.rows?.[0], 2);

    const recentEvents: AnalyticsRealtimeEventItem[] = (eventsRes.rows || []).map((row) => {
      const eventName = dimVal(row, 0, 'unknown_event');
      const minutesAgo = Number(dimVal(row, 1, '0')) || 0;
      return {
        eventName,
        label: EVENT_FRIENDLY_LABELS[eventName] || eventName.replace(/_/g, ' '),
        minutesAgo,
        eventCount: numVal(row, 0)
      };
    });

    const activePages: AnalyticsRealtimePageItem[] = (pagesRes.rows || []).map((row) => ({
      screenName: dimVal(row, 0, 'Wedding Website'),
      activeUsers: numVal(row, 0)
    }));

    const locations: AnalyticsRealtimeLocationItem[] = (locationsRes.rows || []).map((row) => ({
      country: dimVal(row, 0, 'Unknown'),
      city: dimVal(row, 1, '(not set)'),
      activeUsers: numVal(row, 0)
    }));

    const devices: AnalyticsRealtimeDeviceItem[] = (devicesRes.rows || []).map((row) => ({
      deviceCategory: dimVal(row, 0, 'unknown'),
      activeUsers: numVal(row, 0)
    }));

    const result: AnalyticsRealtimeData = {
      available: true,
      fetchedAt: new Date().toISOString(),
      activeUsersNow,
      activeUsersLast30Min,
      pageViewsLast30Min,
      eventsLast30Min,
      recentEvents,
      activePages,
      locations,
      devices,
      errorCode: 'none',
      errorMessage: null,
      activationUrl: null
    };

    realtimeCache = { value: result, expiresAtMs: Date.now() + REALTIME_CACHE_TTL_MS };
    return result;
  } catch (err) {
    const gaErr = err instanceof Ga4ApiError ? err : null;
    return {
      available: false,
      fetchedAt: new Date().toISOString(),
      activeUsersNow: null,
      activeUsersLast30Min: null,
      pageViewsLast30Min: null,
      eventsLast30Min: null,
      recentEvents: [],
      activePages: [],
      locations: [],
      devices: [],
      errorCode: mapGa4ErrorToPublicCode(gaErr),
      errorMessage: err instanceof Error ? err.message : 'Unable to reach GA4 Realtime API.',
      activationUrl: gaErr?.activationUrl ?? null
    };
  }
}

export async function fetchAnalyticsDashboardReport(
  range: AnalyticsDateRange,
  forceRefresh = false
): Promise<AnalyticsReportData> {
  if (!forceRefresh) {
    const existing = reportCache.get(range);
    if (existing && Date.now() < existing.expiresAtMs) {
      return { ...existing.value, cached: true };
    }
  }

  const propertyId = readPropertyId();
  const { credentials: creds } = readServiceAccountCredentialsResult();
  if (!propertyId || !creds) {
    return buildUnavailableReport(range, getAnalyticsConnectionStatus());
  }

  const dateRanges = [getDateRangeSpec(range)];

  try {
    const accessToken = await getGa4AccessToken(creds);
    const projectId = creds.projectId;

    // Core GA4 Data API queries (always valid on any standard GA4 property)
    const [
      overviewRes,
      dailyRes,
      pagesRes,
      devicesRes,
      locationsRes,
      sourcesRes,
      eventsRes
    ] = await Promise.all([
      runGa4Endpoint(
        propertyId,
        'runReport',
        {
          dateRanges,
          metrics: [
            { name: 'totalUsers' },
            { name: 'activeUsers' },
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'userEngagementDuration' },
            { name: 'newUsers' }
          ]
        },
        accessToken,
        projectId
      ),
      runGa4Endpoint(
        propertyId,
        'runReport',
        {
          dateRanges,
          dimensions: [{ name: 'date' }],
          metrics: [
            { name: 'activeUsers' },
            { name: 'sessions' },
            { name: 'screenPageViews' }
          ],
          orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
          limit: 365
        },
        accessToken,
        projectId
      ),
      runGa4Endpoint(
        propertyId,
        'runReport',
        {
          dateRanges,
          dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
          metrics: [
            { name: 'screenPageViews' },
            { name: 'activeUsers' },
            { name: 'userEngagementDuration' }
          ],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 15
        },
        accessToken,
        projectId
      ),
      runGa4Endpoint(
        propertyId,
        'runReport',
        {
          dateRanges,
          dimensions: [{ name: 'deviceCategory' }],
          metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: 6
        },
        accessToken,
        projectId
      ),
      runGa4Endpoint(
        propertyId,
        'runReport',
        {
          dateRanges,
          dimensions: [{ name: 'country' }, { name: 'city' }],
          metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: 15
        },
        accessToken,
        projectId
      ),
      runGa4Endpoint(
        propertyId,
        'runReport',
        {
          dateRanges,
          dimensions: [
            { name: 'sessionSource' },
            { name: 'sessionMedium' },
            { name: 'sessionDefaultChannelGroup' }
          ],
          metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 15
        },
        accessToken,
        projectId
      ),
      runGa4Endpoint(
        propertyId,
        'runReport',
        {
          dateRanges,
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
          limit: 100
        },
        accessToken,
        projectId
      )
    ]);

    // Optional custom-dimension queries (gracefully degraded if user has not yet registered custom dimensions in GA4 Admin)
    let sectionMetricsAvailable = false;
    let customDimensionsRegistered = false;
    const sectionViewsMap = new Map<AnalyticsSectionKey, number>();
    const sectionEngagementTotalSecMap = new Map<AnalyticsSectionKey, number>();
    const sectionEngagementCountMap = new Map<AnalyticsSectionKey, number>();

    try {
      const sectionRes = await runGa4Endpoint(
        propertyId,
        'runReport',
        {
          dateRanges,
          dimensions: [{ name: 'eventName' }, { name: 'customEvent:section_name' }],
          metrics: [{ name: 'eventCount' }, { name: 'eventValue' }],
          dimensionFilter: {
            filter: {
              fieldName: 'eventName',
              inListFilter: { values: ['section_view', 'section_engagement'] }
            }
          },
          limit: 100
        },
        accessToken
      );
      sectionMetricsAvailable = true;
      customDimensionsRegistered = true;

      for (const row of sectionRes.rows || []) {
        const evt = dimVal(row, 0, '');
        const key = normalizeSectionKey(dimVal(row, 1, ''));
        if (!key) continue;
        const cnt = numVal(row, 0);
        const val = numVal(row, 1);
        if (evt === 'section_view') {
          sectionViewsMap.set(key, (sectionViewsMap.get(key) || 0) + cnt);
        } else if (evt === 'section_engagement') {
          sectionEngagementTotalSecMap.set(key, (sectionEngagementTotalSecMap.get(key) || 0) + val);
          sectionEngagementCountMap.set(key, (sectionEngagementCountMap.get(key) || 0) + cnt);
        }
      }
    } catch (customErr) {
      if (!(customErr instanceof Ga4ApiError && customErr.code === 'invalid_argument')) {
        // Non-schema error — still keep core report functional
        sectionMetricsAvailable = false;
      }
    }

    let interactionStatusAvailable = false;
    let eventStatusCounts: Map<string, { started: number; completed: number; failed: number }> | null =
      null;

    try {
      const statusRes = await runGa4Endpoint(
        propertyId,
        'runReport',
        {
          dateRanges,
          dimensions: [{ name: 'eventName' }, { name: 'customEvent:interaction_status' }],
          metrics: [{ name: 'eventCount' }],
          limit: 150
        },
        accessToken
      );
      interactionStatusAvailable = true;
      eventStatusCounts = new Map();
      for (const row of statusRes.rows || []) {
        const evt = dimVal(row, 0, '');
        const st = dimVal(row, 1, '').toLowerCase();
        const cnt = numVal(row, 0);
        if (!evt) continue;
        const entry = eventStatusCounts.get(evt) || { started: 0, completed: 0, failed: 0 };
        if (st === 'started') entry.started += cnt;
        else if (st === 'completed') entry.completed += cnt;
        else if (st === 'failed') entry.failed += cnt;
        eventStatusCounts.set(evt, entry);
      }
    } catch {
      interactionStatusAvailable = false;
      eventStatusCounts = null;
    }

    // Lightweight Realtime 30m check (reuses fresh cache when available) to distinguish
    // GA4 intraday/standard report processing delay from genuine zero activity.
    let realtimeSummary: {
      activeUsers30m: number;
      pageViews30m: number;
      events30m: number;
    } | null = null;
    if (realtimeCache && Date.now() < realtimeCache.expiresAtMs && realtimeCache.value.available) {
      realtimeSummary = {
        activeUsers30m: realtimeCache.value.activeUsersLast30Min ?? 0,
        pageViews30m: realtimeCache.value.pageViewsLast30Min ?? 0,
        events30m: realtimeCache.value.eventsLast30Min ?? 0
      };
    } else {
      try {
        const rtCheck = await runGa4Endpoint(
          propertyId,
          'runRealtimeReport',
          {
            minuteRanges: [{ name: 'last30m', startMinutesAgo: 29, endMinutesAgo: 0 }],
            metrics: [
              { name: 'activeUsers' },
              { name: 'screenPageViews' },
              { name: 'eventCount' }
            ]
          },
          accessToken,
          projectId
        );
        realtimeSummary = {
          activeUsers30m: numVal(rtCheck.rows?.[0], 0),
          pageViews30m: numVal(rtCheck.rows?.[0], 1),
          events30m: numVal(rtCheck.rows?.[0], 2)
        };
      } catch {
        realtimeSummary = null;
      }
    }

    const propertyTimeZone =
      overviewRes.metadata?.timeZone || dailyRes.metadata?.timeZone || 'Africa/Lagos';
    const dateRangeApplied = resolveDateRangeApplied(range, propertyTimeZone);

    const hasStandardRows =
      (overviewRes.rows?.length ?? 0) > 0 ||
      (dailyRes.rows?.length ?? 0) > 0 ||
      (eventsRes.rows?.length ?? 0) > 0;

    const realtimeHasActivity = Boolean(
      realtimeSummary &&
        (realtimeSummary.activeUsers30m > 0 ||
          realtimeSummary.pageViews30m > 0 ||
          realtimeSummary.events30m > 0)
    );

    // Never silently turn empty/unprocessed GA4 runReport responses into 0 when Realtime
    // confirms live visitor activity is already arriving in this property.
    if (!hasStandardRows && realtimeHasActivity && realtimeSummary) {
      const status = getAnalyticsConnectionStatus({
        customDimensionsRegistered,
        errorCode: 'none',
        errorMessage: null
      });

      const processingReport: AnalyticsReportData = {
        available: true,
        dataState: 'processing_delay',
        dataStateMessage: `GA4 Realtime is actively receiving visits (${realtimeSummary.activeUsers30m.toLocaleString()} active users, ${realtimeSummary.pageViews30m.toLocaleString()} page views, ${realtimeSummary.events30m.toLocaleString()} events in the last 30 min), while Google Analytics standard historical & intraday tables for ${dateRangeApplied.resolvedStartDate} – ${dateRangeApplied.resolvedEndDate} (${propertyTimeZone}) have not finished processing yet. Standard GA4 reports typically update within 4–8 hours (up to 24–48 hours for a newly receiving property). Historical metrics are shown as Processing rather than 0 until Google completes aggregation.`,
        propertyTimeZone,
        dateRangeApplied,
        hasIntradayLag: true,
        realtimeSummary,
        range,
        fetchedAt: new Date().toISOString(),
        cached: false,
        status,
        overview: {
          totalUsers: null,
          activeUsers: null,
          sessions: null,
          pageViews: null,
          avgEngagementSeconds: null,
          newUsers: null,
          returningUsers: null
        },
        dailySeries: [],
        weeklySeries: [],
        topPages: [],
        devices: [],
        locations: [],
        trafficSources: [],
        sections: buildEmptySections(),
        sectionMetricsAvailable: false,
        weddingExperience: buildEmptyWeddingExperience('Awaiting GA4 standard report processing'),
        interactionStatusAvailable: false
      };

      reportCache.set(range, {
        value: processingReport,
        expiresAtMs: Date.now() + REPORT_CACHE_TTL_MS
      });
      return processingReport;
    }

    // Parse overview without silently converting missing metric values into 0
    const ovRow = overviewRes.rows?.[0];
    const totalUsers = hasStandardRows ? optionalNumVal(ovRow, 0) : 0;
    const activeUsers = hasStandardRows ? optionalNumVal(ovRow, 1) : 0;
    const sessions = hasStandardRows ? optionalNumVal(ovRow, 2) : 0;
    const pageViews = hasStandardRows ? optionalNumVal(ovRow, 3) : 0;
    const totalEngagementSec = hasStandardRows ? optionalNumVal(ovRow, 4) : 0;
    const newUsers = hasStandardRows ? optionalNumVal(ovRow, 5) : 0;
    const returningUsers =
      totalUsers !== null && newUsers !== null ? Math.max(0, totalUsers - newUsers) : null;
    const avgEngagementSeconds =
      totalEngagementSec === null
        ? null
        : sessions !== null && sessions > 0
        ? Math.round(totalEngagementSec / sessions)
        : activeUsers !== null && activeUsers > 0
        ? Math.round(totalEngagementSec / activeUsers)
        : 0;

    const overview: AnalyticsOverviewMetrics = {
      totalUsers,
      activeUsers,
      sessions,
      pageViews,
      avgEngagementSeconds,
      newUsers,
      returningUsers
    };

    const dailySeries: AnalyticsTimeSeriesPoint[] = (dailyRes.rows || []).map((row) => {
      const formatted = formatGa4Date(dimVal(row, 0, ''));
      return {
        date: formatted.iso,
        label: formatted.label,
        users: numVal(row, 0),
        sessions: numVal(row, 1),
        pageViews: numVal(row, 2)
      };
    });

    const weeklySeries = computeWeeklySeries(dailySeries);

    const topPages: AnalyticsPageMetric[] = (pagesRes.rows || []).map((row) => {
      const views = numVal(row, 0);
      const users = numVal(row, 1);
      const dur = numVal(row, 2);
      return {
        pagePath: dimVal(row, 0, '/'),
        pageTitle: dimVal(row, 1, 'Wedding Website'),
        pageViews: views,
        users,
        avgEngagementSeconds: users > 0 ? Math.round(dur / users) : 0
      };
    });

    const devices: AnalyticsDeviceMetric[] = (devicesRes.rows || []).map((row) => ({
      deviceCategory: dimVal(row, 0, 'unknown'),
      users: numVal(row, 0),
      sessions: numVal(row, 1)
    }));

    const locations: AnalyticsLocationMetric[] = (locationsRes.rows || []).map((row) => ({
      country: dimVal(row, 0, 'Unknown'),
      city: dimVal(row, 1, '(not set)'),
      users: numVal(row, 0),
      sessions: numVal(row, 1)
    }));

    const trafficSources: AnalyticsTrafficSourceMetric[] = (sourcesRes.rows || []).map((row) => ({
      source: dimVal(row, 0, '(direct)'),
      medium: dimVal(row, 1, '(none)'),
      channelGroup: dimVal(row, 2, 'Direct'),
      sessions: numVal(row, 0),
      users: numVal(row, 1)
    }));

    const eventTotals = new Map<string, number>();
    for (const row of eventsRes.rows || []) {
      const evt = dimVal(row, 0, '');
      if (evt) {
        eventTotals.set(evt, (eventTotals.get(evt) || 0) + numVal(row, 0));
      }
    }

    const sections: AnalyticsSectionMetric[] = sectionMetricsAvailable
      ? SECTION_CATALOG.map((item) => {
          const views = sectionViewsMap.get(item.key) ?? 0;
          const totalSec = Math.round(sectionEngagementTotalSecMap.get(item.key) ?? 0);
          const engSamples = sectionEngagementCountMap.get(item.key) ?? 0;
          const denom = views > 0 ? views : engSamples;
          return {
            sectionKey: item.key,
            label: item.label,
            views,
            totalEngagementSeconds: totalSec,
            avgEngagementSeconds: denom > 0 ? Math.round(totalSec / denom) : 0
          };
        })
      : buildEmptySections();

    const weddingExperience = buildWeddingExperienceMetrics(eventTotals, eventStatusCounts);

    const status = getAnalyticsConnectionStatus({
      customDimensionsRegistered,
      errorCode: 'none',
      errorMessage: null
    });

    const hasIntradayLag = Boolean(
      realtimeSummary &&
        realtimeHasActivity &&
        range === 'today' &&
        (pageViews === null || realtimeSummary.pageViews30m > pageViews)
    );

    const dataState = hasStandardRows ? 'ready' : 'no_data';
    const dataStateMessage =
      dataState === 'no_data'
        ? `GA4 Data API returned 0 processed rows for ${dateRangeApplied.resolvedStartDate} – ${dateRangeApplied.resolvedEndDate} (${propertyTimeZone}). Note: newly received visits can take 4–8 hours (up to 24–48 hours on a new property) to appear in standard reports.`
        : hasIntradayLag
        ? `Standard GA4 intraday tables for today (${propertyTimeZone}) are still catching up with Realtime. Latest 30-minute visits appear in Live Overview above.`
        : null;

    const report: AnalyticsReportData = {
      available: true,
      dataState,
      dataStateMessage,
      propertyTimeZone,
      dateRangeApplied,
      hasIntradayLag,
      realtimeSummary,
      range,
      fetchedAt: new Date().toISOString(),
      cached: false,
      status,
      overview,
      dailySeries,
      weeklySeries,
      topPages,
      devices,
      locations,
      trafficSources,
      sections,
      sectionMetricsAvailable,
      weddingExperience,
      interactionStatusAvailable
    };

    reportCache.set(range, { value: report, expiresAtMs: Date.now() + REPORT_CACHE_TTL_MS });
    return report;
  } catch (err) {
    const gaErr = err instanceof Ga4ApiError ? err : null;
    const errorCode = mapGa4ErrorToPublicCode(gaErr);
    const status = getAnalyticsConnectionStatus({
      errorCode,
      errorMessage: err instanceof Error ? err.message : 'Unable to query Google Analytics Data API.',
      activationUrl: gaErr?.activationUrl ?? null
    });
    return buildUnavailableReport(range, status);
  }
}
