import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DriveConnectionStatus, DriveMediaCategory, DriveSubfolderMap } from '../src/types.ts';

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

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOAD_ROOT = path.resolve(DATA_DIR, 'gallery-uploads');
const DRIVE_STATE_PATH = path.resolve(DATA_DIR, 'drive-state.json');

// Optional in-memory cache ONLY for env-var refresh token exchange (never persisted to disk)
let cachedServerRefreshToken: { accessToken: string; expiresAtMs: number } | null = null;

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

export function hasServerRefreshCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim()
  );
}

export function getDriveConnectionStatus(): DriveConnectionStatus {
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

  return {
    configuredFolderId: Boolean(folderId),
    folderIdPreview: folderPreview,
    folderName: state.folderName || '',
    oauthConnected: state.oauthConnected,
    connectedEmail: state.connectedEmail || '',
    serverRefreshConfigured: hasServerRefreshCredentials(),
    lastUploadAt: state.lastUploadAt,
    subfoldersInitialized,
    subfolders: state.subfolders,
    lastError: state.lastError
  };
}

async function exchangeServerRefreshToken(forceRefresh = false): Promise<{
  token: string | null;
  errorReason: string | null;
  errorCode?: 'DRIVE_REFRESH_EXPIRED' | 'DRIVE_API_ERROR';
}> {
  if (!hasServerRefreshCredentials()) {
    return { token: null, errorReason: null };
  }

  if (forceRefresh) {
    cachedServerRefreshToken = null;
  }

  if (cachedServerRefreshToken && Date.now() < cachedServerRefreshToken.expiresAtMs) {
    return { token: cachedServerRefreshToken.accessToken, errorReason: null };
  }

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
    let parsed: { access_token?: string; expires_in?: number; error?: string; error_description?: string } = {};
    try {
      parsed = JSON.parse(payloadText) as typeof parsed;
    } catch {
      parsed = {};
    }

    if (!res.ok) {
      cachedServerRefreshToken = null;
      const oauthCode = (parsed.error || '').toLowerCase();
      let friendlyReason =
        'Your Google Drive connection has expired. Reconnect Google Drive in the Admin Dashboard and retry your upload.';
      let code: 'DRIVE_REFRESH_EXPIRED' | 'DRIVE_API_ERROR' = 'DRIVE_REFRESH_EXPIRED';

      if (oauthCode === 'invalid_grant') {
        friendlyReason =
          'Your server Google Drive refresh token has expired or been revoked (Google OAuth apps in Testing mode expire refresh tokens after 7 days). Reconnect Google Drive in the Admin Dashboard or update GOOGLE_OAUTH_REFRESH_TOKEN with a Production OAuth client.';
      } else if (oauthCode === 'invalid_client' || oauthCode === 'unauthorized_client') {
        friendlyReason =
          'Google rejected the server OAuth client credentials (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET). Verify deployment secrets or reconnect Google Drive in the Admin Dashboard.';
      } else if (res.status >= 500) {
        code = 'DRIVE_API_ERROR';
        friendlyReason =
          'Google OAuth service is temporarily unavailable while refreshing the Drive session. Please retry in a moment.';
      }

      updateDriveState({ lastError: friendlyReason });
      return { token: null, errorReason: friendlyReason, errorCode: code };
    }

    if (!parsed.access_token) {
      cachedServerRefreshToken = null;
      const reason = 'Google OAuth did not return an access token. Please reconnect Google Drive.';
      updateDriveState({ lastError: reason });
      return { token: null, errorReason: reason, errorCode: 'DRIVE_REFRESH_EXPIRED' };
    }

    const ttlMs = Math.max(60, (parsed.expires_in || 3600) - 300) * 1000;
    cachedServerRefreshToken = {
      accessToken: parsed.access_token,
      expiresAtMs: Date.now() + ttlMs
    };

    const currentState = readDriveState();
    if (
      currentState.lastError &&
      (currentState.lastError.includes('refresh token') ||
        currentState.lastError.includes('Google OAuth'))
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

export async function getServerRefreshAccessToken(): Promise<string | null> {
  const res = await exchangeServerRefreshToken(false);
  return res.token;
}

export async function resolveAccessToken(
  headerToken?: string,
  forceRefresh = false
): Promise<{ accessToken: string; source: 'header' | 'refresh' }> {
  const cleanHeader = (headerToken || '').trim();
  if (cleanHeader && !forceRefresh) {
    return { accessToken: cleanHeader, source: 'header' };
  }

  if (hasServerRefreshCredentials()) {
    const exchanged = await exchangeServerRefreshToken(forceRefresh);
    if (exchanged.token) {
      return { accessToken: exchanged.token, source: 'refresh' };
    }
    throw new DriveStorageError(
      exchanged.errorReason ||
        'Your Google Drive connection has expired. Reconnect Google Drive and retry your upload.',
      exchanged.errorCode === 'DRIVE_API_ERROR' ? 502 : 401,
      exchanged.errorCode || 'DRIVE_REFRESH_EXPIRED'
    );
  }

  throw new DriveStorageError(
    'Google Drive is not connected for this session. Please open the Admin Dashboard and click "Connect Google Drive" with joepreserve@gmail.com to authorize uploads.',
    401,
    'DRIVE_AUTH_MISSING'
  );
}

function getRequiredFolderId(): string {
  const folderId = (process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
  if (!folderId) {
    throw new DriveStorageError(
      'GOOGLE_DRIVE_FOLDER_ID is not configured on the server. Add GOOGLE_DRIVE_FOLDER_ID in your deployment secrets before uploading to Google Drive.',
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
      lastError: 'Your Google Drive connection has expired. Reconnect Google Drive and retry your upload.'
    });
    throw new DriveStorageError(
      'Your Google Drive connection has expired. Reconnect Google Drive and retry your upload.',
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

export async function verifyAndSaveDriveConnection(accessToken: string): Promise<DriveConnectionStatus> {
  const folderId = getRequiredFolderId();

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

  updateDriveState({
    oauthConnected: true,
    connectedEmail: about.user?.emailAddress || '',
    folderId,
    folderName: folder.name,
    lastError: null
  });

  return getDriveConnectionStatus();
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

export async function ensureDriveFolderStructure(accessToken: string): Promise<DriveSubfolderMap> {
  const folderId = getRequiredFolderId();
  await verifyAndSaveDriveConnection(accessToken);

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
  updateDriveState({
    oauthConnected: false,
    connectedEmail: '',
    lastError: null
  });
  return getDriveConnectionStatus();
}

async function resolveTargetFolder(
  accessToken: string,
  category: DriveMediaCategory,
  mediaType: 'image' | 'video'
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
    map = await ensureDriveFolderStructure(accessToken);
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
}): Promise<StoredMediaResult> {
  getRequiredFolderId();
  let { accessToken, source } = await resolveAccessToken(params.driveAccessTokenHeader);

  const ext = path.extname(params.originalName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10) || '.bin';
  const cleanOriginal = path.basename(params.originalName).replace(/[^a-zA-Z0-9._\- ]/g, '_').slice(0, 100);
  const uploadName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}_${cleanOriginal || `media${ext}`}`;

  let target = await resolveTargetFolder(accessToken, params.category, params.mediaType);

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
    const retried = await resolveAccessToken(undefined, true);
    accessToken = retried.accessToken;
    source = retried.source;
    uploadRes = await uploadMultipart(target.folderId, accessToken);
  }

  // If cached subfolder ID was deleted on Drive, re-initialize folder tree once and retry
  if (uploadRes.status === 404) {
    await ensureDriveFolderStructure(accessToken);
    target = await resolveTargetFolder(accessToken, params.category, params.mediaType);
    uploadRes = await uploadMultipart(target.folderId, accessToken);
  }

  if (uploadRes.status === 401) {
    const errorCode: DriveStorageErrorCode =
      source === 'refresh' ? 'DRIVE_REFRESH_EXPIRED' : 'DRIVE_AUTH_EXPIRED';
    updateDriveState({
      oauthConnected: source === 'header' ? false : readDriveState().oauthConnected,
      lastError: 'Your Google Drive connection has expired. Reconnect Google Drive and retry your upload.'
    });
    throw new DriveStorageError(
      'Your Google Drive connection has expired. Reconnect Google Drive and retry your upload.',
      401,
      errorCode
    );
  }

  if (uploadRes.status === 403) {
    const errText = await uploadRes.text().catch(() => '');
    updateDriveState({
      lastError: `Google Drive folder permission denied (403)${errText ? `: ${errText.slice(0, 140)}` : '.'}`
    });
    throw new DriveStorageError(
      "You don't have permission to upload files to this Google Drive folder. Check the connected Drive account or folder permissions.",
      403,
      'DRIVE_PERMISSION_ERROR'
    );
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    let msg = `Google Drive upload failed (${uploadRes.status})`;
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } };
      if (parsed.error?.message) msg = `Google Drive upload failed (${uploadRes.status}): ${parsed.error.message}`;
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
    console.warn(`Google Drive public reader permission warning for ${created.id}: ${permRes.status}`);
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
    let token: string | null = (driveAccessTokenHeader || '').trim() || null;
    if (!token) token = await getServerRefreshAccessToken();
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
  driveAccessTokenHeader?: string
): Promise<Response | null> {
  const token = (driveAccessTokenHeader || '').trim() || (await getServerRefreshAccessToken());
  if (token) {
    const authRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (authRes.ok) return authRes;
  }

  // Public anyone-with-link fallback for website visitors when no user OAuth session is active
  const ucRes = await fetch(
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}`,
    { redirect: 'follow' }
  );
  const ucContentType = (ucRes.headers.get('content-type') || '').toLowerCase();
  if (ucRes.ok && !ucContentType.includes('text/html')) {
    return ucRes;
  }

  // Googleusercontent CDN fallback for publicly shared Drive images
  const lh3Res = await fetch(
    `https://lh3.googleusercontent.com/d/${encodeURIComponent(driveFileId)}=s2048`,
    { redirect: 'follow' }
  );
  if (lh3Res.ok) return lh3Res;

  return ucRes.ok ? ucRes : null;
}
