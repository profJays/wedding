import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  DriveStorageError,
  getDriveConnectionStatus,
  verifyAndSaveDriveConnection,
  ensureDriveFolderStructure,
  disconnectDriveState,
  storeGalleryFileInDrive,
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
  UploadBatchResponse,
  UploadErrorCode,
  UploadFileResult,
  UploadedFileMetadata
} from './src/types.ts';

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId: string;
}

const DEFAULT_GALLERY_UNLOCK_ISO = '2026-12-12T00:00:00+01:00'; // Saturday, 12 Dec 2026 00:00 Africa/Lagos
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
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

function classifyUploadedFile(file: Express.Multer.File): {
  mediaType: 'image' | 'video' | 'unsupported';
  canonicalMime: string;
} {
  const mime = (file.mimetype || '').toLowerCase().trim();
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (ALLOWED_IMAGE_MIMES.has(mime)) {
    return { mediaType: 'image', canonicalMime: mime === 'image/jpg' ? 'image/jpeg' : mime };
  }
  if (ALLOWED_VIDEO_MIMES.has(mime)) {
    return { mediaType: 'video', canonicalMime: mime };
  }
  if ((!mime || mime === 'application/octet-stream') && ext in EXTENSION_TO_IMAGE_MIME) {
    return { mediaType: 'image', canonicalMime: EXTENSION_TO_IMAGE_MIME[ext] };
  }
  if ((!mime || mime === 'application/octet-stream') && ext in EXTENSION_TO_VIDEO_MIME) {
    return { mediaType: 'video', canonicalMime: EXTENSION_TO_VIDEO_MIME[ext] };
  }
  return { mediaType: 'unsupported', canonicalMime: mime || 'application/octet-stream' };
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

function formatLagosTime(epochMs: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'full',
    timeStyle: 'medium'
  }).format(new Date(epochMs));
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

async function startServer() {
  const firebaseCfg = loadFirebaseConfig();
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      files: MAX_BATCH_FILES,
      fileSize: MAX_VIDEO_BYTES
    }
  });

  // Authoritative Server Health Check
  app.get('/api/health', (_req, res) => {
    const driveStatus = getDriveConnectionStatus();
    res.json({
      ok: true,
      serverTimeMs: Date.now(),
      timezone: 'Africa/Lagos',
      storageProvider: 'google_drive',
      googleDriveConfigured:
        driveStatus.configuredFolderId &&
        (driveStatus.oauthConnected || driveStatus.serverRefreshConfigured)
    });
  });

  // Server-Side Admin Verification Endpoint (Defense in Depth)
  app.get('/api/admin/verify', async (req, res) => {
    const admin = await requireAdminRequest(req, res, firebaseCfg);
    if (!admin) return;
    res.json({ authorized: true, uid: admin.uid, email: admin.email });
  });

  // Authoritative Server-Side Gallery Lock & Drive Storage Status
  app.get('/api/gallery/status', async (_req, res) => {
    const nowMs = Date.now();
    const { unlockISO, unlockEpochMs } = await resolveGalleryUnlockFromFirestore(firebaseCfg);
    const driveStatus = getDriveConnectionStatus();
    const isUnlocked = nowMs >= unlockEpochMs;

    res.json({
      isUnlocked,
      serverTimeMs: nowMs,
      serverTimeLagosFormatted: formatLagosTime(nowMs),
      unlockAtISO: unlockISO,
      unlockAtEpochMs: unlockEpochMs,
      unlockAtLagosFormatted: formatLagosTime(unlockEpochMs),
      timezone: 'Africa/Lagos',
      storageProvider: 'google_drive',
      googleDriveConfigured:
        driveStatus.configuredFolderId &&
        (driveStatus.oauthConnected || driveStatus.serverRefreshConfigured),
      driveStatus,
      limits: {
        maxImageBytes: MAX_IMAGE_BYTES,
        maxVideoBytes: MAX_VIDEO_BYTES,
        maxBatchFiles: MAX_BATCH_FILES
      }
    });
  });

  // Admin: Get Google Drive Connection Status
  app.get('/api/drive/status', async (req, res) => {
    const admin = await requireAdminRequest(req, res, firebaseCfg);
    if (!admin) return;
    res.json(getDriveConnectionStatus());
  });

  // Admin: Verify OAuth Access Token + Target GOOGLE_DRIVE_FOLDER_ID
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
      const status = await verifyAndSaveDriveConnection(driveToken.trim());
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

    const driveToken = req.header('X-Google-Drive-Token') || '';
    if (!driveToken.trim()) {
      res.status(401).json({
        error: 'Google Drive OAuth token required to initialize folders. Click "Connect Google Drive" first.',
        code: 'DRIVE_AUTH_MISSING'
      });
      return;
    }

    try {
      await ensureDriveFolderStructure(driveToken.trim());
      res.json(getDriveConnectionStatus());
    } catch (err) {
      if (err instanceof DriveStorageError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Unable to initialize Google Drive folders. Please retry.' });
    }
  });

  // Admin: Test Drive Connection + Permissions
  app.post('/api/drive/test', async (req, res) => {
    const admin = await requireAdminRequest(req, res, firebaseCfg);
    if (!admin) return;

    const driveToken = req.header('X-Google-Drive-Token') || '';
    if (!driveToken.trim()) {
      res.status(401).json({
        error: 'Your browser Google Drive session is not active. Click "Reconnect Google Drive" to test.',
        code: 'DRIVE_AUTH_MISSING'
      });
      return;
    }

    try {
      const status = await verifyAndSaveDriveConnection(driveToken.trim());
      res.json({ ok: true, driveStatus: status });
    } catch (err) {
      if (err instanceof DriveStorageError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Drive connection test failed. Please retry.' });
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
              error: 'One or more selected files exceed the 100 MB video upload limit (or 15 MB photo limit). Please compress the file or choose a smaller version.',
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
        const { unlockISO, unlockEpochMs } = await resolveGalleryUnlockFromFirestore(firebaseCfg);

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
          mediaType: 'image' | 'video';
          canonicalMime: string;
        }> = [];

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
              errorMessage: `${file.originalname} is ${sizeMb} MB. The maximum photo size is 15 MB. Please compress this image or choose a smaller version.`
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

          validQueue.push({
            index: i,
            file,
            clientFileId,
            mediaType: classified.mediaType,
            canonicalMime: classified.canonicalMime
          });
        }

        // If zero files passed validation, fail immediately with 400 and all errors
        if (validQueue.length === 0) {
          const firstErr = results.find((r) => r.errorMessage);
          res.status(400).json({
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

          const category: DriveMediaCategory = VALID_CATEGORIES.has(rawCategory)
            ? rawCategory
            : isAdminUpload
            ? 'admin_media'
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
              driveAccessTokenHeader: driveTokenHeader
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

  // Proxy Google Drive uploaded media cleanly without exposing tokens
  app.get('/api/gallery/drive/:driveFileId', async (req, res) => {
    const driveId = req.params.driveFileId.replace(/[^a-zA-Z0-9_\-]/g, '');
    if (!driveId) {
      res.status(400).json({ error: 'Invalid Drive file ID' });
      return;
    }
    try {
      const optionalToken = req.header('X-Google-Drive-Token') || undefined;
      const upstream = await fetchDriveMediaStream(driveId, optionalToken);
      if (!upstream || !upstream.ok) {
        res.status(404).json({ error: 'Drive media file unavailable' });
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      if (req.query.download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="mjay2026-${driveId}"`);
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
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
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mary & Joseph (#mjay2026) server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
