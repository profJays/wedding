import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  DriveAuthState,
  DriveAuthStateLabel,
  DriveBrowserSessionStatus,
  DriveConnectionStatus,
  DriveMediaCategory,
  DriveOverallConnectionStatus,
  DriveServerRefreshStatus,
  DriveSubfolderMap,
  DriveTestConnectionResponse
} from '../src/types.ts';

export interface StoredMediaResult {
  storageProvider: 'google_drive' | 'local_server';
  driveFileId: string;
  fileUrl: string;
  sizeBytes: number;
  mimeType: string;
  originalName: string;
  category: DriveMediaCategory;
  folderName: string;
}

export type DriveStorageErrorCode =
  | 'DRIVE_NOT_CONFIGURED'
  | 'DRIVE_AUTH_MISSING'
  | 'DRIVE_AUTH_EXPIRED'
  | 'DRIVE_REFRESH_EXPIRED'
  | 'DRIVE_PERMISSION_ERROR'
  | 'DRIVE_API_ERROR';

export class DriveStorageError extends Error {
  statusCode: number;
  code: DriveStorageErrorCode;

  constructor(
    message: string,
    statusCode: number,
    code: DriveStorageErrorCode
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

interface PersistedDriveState {
  oauthConnected: boolean;
  connectedEmail: string;
  folderId: string;
  folderName: string;
  lastUploadAt: string | null;
  lastError: string | null;
  subfolders: DriveSubfolderMap;
}

interface EncryptedRefreshStorePayload {
  version: 1;
  clientIdHash: string;
  envTokenHashAtSave: string;
  iv: string;
  tag: string;
  ciphertext: string;
  updatedAt: string;
}

interface ActiveRefreshTokenResolution {
  token: string | null;
  source: 'server_store' | 'env' | 'none';
  persistedAt: string | null;
  fingerprint: string;
}

interface PendingOAuthState {
  adminUid: string;
  adminEmail: string;
  redirectUri: string;
  createdAtMs: number;
}

type RefreshErrorCategory =
  | 'expired_or_revoked'
  | 'invalid_client'
  | 'missing'
  | 'network'
  | null;

interface RefreshExchangeResult {
  token: string | null;
  errorReason: string | null;
  errorCode?: 'DRIVE_REFRESH_EXPIRED' | 'DRIVE_API_ERROR';
  errorCategory?: RefreshErrorCategory;
}

export interface ServerDriveOAuthCallbackResult {
  ok: boolean;
  refreshTokenIssued: boolean;
  message: string;
  driveStatus: DriveConnectionStatus;
}

export const OAUTH_CALLBACK_PATH = '/api/drive/oauth/callback';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const AUTO_VERIFY_FAILURE_COOLDOWN_MS = 60 * 1000;

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOAD_ROOT = path.resolve(DATA_DIR, 'gallery-uploads');
const DRIVE_STATE_PATH = path.resolve(DATA_DIR, 'drive-state.json');
let encryptedTokenStorePath = path.resolve(DATA_DIR, '.drive-oauth-token.enc');

// Strict in-memory only caches/flags for server OAuth tokens (never written plaintext to disk or responses)
let cachedServerRefreshToken: { accessToken: string; expiresAtMs: number } | null = null;
let inFlightRefreshPromise: Promise<RefreshExchangeResult> | null = null;
let inFlightAutoVerifyPromise: Promise<void> | null = null;
let serverRefreshVerified: boolean | null = null;
let serverRefreshErrorCategory: RefreshErrorCategory = null;
let lastAutoVerifyAttemptMs = 0;
let lastVerifiedTokenFingerprint = '';
let manuallyDisconnected = false;

const pendingOAuthStates = new Map<string, PendingOAuthState>();

export function resetServerRefreshAuthCacheForTests(options?: {
  expiresAtMs?: number;
  accessToken?: string;
  verified?: boolean | null;
  errorCategory?: RefreshErrorCategory;
  disconnected?: boolean;
  tokenStorePath?: string;
}): void {
  cachedServerRefreshToken =
    options?.accessToken && options?.expiresAtMs !== undefined
      ? { accessToken: options.accessToken, expiresAtMs: options.expiresAtMs }
      : null;
  inFlightRefreshPromise = null;
  inFlightAutoVerifyPromise = null;
  serverRefreshVerified = options?.verified !== undefined ? options.verified : null;
  serverRefreshErrorCategory = options?.errorCategory !== undefined ? options.errorCategory : null;
  lastAutoVerifyAttemptMs = 0;
  lastVerifiedTokenFingerprint = '';
  manuallyDisconnected = options?.disconnected ?? false;
  pendingOAuthStates.clear();
  if (options?.tokenStorePath !== undefined) {
    encryptedTokenStorePath = options.tokenStorePath;
  } else {
    encryptedTokenStorePath = path.resolve(DATA_DIR, '.drive-oauth-token.enc');
  }
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function deriveTokenStoreKey(clientId: string, clientSecret: string): Buffer {
  return crypto
    .createHash('sha256')
    .update(`mjay2026-drive-refresh-store-v1:${clientId}:${clientSecret}`, 'utf8')
    .digest();
}

export function hasServerOAuthClientCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  );
}

function readEncryptedServerRefreshToken(): {
  refreshToken: string;
  updatedAt: string;
  envTokenHashAtSave: string;
} | null {
  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;

  try {
    if (!fs.existsSync(encryptedTokenStorePath)) return null;
    const raw = fs.readFileSync(encryptedTokenStorePath, 'utf8');
    const payload = JSON.parse(raw) as Partial<EncryptedRefreshStorePayload>;
    if (
      payload.version !== 1 ||
      !payload.iv ||
      !payload.tag ||
      !payload.ciphertext ||
      !payload.clientIdHash
    ) {
      return null;
    }

    if (payload.clientIdHash !== sha256Hex(clientId)) {
      return null;
    }

    const key = deriveTokenStoreKey(clientId, clientSecret);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(payload.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final()
    ])
      .toString('utf8')
      .trim();

    if (!decrypted) return null;

    return {
      refreshToken: decrypted,
      updatedAt: String(payload.updatedAt || ''),
      envTokenHashAtSave: String(payload.envTokenHashAtSave || '')
    };
  } catch {
    return null;
  }
}

export function saveServerRefreshTokenSecurely(refreshToken: string): {
  saved: boolean;
  updatedAt: string | null;
} {
  const trimmed = (refreshToken || '').trim();
  // Never overwrite an existing valid refresh token with an empty string
  if (!trimmed) {
    return { saved: false, updatedAt: null };
  }

  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw new DriveStorageError(
      'Cannot store server refresh token because GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET is missing.',
      500,
      'DRIVE_NOT_CONFIGURED'
    );
  }

  const key = deriveTokenStoreKey(clientId, clientSecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const updatedAt = new Date().toISOString();
  const envRefreshToken = (process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '').trim();

  const payload: EncryptedRefreshStorePayload = {
    version: 1,
    clientIdHash: sha256Hex(clientId),
    envTokenHashAtSave: envRefreshToken ? sha256Hex(envRefreshToken) : '',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    updatedAt
  };

  const storeDir = path.dirname(encryptedTokenStorePath);
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true });
  }

  const tmpPath = `${encryptedTokenStorePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, encryptedTokenStorePath);
  try {
    fs.chmodSync(encryptedTokenStorePath, 0o600);
  } catch {
    // Best effort on filesystems that restrict chmod
  }

  // Clear cached access token so subsequent verification uses the newly saved refresh token
  cachedServerRefreshToken = null;
  inFlightRefreshPromise = null;
  serverRefreshVerified = null;
  serverRefreshErrorCategory = null;
  lastAutoVerifyAttemptMs = 0;
  lastVerifiedTokenFingerprint = '';
  manuallyDisconnected = false;

  return { saved: true, updatedAt };
}

function resolveActiveServerRefreshToken(): ActiveRefreshTokenResolution {
  if (!hasServerOAuthClientCredentials()) {
    return { token: null, source: 'none', persistedAt: null, fingerprint: '' };
  }

  const envToken = (process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '').trim();
  const envHash = envToken ? sha256Hex(envToken) : '';
  const stored = readEncryptedServerRefreshToken();

  if (stored?.refreshToken) {
    // If the hosting environment secret GOOGLE_OAUTH_REFRESH_TOKEN was explicitly rotated
    // to a different value after the stored token was saved, honor the newly rotated secret.
    if (envToken && envHash !== stored.envTokenHashAtSave) {
      return {
        token: envToken,
        source: 'env',
        persistedAt: null,
        fingerprint: `env:${envHash}`
      };
    }

    return {
      token: stored.refreshToken,
      source: 'server_store',
      persistedAt: stored.updatedAt || null,
      fingerprint: `store:${sha256Hex(stored.refreshToken)}`
    };
  }

  if (envToken) {
    return {
      token: envToken,
      source: 'env',
      persistedAt: null,
      fingerprint: `env:${envHash}`
    };
  }

  return { token: null, source: 'none', persistedAt: null, fingerprint: '' };
}

function syncVerificationStateWithActiveToken(active: ActiveRefreshTokenResolution): void {
  if (!active.token) {
    cachedServerRefreshToken = null;
    serverRefreshVerified = null;
    serverRefreshErrorCategory = 'missing';
    lastVerifiedTokenFingerprint = '';
    return;
  }

  if (lastVerifiedTokenFingerprint && lastVerifiedTokenFingerprint !== active.fingerprint) {
    cachedServerRefreshToken = null;
    serverRefreshVerified = null;
    serverRefreshErrorCategory = null;
    lastAutoVerifyAttemptMs = 0;
    lastVerifiedTokenFingerprint = active.fingerprint;
  }
}

function readDriveState(): PersistedDriveState {
  const configuredId = (process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
  const empty: PersistedDriveState = {
    oauthConnected: false,
    connectedEmail: '',
    folderId: configuredId,
    folderName: '',
    lastUploadAt: null,
    lastError: null,
    subfolders: {}
  };

  try {
    if (!fs.existsSync(DRIVE_STATE_PATH)) return empty;
    const raw = fs.readFileSync(DRIVE_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedDriveState>;
    // Reset folder metadata if GOOGLE_DRIVE_FOLDER_ID changed
    if (parsed.folderId && configuredId && parsed.folderId !== configuredId) {
      return empty;
    }
    return {
      oauthConnected: Boolean(parsed.oauthConnected),
      connectedEmail: String(parsed.connectedEmail || ''),
      folderId: configuredId || String(parsed.folderId || ''),
      folderName: String(parsed.folderName || ''),
      lastUploadAt: parsed.lastUploadAt || null,
      lastError: parsed.lastError || null,
      subfolders: parsed.subfolders || {}
    };
  } catch {
    return empty;
  }
}

function writeDriveState(next: PersistedDriveState): void {
  ensureDataDir();
  fs.writeFileSync(DRIVE_STATE_PATH, JSON.stringify(next, null, 2), 'utf8');
}

function updateDriveState(patch: Partial<PersistedDriveState>): PersistedDriveState {
  const current = readDriveState();
  const updated: PersistedDriveState = {
    ...current,
    ...patch,
    subfolders: patch.subfolders !== undefined ? patch.subfolders : current.subfolders
  };
  writeDriveState(updated);
  return updated;
}

export function getMissingServerEnvVars(): string[] {
  const missing: string[] = [];
  if (!(process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim()) {
    missing.push('GOOGLE_DRIVE_FOLDER_ID');
  }
  if (!(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim()) {
    missing.push('GOOGLE_OAUTH_CLIENT_ID');
  }
  if (!(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim()) {
    missing.push('GOOGLE_OAUTH_CLIENT_SECRET');
  }
  const activeRefresh = resolveActiveServerRefreshToken();
  if (!activeRefresh.token) {
    missing.push('GOOGLE_OAUTH_REFRESH_TOKEN');
  }
  return missing;
}

export function hasServerRefreshCredentials(): boolean {
  return Boolean(hasServerOAuthClientCredentials() && resolveActiveServerRefreshToken().token);
}

function computeServerRefreshStatus(active: ActiveRefreshTokenResolution): DriveServerRefreshStatus {
  if (!hasServerOAuthClientCredentials() || !active.token) {
    return 'missing';
  }
  if (serverRefreshVerified === true) {
    return 'connected';
  }
  if (serverRefreshVerified === false) {
    if (serverRefreshErrorCategory === 'expired_or_revoked') {
      return 'expired';
    }
    return 'invalid';
  }
  return 'unverified';
}

function mapDriveAuthState(params: {
  configuredFolderId: boolean;
  serverRefreshStatus: DriveServerRefreshStatus;
  hasBrowserSession: boolean;
  lastError: string | null;
}): {
  authState: DriveAuthState;
  authStateLabel: DriveAuthStateLabel;
  overallConnectionStatus: DriveOverallConnectionStatus;
} {
  const { configuredFolderId, serverRefreshStatus, hasBrowserSession, lastError } = params;

  if (!configuredFolderId) {
    return {
      authState: 'missing_server_credentials',
      authStateLabel: 'Missing Server Credentials',
      overallConnectionStatus: 'disconnected'
    };
  }

  // Only report Fully Connected when the server-side refresh token has actually been verified
  if (serverRefreshStatus === 'connected') {
    return {
      authState: 'connected_server_refresh',
      authStateLabel: 'Connected — Server Refresh Token',
      overallConnectionStatus: 'fully_connected'
    };
  }

  // Browser session alone is ALWAYS reported as Temporary Browser Connection — never Fully Connected
  if (hasBrowserSession) {
    return {
      authState: 'connected_browser_session',
      authStateLabel: 'Connected — Browser Session Only',
      overallConnectionStatus: 'temporary_browser'
    };
  }

  if (serverRefreshStatus === 'expired' || serverRefreshStatus === 'invalid') {
    return {
      authState: 'reconnection_required',
      authStateLabel: 'Reconnection Required',
      overallConnectionStatus: 'disconnected'
    };
  }

  if (lastError && /browser.*(expired|revoked)/i.test(lastError)) {
    return {
      authState: 'reconnection_required',
      authStateLabel: 'Reconnection Required',
      overallConnectionStatus: 'disconnected'
    };
  }

  if (serverRefreshStatus === 'missing') {
    if (manuallyDisconnected) {
      return {
        authState: 'not_connected',
        authStateLabel: 'Not Connected',
        overallConnectionStatus: 'disconnected'
      };
    }
    return {
      authState: 'missing_server_credentials',
      authStateLabel: 'Missing Server Credentials',
      overallConnectionStatus: 'disconnected'
    };
  }

  // Unverified server refresh token with no browser session
  return {
    authState: 'not_connected',
    authStateLabel: 'Not Connected',
    overallConnectionStatus: 'disconnected'
  };
}

export function maskOAuthClientId(clientId?: string): string {
  const raw = (clientId ?? process.env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim();
  if (!raw) return 'not-configured';
  const googleSuffix = '.apps.googleusercontent.com';
  if (raw.endsWith(googleSuffix)) {
    const core = raw.slice(0, -googleSuffix.length);
    if (core.length > 10) {
      return `${core.slice(0, 6)}...${core.slice(-4)}${googleSuffix}`;
    }
    return `${core.slice(0, 3)}...${googleSuffix}`;
  }
  if (raw.length > 10) {
    return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
  }
  return '***';
}

export interface CanonicalOAuthRedirectResolution {
  redirectUri: string;
  source: 'env_redirect_uri' | 'env_app_url' | 'request_fallback';
  warning?: string;
}

/**
 * Single canonical server-side source of truth for the Google Drive OAuth redirect URI.
 * Used identically for:
 *  1) Admin Dashboard diagnostic display
 *  2) Google OAuth 2.0 authorization URL generation (redirect_uri param)
 *  3) Google OAuth 2.0 authorization-code token exchange (redirect_uri param)
 */
export function getCanonicalOAuthRedirectUri(options?: {
  fallbackRequestOrigin?: string;
  strict?: boolean;
}): CanonicalOAuthRedirectResolution {
  const isProd = process.env.NODE_ENV === 'production';

  // 1. Canonical explicit GOOGLE_OAUTH_REDIRECT_URI (highest priority)
  const explicitRaw = (process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim().replace(/\/+$/, '');
  if (explicitRaw) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(explicitRaw);
    } catch {
      parsed = null;
    }

    const isLocalHost =
      parsed !== null &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

    if (
      !parsed ||
      (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalHost && !isProd)) ||
      parsed.pathname !== OAUTH_CALLBACK_PATH
    ) {
      const errMsg = `GOOGLE_OAUTH_REDIRECT_URI ("${explicitRaw}") is invalid. It must be an ${
        isProd ? 'https://' : 'http(s)://'
      } URL ending in "${OAUTH_CALLBACK_PATH}" (for example: https://<your-domain>${OAUTH_CALLBACK_PATH}).`;
      if (options?.strict) {
        throw new DriveStorageError(errMsg, 400, 'DRIVE_NOT_CONFIGURED');
      }
      return {
        redirectUri: explicitRaw,
        source: 'env_redirect_uri',
        warning: errMsg
      };
    }

    return {
      redirectUri: `${parsed.origin}${OAUTH_CALLBACK_PATH}`,
      source: 'env_redirect_uri'
    };
  }

  // 2. Canonical APP_URL environment variable (set automatically by hosting runtime)
  const envAppUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (envAppUrl && envAppUrl !== 'MY_APP_URL') {
    try {
      const parsed = new URL(envAppUrl);
      const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (
        parsed.protocol === 'https:' ||
        (parsed.protocol === 'http:' && isLocalHost && !isProd)
      ) {
        return {
          redirectUri: `${parsed.origin}${OAUTH_CALLBACK_PATH}`,
          source: 'env_app_url'
        };
      }
    } catch {
      // Ignore malformed APP_URL and fall through
    }
  }

  // 3. Fallback to server-derived request origin (never localhost in production)
  const fallbackRaw = (options?.fallbackRequestOrigin || '').trim().replace(/\/+$/, '');
  if (fallbackRaw) {
    try {
      const parsed = new URL(fallbackRaw);
      const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (
        parsed.protocol === 'https:' ||
        (parsed.protocol === 'http:' && isLocalHost && !isProd)
      ) {
        return {
          redirectUri: `${parsed.origin}${OAUTH_CALLBACK_PATH}`,
          source: 'request_fallback'
        };
      }
    } catch {
      // Ignore malformed fallback origin
    }
  }

  if (options?.strict) {
    throw new DriveStorageError(
      `Unable to determine canonical OAuth redirect URI. Configure GOOGLE_OAUTH_REDIRECT_URI (or APP_URL) on the server to your deployed URL ending in "${OAUTH_CALLBACK_PATH}".`,
      500,
      'DRIVE_NOT_CONFIGURED'
    );
  }

  return {
    redirectUri: isProd ? '' : `http://localhost:3000${OAUTH_CALLBACK_PATH}`,
    source: 'request_fallback',
    warning: isProd
      ? `GOOGLE_OAUTH_REDIRECT_URI and APP_URL are not set in production. Set GOOGLE_OAUTH_REDIRECT_URI to https://<your-domain>${OAUTH_CALLBACK_PATH}.`
      : undefined
  };
}

export function logDriveOAuthStartupDiagnostics(): void {
  const canonical = getCanonicalOAuthRedirectUri();
  console.info(
    `[Drive OAuth] Config | clientId=${maskOAuthClientId()} | expectedRedirectUri=${
      canonical.redirectUri || '(not configured)'
    } | source=${canonical.source} | callbackRoute=${OAUTH_CALLBACK_PATH}`
  );
  if (canonical.warning) {
    console.warn(`[Drive OAuth] Configuration warning: ${canonical.warning}`);
  }
}

export function getDriveConnectionStatus(options?: {
  hasBrowserSession?: boolean;
  fallbackRequestOrigin?: string;
}): DriveConnectionStatus {
  const folderId = (process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
  const state = readDriveState();
  const activeRefresh = resolveActiveServerRefreshToken();
  syncVerificationStateWithActiveToken(activeRefresh);
  const canonicalRedirect = getCanonicalOAuthRedirectUri({
    fallbackRequestOrigin: options?.fallbackRequestOrigin
  });

  const folderPreview = folderId
    ? folderId.length > 14
      ? `${folderId.slice(0, 6)}...${folderId.slice(-6)}`
      : folderId
    : '';

  const s = state.subfolders;
  const subfoldersInitialized = Boolean(
    s.rootId &&
      s.homepageId &&
      s.ourStoryId &&
      s.scheduleId &&
      s.guestPhotosId &&
      s.guestVideosId &&
      s.adminMediaId
  );

  const configuredFolderId = Boolean(folderId);
  const serverOAuthClientConfigured = hasServerOAuthClientCredentials();
  const serverRefreshConfigured = Boolean(serverOAuthClientConfigured && activeRefresh.token);
  const missingServerEnvVars = getMissingServerEnvVars();
  const hasBrowserSession = Boolean(options?.hasBrowserSession);
  const browserSessionStatus: DriveBrowserSessionStatus = hasBrowserSession
    ? 'connected'
    : 'disconnected';
  const serverRefreshStatus = computeServerRefreshStatus(activeRefresh);

  const { authState, authStateLabel, overallConnectionStatus } = mapDriveAuthState({
    configuredFolderId,
    serverRefreshStatus,
    hasBrowserSession,
    lastError: state.lastError
  });

  // Strict honesty: unattended uploads are ready ONLY when the server refresh token is verified & connected
  const unattendedUploadsReady = Boolean(
    configuredFolderId && serverRefreshStatus === 'connected'
  );

  const effectiveConnected = Boolean(unattendedUploadsReady || hasBrowserSession);

  return {
    configuredFolderId,
    folderIdPreview: folderPreview,
    folderName: state.folderName || '',
    oauthConnected: effectiveConnected,
    connectedEmail: state.connectedEmail || '',
    serverOAuthClientConfigured,
    serverRefreshConfigured,
    serverRefreshVerified: serverRefreshConfigured ? serverRefreshVerified : null,
    serverRefreshTokenSource: activeRefresh.source,
    serverRefreshTokenPersistedAt: activeRefresh.persistedAt,
    browserSessionStatus,
    serverRefreshStatus,
    overallConnectionStatus,
    refreshErrorCategory:
      serverRefreshStatus === 'connected'
        ? null
        : serverRefreshStatus === 'missing'
        ? 'missing'
        : serverRefreshErrorCategory,
    oauthCallbackPath: OAUTH_CALLBACK_PATH,
    oauthRedirectUri: canonicalRedirect.redirectUri,
    oauthRedirectUriSource: canonicalRedirect.source,
    oauthClientIdMasked: maskOAuthClientId(),
    unattendedUploadsReady,
    authState,
    authStateLabel,
    missingServerEnvVars,
    lastUploadAt: state.lastUploadAt,
    subfoldersInitialized,
    subfolders: state.subfolders,
    lastError: state.lastError
  };
}

function pruneExpiredOAuthStates(): void {
  const now = Date.now();
  for (const [key, entry] of pendingOAuthStates.entries()) {
    if (now - entry.createdAtMs > OAUTH_STATE_TTL_MS) {
      pendingOAuthStates.delete(key);
    }
  }
}

export function createServerDriveOAuthUrl(params: {
  adminUid: string;
  adminEmail: string;
  fallbackRequestOrigin?: string;
}): { authUrl: string; redirectUri: string; state: string } {
  const folderId = (process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
  if (!folderId) {
    throw new DriveStorageError(
      'GOOGLE_DRIVE_FOLDER_ID is not configured on the server. Add it in deployment secrets before reconnecting Google Drive.',
      400,
      'DRIVE_NOT_CONFIGURED'
    );
  }

  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw new DriveStorageError(
      'Server-side Google OAuth client credentials (GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET) are not configured on the server.',
      400,
      'DRIVE_NOT_CONFIGURED'
    );
  }

  // Always resolve from the single canonical server-side configuration
  const canonical = getCanonicalOAuthRedirectUri({
    fallbackRequestOrigin: params.fallbackRequestOrigin,
    strict: true
  });
  const canonicalRedirectUri = canonical.redirectUri;

  pruneExpiredOAuthStates();
  const state = crypto.randomBytes(24).toString('hex');
  pendingOAuthStates.set(state, {
    adminUid: params.adminUid,
    adminEmail: params.adminEmail,
    redirectUri: canonicalRedirectUri,
    createdAtMs: Date.now()
  });

  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: canonicalRedirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive',
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    login_hint: params.adminEmail || 'joepreserve@gmail.com',
    state
  });

  // Safe server-side diagnostic logging (never logs client secret, tokens, or auth codes)
  console.info(
    `[Drive OAuth] Authorization URL generated | clientId=${maskOAuthClientId(
      clientId
    )} | expectedRedirectUri=${canonicalRedirectUri} | sentRedirectUri=${canonicalRedirectUri} | source=${
      canonical.source
    } | callbackRoute=${OAUTH_CALLBACK_PATH}`
  );

  return {
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`,
    redirectUri: canonicalRedirectUri,
    state
  };
}

export async function completeServerDriveOAuthCallback(params: {
  code?: string;
  state?: string;
  oauthError?: string;
  oauthErrorDescription?: string;
  callbackRoute?: string;
}): Promise<ServerDriveOAuthCallbackResult> {
  pruneExpiredOAuthStates();

  const handledRoute = params.callbackRoute || OAUTH_CALLBACK_PATH;
  const canonicalNow = getCanonicalOAuthRedirectUri();
  const maskedClientId = maskOAuthClientId();

  console.info(
    `[Drive OAuth] Callback received | callbackRoute=${handledRoute} | clientId=${maskedClientId} | expectedRedirectUri=${
      canonicalNow.redirectUri || '(not configured)'
    } | statePresent=${Boolean(params.state)} | codePresent=${Boolean(
      params.code
    )} | oauthError=${params.oauthError || 'none'}`
  );

  const rawState = (params.state || '').trim();
  if (!rawState || !pendingOAuthStates.has(rawState)) {
    return {
      ok: false,
      refreshTokenIssued: false,
      message:
        'OAuth state validation failed or the authorization session expired. Please close this window and click "Reconnect Google Drive" again.',
      driveStatus: getDriveConnectionStatus()
    };
  }

  // One-time CSRF state consumption
  const pending = pendingOAuthStates.get(rawState)!;
  pendingOAuthStates.delete(rawState);

  if (Date.now() - pending.createdAtMs > OAUTH_STATE_TTL_MS) {
    return {
      ok: false,
      refreshTokenIssued: false,
      message:
        'The Google Drive authorization request expired. Please click "Reconnect Google Drive" again.',
      driveStatus: getDriveConnectionStatus()
    };
  }

  if (params.oauthError) {
    const errLabel =
      params.oauthError === 'access_denied'
        ? 'Google Drive authorization was cancelled before granting permission.'
        : `Google OAuth returned an error (${params.oauthError}${
            params.oauthErrorDescription ? `: ${params.oauthErrorDescription}` : ''
          }).`;
    return {
      ok: false,
      refreshTokenIssued: false,
      message: errLabel,
      driveStatus: getDriveConnectionStatus()
    };
  }

  const code = (params.code || '').trim();
  if (!code) {
    return {
      ok: false,
      refreshTokenIssued: false,
      message: 'Google OAuth did not return an authorization code. Please retry.',
      driveStatus: getDriveConnectionStatus()
    };
  }

  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      refreshTokenIssued: false,
      message:
        'Server OAuth client credentials (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET) are missing.',
      driveStatus: getDriveConnectionStatus()
    };
  }

  // Strictly reuse the exact canonical redirect_uri that was sent in the authorization request
  const tokenExchangeRedirectUri = pending.redirectUri;
  console.info(
    `[Drive OAuth] Exchanging authorization code | callbackRoute=${handledRoute} | clientId=${maskOAuthClientId(
      clientId
    )} | expectedRedirectUri=${canonicalNow.redirectUri || tokenExchangeRedirectUri} | tokenExchangeRedirectUri=${tokenExchangeRedirectUri}`
  );

  let tokenPayload: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } = {};

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: tokenExchangeRedirectUri,
        grant_type: 'authorization_code'
      })
    });

    const rawText = await tokenRes.text();
    try {
      tokenPayload = JSON.parse(rawText) as typeof tokenPayload;
    } catch {
      tokenPayload = {};
    }

    if (!tokenRes.ok) {
      const oauthCode = (tokenPayload.error || '').toLowerCase();
      console.warn(
        `[Drive OAuth] Token exchange failed | status=${tokenRes.status} | oauthError=${
          oauthCode || 'unknown'
        } | clientId=${maskOAuthClientId(clientId)} | redirectUri=${tokenExchangeRedirectUri}`
      );
      let msg = `Google OAuth token exchange failed (${tokenRes.status}).`;
      if (oauthCode === 'redirect_uri_mismatch') {
        msg = `Google OAuth redirect_uri_mismatch. Register "${tokenExchangeRedirectUri}" under Authorized redirect URIs for OAuth client ${maskOAuthClientId(
          clientId
        )} in Google Cloud Console and retry.`;
      } else if (oauthCode === 'invalid_client' || oauthCode === 'unauthorized_client') {
        serverRefreshVerified = false;
        serverRefreshErrorCategory = 'invalid_client';
        msg =
          'Google rejected GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET during code exchange. Verify your OAuth client secrets.';
      } else if (oauthCode === 'invalid_grant') {
        msg =
          'The Google authorization code was expired or already used. Please click "Reconnect Google Drive" again.';
      } else if (tokenPayload.error_description) {
        msg = `Google OAuth code exchange failed: ${tokenPayload.error_description}`;
      }

      updateDriveState({ lastError: msg });
      return {
        ok: false,
        refreshTokenIssued: false,
        message: msg,
        driveStatus: getDriveConnectionStatus()
      };
    }
  } catch {
    const msg =
      'Unable to reach Google OAuth token endpoint to complete server-side authentication. Please retry.';
    updateDriveState({ lastError: msg });
    return {
      ok: false,
      refreshTokenIssued: false,
      message: msg,
      driveStatus: getDriveConnectionStatus()
    };
  }

  const issuedRefreshToken = (tokenPayload.refresh_token || '').trim();

  // Case A: Google issued a fresh offline refresh_token — persist securely and verify end-to-end
  if (issuedRefreshToken) {
    saveServerRefreshTokenSecurely(issuedRefreshToken);
    const liveTest = await testServerRefreshTokenConnection();

    if (liveTest.ok) {
      return {
        ok: true,
        refreshTokenIssued: true,
        message:
          'Google Drive is fully connected. Server-side authentication is working.',
        driveStatus: liveTest.driveStatus
      };
    }

    return {
      ok: false,
      refreshTokenIssued: true,
      message: liveTest.message,
      driveStatus: liveTest.driveStatus
    };
  }

  // Case B: Google did NOT return a new refresh_token.
  // NEVER overwrite any existing stored refresh token! Test whether an existing refresh token is valid.
  const existingActive = resolveActiveServerRefreshToken();
  if (existingActive.token) {
    const existingTest = await testServerRefreshTokenConnection();
    if (existingTest.ok) {
      return {
        ok: true,
        refreshTokenIssued: false,
        message:
          'Google Drive is fully connected. Server-side authentication is working (existing valid server refresh token preserved).',
        driveStatus: existingTest.driveStatus
      };
    }
  }

  const missingRefreshMsg =
    'Google completed sign-in but did not issue a new offline refresh token. Remove prior access for this app at myaccount.google.com/permissions, then click "Reconnect Google Drive" again and approve all requested Google Drive permissions.';
  updateDriveState({ lastError: missingRefreshMsg });
  return {
    ok: false,
    refreshTokenIssued: false,
    message: missingRefreshMsg,
    driveStatus: getDriveConnectionStatus()
  };
}

async function performServerRefreshExchange(): Promise<RefreshExchangeResult> {
  const active = resolveActiveServerRefreshToken();
  syncVerificationStateWithActiveToken(active);

  if (!hasServerOAuthClientCredentials() || !active.token) {
    serverRefreshVerified = null;
    serverRefreshErrorCategory = 'missing';
    return {
      token: null,
      errorReason:
        'Server-side Google Drive refresh token is missing. Click "Reconnect Google Drive" or configure GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN.',
      errorCode: 'DRIVE_REFRESH_EXPIRED',
      errorCategory: 'missing'
    };
  }

  lastVerifiedTokenFingerprint = active.fingerprint;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!.trim(),
        refresh_token: active.token,
        grant_type: 'refresh_token'
      })
    });

    const payloadText = await res.text();
    let parsed: {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    } = {};
    try {
      parsed = JSON.parse(payloadText) as typeof parsed;
    } catch {
      parsed = {};
    }

    if (!res.ok) {
      cachedServerRefreshToken = null;
      const oauthCode = (parsed.error || '').toLowerCase();
      let friendlyReason =
        'The server Google Drive refresh token is invalid or expired. Click "Reconnect Google Drive" in the Admin Dashboard to issue a new persistent server refresh token.';
      let code: 'DRIVE_REFRESH_EXPIRED' | 'DRIVE_API_ERROR' = 'DRIVE_REFRESH_EXPIRED';
      let category: RefreshErrorCategory = 'invalid_client';

      if (oauthCode === 'invalid_grant') {
        serverRefreshVerified = false;
        category = 'expired_or_revoked';
        friendlyReason =
          'Server Google Drive refresh token has expired or been revoked (Google OAuth apps in Testing mode expire refresh tokens after 7 days). Click "Reconnect Google Drive" to obtain a new server refresh token or update GOOGLE_OAUTH_REFRESH_TOKEN.';
      } else if (oauthCode === 'invalid_client' || oauthCode === 'unauthorized_client') {
        serverRefreshVerified = false;
        category = 'invalid_client';
        friendlyReason =
          'Google rejected the server OAuth client credentials (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET). Verify server secrets and retry.';
      } else if (res.status >= 500) {
        code = 'DRIVE_API_ERROR';
        category = 'network';
        friendlyReason =
          'Google OAuth service is temporarily unavailable while refreshing the Drive session. Please retry in a moment.';
      } else {
        serverRefreshVerified = false;
        category = 'invalid_client';
      }

      serverRefreshErrorCategory = category;
      updateDriveState({ lastError: friendlyReason });
      return {
        token: null,
        errorReason: friendlyReason,
        errorCode: code,
        errorCategory: category
      };
    }

    if (!parsed.access_token) {
      cachedServerRefreshToken = null;
      serverRefreshVerified = false;
      serverRefreshErrorCategory = 'invalid_client';
      const reason =
        'Google OAuth did not return an access token from the configured refresh token. Click "Reconnect Google Drive" or update GOOGLE_OAUTH_REFRESH_TOKEN.';
      updateDriveState({ lastError: reason });
      return {
        token: null,
        errorReason: reason,
        errorCode: 'DRIVE_REFRESH_EXPIRED',
        errorCategory: 'invalid_client'
      };
    }

    const expiresInSec = Math.max(10, Number(parsed.expires_in) || 3600);
    const bufferSec = expiresInSec > 600 ? 300 : Math.floor(expiresInSec * 0.15);
    const ttlMs = Math.max(5, expiresInSec - bufferSec) * 1000;

    cachedServerRefreshToken = {
      accessToken: parsed.access_token,
      expiresAtMs: Date.now() + ttlMs
    };
    serverRefreshVerified = true;
    serverRefreshErrorCategory = null;
    manuallyDisconnected = false;

    const currentState = readDriveState();
    if (
      currentState.lastError &&
      /refresh token|google oauth|expired|revoked|redirect_uri_mismatch/i.test(currentState.lastError)
    ) {
      updateDriveState({ lastError: null });
    }

    return { token: parsed.access_token, errorReason: null, errorCategory: null };
  } catch {
    cachedServerRefreshToken = null;
    serverRefreshErrorCategory = 'network';
    const reason =
      'Unable to reach Google OAuth to refresh the Drive connection. Check server connectivity and retry.';
    updateDriveState({ lastError: reason });
    return {
      token: null,
      errorReason: reason,
      errorCode: 'DRIVE_API_ERROR',
      errorCategory: 'network'
    };
  }
}

async function exchangeServerRefreshToken(
  forceRefresh = false
): Promise<RefreshExchangeResult> {
  const active = resolveActiveServerRefreshToken();
  syncVerificationStateWithActiveToken(active);

  if (!hasServerOAuthClientCredentials() || !active.token) {
    return { token: null, errorReason: null, errorCategory: 'missing' };
  }

  if (forceRefresh) {
    cachedServerRefreshToken = null;
  }

  if (cachedServerRefreshToken && Date.now() < cachedServerRefreshToken.expiresAtMs) {
    return { token: cachedServerRefreshToken.accessToken, errorReason: null, errorCategory: null };
  }

  if (!inFlightRefreshPromise) {
    inFlightRefreshPromise = performServerRefreshExchange().finally(() => {
      inFlightRefreshPromise = null;
    });
  }

  return inFlightRefreshPromise;
}

export async function ensureServerRefreshVerifiedIfNeeded(): Promise<void> {
  const folderId = (process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
  const active = resolveActiveServerRefreshToken();
  syncVerificationStateWithActiveToken(active);

  if (!folderId || !hasServerOAuthClientCredentials() || !active.token) {
    return;
  }

  if (serverRefreshVerified === true && cachedServerRefreshToken && Date.now() < cachedServerRefreshToken.expiresAtMs) {
    return;
  }

  if (
    serverRefreshVerified === false &&
    Date.now() - lastAutoVerifyAttemptMs < AUTO_VERIFY_FAILURE_COOLDOWN_MS
  ) {
    return;
  }

  if (!inFlightAutoVerifyPromise) {
    lastAutoVerifyAttemptMs = Date.now();
    inFlightAutoVerifyPromise = (async () => {
      await testServerRefreshTokenConnection();
    })().finally(() => {
      inFlightAutoVerifyPromise = null;
    });
  }

  await inFlightAutoVerifyPromise;
}

export async function getServerRefreshAccessToken(
  forceRefresh = false
): Promise<string | null> {
  const res = await exchangeServerRefreshToken(forceRefresh);
  return res.token;
}

export interface ResolveAccessTokenOptions {
  driveAccessTokenHeader?: string;
  allowBrowserFallback?: boolean;
  forceRefresh?: boolean;
  audience?: 'admin' | 'public';
}

const PUBLIC_GUEST_STORAGE_UNAVAILABLE_MSG =
  'Photo and video uploads are temporarily unavailable while the couple finishes configuring the wedding gallery storage. Please try again shortly or reach out to Mary & Joseph.';

export async function resolveAccessToken(
  options?: ResolveAccessTokenOptions
): Promise<{ accessToken: string; source: 'refresh' | 'header' }> {
  const cleanHeader = (options?.driveAccessTokenHeader || '').trim();
  const allowBrowserFallback = Boolean(options?.allowBrowserFallback);
  const forceRefresh = Boolean(options?.forceRefresh);
  const audience = options?.audience || 'public';

  // 1. Server-side refresh token ALWAYS takes priority whenever configured.
  //    A browser X-Google-Drive-Token header CANNOT override a valid server refresh mechanism.
  if (hasServerRefreshCredentials()) {
    const exchanged = await exchangeServerRefreshToken(forceRefresh);
    if (exchanged.token) {
      return { accessToken: exchanged.token, source: 'refresh' };
    }

    // If server refresh credentials are invalid/revoked, ONLY an authenticated admin
    // session explicitly providing a fresh browser token can fall back; public guest
    // uploads must never silently depend on browser tokens.
    if (allowBrowserFallback && cleanHeader && !forceRefresh) {
      return { accessToken: cleanHeader, source: 'header' };
    }

    const message =
      audience === 'admin'
        ? exchanged.errorReason ||
          'The server Google Drive refresh token is expired or revoked. Click "Reconnect Google Drive" in the Admin Dashboard to issue a fresh server refresh token.'
        : PUBLIC_GUEST_STORAGE_UNAVAILABLE_MSG;

    throw new DriveStorageError(
      message,
      exchanged.errorCode === 'DRIVE_API_ERROR' ? 502 : 401,
      exchanged.errorCode || 'DRIVE_REFRESH_EXPIRED'
    );
  }

  // 2. Server refresh credentials are NOT configured.
  //    Authenticated admins can upload using their temporary browser OAuth session;
  //    unattended public guest uploads cannot proceed without server credentials.
  if (allowBrowserFallback && cleanHeader) {
    return { accessToken: cleanHeader, source: 'header' };
  }

  const missingVars = getMissingServerEnvVars().filter((v) => v !== 'GOOGLE_DRIVE_FOLDER_ID');
  const missingList =
    missingVars.join(', ') ||
    'GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN';

  const adminMissingMsg = `Persistent server-side Google Drive OAuth credentials are missing (${missingList}). Click "Reconnect Google Drive" in the Admin Dashboard or configure those server environment variables.`;

  throw new DriveStorageError(
    audience === 'admin' ? adminMissingMsg : PUBLIC_GUEST_STORAGE_UNAVAILABLE_MSG,
    401,
    'DRIVE_AUTH_MISSING'
  );
}

function getRequiredFolderId(audience: 'admin' | 'public' = 'admin'): string {
  const folderId = (process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
  if (!folderId) {
    throw new DriveStorageError(
      audience === 'admin'
        ? 'GOOGLE_DRIVE_FOLDER_ID is not configured on the server. Add GOOGLE_DRIVE_FOLDER_ID in your deployment secrets before uploading to Google Drive.'
        : PUBLIC_GUEST_STORAGE_UNAVAILABLE_MSG,
      400,
      'DRIVE_NOT_CONFIGURED'
    );
  }
  return folderId;
}

async function driveJsonFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {})
    }
  });

  if (res.status === 401) {
    updateDriveState({
      oauthConnected: false,
      lastError: 'Your Google Drive connection has expired. Reconnect Google Drive and retry.'
    });
    throw new DriveStorageError(
      'Your Google Drive authorization token was rejected (401). Reconnect Google Drive or refresh server credentials.',
      401,
      'DRIVE_AUTH_EXPIRED'
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    let apiDetails = '';
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } };
      if (parsed.error?.message) {
        apiDetails = parsed.error.message;
      }
    } catch {
      if (errText) apiDetails = errText.slice(0, 180);
    }

    if (res.status === 403) {
      const stateMsg = apiDetails
        ? `Google Drive permission denied (403): ${apiDetails}`
        : 'Google Drive folder permission denied (403).';
      updateDriveState({ lastError: stateMsg });
      throw new DriveStorageError(
        "You don't have permission to access or upload files to this Google Drive folder. Check the connected Drive account or folder permissions.",
        403,
        'DRIVE_PERMISSION_ERROR'
      );
    }

    const conciseMessage = apiDetails
      ? `Google Drive error (${res.status}): ${apiDetails}`
      : `Google Drive API error (${res.status})`;
    updateDriveState({ lastError: conciseMessage });
    throw new DriveStorageError(
      'Something went wrong while communicating with Google Drive. Please try again in a moment.',
      502,
      'DRIVE_API_ERROR'
    );
  }

  return (await res.json()) as T;
}

export async function verifyAndSaveDriveConnection(
  accessToken: string,
  options?: { fromBrowserSession?: boolean }
): Promise<DriveConnectionStatus> {
  const folderId = getRequiredFolderId('admin');

  const about = await driveJsonFetch<{ user?: { emailAddress?: string; displayName?: string } }>(
    'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)',
    accessToken
  );

  const folder = await driveJsonFetch<{
    id: string;
    name: string;
    mimeType: string;
    capabilities?: { canAddChildren?: boolean };
  }>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      folderId
    )}?fields=id,name,mimeType,capabilities(canAddChildren)&supportsAllDrives=true`,
    accessToken
  );

  if (folder.mimeType !== 'application/vnd.google-apps.folder') {
    throw new DriveStorageError(
      `Configured GOOGLE_DRIVE_FOLDER_ID ("${folder.name}") is not a Google Drive folder.`,
      400,
      'DRIVE_PERMISSION_ERROR'
    );
  }

  if (folder.capabilities && folder.capabilities.canAddChildren === false) {
    throw new DriveStorageError(
      `Signed-in Google account (${about.user?.emailAddress || 'unknown'}) does not have edit/upload access to Google Drive folder "${folder.name}".`,
      403,
      'DRIVE_PERMISSION_ERROR'
    );
  }

  manuallyDisconnected = false;
  const currentState = readDriveState();
  // Preserve any existing server refresh error message when only verifying a browser session!
  const nextLastError =
    options?.fromBrowserSession && serverRefreshVerified === false
      ? currentState.lastError
      : null;

  updateDriveState({
    oauthConnected: true,
    connectedEmail: about.user?.emailAddress || '',
    folderId,
    folderName: folder.name,
    lastError: nextLastError
  });

  return getDriveConnectionStatus({
    hasBrowserSession: Boolean(options?.fromBrowserSession)
  });
}

export async function testServerRefreshTokenConnection(options?: {
  hasBrowserSession?: boolean;
}): Promise<DriveTestConnectionResponse> {
  const configuredFolderId = Boolean((process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim());
  const refreshConfigured = hasServerRefreshCredentials();
  const hasBrowserSession = Boolean(options?.hasBrowserSession);

  if (!configuredFolderId) {
    const driveStatus = getDriveConnectionStatus({ hasBrowserSession });
    return {
      ok: false,
      refreshTokenConfigured: refreshConfigured,
      refreshTokenValid: false,
      tokenObtained: false,
      folderVerified: false,
      authMode: 'none',
      serverRefreshStatus: driveStatus.serverRefreshStatus,
      message: 'GOOGLE_DRIVE_FOLDER_ID is missing from server environment variables.',
      driveStatus
    };
  }

  if (!refreshConfigured) {
    const missing = getMissingServerEnvVars().join(', ');
    const driveStatus = getDriveConnectionStatus({ hasBrowserSession });
    return {
      ok: false,
      refreshTokenConfigured: false,
      refreshTokenValid: false,
      tokenObtained: false,
      folderVerified: false,
      authMode: 'none',
      serverRefreshStatus: 'missing',
      message: `Persistent server-side OAuth credentials are missing (${missing}). Click "Reconnect Google Drive" or configure deployment secrets to enable unattended guest uploads.`,
      driveStatus
    };
  }

  // Strictly test the server-side refresh token ONLY — never fall back to any browser token
  const exchanged = await exchangeServerRefreshToken(true);
  if (!exchanged.token) {
    const driveStatus = getDriveConnectionStatus({ hasBrowserSession });
    return {
      ok: false,
      refreshTokenConfigured: true,
      refreshTokenValid: false,
      tokenObtained: false,
      folderVerified: false,
      authMode: 'none',
      serverRefreshStatus: driveStatus.serverRefreshStatus,
      message:
        exchanged.errorReason ||
        'Server refresh token failed to obtain an access token from Google OAuth.',
      driveStatus
    };
  }

  try {
    const status = await verifyAndSaveDriveConnection(exchanged.token, {
      fromBrowserSession: hasBrowserSession
    });
    return {
      ok: true,
      refreshTokenConfigured: true,
      refreshTokenValid: true,
      tokenObtained: true,
      folderVerified: true,
      authMode: 'server_refresh_token',
      serverRefreshStatus: 'connected',
      verifiedEmail: status.connectedEmail || undefined,
      message: `Google Drive is fully connected. Server-side authentication is working (${status.connectedEmail || 'verified account'} · folder "${status.folderName}").`,
      driveStatus: status
    };
  } catch (err) {
    if (err instanceof DriveStorageError && err.code === 'DRIVE_AUTH_EXPIRED') {
      serverRefreshVerified = false;
      serverRefreshErrorCategory = 'expired_or_revoked';
    } else if (err instanceof DriveStorageError && err.code === 'DRIVE_PERMISSION_ERROR') {
      serverRefreshVerified = false;
      serverRefreshErrorCategory = 'invalid_client';
    }
    const msg =
      err instanceof Error
        ? err.message
        : 'Obtained an access token from refresh token, but Google Drive folder verification failed.';
    const driveStatus = getDriveConnectionStatus({ hasBrowserSession });
    return {
      ok: false,
      refreshTokenConfigured: true,
      refreshTokenValid: !(err instanceof DriveStorageError && err.code === 'DRIVE_AUTH_EXPIRED'),
      tokenObtained: true,
      folderVerified: false,
      authMode: 'none',
      serverRefreshStatus: driveStatus.serverRefreshStatus,
      message: msg,
      driveStatus
    };
  }
}

export async function testDriveConnection(
  driveAccessTokenHeader?: string
): Promise<DriveTestConnectionResponse> {
  const cleanHeader = (driveAccessTokenHeader || '').trim();
  const hasBrowserSession = Boolean(cleanHeader);

  // Always prefer server-side refresh token test whenever configured (cannot be overridden by browser header)
  if (hasServerRefreshCredentials()) {
    const refreshResult = await testServerRefreshTokenConnection({ hasBrowserSession });
    if (refreshResult.ok || !cleanHeader) {
      return refreshResult;
    }

    // Only if server refresh failed AND admin provided a browser token, test browser fallback explicitly
    try {
      const status = await verifyAndSaveDriveConnection(cleanHeader, {
        fromBrowserSession: true
      });
      return {
        ok: true,
        refreshTokenConfigured: true,
        refreshTokenValid: false,
        tokenObtained: true,
        folderVerified: true,
        authMode: 'browser_session',
        serverRefreshStatus: status.serverRefreshStatus,
        verifiedEmail: status.connectedEmail || undefined,
        message: `Browser connection active for "${status.folderName}", but server-side authentication is not working (${refreshResult.message}). Background and guest uploads may be affected.`,
        driveStatus: status
      };
    } catch (err) {
      return {
        ...refreshResult,
        message:
          err instanceof Error
            ? `${refreshResult.message} Browser fallback also failed: ${err.message}`
            : refreshResult.message
      };
    }
  }

  // Server refresh credentials not configured: allow testing browser session if provided,
  // while clearly flagging missing server credentials.
  if (cleanHeader) {
    const status = await verifyAndSaveDriveConnection(cleanHeader, {
      fromBrowserSession: true
    });
    return {
      ok: true,
      refreshTokenConfigured: false,
      refreshTokenValid: false,
      tokenObtained: true,
      folderVerified: true,
      authMode: 'browser_session',
      serverRefreshStatus: 'missing',
      verifiedEmail: status.connectedEmail || undefined,
      message: `Browser connection active for "${status.folderName}", but server-side authentication is not configured. Background and guest uploads may be affected.`,
      driveStatus: status
    };
  }

  return testServerRefreshTokenConnection({ hasBrowserSession: false });
}

async function findOrCreateSubfolder(
  accessToken: string,
  parentId: string,
  folderName: string
): Promise<string> {
  const escapedName = folderName.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `'${parentId}' in parents and name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );

  const searchRes = await driveJsonFetch<{ files?: Array<{ id: string; name: string }> }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    accessToken
  );

  if (searchRes.files && searchRes.files.length > 0) {
    return searchRes.files[0].id;
  }

  const created = await driveJsonFetch<{ id: string }>(
    'https://www.googleapis.com/drive/v3/files?fields=id,name&supportsAllDrives=true',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    }
  );

  return created.id;
}

export async function ensureDriveFolderStructure(
  accessToken: string,
  options?: { fromBrowserSession?: boolean }
): Promise<DriveSubfolderMap> {
  const folderId = getRequiredFolderId('admin');
  await verifyAndSaveDriveConnection(accessToken, options);

  const state = readDriveState();
  const rootId =
    state.folderName.trim().toLowerCase() === 'mary and joseph wedding'
      ? folderId
      : await findOrCreateSubfolder(accessToken, folderId, 'Mary and Joseph Wedding');

  const [websitePhotosId, guestUploadsId, adminMediaId] = await Promise.all([
    findOrCreateSubfolder(accessToken, rootId, 'Website Photos'),
    findOrCreateSubfolder(accessToken, rootId, 'Guest Uploads'),
    findOrCreateSubfolder(accessToken, rootId, 'Admin Media')
  ]);

  const [homepageId, ourStoryId, scheduleId, guestPhotosId, guestVideosId] = await Promise.all([
    findOrCreateSubfolder(accessToken, websitePhotosId, 'Homepage'),
    findOrCreateSubfolder(accessToken, websitePhotosId, 'Our Story'),
    findOrCreateSubfolder(accessToken, websitePhotosId, 'Schedule'),
    findOrCreateSubfolder(accessToken, guestUploadsId, 'Photos'),
    findOrCreateSubfolder(accessToken, guestUploadsId, 'Videos')
  ]);

  const subfolders: DriveSubfolderMap = {
    rootId,
    websitePhotosId,
    homepageId,
    ourStoryId,
    scheduleId,
    guestUploadsId,
    guestPhotosId,
    guestVideosId,
    adminMediaId
  };

  const nextLastError =
    options?.fromBrowserSession && serverRefreshVerified === false
      ? state.lastError
      : null;

  updateDriveState({ subfolders, lastError: nextLastError });
  return subfolders;
}

export function disconnectDriveState(): DriveConnectionStatus {
  // Disconnecting the browser session must NOT break or clear a verified server refresh token.
  const hasVerifiedServer = serverRefreshVerified === true && hasServerRefreshCredentials();
  if (!hasVerifiedServer) {
    manuallyDisconnected = true;
    updateDriveState({
      oauthConnected: false,
      connectedEmail: hasServerRefreshCredentials() ? readDriveState().connectedEmail : ''
    });
  }
  return getDriveConnectionStatus({ hasBrowserSession: false });
}

async function resolveTargetFolder(
  accessToken: string,
  category: DriveMediaCategory,
  mediaType: 'image' | 'video' | 'audio',
  fromBrowserSession: boolean
): Promise<{ folderId: string; label: string }> {
  const state = readDriveState();
  let map = state.subfolders;

  const needsInit =
    !map.rootId ||
    !map.homepageId ||
    !map.ourStoryId ||
    !map.scheduleId ||
    !map.guestPhotosId ||
    !map.guestVideosId ||
    !map.adminMediaId;

  if (needsInit) {
    map = await ensureDriveFolderStructure(accessToken, { fromBrowserSession });
  }

  switch (category) {
    case 'website_homepage':
      return { folderId: map.homepageId!, label: 'Website Photos / Homepage' };
    case 'website_story':
      return { folderId: map.ourStoryId!, label: 'Website Photos / Our Story' };
    case 'website_schedule':
      return { folderId: map.scheduleId!, label: 'Website Photos / Schedule' };
    case 'guest_photo':
      return { folderId: map.guestPhotosId!, label: 'Guest Uploads / Photos' };
    case 'guest_video':
      return { folderId: map.guestVideosId!, label: 'Guest Uploads / Videos' };
    case 'admin_music': {
      let musicFolderId = map.websiteMusicId;
      if (!musicFolderId && map.rootId) {
        musicFolderId = await findOrCreateSubfolder(accessToken, map.rootId, 'Website Music');
        const nextSubfolders: DriveSubfolderMap = { ...map, websiteMusicId: musicFolderId };
        updateDriveState({ subfolders: nextSubfolders });
      }
      return {
        folderId: musicFolderId || map.adminMediaId!,
        label: musicFolderId ? 'Website Music' : 'Admin Media'
      };
    }
    case 'admin_media':
    default:
      if (category === 'admin_media') {
        return { folderId: map.adminMediaId!, label: 'Admin Media' };
      }
      if (mediaType === 'audio') {
        return { folderId: map.websiteMusicId || map.adminMediaId!, label: 'Website Music' };
      }
      return mediaType === 'video'
        ? { folderId: map.guestVideosId!, label: 'Guest Uploads / Videos' }
        : { folderId: map.guestPhotosId!, label: 'Guest Uploads / Photos' };
  }
}

export async function storeGalleryFileInDrive(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  category: DriveMediaCategory;
  mediaType: 'image' | 'video' | 'audio';
  driveAccessTokenHeader?: string;
  isAdminUpload?: boolean;
}): Promise<StoredMediaResult> {
  const audience: 'admin' | 'public' = params.isAdminUpload ? 'admin' : 'public';
  getRequiredFolderId(audience);

  // Public guest uploads MUST strictly use server refresh credentials and never depend on browser headers
  let { accessToken, source } = await resolveAccessToken({
    driveAccessTokenHeader: params.isAdminUpload ? params.driveAccessTokenHeader : undefined,
    allowBrowserFallback: Boolean(params.isAdminUpload),
    audience
  });

  const ext =
    path.extname(params.originalName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10) || '.bin';
  const cleanOriginal = path
    .basename(params.originalName)
    .replace(/[^a-zA-Z0-9._\- ]/g, '_')
    .slice(0, 100);
  const uploadName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}_${
    cleanOriginal || `media${ext}`
  }`;

  let target = await resolveTargetFolder(
    accessToken,
    params.category,
    params.mediaType,
    source === 'header'
  );

  const uploadMultipart = async (parentFolderId: string, tokenToUse: string) => {
    const boundary = `mjay2026_${crypto.randomBytes(12).toString('hex')}`;
    const metadata = JSON.stringify({
      name: uploadName,
      parents: [parentFolderId]
    });

    const prefix = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`,
      'utf8'
    );
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const multipartBody = Buffer.concat([prefix, params.buffer, suffix]);

    return fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,webContentLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenToUse}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(multipartBody.length)
        },
        body: multipartBody
      }
    );
  };

  let uploadRes = await uploadMultipart(target.folderId, accessToken);

  // If cached server refresh token was invalidated mid-flight, force one clean refresh and retry once
  if (uploadRes.status === 401 && source === 'refresh') {
    const retried = await resolveAccessToken({
      forceRefresh: true,
      allowBrowserFallback: false,
      audience
    });
    accessToken = retried.accessToken;
    source = retried.source;
    uploadRes = await uploadMultipart(target.folderId, accessToken);
  }

  // If cached subfolder ID was deleted on Drive, re-initialize folder tree once and retry
  if (uploadRes.status === 404) {
    await ensureDriveFolderStructure(accessToken, { fromBrowserSession: source === 'header' });
    target = await resolveTargetFolder(
      accessToken,
      params.category,
      params.mediaType,
      source === 'header'
    );
    uploadRes = await uploadMultipart(target.folderId, accessToken);
  }

  if (uploadRes.status === 401) {
    if (source === 'refresh') {
      cachedServerRefreshToken = null;
      serverRefreshVerified = false;
    }
    const errorCode: DriveStorageErrorCode =
      source === 'refresh' ? 'DRIVE_REFRESH_EXPIRED' : 'DRIVE_AUTH_EXPIRED';
    const adminMsg =
      source === 'refresh'
        ? 'The refreshed Google Drive access token was rejected (401). Reconnect Google Drive in the Admin Dashboard or update GOOGLE_OAUTH_REFRESH_TOKEN.'
        : 'Your browser Google Drive session has expired. Click "Connect Google Drive" to reconnect and retry your upload.';
    updateDriveState({
      oauthConnected: source === 'header' ? false : readDriveState().oauthConnected,
      lastError: adminMsg
    });
    throw new DriveStorageError(
      audience === 'admin' ? adminMsg : PUBLIC_GUEST_STORAGE_UNAVAILABLE_MSG,
      401,
      errorCode
    );
  }

  if (uploadRes.status === 403) {
    const errText = await uploadRes.text().catch(() => '');
    updateDriveState({
      lastError: `Google Drive folder permission denied (403)${
        errText ? `: ${errText.slice(0, 140)}` : '.'
      }`
    });
    throw new DriveStorageError(
      audience === 'admin'
        ? "You don't have permission to upload files to this Google Drive folder. Check the connected Drive account or folder permissions."
        : PUBLIC_GUEST_STORAGE_UNAVAILABLE_MSG,
      403,
      'DRIVE_PERMISSION_ERROR'
    );
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    let msg = `Google Drive upload failed (${uploadRes.status})`;
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } };
      if (parsed.error?.message) {
        msg = `Google Drive upload failed (${uploadRes.status}): ${parsed.error.message}`;
      }
    } catch {
      if (errText) msg = `Google Drive upload failed (${uploadRes.status}): ${errText.slice(0, 180)}`;
    }
    updateDriveState({ lastError: msg });
    throw new DriveStorageError(
      'Something went wrong on our end while uploading your files to Google Drive. Please try again in a moment.',
      502,
      'DRIVE_API_ERROR'
    );
  }

  const created = (await uploadRes.json()) as { id?: string };
  if (!created.id) {
    throw new DriveStorageError(
      'Google Drive did not confirm creation of the uploaded file. Please retry.',
      502,
      'DRIVE_API_ERROR'
    );
  }

  // Set public read-only link sharing so wedding guests can view approved photos cleanly
  const permRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(created.id)}/permissions?supportsAllDrives=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    }
  );
  if (!permRes.ok) {
    console.warn(
      `Google Drive public reader permission warning for ${created.id}: ${permRes.status}`
    );
  }

  updateDriveState({
    oauthConnected: source === 'header' ? true : readDriveState().oauthConnected,
    lastUploadAt: new Date().toISOString(),
    lastError: null
  });

  return {
    storageProvider: 'google_drive',
    driveFileId: created.id,
    fileUrl: `/api/gallery/drive/${encodeURIComponent(created.id)}`,
    sizeBytes: params.buffer.length,
    mimeType: params.mimeType,
    originalName: cleanOriginal || uploadName,
    category: params.category,
    folderName: target.label
  };
}

export interface ResumableSessionRecord {
  sessionId: string;
  driveUploadUri: string;
  originalName: string;
  uploadName: string;
  mediaType: 'image' | 'video' | 'audio';
  mimeType: string;
  sizeBytes: number;
  category: DriveMediaCategory;
  targetFolderId: string;
  folderName: string;
  isAdminUpload: boolean;
  fromBrowserSession: boolean;
  createdAtMs: number;
}

const RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB (multiple of 256 KiB, safely < 32 MiB proxy limit)
const RESUMABLE_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const resumableSessions = new Map<string, ResumableSessionRecord>();

function pruneExpiredResumableSessions(): void {
  const cutoff = Date.now() - RESUMABLE_SESSION_TTL_MS;
  for (const [id, rec] of resumableSessions.entries()) {
    if (rec.createdAtMs < cutoff) {
      resumableSessions.delete(id);
    }
  }
}

function buildSanitizedUploadName(originalName: string): {
  cleanOriginal: string;
  uploadName: string;
} {
  const ext =
    path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10) || '.bin';
  const cleanOriginal = path
    .basename(originalName)
    .replace(/[^a-zA-Z0-9._\- ]/g, '_')
    .slice(0, 100);
  const uploadName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}_${
    cleanOriginal || `media${ext}`
  }`;
  return { cleanOriginal: cleanOriginal || uploadName, uploadName };
}

async function applyPublicDriveReadPermission(
  driveFileId: string,
  accessToken: string
): Promise<void> {
  const permRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      driveFileId
    )}/permissions?supportsAllDrives=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    }
  );
  if (!permRes.ok) {
    console.warn(
      `Google Drive public reader permission warning for ${driveFileId}: ${permRes.status}`
    );
  }
}

export async function initiateDriveResumableSession(params: {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: DriveMediaCategory;
  mediaType: 'image' | 'video' | 'audio';
  origin?: string;
  driveAccessTokenHeader?: string;
  isAdminUpload?: boolean;
}): Promise<{
  sessionId: string;
  driveUploadUri: string;
  chunkBytes: number;
  folderName: string;
}> {
  pruneExpiredResumableSessions();

  const audience: 'admin' | 'public' = params.isAdminUpload ? 'admin' : 'public';
  getRequiredFolderId(audience);

  let { accessToken, source } = await resolveAccessToken({
    driveAccessTokenHeader: params.isAdminUpload ? params.driveAccessTokenHeader : undefined,
    allowBrowserFallback: Boolean(params.isAdminUpload),
    audience
  });

  const { cleanOriginal, uploadName } = buildSanitizedUploadName(params.originalName);

  let target = await resolveTargetFolder(
    accessToken,
    params.category,
    params.mediaType,
    source === 'header'
  );

  const createResumableSession = async (parentFolderId: string, tokenToUse: string) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${tokenToUse}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': params.mimeType,
      'X-Upload-Content-Length': String(params.sizeBytes)
    };
    if (params.origin) {
      headers['Origin'] = params.origin;
    }

    return fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: uploadName,
          parents: [parentFolderId]
        })
      }
    );
  };

  let initRes = await createResumableSession(target.folderId, accessToken);

  if (initRes.status === 401 && source === 'refresh') {
    const retried = await resolveAccessToken({
      forceRefresh: true,
      allowBrowserFallback: false,
      audience
    });
    accessToken = retried.accessToken;
    source = retried.source;
    initRes = await createResumableSession(target.folderId, accessToken);
  }

  if (initRes.status === 404) {
    await ensureDriveFolderStructure(accessToken, { fromBrowserSession: source === 'header' });
    target = await resolveTargetFolder(
      accessToken,
      params.category,
      params.mediaType,
      source === 'header'
    );
    initRes = await createResumableSession(target.folderId, accessToken);
  }

  if (initRes.status === 401) {
    if (source === 'refresh') {
      cachedServerRefreshToken = null;
      serverRefreshVerified = false;
    }
    const errorCode: DriveStorageErrorCode =
      source === 'refresh' ? 'DRIVE_REFRESH_EXPIRED' : 'DRIVE_AUTH_EXPIRED';
    const adminMsg =
      source === 'refresh'
        ? 'The refreshed Google Drive access token was rejected (401). Reconnect Google Drive in the Admin Dashboard or update GOOGLE_OAUTH_REFRESH_TOKEN.'
        : 'Your browser Google Drive session has expired. Click "Connect Google Drive" to reconnect and retry your upload.';
    updateDriveState({
      oauthConnected: source === 'header' ? false : readDriveState().oauthConnected,
      lastError: adminMsg
    });
    throw new DriveStorageError(
      audience === 'admin' ? adminMsg : PUBLIC_GUEST_STORAGE_UNAVAILABLE_MSG,
      401,
      errorCode
    );
  }

  if (initRes.status === 403) {
    const errText = await initRes.text().catch(() => '');
    updateDriveState({
      lastError: `Google Drive folder permission denied (403)${
        errText ? `: ${errText.slice(0, 140)}` : '.'
      }`
    });
    throw new DriveStorageError(
      audience === 'admin'
        ? "You don't have permission to upload files to this Google Drive folder. Check the connected Drive account or folder permissions."
        : PUBLIC_GUEST_STORAGE_UNAVAILABLE_MSG,
      403,
      'DRIVE_PERMISSION_ERROR'
    );
  }

  if (!initRes.ok) {
    const errText = await initRes.text().catch(() => '');
    let msg = `Google Drive resumable session init failed (${initRes.status})`;
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } };
      if (parsed.error?.message) {
        msg = `Google Drive resumable init failed (${initRes.status}): ${parsed.error.message}`;
      }
    } catch {
      if (errText) msg = `Google Drive resumable init failed (${initRes.status}): ${errText.slice(0, 180)}`;
    }
    updateDriveState({ lastError: msg });
    throw new DriveStorageError(
      'Unable to initialize upload session with Google Drive. Please try again in a moment.',
      502,
      'DRIVE_API_ERROR'
    );
  }

  const driveUploadUri = initRes.headers.get('location') || '';
  if (!driveUploadUri) {
    throw new DriveStorageError(
      'Google Drive did not return a resumable upload session URI. Please retry.',
      502,
      'DRIVE_API_ERROR'
    );
  }

  const sessionId = crypto.randomUUID();
  resumableSessions.set(sessionId, {
    sessionId,
    driveUploadUri,
    originalName: cleanOriginal,
    uploadName,
    mediaType: params.mediaType,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    category: params.category,
    targetFolderId: target.folderId,
    folderName: target.label,
    isAdminUpload: Boolean(params.isAdminUpload),
    fromBrowserSession: source === 'header',
    createdAtMs: Date.now()
  });

  return {
    sessionId,
    driveUploadUri,
    chunkBytes: RESUMABLE_CHUNK_BYTES,
    folderName: target.label
  };
}

export async function relayResumableChunkToDrive(params: {
  sessionId: string;
  chunk: Buffer;
  contentRange: string;
  contentType?: string;
}): Promise<{
  status: number;
  rangeHeader: string | null;
  bodyText: string;
}> {
  pruneExpiredResumableSessions();
  const session = resumableSessions.get(params.sessionId);
  if (!session) {
    throw new DriveStorageError(
      'Resumable upload session expired or could not be found. Please restart this upload.',
      404,
      'DRIVE_API_ERROR'
    );
  }

  const headers: Record<string, string> = {
    'Content-Length': String(params.chunk.length),
    'Content-Range': params.contentRange
  };
  if (params.contentType) {
    headers['Content-Type'] = params.contentType;
  }

  const upstream = await fetch(session.driveUploadUri, {
    method: 'PUT',
    headers,
    body: new Uint8Array(params.chunk)
  });

  const bodyText = await upstream.text().catch(() => '');
  const rangeHeader = upstream.headers.get('range');

  return {
    status: upstream.status,
    rangeHeader,
    bodyText
  };
}

export async function completeDriveResumableSession(params: {
  sessionId: string;
  driveFileIdHint?: string;
  driveAccessTokenHeader?: string;
  isAdminUpload?: boolean;
}): Promise<StoredMediaResult> {
  pruneExpiredResumableSessions();
  const session = resumableSessions.get(params.sessionId);
  if (!session) {
    throw new DriveStorageError(
      'Resumable upload session expired or was already completed.',
      404,
      'DRIVE_API_ERROR'
    );
  }

  const audience: 'admin' | 'public' =
    session.isAdminUpload || params.isAdminUpload ? 'admin' : 'public';

  let fileId = (params.driveFileIdHint || '').replace(/[^a-zA-Z0-9_\-]/g, '');

  // If browser response didn't expose fileId (or needs session confirmation), query Drive session status
  if (!fileId) {
    const statusRes = await fetch(session.driveUploadUri, {
      method: 'PUT',
      headers: {
        'Content-Length': '0',
        'Content-Range': `bytes */${session.sizeBytes}`
      }
    });
    if (statusRes.ok) {
      const parsed = (await statusRes.json().catch(() => ({}))) as { id?: string };
      if (parsed.id) {
        fileId = parsed.id;
      }
    }
  }

  if (!fileId) {
    throw new DriveStorageError(
      'Google Drive did not confirm the completed upload file ID. Please retry the upload.',
      502,
      'DRIVE_API_ERROR'
    );
  }

  let { accessToken, source } = await resolveAccessToken({
    driveAccessTokenHeader: session.isAdminUpload ? params.driveAccessTokenHeader : undefined,
    allowBrowserFallback: session.isAdminUpload,
    audience
  });

  const fetchMeta = async (tokenToUse: string) =>
    fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        fileId
      )}?fields=id,name,mimeType,size,parents,trashed&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${tokenToUse}` }
      }
    );

  let metaRes = await fetchMeta(accessToken);
  if (metaRes.status === 401 && source === 'refresh') {
    const retried = await resolveAccessToken({
      forceRefresh: true,
      allowBrowserFallback: false,
      audience
    });
    accessToken = retried.accessToken;
    source = retried.source;
    metaRes = await fetchMeta(accessToken);
  }

  if (!metaRes.ok) {
    throw new DriveStorageError(
      'Could not verify the uploaded file in Google Drive. Please retry.',
      502,
      'DRIVE_API_ERROR'
    );
  }

  const fileMeta = (await metaRes.json()) as {
    id?: string;
    name?: string;
    mimeType?: string;
    size?: string;
    parents?: string[];
    trashed?: boolean;
  };

  if (
    !fileMeta.id ||
    fileMeta.trashed ||
    !Array.isArray(fileMeta.parents) ||
    !fileMeta.parents.includes(session.targetFolderId)
  ) {
    throw new DriveStorageError(
      'Uploaded file did not match the authorized Google Drive destination folder.',
      403,
      'DRIVE_PERMISSION_ERROR'
    );
  }

  const confirmedSize = Number(fileMeta.size || 0);
  if (!Number.isFinite(confirmedSize) || confirmedSize <= 0) {
    throw new DriveStorageError(
      'The uploaded file in Google Drive appears incomplete or empty (0 bytes). Please retry.',
      502,
      'DRIVE_API_ERROR'
    );
  }

  await applyPublicDriveReadPermission(fileMeta.id, accessToken);

  updateDriveState({
    oauthConnected: source === 'header' ? true : readDriveState().oauthConnected,
    lastUploadAt: new Date().toISOString(),
    lastError: null
  });

  resumableSessions.delete(params.sessionId);

  return {
    storageProvider: 'google_drive',
    driveFileId: fileMeta.id,
    fileUrl: `/api/gallery/drive/${encodeURIComponent(fileMeta.id)}`,
    sizeBytes: confirmedSize,
    mimeType: session.mimeType,
    originalName: session.originalName,
    category: session.category,
    folderName: session.folderName
  };
}

export async function abortDriveResumableSession(sessionId: string): Promise<void> {
  const session = resumableSessions.get(sessionId);
  if (!session) return;
  resumableSessions.delete(sessionId);
  try {
    await fetch(session.driveUploadUri, { method: 'DELETE' });
  } catch {
    // Best-effort cleanup of abandoned Drive resumable URI
  }
}

export function resolveLocalMediaPath(fileId: string): string | null {
  const safeId = path.basename(fileId);
  if (!safeId || safeId !== fileId || !/^[a-zA-Z0-9._\-]+$/.test(safeId)) {
    return null;
  }
  const fullPath = path.join(UPLOAD_ROOT, safeId);
  if (!fullPath.startsWith(UPLOAD_ROOT)) return null;
  if (!fs.existsSync(fullPath)) return null;
  return fullPath;
}

export async function deleteStoredGalleryFile(
  storageProvider: string,
  driveFileId: string,
  driveAccessTokenHeader?: string
): Promise<void> {
  if (storageProvider === 'local_server' && driveFileId) {
    const target = resolveLocalMediaPath(driveFileId);
    if (target && fs.existsSync(target)) {
      await fs.promises.unlink(target);
    }
    return;
  }

  if (storageProvider === 'google_drive' && driveFileId) {
    // Prefer server refresh token over browser session header whenever configured
    let token: string | null = await getServerRefreshAccessToken();
    if (!token) {
      token = (driveAccessTokenHeader || '').trim() || null;
    }
    if (!token) return;

    await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?supportsAllDrives=true`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      }
    );
  }
}

export async function fetchDriveMediaStream(
  driveFileId: string,
  driveAccessTokenHeader?: string,
  rangeHeader?: string
): Promise<Response | null> {
  // Prefer server refresh token over browser session header whenever configured
  const token =
    (await getServerRefreshAccessToken()) || (driveAccessTokenHeader || '').trim() || null;
  if (token) {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }
    const authRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`,
      { headers }
    );
    if (authRes.ok || authRes.status === 206) return authRes;
  }

  // Public anyone-with-link fallback for website visitors when no server/user OAuth token is active
  const ucHeaders: Record<string, string> = {};
  if (rangeHeader) {
    ucHeaders['Range'] = rangeHeader;
  }
  const ucRes = await fetch(
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}`,
    { redirect: 'follow', headers: ucHeaders }
  );
  const ucContentType = (ucRes.headers.get('content-type') || '').toLowerCase();
  if ((ucRes.ok || ucRes.status === 206) && !ucContentType.includes('text/html')) {
    return ucRes;
  }

  // Googleusercontent CDN fallback for publicly shared Drive images
  const lh3Res = await fetch(
    `https://lh3.googleusercontent.com/d/${encodeURIComponent(driveFileId)}=s2048`,
    { redirect: 'follow' }
  );
  if (lh3Res.ok) return lh3Res;

  return ucRes.ok || ucRes.status === 206 ? ucRes : null;
}
