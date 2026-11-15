import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  getStorageConfigStatus,
  storeGalleryFile,
  resolveLocalMediaPath,
  deleteStoredGalleryFile,
  fetchDriveMediaStream
} from './server/storageProvider.ts';
import {
  verifyFirebaseIdToken,
  isAuthorizedWeddingAdmin
} from './server/firebaseTokenVerifier.ts';

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
    const storage = getStorageConfigStatus();
    res.json({
      ok: true,
      serverTimeMs: Date.now(),
      timezone: 'Africa/Lagos',
      storageProvider: storage.activeProvider,
      googleDriveConfigured: storage.googleDriveConfigured
    });
  });

  // Authoritative Server-Side Gallery Lock & Storage Status
  app.get('/api/gallery/status', async (_req, res) => {
    const nowMs = Date.now();
    const { unlockISO, unlockEpochMs } = await resolveGalleryUnlockFromFirestore(firebaseCfg);
    const storage = getStorageConfigStatus();
    const isUnlocked = nowMs >= unlockEpochMs;

    res.json({
      isUnlocked,
      serverTimeMs: nowMs,
      serverTimeLagosFormatted: formatLagosTime(nowMs),
      unlockAtISO: unlockISO,
      unlockAtEpochMs: unlockEpochMs,
      unlockAtLagosFormatted: formatLagosTime(unlockEpochMs),
      timezone: 'Africa/Lagos',
      storageProvider: storage.activeProvider,
      googleDriveConfigured: storage.googleDriveConfigured,
      missingGoogleDriveEnvVars: storage.missingGoogleDriveEnvVars,
      limits: {
        maxImageBytes: MAX_IMAGE_BYTES,
        maxVideoBytes: MAX_VIDEO_BYTES,
        maxBatchFiles: MAX_BATCH_FILES
      }
    });
  });

  // Server-Time Enforced Gallery Media Upload
  app.post('/api/gallery/upload', (req, res) => {
    upload.array('files', MAX_BATCH_FILES)(req, res, async (multerErr) => {
      if (multerErr) {
        res.status(400).json({ error: multerErr.message || 'Invalid upload payload.' });
        return;
      }

      try {
        const nowMs = Date.now();
        const { unlockISO, unlockEpochMs } = await resolveGalleryUnlockFromFirestore(firebaseCfg);

        // Check if caller is an authenticated admin (admins can upload portraits early)
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
            error: `Gallery uploads are locked until Saturday, 12 December 2026 at 00:00 WAT (Africa/Lagos).`,
            serverTimeMs: nowMs,
            unlockAtISO: unlockISO,
            unlockAtEpochMs: unlockEpochMs
          });
          return;
        }

        const files = (req.files as Express.Multer.File[] | undefined) || [];
        if (files.length === 0) {
          res.status(400).json({ error: 'Please select at least one photograph or video to upload.' });
          return;
        }

        const uploaded: Array<{
          mediaType: 'image' | 'video';
          mimeType: string;
          fileUrl: string;
          storageProvider: 'google_drive' | 'local_server';
          driveFileId: string;
          sizeBytes: number;
          originalName: string;
        }> = [];

        for (const file of files) {
          const mime = file.mimetype.toLowerCase();
          const isImage = ALLOWED_IMAGE_MIMES.has(mime);
          const isVideo = ALLOWED_VIDEO_MIMES.has(mime);

          if (!isImage && !isVideo) {
            res.status(400).json({
              error: `Unsupported file format "${file.originalname}" (${file.mimetype}). Please upload JPEG, PNG, WebP, HEIC images or MP4, MOV, WebM videos.`
            });
            return;
          }

          if (isImage && file.size > MAX_IMAGE_BYTES) {
            res.status(400).json({
              error: `Image "${file.originalname}" exceeds the 15 MB image size limit.`
            });
            return;
          }

          if (isVideo && file.size > MAX_VIDEO_BYTES) {
            res.status(400).json({
              error: `Video "${file.originalname}" exceeds the 100 MB video size limit.`
            });
            return;
          }

          const stored = await storeGalleryFile(file.buffer, file.originalname, mime);
          uploaded.push({
            mediaType: isImage ? 'image' : 'video',
            mimeType: stored.mimeType,
            fileUrl: stored.fileUrl,
            storageProvider: stored.storageProvider,
            driveFileId: stored.driveFileId,
            sizeBytes: stored.sizeBytes,
            originalName: stored.originalName
          });
        }

        res.status(201).json({
          uploaded,
          serverTimeMs: nowMs,
          isAdminUpload
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload processing error';
        res.status(500).json({ error: message });
      }
    });
  });

  // Serve locally vaulted uploaded gallery media safely
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

  // Proxy Google Drive uploaded media cleanly without leaking credentials
  app.get('/api/gallery/drive/:driveFileId', async (req, res) => {
    const driveId = req.params.driveFileId.replace(/[^a-zA-Z0-9_\-]/g, '');
    if (!driveId) {
      res.status(400).json({ error: 'Invalid Drive file ID' });
      return;
    }
    try {
      const upstream = await fetchDriveMediaStream(driveId);
      if (!upstream || !upstream.ok) {
        res.status(404).json({ error: 'Drive media file unavailable' });
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Admin authentication required' });
        return;
      }

      const rawToken = authHeader.slice('Bearer '.length).trim();
      const tokenInfo = await verifyFirebaseIdToken(rawToken, firebaseCfg.projectId);
      if (!tokenInfo) {
        res.status(401).json({ error: 'Invalid authentication token' });
        return;
      }

      const allowed = await isAuthorizedWeddingAdmin(
        tokenInfo,
        firebaseCfg.projectId,
        firebaseCfg.firestoreDatabaseId,
        rawToken
      );
      if (!allowed) {
        res.status(403).json({ error: 'Administrator privileges required' });
        return;
      }

      const { storageProvider, driveFileId } = req.body as {
        storageProvider?: string;
        driveFileId?: string;
      };
      if (storageProvider && driveFileId) {
        await deleteStoredGalleryFile(storageProvider, driveFileId);
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
