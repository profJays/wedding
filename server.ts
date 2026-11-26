import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  DriveStorageError,
  OAUTH_CALLBACK_PATH,
  getDriveConnectionStatus,
  logDriveOAuthStartupDiagnostics,
  ensureServerRefreshVerifiedIfNeeded,
  createServerDriveOAuthUrl,
  completeServerDriveOAuthCallback,
  resolveAccessToken,
  verifyAndSaveDriveConnection,
  ensureDriveFolderStructure,
  testDriveConnection,
  testServerRefreshTokenConnection,
  disconnectDriveState,
  storeGalleryFileInDrive,
  initiateDriveResumableSession,
  relayResumableChunkToDrive,
  completeDriveResumableSession,
  abortDriveResumableSession,
  resolveLocalMediaPath,
  deleteStoredGalleryFile,
  fetchDriveMediaStream
} from './server/storageProvider.ts';
import {
  verifyFirebaseIdToken,
  isAuthorizedWeddingAdmin
} from './server/firebaseTokenVerifier.ts';
import type {
  DriveMediaCategory,
  ResumableCompleteRequest,
  ResumableCompleteResponse,
  ResumableInitRequest,
  ResumableInitResponse,
  UploadBatchResponse,
  UploadErrorCode,
  UploadFileResult,
  UploadedFileMetadata,
  VisibilitySettingsData
} from './src/types.ts';
import {
  DEFAULT_VISIBILITY_SETTINGS,
  normalizeVisibilitySettings
} from './src/utils/visibilitySettings.ts';

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId: string;
}

const DEFAULT_GALLERY_UNLOCK_ISO = '2026-12-12T00:00:00+01:00'; // Saturday, 12 Dec 2026 00:00 Africa/Lagos
const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_BATCH_FILES = 10;

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
]);

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v'
]);

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/aacp'
]);

const EXTENSION_TO_IMAGE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif'
};

const EXTENSION_TO_VIDEO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v'
};

const EXTENSION_TO_AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac'
};

function classifyMediaDescriptor(
  originalName: string,
  mimeType: string
): {
  mediaType: 'image' | 'video' | 'audio' | 'unsupported';
  canonicalMime: string;
} {
  const mime = (mimeType || '').toLowerCase().trim();
  const ext = path.extname(originalName || '').toLowerCase();

  if (ALLOWED_IMAGE_MIMES.has(mime)) {
    return { mediaType: 'image', canonicalMime: mime === 'image/jpg' ? 'image/jpeg' : mime };
  }
  if (ALLOWED_VIDEO_MIMES.has(mime)) {
    return { mediaType: 'video', canonicalMime: mime };
  }
  if (ALLOWED_AUDIO_MIMES.has(mime)) {
    const canonical =
      mime === 'audio/mp3'
        ? 'audio/mpeg'
        : mime === 'audio/x-m4a' || mime === 'audio/m4a'
        ? 'audio/mp4'
        : mime;
    return { mediaType: 'audio', canonicalMime: canonical };
  }
  if ((!mime || mime === 'application/octet-stream') && ext in EXTENSION_TO_IMAGE_MIME) {
    return { mediaType: 'image', canonicalMime: EXTENSION_TO_IMAGE_MIME[ext] };
  }
  if ((!mime || mime === 'application/octet-stream') && ext in EXTENSION_TO_VIDEO_MIME) {
    return { mediaType: 'video', canonicalMime: EXTENSION_TO_VIDEO_MIME[ext] };
  }
  if ((!mime || mime === 'application/octet-stream') && ext in EXTENSION_TO_AUDIO_MIME) {
    return { mediaType: 'audio', canonicalMime: EXTENSION_TO_AUDIO_MIME[ext] };
  }
  return { mediaType: 'unsupported', canonicalMime: mime || 'application/octet-stream' };
}

function classifyUploadedFile(file: Express.Multer.File): {
  mediaType: 'image' | 'video' | 'audio' | 'unsupported';
  canonicalMime: string;
} {
  return classifyMediaDescriptor(file.originalname || '', file.mimetype || '');
}

function parseClientFileIds(raw: unknown, count: number): string[] {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return Array.from({ length: count }, (_, i) => String(parsed[i] || `file_${i}`));
      }
    } catch {
      // Single string or invalid JSON
    }
  } else if (Array.isArray(raw)) {
    return Array.from({ length: count }, (_, i) => String(raw[i] || `file_${i}`));
  }
  return Array.from({ length: count }, (_, i) => `file_${i}`);
}

const VALID_CATEGORIES = new Set<DriveMediaCategory>([
  'admin_media',
  'admin_music',
  'website_homepage',
  'website_story',
  'website_schedule',
  'guest_photo',
  'guest_video'
]);

function loadFirebaseConfig(): FirebaseAppletConfig {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fs.readFileSync(cfgPath, 'utf8');
  return JSON.parse(raw) as FirebaseAppletConfig;
}

async function resolveGalleryUnlockFromFirestore(
  cfg: FirebaseAppletConfig
): Promise<{ unlockISO: string; unlockEpochMs: number }> {
  const defaultMs = new Date(DEFAULT_GALLERY_UNLOCK_ISO).getTime();
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      cfg.projectId
    )}/databases/${encodeURIComponent(cfg.firestoreDatabaseId)}/documents/siteContent/main`;
    const res = await fetch(url);
    if (!res.ok) {
      return { unlockISO: DEFAULT_GALLERY_UNLOCK_ISO, unlockEpochMs: defaultMs };
    }
    const doc = (await res.json()) as {
      fields?: {
        galleryUnlockISO?: { stringValue?: string };
        galleryUnlockEpochMs?: { integerValue?: string; doubleValue?: number };
      };
    };
    const iso = doc.fields?.galleryUnlockISO?.stringValue || DEFAULT_GALLERY_UNLOCK_ISO;
    const parsedEpoch = doc.fields?.galleryUnlockEpochMs?.integerValue
      ? Number(doc.fields.galleryUnlockEpochMs.integerValue)
      : new Date(iso).getTime();

    if (Number.isFinite(parsedEpoch) && parsedEpoch > 0) {
      return { unlockISO: iso, unlockEpochMs: parsedEpoch };
    }
  } catch {
    // Fall back safely to authoritative default date
  }
  return { unlockISO: DEFAULT_GALLERY_UNLOCK_ISO, unlockEpochMs: defaultMs };
}

interface FirestoreBoolMapField {
  mapValue?: {
    fields?: Record<string, { booleanValue?: boolean }>;
  };
}

function extractFirestoreBoolGroup(
  field: FirestoreBoolMapField | undefined
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const mapFields = field?.mapValue?.fields;
  if (!mapFields || typeof mapFields !== 'object') return out;
  for (const [key, val] of Object.entries(mapFields)) {
    if (val && typeof val.booleanValue === 'boolean') {
      out[key] = val.booleanValue;
    }
  }
  return out;
}

async function resolveVisibilitySettingsFromFirestore(
  cfg: FirebaseAppletConfig
): Promise<VisibilitySettingsData> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      cfg.projectId
    )}/databases/${encodeURIComponent(cfg.firestoreDatabaseId)}/documents/siteContent/visibilitySettings`;
    const res = await fetch(url);
    if (!res.ok) {
      return normalizeVisibilitySettings(DEFAULT_VISIBILITY_SETTINGS);
    }
    const doc = (await res.json()) as {
      fields?: {
        experience?: FirestoreBoolMapField;
        sections?: FirestoreBoolMapField;
        interactions?: FirestoreBoolMapField;
      };
    };
    return normalizeVisibilitySettings({
      experience: extractFirestoreBoolGroup(doc.fields?.experience),
      sections: extractFirestoreBoolGroup(doc.fields?.sections),
      interactions: extractFirestoreBoolGroup(doc.fields?.interactions)
    });
  } catch {
    return normalizeVisibilitySettings(DEFAULT_VISIBILITY_SETTINGS);
  }
}

function isGuestUploadAllowedByVisibility(vis: VisibilitySettingsData): boolean {
  return Boolean(
    vis.experience.mainWebsite &&
      vis.sections.gallery &&
      vis.interactions.guestUploads
  );
}

function formatLagosTime(epochMs: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'full',
    timeStyle: 'medium'
  }).format(new Date(epochMs));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function deriveServerRequestOrigin(req: express.Request): string | undefined {
  const forwardedHost = (req.header('x-forwarded-host') || req.get('host') || '')
    .split(',')[0]
    .trim();
  if (!forwardedHost) return undefined;
  const isLocalHost =
    forwardedHost.startsWith('localhost') || forwardedHost.startsWith('127.0.0.1');
  if (isLocalHost && process.env.NODE_ENV === 'production') {
    return undefined;
  }
  const forwardedProto = (req.header('x-forwarded-proto') || '').split(',')[0].trim();
  const proto =
    forwardedProto === 'https' || forwardedProto === 'http'
      ? forwardedProto
      : isLocalHost
      ? 'http'
      : 'https';
  return `${proto}://${forwardedHost}`;
}

function renderOAuthCallbackHtml(result: {
  ok: boolean;
  refreshTokenIssued: boolean;
  message: string;
  driveStatus: ReturnType<typeof getDriveConnectionStatus>;
}): string {
  // Never include any OAuth access/refresh tokens or secrets in the callback payload
  const safePayloadJson = JSON.stringify({
    type: 'DRIVE_OAUTH_SERVER_RESULT',
    ok: result.ok,
    refreshTokenIssued: result.refreshTokenIssued,
    message: result.message,
    driveStatus: result.driveStatus
  }).replace(/</g, '\\u003c');

  const heading = result.ok
    ? 'Google Drive Connected'
    : 'Google Drive Authorization Incomplete';
  const statusColor = result.ok ? '#07543E' : '#991B1B';
  const safeMessage = escapeHtml(result.message);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(heading)} — Mary &amp; Joseph</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #FAF7F0; color: #262820; margin: 0; padding: 32px 20px; display: flex; align-items: center; justify-content: center; min-height: 100vh; box-sizing: border-box; }
    .card { max-width: 440px; width: 100%; background: #FFFDF8; border: 1px solid rgba(7,84,62,0.18); border-radius: 12px; padding: 28px; box-shadow: 0 8px 24px rgba(0,0,0,0.06); text-align: center; }
    h1 { margin: 0 0 12px; font-size: 20px; color: ${statusColor}; }
    p { margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #3D4035; }
    button { background: #07543E; color: #FFFFFF; border: 0; border-radius: 8px; padding: 10px 18px; font-size: 13px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(heading)}</h1>
    <p>${safeMessage}</p>
    <button type="button" onclick="window.close()">Close Window</button>
  </div>
  <script>
    (function () {
      var payload = ${safePayloadJson};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, '*');
        }
      } catch (e) {}
      if (payload.ok) {
        setTimeout(function () { window.close(); }, 650);
      }
    })();
  </script>
</body>
</html>`;
}

async function requireAdminRequest(
  req: express.Request,
  res: express.Response,
  cfg: FirebaseAppletConfig
): Promise<{ uid: string; email: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Administrator authentication required.' });
    return null;
  }
  const rawToken = authHeader.slice('Bearer '.length).trim();
  const tokenInfo = await verifyFirebaseIdToken(rawToken, cfg.projectId);
  if (!tokenInfo) {
    res.status(401).json({ error: 'Invalid or expired Firebase authentication token.' });
    return null;
  }
  const allowed = await isAuthorizedWeddingAdmin(
    tokenInfo,
    cfg.projectId,
    cfg.firestoreDatabaseId,
    rawToken
  );
  if (!allowed) {
    res.status(403).json({ error: 'Administrator privileges required.' });
    return null;
  }
  return { uid: tokenInfo.uid, email: tokenInfo.email };
}

function resolveServerPort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      const next = Number(args[i + 1]);
      if (Number.isInteger(next) && next > 0 && next < 65536) {
        return next;
      }
    } else if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
        return parsed;
      }
    }
  }
  const envPort = Number(process.env.PORT);
  if (Number.isInteger(envPort) && envPort > 0 && envPort < 65536) {
    return envPort;
  }
  return 3000;
}

async function startServer() {
  const firebaseCfg = loadFirebaseConfig();
  const app = express();
  const PORT = resolveServerPort();

  // Trust Firebase Hosting and Cloud Run reverse-proxy headers (X-Forwarded-Proto, X-Forwarded-Host, X-Forwarded-For)
  app.set('trust proxy', true);

  app.use(express.json({ limit: '1mb' }));

  // Prevent CDN/reverse-proxy caching of dynamic API, OAuth, and admin endpoints
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      files: MAX_BATCH_FILES,
      fileSize: MAX_VIDEO_BYTES
    }
  });

  // Authoritative Server Health Check (fast, non-blocking for readiness probes)
  app.get('/api/health', (_req, res) => {
    void ensureServerRefreshVerifiedIfNeeded().catch(() => {});
    const driveStatus = getDriveConnectionStatus();
    res.json({
      ok: true,
      serverTimeMs: Date.now(),
      timezone: 'Africa/Lagos',
      storageProvider: 'google_drive',
      googleDriveConfigured: driveStatus.unattendedUploadsReady,
      unattendedUploadsReady: driveStatus.unattendedUploadsReady,
      serverRefreshStatus: driveStatus.serverRefreshStatus,
      overallConnectionStatus: driveStatus.overallConnectionStatus,
      driveAuthState: driveStatus.authStateLabel
    });
  });

  // Server-Side Admin Verification Endpoint (Defense in Depth)
  app.get('/api/admin/verify', async (req, res) => {
    const admin = await requireAdminRequest(req, res, firebaseCfg);
    if (!admin) return;
    res.json({ authorized: true, uid: admin.uid, email: admin.email });
  });

  // Authoritative Server-Side Gallery Lock & Drive Storage Status
  app.get('/api/gallery/status', async (req, res) => {
    const nowMs = Date.now();
    const [{ unlockISO, unlockEpochMs }, visibility] = await Promise.all([
      resolveGalleryUnlockFromFirestore(firebaseCfg),
      resolveVisibilitySettingsFromFirestore(firebaseCfg),
      ensureServerRefreshVerifiedIfNeeded()
    ]);
    const driveStatus = getDriveConnectionStatus({
      fallbackRequestOrigin: deriveServerRequestOrigin(req)
    });
    const isUnlocked = nowMs >= unlockEpochMs;
    const guestUploadsEnabled = isGuestUploadAllowedByVisibility(visibility);

    res.json({
      isUnlocked,
      guestUploadsEnabled,
      serverTimeMs: nowMs,
      serverTimeLagosFormatted: formatLagosTime(nowMs),
      unlockAtISO: unlockISO,
      unlockAtEpochMs: unlockEpochMs,
      unlockAtLagosFormatted: formatLagosTime(unlockEpochMs),
      timezone: 'Africa/Lagos',
      storageProvider: 'google_drive',
      googleDriveConfigured: driveStatus.unattendedUploadsReady,
      unattendedUploadsReady: driveStatus.unattendedUploadsReady,
      driveStatus,
      limits: {
        maxImageBytes: MAX_IMAGE_BYTES,
        maxVideoBytes: MAX_VIDEO_BYTES,
        maxAudioBytes: MAX_AUDIO_BYTES,
        maxBatchFiles: MAX_BATCH_FILES
      }
    });
  });

  // Admin: Get Google Drive Connection Status (verifies server refresh token on cold start)
  app.get('/api/drive/status', async (req, res) => {
    const admin = await requireAdminRequest(req, res, firebaseCfg);
    if (!admin) return;
    await ensureServerRefreshVerifiedIfNeeded();
    const hasBrowserSession = Boolean(req.header('X-Google-Drive-Token')?.trim());
    res.json(
      getDriveConnectionStatus({
        hasBrowserSession,
        fallbackRequestOrigin: deriveServerRequestOrigin(req)
      })
    );
  });

  // Admin: Start Server-Side Google Drive OAuth Authorization-Code Flow (canonical server redirect URI)
  app.post('/api/drive/oauth/start', async (req, res) => {
    const admin = await requireAdminRequest(req, res, firebaseCfg);
    if (!admin) return;

    try {
      const { authUrl, redirectUri } = createServerDriveOAuthUrl({
        adminUid: admin.uid,
        adminEmail: admin.email,
        fallbackRequestOrigin: deriveServerRequestOrigin(req)
      });
      res.json({ authUrl, redirectUri });
    } catch (err) {
      if (err instanceof DriveStorageError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Unable to initiate server-side Google Drive OAuth flow.' });
    }
  });

  // OAuth 2.0 Authorization-Code Callback (trailing-slash tolerant; exchanges code server-side)
  app.get([OAUTH_CALLBACK_PATH, `${OAUTH_CALLBACK_PATH}/`], async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const oauthError = typeof req.query.error === 'string' ? req.query.error : undefined;
    const oauthErrorDescription =
      typeof req.query.error_description === 'string' ? req.query.error_description : undefined;

    const result = await completeServerDriveOAuthCallback({
      code,
      state,
      oauthError,
      oauthErrorDescription,
      callbackRoute: req.path
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.ok ? 200 : 400).send(renderOAuthCallbackHtml(result));
  });

  // Admin: Verify Browser OAuth Access Token + Target GOOGLE_DRIVE_FOLDER_ID
  app.post('/api/drive/verify', async (req, res) => {
    const admin = await requireAdminRequest(req, res, firebaseCfg);
    if (!admin) return;

    const driveToken = req.header('X-Google-Drive-Token') || '';
    if (!driveToken.trim()) {
      res.status(401).json({
        error: 'Missing Google Drive OAuth token. Please click "Connect Google Drive" first.',
        code: 'DRIVE_AUTH_MISSING'
      });
      return;
    }

    try {
      const status = await verifyAndSaveDriveConnection(driveToken.trim(), {
        fromBrowserSession: true
      });
      res.json(status);
    } catch (err) {
      if (err instanceof DriveStorageError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Drive verification failed. Please retry.' });
    }
  });

  // Admin: Initialize Wedding Folder Hierarchy inside GOOGLE_DRIVE_FOLDER_ID
  app.post('/api/drive/folders/init', async (req, res) => {
    const admin = await requireAdminRequest(req, res, firebaseCfg);
    if (!admin) return;

    const driveTokenHeader = req.header('X-Google-Drive-Token') || '';
    try {
      const { accessToken, source } = await resolveAccessToken({
        driveAccessTokenHeader: driveTokenHeader,
        allowBrowserFallback: true,
        audience: 'admin'
      });
      await ensureDriveFolderStructure(accessToken, {
        fromBrowserSession: source === 'header'
      });
      res.json(
        getDriveConnectionStatus({
          hasBrowserSession: Boolean(driveTokenHeader.trim())
        })
      );
    } catch (err) {
      if (err instanceof DriveStorageError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Unable to initialize Google Drive folders. Please retry.' });
    }
  });

  // Admin: Test Drive Connection + Permissions (prefers server refresh token when configured)
  app.post('/api/drive/test', async (req, res) => {
    const admin = await requireAdminRequest(req, res, firebaseCfg);
    if (!admin) return;

    try {
      const result = await testDriveConnection(req.header('X-Google-Drive-Token') || undefined);
      if (!result.ok) {
        res.status(result.refreshTokenConfigured ? 401 : 400).json({
          ...result,
          error: result.message,
          code: result.refreshTokenConfigured ? 'DRIVE_REFRESH_EXPIRED' : 'DRIVE_AUTH_MISSING'
        });
        return;
      }
      res.json(result);
    } catch (err) {
      if (err instanceof DriveStorageError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Drive connection test failed. Please retry.' });
    }
  });

  // Admin: Test Server-Side Refresh Token Exchange Directly (strictly server refresh token only; never browser token)
  app.post('/api/drive/test-refresh', async (req, res) => {
    const admin = await requireAdminRequest(req, res, firebaseCfg);
    if (!admin) return;

    const hasBrowserSession = Boolean(req.header('X-Google-Drive-Token')?.trim());
    try {
      const result = await testServerRefreshTokenConnection({ hasBrowserSession });
      if (!result.ok) {
        res.status(result.refreshTokenConfigured ? 401 : 400).json({
          ...result,
          error: result.message,
          code: result.refreshTokenConfigured ? 'DRIVE_REFRESH_EXPIRED' : 'DRIVE_AUTH_MISSING'
        });
        return;
      }
      res.json(result);
    } catch (err) {
      if (err instanceof DriveStorageError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Server refresh token test failed. Please retry.' });
    }
  });

  // Admin: Disconnect Google Drive Metadata State
  app.post('/api/drive/disconnect', async (req, res) => {
    const admin = await requireAdminRequest(req, res, firebaseCfg);
    if (!admin) return;
    res.json(disconnectDriveState());
  });

  // Server-Time Enforced Gallery & Admin Media Upload via Google Drive OAuth 2.0
  app.post('/api/gallery/upload', (req, res) => {
    upload.array('files', MAX_BATCH_FILES)(req, res, async (multerErr) => {
      if (multerErr) {
        if (multerErr instanceof multer.MulterError) {
          if (multerErr.code === 'LIMIT_FILE_COUNT' || multerErr.code === 'LIMIT_UNEXPECTED_FILE') {
            res.status(400).json({
              error: `You selected more than ${MAX_BATCH_FILES} files. You can upload a maximum of ${MAX_BATCH_FILES} files at a time.`,
              code: 'TOO_MANY_FILES',
              uploaded: [],
              results: [],
              summary: { total: 0, succeeded: 0, failed: 0 }
            });
            return;
          }
          if (multerErr.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({
              error: 'One or more selected files exceed the 100 MB video upload limit (or 50 MB photo/audio limit). Please compress the file or choose a smaller version.',
              code: 'VIDEO_TOO_LARGE',
              uploaded: [],
              results: [],
              summary: { total: 0, succeeded: 0, failed: 0 }
            });
            return;
          }
        }
        res.status(400).json({
          error: 'Invalid upload request. Please verify your selected files and try again.',
          code: 'VALIDATION_ERROR',
          uploaded: [],
          results: [],
          summary: { total: 0, succeeded: 0, failed: 0 }
        });
        return;
      }

      try {
        const nowMs = Date.now();
        const [{ unlockISO, unlockEpochMs }, visibility] = await Promise.all([
          resolveGalleryUnlockFromFirestore(firebaseCfg),
          resolveVisibilitySettingsFromFirestore(firebaseCfg)
        ]);

        let isAdminUpload = false;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          const rawToken = authHeader.slice('Bearer '.length).trim();
          const tokenInfo = await verifyFirebaseIdToken(rawToken, firebaseCfg.projectId);
          if (tokenInfo) {
            isAdminUpload = await isAuthorizedWeddingAdmin(
              tokenInfo,
              firebaseCfg.projectId,
              firebaseCfg.firestoreDatabaseId,
              rawToken
            );
          }
        }

        if (!isAdminUpload && !isGuestUploadAllowedByVisibility(visibility)) {
          res.status(403).json({
            error: 'Guest photo and video uploads are currently disabled by the couple.',
            code: 'GUEST_UPLOADS_DISABLED',
            serverTimeMs: nowMs,
            uploaded: [],
            results: [],
            summary: { total: 0, succeeded: 0, failed: 0 }
          });
          return;
        }

        if (!isAdminUpload && nowMs < unlockEpochMs) {
          res.status(403).json({
            error: 'Gallery uploads are locked until Saturday, 12 December 2026 at 00:00 WAT (Africa/Lagos).',
            code: 'GALLERY_LOCKED',
            serverTimeMs: nowMs,
            unlockAtISO: unlockISO,
            unlockAtEpochMs: unlockEpochMs,
            uploaded: [],
            results: [],
            summary: { total: 0, succeeded: 0, failed: 0 }
          });
          return;
        }

        const files = (req.files as Express.Multer.File[] | undefined) || [];
        if (files.length === 0) {
          res.status(400).json({
            error: 'Please select at least one photo or video to upload.',
            code: 'VALIDATION_ERROR',
            uploaded: [],
            results: [],
            summary: { total: 0, succeeded: 0, failed: 0 }
          });
          return;
        }

        const clientFileIds = parseClientFileIds(req.body?.clientFileIds, files.length);
        const rawCategory = String((req.body?.category as string | undefined) || '').trim() as DriveMediaCategory;
        const driveTokenHeader = req.header('X-Google-Drive-Token') || '';

        // 1. Validate every file upfront so partial or invalid batches return clear per-file reasons
        const results: UploadFileResult[] = new Array(files.length);
        const validQueue: Array<{
          index: number;
          file: Express.Multer.File;
          clientFileId: string;
          mediaType: 'image' | 'video' | 'audio';
          canonicalMime: string;
        }> = [];
        let blockedGuestAudioCount = 0;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const clientFileId = clientFileIds[i];
          const classified = classifyUploadedFile(file);

          if (file.size <= 0) {
            results[i] = {
              clientFileId,
              originalName: file.originalname,
              status: 'rejected',
              errorCode: 'FILE_EMPTY',
              errorMessage: `${file.originalname} appears to be empty or corrupted (0 bytes). Please choose a valid photo or video.`
            };
            continue;
          }

          if (classified.mediaType === 'audio' && !isAdminUpload) {
            blockedGuestAudioCount += 1;
            results[i] = {
              clientFileId,
              originalName: file.originalname,
              status: 'rejected',
              errorCode: 'UNSUPPORTED_FORMAT',
              errorMessage: `We couldn't upload ${file.originalname} because audio uploads are restricted to wedding administrators.`
            };
            continue;
          }

          if (classified.mediaType === 'unsupported') {
            results[i] = {
              clientFileId,
              originalName: file.originalname,
              status: 'rejected',
              errorCode: 'UNSUPPORTED_FORMAT',
              errorMessage: `We couldn't upload ${file.originalname} because this file format is not supported. Please select an image or video in one of the supported formats.`
            };
            continue;
          }

          if (classified.mediaType === 'image' && file.size > MAX_IMAGE_BYTES) {
            const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
            results[i] = {
              clientFileId,
              originalName: file.originalname,
              status: 'rejected',
              errorCode: 'IMAGE_TOO_LARGE',
              errorMessage: `${file.originalname} is ${sizeMb} MB. The maximum photo size is 50 MB. Please compress this image or choose a smaller version.`
            };
            continue;
          }

          if (classified.mediaType === 'video' && file.size > MAX_VIDEO_BYTES) {
            const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
            results[i] = {
              clientFileId,
              originalName: file.originalname,
              status: 'rejected',
              errorCode: 'VIDEO_TOO_LARGE',
              errorMessage: `${file.originalname} is ${sizeMb} MB. The maximum video size is 100 MB. Please compress the video or select a smaller version.`
            };
            continue;
          }

          if (classified.mediaType === 'audio' && file.size > MAX_AUDIO_BYTES) {
            const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
            results[i] = {
              clientFileId,
              originalName: file.originalname,
              status: 'rejected',
              errorCode: 'AUDIO_TOO_LARGE',
              errorMessage: `${file.originalname} is ${sizeMb} MB. The maximum audio file size is 50 MB. Please choose a smaller audio file.`
            };
            continue;
          }

          validQueue.push({
            index: i,
            file,
            clientFileId,
            mediaType: classified.mediaType,
            canonicalMime: classified.canonicalMime
          });
        }

        // If zero files passed validation, fail immediately with 403 (audio-only guest attempt) or 400
        if (validQueue.length === 0) {
          const firstErr = results.find((r) => r.errorMessage);
          const status = blockedGuestAudioCount === files.length && files.length > 0 ? 403 : 400;
          res.status(status).json({
            uploaded: [],
            results,
            summary: { total: files.length, succeeded: 0, failed: files.length },
            error: firstErr?.errorMessage || 'Selected files did not pass validation.',
            code: firstErr?.errorCode || 'VALIDATION_ERROR'
          } satisfies UploadBatchResponse);
          return;
        }

        // 2. Upload valid files to Google Drive individually, preserving partial progress
        const uploaded: UploadedFileMetadata[] = [];
        let blockingDriveError: DriveStorageError | null = null;

        for (let qIdx = 0; qIdx < validQueue.length; qIdx++) {
          const entry = validQueue[qIdx];

          if (blockingDriveError) {
            results[entry.index] = {
              clientFileId: entry.clientFileId,
              originalName: entry.file.originalname,
              status: 'failed',
              errorCode: blockingDriveError.code,
              errorMessage: blockingDriveError.message
            };
            continue;
          }

          const category: DriveMediaCategory =
            isAdminUpload && VALID_CATEGORIES.has(rawCategory)
              ? rawCategory
              : isAdminUpload
              ? entry.mediaType === 'audio'
                ? 'admin_music'
                : 'admin_media'
              : entry.mediaType === 'image'
              ? 'guest_photo'
              : 'guest_video';

          try {
            const stored = await storeGalleryFileInDrive({
              buffer: entry.file.buffer,
              originalName: entry.file.originalname,
              mimeType: entry.canonicalMime,
              category,
              mediaType: entry.mediaType,
              driveAccessTokenHeader: isAdminUpload ? driveTokenHeader : undefined,
              isAdminUpload
            });

            const itemMeta: UploadedFileMetadata = {
              mediaType: entry.mediaType,
              mimeType: stored.mimeType,
              fileUrl: stored.fileUrl,
              storageProvider: stored.storageProvider,
              driveFileId: stored.driveFileId,
              sizeBytes: stored.sizeBytes,
              originalName: stored.originalName,
              category: stored.category,
              folderName: stored.folderName
            };

            uploaded.push(itemMeta);
            results[entry.index] = {
              clientFileId: entry.clientFileId,
              originalName: entry.file.originalname,
              status: 'uploaded',
              item: itemMeta
            };
          } catch (err) {
            if (err instanceof DriveStorageError) {
              const isFatalBlocker =
                err.code === 'DRIVE_NOT_CONFIGURED' ||
                err.code === 'DRIVE_AUTH_MISSING' ||
                err.code === 'DRIVE_AUTH_EXPIRED' ||
                err.code === 'DRIVE_REFRESH_EXPIRED' ||
                err.code === 'DRIVE_PERMISSION_ERROR';

              if (isFatalBlocker) {
                blockingDriveError = err;
              }

              results[entry.index] = {
                clientFileId: entry.clientFileId,
                originalName: entry.file.originalname,
                status: 'failed',
                errorCode: err.code,
                errorMessage: err.message
              };
            } else {
              results[entry.index] = {
                clientFileId: entry.clientFileId,
                originalName: entry.file.originalname,
                status: 'failed',
                errorCode: 'SERVER_ERROR',
                errorMessage:
                  'Something went wrong on our end while uploading this file. Please retry.'
              };
            }
          }
        }

        const failedCount = files.length - uploaded.length;
        const needsDriveReconnect = Boolean(
          isAdminUpload &&
            blockingDriveError &&
            (blockingDriveError.code === 'DRIVE_AUTH_MISSING' ||
              blockingDriveError.code === 'DRIVE_AUTH_EXPIRED' ||
              blockingDriveError.code === 'DRIVE_REFRESH_EXPIRED')
        );

        const firstFailure = results.find((r) => r.status !== 'uploaded');
        const payload: UploadBatchResponse = {
          uploaded,
          results,
          summary: {
            total: files.length,
            succeeded: uploaded.length,
            failed: failedCount
          },
          needsDriveReconnect,
          serverTimeMs: nowMs,
          isAdminUpload,
          ...(failedCount > 0
            ? {
                error: blockingDriveError?.message || firstFailure?.errorMessage || 'Some files could not be uploaded.',
                code: (blockingDriveError?.code || firstFailure?.errorCode || 'SERVER_ERROR') as UploadErrorCode
              }
            : {})
        };

        if (uploaded.length === files.length) {
          res.status(201).json(payload);
        } else if (uploaded.length > 0) {
          res.status(207).json(payload);
        } else {
          const status = blockingDriveError?.statusCode || 502;
          res.status(status).json(payload);
        }
      } catch {
        res.status(500).json({
          error: 'Something went wrong on our end while uploading your files. Please try again in a moment.',
          code: 'SERVER_ERROR',
          uploaded: [],
          results: [],
          summary: { total: 0, succeeded: 0, failed: 0 }
        });
      }
    });
  });

  // -------------------------------------------------------------------------
  // Google Drive Resumable Uploads (Bypasses 32 MiB proxy limits for 60-100 MB videos)
  // -------------------------------------------------------------------------
  async function checkOptionalAdminUpload(req: express.Request): Promise<boolean> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return false;
    const rawToken = authHeader.slice('Bearer '.length).trim();
    const tokenInfo = await verifyFirebaseIdToken(rawToken, firebaseCfg.projectId);
    if (!tokenInfo) return false;
    return isAuthorizedWeddingAdmin(
      tokenInfo,
      firebaseCfg.projectId,
      firebaseCfg.firestoreDatabaseId,
      rawToken
    );
  }

  app.post('/api/gallery/upload/resumable/init', async (req, res) => {
    try {
      const nowMs = Date.now();
      const [{ unlockISO, unlockEpochMs }, visibility, isAdminUpload] = await Promise.all([
        resolveGalleryUnlockFromFirestore(firebaseCfg),
        resolveVisibilitySettingsFromFirestore(firebaseCfg),
        checkOptionalAdminUpload(req)
      ]);

      if (!isAdminUpload && !isGuestUploadAllowedByVisibility(visibility)) {
        res.status(403).json({
          error: 'Guest photo and video uploads are currently disabled by the couple.',
          code: 'GUEST_UPLOADS_DISABLED',
          serverTimeMs: nowMs
        });
        return;
      }

      if (!isAdminUpload && nowMs < unlockEpochMs) {
        res.status(403).json({
          error:
            'Gallery uploads are locked until Saturday, 12 December 2026 at 00:00 WAT (Africa/Lagos).',
          code: 'GALLERY_LOCKED',
          serverTimeMs: nowMs,
          unlockAtISO: unlockISO,
          unlockAtEpochMs: unlockEpochMs
        });
        return;
      }

      const body = (req.body || {}) as Partial<ResumableInitRequest>;
      const originalName = String(body.originalName || '').trim();
      const sizeBytes = Number(body.sizeBytes);
      const rawMime = String(body.mimeType || '').trim();
      const rawCategory = String(body.category || '').trim() as DriveMediaCategory;

      if (!originalName || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
        res.status(400).json({
          error: `${originalName || 'Selected file'} appears to be empty or invalid (0 bytes).`,
          code: 'FILE_EMPTY'
        });
        return;
      }

      const classified = classifyMediaDescriptor(originalName, rawMime);
      if (classified.mediaType === 'audio' && !isAdminUpload) {
        res.status(403).json({
          error: `Background music uploads are restricted to wedding administrators.`,
          code: 'UNSUPPORTED_FORMAT'
        });
        return;
      }
      if (classified.mediaType === 'unsupported') {
        res.status(400).json({
          error: `We couldn't upload ${originalName} because this file format is not supported.`,
          code: 'UNSUPPORTED_FORMAT'
        });
        return;
      }

      if (classified.mediaType === 'image' && sizeBytes > MAX_IMAGE_BYTES) {
        const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
        res.status(400).json({
          error: `${originalName} is ${sizeMb} MB. The maximum photo size is 50 MB. Please compress this image or choose a smaller version.`,
          code: 'IMAGE_TOO_LARGE'
        });
        return;
      }

      if (classified.mediaType === 'video' && sizeBytes > MAX_VIDEO_BYTES) {
        const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
        res.status(400).json({
          error: `${originalName} is ${sizeMb} MB. The maximum video size is 100 MB. Please compress the video or select a smaller version.`,
          code: 'VIDEO_TOO_LARGE'
        });
        return;
      }

      if (classified.mediaType === 'audio' && sizeBytes > MAX_AUDIO_BYTES) {
        const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
        res.status(400).json({
          error: `${originalName} is ${sizeMb} MB. The maximum audio file size is 50 MB. Please choose a smaller audio file.`,
          code: 'AUDIO_TOO_LARGE'
        });
        return;
      }

      const category: DriveMediaCategory =
        isAdminUpload && VALID_CATEGORIES.has(rawCategory)
          ? rawCategory
          : isAdminUpload
          ? classified.mediaType === 'audio'
            ? 'admin_music'
            : 'admin_media'
          : classified.mediaType === 'image'
          ? 'guest_photo'
          : 'guest_video';

      const driveTokenHeader = req.header('X-Google-Drive-Token') || '';
      const reqOrigin = req.get('origin') || deriveServerRequestOrigin(req);

      const session = await initiateDriveResumableSession({
        originalName,
        mimeType: classified.canonicalMime,
        sizeBytes: Math.trunc(sizeBytes),
        category,
        mediaType: classified.mediaType,
        origin: reqOrigin,
        driveAccessTokenHeader: isAdminUpload ? driveTokenHeader : undefined,
        isAdminUpload
      });

      const response: ResumableInitResponse = {
        sessionId: session.sessionId,
        driveUploadUri: session.driveUploadUri,
        chunkBytes: session.chunkBytes,
        mediaType: classified.mediaType,
        mimeType: classified.canonicalMime,
        category,
        folderName: session.folderName,
        isAdminUpload
      };
      res.json(response);
    } catch (err) {
      if (err instanceof DriveStorageError) {
        res.status(err.statusCode).json({
          error: err.message,
          code: err.code
        });
        return;
      }
      res.status(500).json({
        error: 'Unable to prepare resumable upload session. Please try again shortly.',
        code: 'SERVER_ERROR'
      });
    }
  });

  // Optional 8 MiB chunk relay fallback if browser CORS blocks direct PUT to Google Drive session URI
  app.put(
    '/api/gallery/upload/resumable/chunk/:sessionId',
    express.raw({ type: '*/*', limit: '16mb' }),
    async (req, res) => {
      try {
        const sessionId = String(req.params.sessionId || '').trim();
        const contentRange = String(req.header('content-range') || '').trim();
        const chunkBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

        if (!sessionId || !contentRange) {
          res.status(400).json({
            error: 'Missing resumable session ID or Content-Range header.',
            code: 'VALIDATION_ERROR'
          });
          return;
        }

        const relayResult = await relayResumableChunkToDrive({
          sessionId,
          chunk: chunkBuffer,
          contentRange,
          contentType: req.header('content-type') || undefined
        });

        if (relayResult.rangeHeader) {
          res.setHeader('Range', relayResult.rangeHeader);
          res.setHeader('X-Drive-Range', relayResult.rangeHeader);
        }

        if (relayResult.status === 308) {
          res.status(200).json({
            incomplete: true,
            status: 308,
            range: relayResult.rangeHeader
          });
          return;
        }

        if (relayResult.status >= 200 && relayResult.status < 300) {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(relayResult.bodyText || '{}') as Record<string, unknown>;
          } catch {
            parsed = {};
          }
          res.status(relayResult.status).json({
            incomplete: false,
            status: relayResult.status,
            ...parsed
          });
          return;
        }

        res.status(relayResult.status || 502).json({
          error: 'Google Drive rejected an upload chunk. Please retry.',
          code: 'DRIVE_API_ERROR',
          upstreamStatus: relayResult.status
        });
      } catch (err) {
        if (err instanceof DriveStorageError) {
          res.status(err.statusCode).json({ error: err.message, code: err.code });
          return;
        }
        res.status(500).json({
          error: 'Chunk upload relay failed. Please retry.',
          code: 'SERVER_ERROR'
        });
      }
    }
  );

  app.post('/api/gallery/upload/resumable/complete', async (req, res) => {
    try {
      const body = (req.body || {}) as Partial<ResumableCompleteRequest>;
      const sessionId = String(body.sessionId || '').trim();
      if (!sessionId) {
        res.status(400).json({
          error: 'Missing resumable upload sessionId.',
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const [isAdminUpload, visibility] = await Promise.all([
        checkOptionalAdminUpload(req),
        resolveVisibilitySettingsFromFirestore(firebaseCfg)
      ]);

      if (!isAdminUpload && !isGuestUploadAllowedByVisibility(visibility)) {
        res.status(403).json({
          error: 'Guest photo and video uploads are currently disabled by the couple.',
          code: 'GUEST_UPLOADS_DISABLED'
        });
        return;
      }

      const driveTokenHeader = req.header('X-Google-Drive-Token') || '';

      const stored = await completeDriveResumableSession({
        sessionId,
        driveFileIdHint: body.driveFileId,
        driveAccessTokenHeader: isAdminUpload ? driveTokenHeader : undefined,
        isAdminUpload
      });

      const classified = classifyMediaDescriptor(stored.originalName, stored.mimeType);
      const item: UploadedFileMetadata = {
        mediaType:
          classified.mediaType === 'audio'
            ? 'audio'
            : classified.mediaType === 'video'
            ? 'video'
            : 'image',
        mimeType: stored.mimeType,
        fileUrl: stored.fileUrl,
        storageProvider: stored.storageProvider,
        driveFileId: stored.driveFileId,
        sizeBytes: stored.sizeBytes,
        originalName: stored.originalName,
        category: stored.category,
        folderName: stored.folderName
      };

      const payload: ResumableCompleteResponse = {
        item,
        isAdminUpload
      };
      res.status(201).json(payload);
    } catch (err) {
      if (err instanceof DriveStorageError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({
        error: 'Unable to finalize Google Drive upload. Please retry.',
        code: 'SERVER_ERROR'
      });
    }
  });

  app.delete('/api/gallery/upload/resumable/:sessionId', async (req, res) => {
    const sessionId = String(req.params.sessionId || '').trim();
    if (sessionId) {
      await abortDriveResumableSession(sessionId);
    }
    res.json({ aborted: true });
  });

  // Serve legacy local media cleanly if any exist
  app.get('/api/gallery/media/:fileId', (req, res) => {
    const filePath = resolveLocalMediaPath(req.params.fileId);
    if (!filePath) {
      res.status(404).json({ error: 'Media file not found' });
      return;
    }
    if (req.query.download === '1') {
      res.download(filePath);
      return;
    }
    res.sendFile(filePath);
  });

  // Proxy Google Drive uploaded media cleanly without exposing tokens (with streaming + HTTP Range support for large videos)
  app.get('/api/gallery/drive/:driveFileId', async (req, res) => {
    const driveId = req.params.driveFileId.replace(/[^a-zA-Z0-9_\-]/g, '');
    if (!driveId) {
      res.status(400).json({ error: 'Invalid Drive file ID' });
      return;
    }
    try {
      const optionalToken = req.header('X-Google-Drive-Token') || undefined;
      const rangeHeader = req.header('range') || undefined;
      const upstream = await fetchDriveMediaStream(driveId, optionalToken, rangeHeader);
      if (!upstream || (!upstream.ok && upstream.status !== 206)) {
        res.status(404).json({ error: 'Drive media file unavailable' });
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      res.status(upstream.status === 206 ? 206 : 200);
      res.setHeader('Content-Type', contentType);
      const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes';
      res.setHeader('Accept-Ranges', acceptRanges);

      const contentRange = upstream.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      if (req.query.download === '1') {
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Content-Disposition', `attachment; filename="mjay2026-${driveId}"`);
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }

      if (upstream.body) {
        const nodeStream = Readable.fromWeb(upstream.body as unknown as NodeWebReadableStream);
        nodeStream.on('error', () => {
          if (!res.headersSent) res.status(502);
          res.end();
        });
        nodeStream.pipe(res);
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.send(buf);
      }
    } catch {
      res.status(500).json({ error: 'Error retrieving Drive media' });
    }
  });

  // Admin-Only Media File Deletion Endpoint
  app.delete('/api/gallery/media', async (req, res) => {
    try {
      const admin = await requireAdminRequest(req, res, firebaseCfg);
      if (!admin) return;

      const { storageProvider, driveFileId } = req.body as {
        storageProvider?: string;
        driveFileId?: string;
      };
      const driveTokenHeader = req.header('X-Google-Drive-Token') || undefined;
      if (storageProvider && driveFileId) {
        await deleteStoredGalleryFile(storageProvider, driveFileId, driveTokenHeader);
      }

      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Delete failed' });
    }
  });

  // Vite dev middleware or production static serving
  let viteServer: Awaited<ReturnType<typeof createViteServer>> | null = null;
  if (process.env.NODE_ENV !== 'production') {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    viteServer = await createViteServer({
      server: {
        middlewareMode: true,
        ...(disableHmr ? { hmr: false, ws: false, watch: null } : {})
      },
      appType: 'spa'
    });
    app.use(viteServer.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mary & Joseph (#mjay2026) server running on http://0.0.0.0:${PORT}`);
    logDriveOAuthStartupDiagnostics();
    // Proactively verify server refresh token on boot so connection status is accurate immediately
    void ensureServerRefreshVerifiedIfNeeded().catch(() => {});
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down server gracefully...`);
    httpServer.close(() => {
      void viteServer?.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
