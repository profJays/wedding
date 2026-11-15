import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  DriveAuthState,
  DriveAuthStateLabel,
  DriveConnectionStatus,
  DriveMediaCategory,
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

interface RefreshExchangeResult {
  token: string | null;
  errorReason: string | null;
  errorCode?: 'DRIVE_REFRESH_EXPIRED' | 'DRIVE_API_ERROR';
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOAD_ROOT = path.resolve(DATA_DIR, 'gallery-uploads');
const DRIVE_STATE_PATH = path.resolve(DATA_DIR, 'drive-state.json');

// Strict in-memory only caches/flags for server OAuth tokens (never written to disk or responses)
let cachedServerRefreshToken: { accessToken: string; expiresAtMs: number } | null = null;
let inFlightRefreshPromise: Promise<RefreshExchangeResult> | null = null;
let serverRefreshVerified: boolean | null = null;
let manuallyDisconnected = false;

export function resetServerRefreshAuthCacheForTests(options?: {
  expiresAtMs?: number;
  accessToken?: string;
  verified?: boolean | null;
  disconnected?: boolean;
}): void {
  cachedServerRefreshToken =
    options?.accessToken && options?.expiresAtMs !== undefined
      ? { accessToken: options.accessToken, expiresAtMs: options.expiresAtMs }
      : null;
  inFlightRefreshPromise = null;
  serverRefreshVerified = options?.verified !== undefined ? options.verified : null;
  manuallyDisconnected = options?.disconnected ?? false;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
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
  const requiredVars = [
    'GOOGLE_DRIVE_FOLDER_ID',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'GOOGLE_OAUTH_REFRESH_TOKEN'
  ];
  return requiredVars.filter((key) => !(process.env[key] || '').trim());
}

export function hasServerRefreshCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim()
  );
}

function mapDriveAuthState(params: {
  configuredFolderId: boolean;
  serverRefreshConfigured: boolean;
  hasBrowserSession: boolean;
  lastError: string | null;
}): { authState: DriveAuthState; authStateLabel: DriveAuthStateLabel } {
  const { configuredFolderId, serverRefreshConfigured, hasBrowserSession, lastError } = params;

  if (!configuredFolderId) {
    return {
      authState: 'missing_server_credentials',
      authStateLabel: 'Missing Server Credentials'
    };
  }

  if (serverRefreshConfigured) {
    if (serverRefreshVerified === false) {
      if (hasBrowserSession) {
        return {
          authState: 'connected_browser_session',
          authStateLabel: 'Connected — Browser Session Only'
        };
      }
      return {
        authState: 'reconnection_required',
        authStateLabel: 'Reconnection Required'
      };
    }

    return {
      authState: 'connected_server_refresh',
      authStateLabel: 'Connected — Server Refresh Token'
    };
  }

  if (hasBrowserSession) {
    return {
      authState: 'connected_browser_session',
      authStateLabel: 'Connected — Browser Session Only'
    };
  }

  if (lastError && /browser.*(expired|revoked)/i.test(lastError)) {
    return {
      authState: 'reconnection_required',
      authStateLabel: 'Reconnection Required'
    };
  }

  if (manuallyDisconnected) {
    return {
      authState: 'not_connected',
      authStateLabel: 'Not Connected'
    };
  }

  return {
    authState: 'missing_server_credentials',
    authStateLabel: 'Missing Server Credentials'
  };
}

export function getDriveConnectionStatus(options?: {
  hasBrowserSession?: boolean;
}): DriveConnectionStatus {
  const folderId = (process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
  const state = readDriveState();
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
  const serverRefreshConfigured = hasServerRefreshCredentials();
  const missingServerEnvVars = getMissingServerEnvVars();
  const hasBrowserSession = Boolean(options?.hasBrowserSession);

  const { authState, authStateLabel } = mapDriveAuthState({
    configuredFolderId,
    serverRefreshConfigured,
    hasBrowserSession,
    lastError: state.lastError
  });

  const unattendedUploadsReady = Boolean(
    configuredFolderId && serverRefreshConfigured && serverRefreshVerified !== false
  );

  // Never falsely report Drive as persistently connected via historical browser state alone
  const effectiveConnected = Boolean(
    unattendedUploadsReady || hasBrowserSession
  );

  return {
    configuredFolderId,
    folderIdPreview: folderPreview,
    folderName: state.folderName || '',
    oauthConnected: effectiveConnected,
    connectedEmail: state.connectedEmail || '',
    serverRefreshConfigured,
    serverRefreshVerified: serverRefreshConfigured ? serverRefreshVerified : null,
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

async function performServerRefreshExchange(): Promise<RefreshExchangeResult> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!.trim(),
        refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN!.trim(),
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
        'The server Google Drive refresh token is invalid or expired. Update GOOGLE_OAUTH_REFRESH_TOKEN or click "Connect Google Drive" in the Admin Dashboard.';
      let code: 'DRIVE_REFRESH_EXPIRED' | 'DRIVE_API_ERROR' = 'DRIVE_REFRESH_EXPIRED';

      if (oauthCode === 'invalid_grant') {
        serverRefreshVerified = false;
        friendlyReason =
          'Your server Google Drive refresh token has expired or been revoked (Google OAuth apps in Testing mode expire refresh tokens after 7 days). Update GOOGLE_OAUTH_REFRESH_TOKEN with a Production OAuth client or click "Connect Google Drive" in the Admin Dashboard.';
      } else if (oauthCode === 'invalid_client' || oauthCode === 'unauthorized_client') {
        serverRefreshVerified = false;
        friendlyReason =
          'Google rejected the server OAuth client credentials (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET). Verify server secrets or reconnect Google Drive in the Admin Dashboard.';
      } else if (res.status >= 500) {
        code = 'DRIVE_API_ERROR';
        friendlyReason =
          'Google OAuth service is temporarily unavailable while refreshing the Drive session. Please retry in a moment.';
      } else {
        serverRefreshVerified = false;
      }

      updateDriveState({ lastError: friendlyReason });
      return { token: null, errorReason: friendlyReason, errorCode: code };
    }

    if (!parsed.access_token) {
      cachedServerRefreshToken = null;
      serverRefreshVerified = false;
      const reason =
        'Google OAuth did not return an access token from the configured refresh token. Update GOOGLE_OAUTH_REFRESH_TOKEN or reconnect Google Drive.';
      updateDriveState({ lastError: reason });
      return { token: null, errorReason: reason, errorCode: 'DRIVE_REFRESH_EXPIRED' };
    }

    const expiresInSec = Math.max(10, Number(parsed.expires_in) || 3600);
    const bufferSec = expiresInSec > 600 ? 300 : Math.floor(expiresInSec * 0.15);
    const ttlMs = Math.max(5, expiresInSec - bufferSec) * 1000;

    cachedServerRefreshToken = {
      accessToken: parsed.access_token,
      expiresAtMs: Date.now() + ttlMs
    };
    serverRefreshVerified = true;
    manuallyDisconnected = false;

    const currentState = readDriveState();
    if (
      currentState.lastError &&
      /refresh token|google oauth|expired|revoked/i.test(currentState.lastError)
    ) {
      updateDriveState({ lastError: null });
    }

    return { token: parsed.access_token, errorReason: null };
  } catch {
    cachedServerRefreshToken = null;
    const reason =
      'Unable to reach Google OAuth to refresh the Drive connection. Check server connectivity and retry.';
    updateDriveState({ lastError: reason });
    return { token: null, errorReason: reason, errorCode: 'DRIVE_API_ERROR' };
  }
}

async function exchangeServerRefreshToken(
  forceRefresh = false
): Promise<RefreshExchangeResult> {
  if (!hasServerRefreshCredentials()) {
    return { token: null, errorReason: null };
  }

  if (forceRefresh) {
    cachedServerRefreshToken = null;
  }

  if (cachedServerRefreshToken && Date.now() < cachedServerRefreshToken.expiresAtMs) {
    return { token: cachedServerRefreshToken.accessToken, errorReason: null };
  }

  if (!inFlightRefreshPromise) {
    inFlightRefreshPromise = performServerRefreshExchange().finally(() => {
      inFlightRefreshPromise = null;
    });
  }

  return inFlightRefreshPromise;
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
    // uploads must never silently depend on or wait for browser tokens.
    if (allowBrowserFallback && cleanHeader && !forceRefresh) {
      return { accessToken: cleanHeader, source: 'header' };
    }

    const message =
      audience === 'admin'
        ? exchanged.errorReason ||
          'The server Google Drive refresh token is expired or revoked. Click "Connect Google Drive" to reconnect for admin uploads or update GOOGLE_OAUTH_REFRESH_TOKEN.'
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
  const missingList = missingVars.join(', ') || 'GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN';

  const adminMissingMsg = `Persistent server-side Google Drive OAuth credentials are missing (${missingList}). Unattended guest uploads require configuring those server environment variables. As an admin, click "Connect Google Drive" to upload during this browser session.`;

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
  updateDriveState({
    oauthConnected: true,
    connectedEmail: about.user?.emailAddress || '',
    folderId,
    folderName: folder.name,
    lastError: null
  });

  return getDriveConnectionStatus({
    hasBrowserSession: Boolean(options?.fromBrowserSession)
  });
}

export async function testServerRefreshTokenConnection(): Promise<DriveTestConnectionResponse> {
  const configuredFolderId = Boolean((process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim());
  const refreshConfigured = hasServerRefreshCredentials();

  if (!configuredFolderId) {
    const driveStatus = getDriveConnectionStatus();
    return {
      ok: false,
      refreshTokenConfigured: refreshConfigured,
      refreshTokenValid: false,
      tokenObtained: false,
      folderVerified: false,
      authMode: 'none',
      message: 'GOOGLE_DRIVE_FOLDER_ID is missing from server environment variables.',
      driveStatus
    };
  }

  if (!refreshConfigured) {
    const missing = getMissingServerEnvVars().join(', ');
    const driveStatus = getDriveConnectionStatus();
    return {
      ok: false,
      refreshTokenConfigured: false,
      refreshTokenValid: false,
      tokenObtained: false,
      folderVerified: false,
      authMode: 'none',
      message: `Persistent server-side OAuth credentials are missing (${missing}). Configure them in deployment secrets to enable unattended guest uploads.`,
      driveStatus
    };
  }

  const exchanged = await exchangeServerRefreshToken(true);
  if (!exchanged.token) {
    return {
      ok: false,
      refreshTokenConfigured: true,
      refreshTokenValid: false,
      tokenObtained: false,
      folderVerified: false,
      authMode: 'none',
      message:
        exchanged.errorReason ||
        'Server refresh token failed to obtain an access token from Google OAuth.',
      driveStatus: getDriveConnectionStatus()
    };
  }

  try {
    const status = await verifyAndSaveDriveConnection(exchanged.token, {
      fromBrowserSession: false
    });
    return {
      ok: true,
      refreshTokenConfigured: true,
      refreshTokenValid: true,
      tokenObtained: true,
      folderVerified: true,
      authMode: 'server_refresh_token',
      message: `Server refresh token verified! Obtained a fresh access token and confirmed write access to "${status.folderName}". Unattended guest uploads are ready.`,
      driveStatus: status
    };
  } catch (err) {
    if (err instanceof DriveStorageError && err.code === 'DRIVE_AUTH_EXPIRED') {
      serverRefreshVerified = false;
    }
    const msg =
      err instanceof Error
        ? err.message
        : 'Obtained an access token from refresh token, but Google Drive folder verification failed.';
    return {
      ok: false,
      refreshTokenConfigured: true,
      refreshTokenValid: !(err instanceof DriveStorageError && err.code === 'DRIVE_AUTH_EXPIRED'),
      tokenObtained: true,
      folderVerified: false,
      authMode: 'server_refresh_token',
      message: msg,
      driveStatus: getDriveConnectionStatus()
    };
  }
}

export async function testDriveConnection(
  driveAccessTokenHeader?: string
): Promise<DriveTestConnectionResponse> {
  const cleanHeader = (driveAccessTokenHeader || '').trim();

  // Always prefer server-side refresh token test whenever configured (cannot be overridden by browser header)
  if (hasServerRefreshCredentials()) {
    const refreshResult = await testServerRefreshTokenConnection();
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
        message: `Admin browser session verified for "${status.folderName}", but the server refresh token failed (${refreshResult.message}). Public unattended uploads remain unavailable until GOOGLE_OAUTH_REFRESH_TOKEN is fixed.`,
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
    const missing = getMissingServerEnvVars().join(', ');
    return {
      ok: true,
      refreshTokenConfigured: false,
      refreshTokenValid: false,
      tokenObtained: true,
      folderVerified: true,
      authMode: 'browser_session',
      message: `Connected via browser session only for "${status.folderName}". Server credentials (${missing}) are still missing, so unattended public guest uploads are not yet enabled.`,
      driveStatus: status
    };
  }

  return testServerRefreshTokenConnection();
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

  updateDriveState({ subfolders, lastError: null });
  return subfolders;
}

export function disconnectDriveState(): DriveConnectionStatus {
  cachedServerRefreshToken = null;
  inFlightRefreshPromise = null;
  manuallyDisconnected = true;
  updateDriveState({
    oauthConnected: false,
    connectedEmail: hasServerRefreshCredentials() ? readDriveState().connectedEmail : '',
    lastError: null
  });
  return getDriveConnectionStatus({ hasBrowserSession: false });
}

async function resolveTargetFolder(
  accessToken: string,
  category: DriveMediaCategory,
  mediaType: 'image' | 'video',
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
    case 'admin_media':
    default:
      if (category === 'admin_media') {
        return { folderId: map.adminMediaId!, label: 'Admin Media' };
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
  mediaType: 'image' | 'video';
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
  mediaType: 'image' | 'video';
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
  mediaType: 'image' | 'video';
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
