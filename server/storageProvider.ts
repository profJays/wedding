import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface StoredMediaResult {
  storageProvider: 'google_drive' | 'local_server';
  driveFileId: string;
  fileUrl: string;
  sizeBytes: number;
  mimeType: string;
  originalName: string;
}

export interface StorageConfigStatus {
  activeProvider: 'google_drive' | 'local_server';
  googleDriveConfigured: boolean;
  missingGoogleDriveEnvVars: string[];
  uploadDir: string;
}

const UPLOAD_ROOT = path.resolve(process.cwd(), 'data', 'gallery-uploads');

function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_ROOT)) {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  }
}

export function getStorageConfigStatus(): StorageConfigStatus {
  const missing: string[] = [];
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) missing.push('GOOGLE_DRIVE_FOLDER_ID');
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) missing.push('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');

  const googleDriveConfigured = missing.length === 0;
  return {
    activeProvider: googleDriveConfigured ? 'google_drive' : 'local_server',
    googleDriveConfigured,
    missingGoogleDriveEnvVars: missing,
    uploadDir: UPLOAD_ROOT
  };
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function getGoogleDriveAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
  const rawKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: email,
      scope: 'https://www.googleapis.com/auth/drive.file',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    })
  );

  const unsignedJwt = `${header}.${claimSet}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  const signature = base64UrlEncode(signer.sign(rawKey));
  const assertion = `${unsignedJwt}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Google Drive OAuth token exchange failed (${tokenRes.status}): ${text}`);
  }

  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error('Google Drive OAuth response missing access_token');
  }
  return tokenJson.access_token;
}

async function uploadToGoogleDrive(
  buffer: Buffer,
  safeName: string,
  mimeType: string
): Promise<StoredMediaResult> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
  const accessToken = await getGoogleDriveAccessToken();

  const boundary = `mjay2026_${crypto.randomBytes(12).toString('hex')}`;
  const metadata = JSON.stringify({
    name: safeName,
    parents: [folderId]
  });

  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8'
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const multipartBody = Buffer.concat([prefix, buffer, suffix]);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(multipartBody.length)
      },
      body: multipartBody
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Google Drive upload failed (${uploadRes.status}): ${errText}`);
  }

  const created = (await uploadRes.json()) as { id: string; webContentLink?: string };

  // Make file viewable via link so approved wedding gallery items render cleanly
  await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(created.id)}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });

  const proxyUrl = `/api/gallery/drive/${encodeURIComponent(created.id)}`;
  return {
    storageProvider: 'google_drive',
    driveFileId: created.id,
    fileUrl: proxyUrl,
    sizeBytes: buffer.length,
    mimeType,
    originalName: safeName
  };
}

export async function storeGalleryFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<StoredMediaResult> {
  const ext = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10) || '.bin';
  const id = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const cleanOriginal = path.basename(originalName).replace(/[^a-zA-Z0-9._\- ]/g, '_').slice(0, 120);

  const status = getStorageConfigStatus();
  if (status.googleDriveConfigured) {
    return uploadToGoogleDrive(buffer, `${id}_${cleanOriginal}`, mimeType);
  }

  ensureUploadDir();
  const targetPath = path.join(UPLOAD_ROOT, id);
  await fs.promises.writeFile(targetPath, buffer);

  return {
    storageProvider: 'local_server',
    driveFileId: id,
    fileUrl: `/api/gallery/media/${encodeURIComponent(id)}`,
    sizeBytes: buffer.length,
    mimeType,
    originalName: cleanOriginal
  };
}

export function resolveLocalMediaPath(fileId: string): string | null {
  const safeId = path.basename(fileId);
  if (!safeId || safeId !== fileId || !/^[a-zA-Z0-9._\-]+$/.test(safeId)) {
    return null;
  }
  const fullPath = path.join(UPLOAD_ROOT, safeId);
  if (!fullPath.startsWith(UPLOAD_ROOT)) {
    return null;
  }
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fullPath;
}

export async function deleteStoredGalleryFile(
  storageProvider: string,
  driveFileId: string
): Promise<void> {
  if (storageProvider === 'local_server' && driveFileId) {
    const target = resolveLocalMediaPath(driveFileId);
    if (target && fs.existsSync(target)) {
      await fs.promises.unlink(target);
    }
    return;
  }

  if (storageProvider === 'google_drive' && driveFileId) {
    const status = getStorageConfigStatus();
    if (!status.googleDriveConfigured) return;
    const accessToken = await getGoogleDriveAccessToken();
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  }
}

export async function fetchDriveMediaStream(driveFileId: string): Promise<Response | null> {
  const status = getStorageConfigStatus();
  if (!status.googleDriveConfigured) return null;
  const accessToken = await getGoogleDriveAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  return res;
}
