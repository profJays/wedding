import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import {
  db,
  auth,
  OperationType,
  handleFirestoreError
} from './firebase';
import { DEFAULT_SITE_CONTENT } from '../data/weddingSite';
import { getDriveAccessToken, clearExpiredDriveToken } from './driveOAuth';
import {
  SiteContentData,
  RsvpRecord,
  GalleryItem,
  AdminUser,
  GalleryServerStatus,
  DriveConnectionStatus,
  DriveTestConnectionResponse,
  DriveMediaCategory,
  ResumableCompleteResponse,
  ResumableInitResponse,
  UploadBatchResponse,
  UploadErrorCode,
  UploadFileResult,
  UploadedFileMetadata
} from '../types';

const SITE_CONTENT_DOC_PATH = 'siteContent/main';
const BOOTSTRAPPED_ADMIN_EMAIL = 'joepreserve@gmail.com';
const BOOTSTRAPPED_ADMIN_UID = 'oFuTnbSimLQSRIaYzMIShk0oQm92';

function toJsDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    const parsed = new Date(val);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function normalizeRsvpId(fullName: string): string {
  const cleaned = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  // Simple deterministic FNV-1a suffix so accents/punctuation differences don't collide unpredictably
  let hash = 2166136261;
  const normalized = fullName.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(36);
  return `rsvp_${cleaned || 'guest'}_${suffix}`;
}

// ---------------------------------------------------------------------------
// 1. Public & Admin Site Content
// ---------------------------------------------------------------------------
export function subscribeSiteContent(
  onData: (data: SiteContentData) => void
): () => void {
  const ref = doc(db, 'siteContent', 'main');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(DEFAULT_SITE_CONTENT);
        return;
      }
      const raw = snap.data() as Partial<SiteContentData>;
      onData({
        ...DEFAULT_SITE_CONTENT,
        ...raw,
        puzzleEnabled:
          typeof raw.puzzleEnabled === 'boolean'
            ? raw.puzzleEnabled
            : DEFAULT_SITE_CONTENT.puzzleEnabled,
        puzzleImageFileId:
          typeof raw.puzzleImageFileId === 'string'
            ? raw.puzzleImageFileId
            : DEFAULT_SITE_CONTENT.puzzleImageFileId,
        puzzleImageUrl:
          typeof raw.puzzleImageUrl === 'string' && raw.puzzleImageUrl.trim().length > 0
            ? raw.puzzleImageUrl
            : DEFAULT_SITE_CONTENT.puzzleImageUrl,
        musicEnabled:
          typeof raw.musicEnabled === 'boolean'
            ? raw.musicEnabled
            : DEFAULT_SITE_CONTENT.musicEnabled,
        musicTitle:
          typeof raw.musicTitle === 'string' && raw.musicTitle.trim().length > 0
            ? raw.musicTitle
            : DEFAULT_SITE_CONTENT.musicTitle,
        musicArtist:
          typeof raw.musicArtist === 'string' && raw.musicArtist.trim().length > 0
            ? raw.musicArtist
            : DEFAULT_SITE_CONTENT.musicArtist,
        musicAudioFileId:
          typeof raw.musicAudioFileId === 'string'
            ? raw.musicAudioFileId
            : DEFAULT_SITE_CONTENT.musicAudioFileId,
        musicAudioUrl:
          typeof raw.musicAudioUrl === 'string' && !raw.musicAudioUrl.trim().startsWith('blob:')
            ? raw.musicAudioUrl.trim()
            : DEFAULT_SITE_CONTENT.musicAudioUrl,
        musicAudioFileName:
          typeof raw.musicAudioFileName === 'string'
            ? raw.musicAudioFileName
            : DEFAULT_SITE_CONTENT.musicAudioFileName,
        welcomeParagraphs: Array.isArray(raw.welcomeParagraphs) && raw.welcomeParagraphs.length > 0
          ? raw.welcomeParagraphs
          : DEFAULT_SITE_CONTENT.welcomeParagraphs,
        storyParagraphs: Array.isArray(raw.storyParagraphs) && raw.storyParagraphs.length > 0
          ? raw.storyParagraphs
          : DEFAULT_SITE_CONTENT.storyParagraphs,
        coupleQas: Array.isArray(raw.coupleQas) ? raw.coupleQas : DEFAULT_SITE_CONTENT.coupleQas,
        scheduleEvents: Array.isArray(raw.scheduleEvents)
          ? raw.scheduleEvents
          : DEFAULT_SITE_CONTENT.scheduleEvents,
        guestFaqs: Array.isArray(raw.guestFaqs) ? raw.guestFaqs : DEFAULT_SITE_CONTENT.guestFaqs
      });
    },
    (error) => {
      // Do not crash public site if offline; report only permission/fatal issues cleanly
      console.warn('Site content subscription fallback:', error.message);
      onData(DEFAULT_SITE_CONTENT);
    }
  );
}

export async function saveSiteContent(content: SiteContentData): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Administrator authentication is required.');
  }

  const rawPuzzleUrl = (content.puzzleImageUrl || '').trim();
  const safePuzzleUrl =
    rawPuzzleUrl && !rawPuzzleUrl.startsWith('blob:')
      ? rawPuzzleUrl.slice(0, 500)
      : (DEFAULT_SITE_CONTENT.puzzleImageUrl || '').slice(0, 500);

  const rawMusicUrl = (content.musicAudioUrl || '').trim();
  const safeMusicUrl =
    rawMusicUrl && !rawMusicUrl.startsWith('blob:')
      ? rawMusicUrl.slice(0, 500)
      : '';

  const unlockMs = new Date(content.galleryUnlockISO).getTime();
  const payload = {
    coupleNames: content.coupleNames.trim().slice(0, 100),
    brideName: content.brideName.trim().slice(0, 50),
    groomName: content.groomName.trim().slice(0, 50),
    hashtag: content.hashtag.trim().slice(0, 40),
    weddingDateDisplay: content.weddingDateDisplay.trim().slice(0, 80),
    ceremonyTargetISO: content.ceremonyTargetISO.trim().slice(0, 40),
    galleryUnlockISO: content.galleryUnlockISO.trim().slice(0, 40),
    galleryUnlockEpochMs: Number.isFinite(unlockMs) && unlockMs > 0
      ? Math.trunc(unlockMs)
      : DEFAULT_SITE_CONTENT.galleryUnlockEpochMs,
    mainVenue: content.mainVenue.trim().slice(0, 240),
    heroImageUrl: content.heroImageUrl.trim().slice(0, 500),
    contactName: (content.contactName || '').trim().slice(0, 80),
    contactPhone: (content.contactPhone || '').trim().slice(0, 40),
    welcomeHeading: content.welcomeHeading.trim().slice(0, 160),
    welcomeParagraphs: content.welcomeParagraphs.filter((p) => p.trim().length > 0).slice(0, 12),
    welcomeSignOff: content.welcomeSignOff.trim().slice(0, 120),
    storyHeading: content.storyHeading.trim().slice(0, 160),
    storyParagraphs: content.storyParagraphs.filter((p) => p.trim().length > 0).slice(0, 20),
    coupleQas: content.coupleQas.slice(0, 30),
    scheduleEvents: content.scheduleEvents.slice(0, 20),
    guestFaqs: content.guestFaqs.slice(0, 30),
    footerNote: (content.footerNote || '').trim().slice(0, 200),
    rsvpOpen: Boolean(content.rsvpOpen),
    maxGuestsPerRsvp: Math.max(1, Math.min(10, Math.trunc(content.maxGuestsPerRsvp || 1))),
    galleryPublicEnabled: Boolean(content.galleryPublicEnabled),
    themePrimaryHex: (content.themePrimaryHex || '#07543E').slice(0, 20),
    themeAccentHex: (content.themeAccentHex || '#737746').slice(0, 20),
    themeGoldHex: (content.themeGoldHex || '#C5A04A').slice(0, 20),
    puzzleEnabled: content.puzzleEnabled !== false,
    puzzleImageFileId: (content.puzzleImageFileId || '').trim().slice(0, 200),
    puzzleImageUrl: safePuzzleUrl,
    musicEnabled: content.musicEnabled !== false,
    musicTitle: ((content.musicTitle || '').trim() || DEFAULT_SITE_CONTENT.musicTitle || 'Perfect').slice(0, 120),
    musicArtist: ((content.musicArtist || '').trim() || DEFAULT_SITE_CONTENT.musicArtist || 'Ed Sheeran').slice(0, 120),
    musicAudioFileId: safeMusicUrl ? (content.musicAudioFileId || '').trim().slice(0, 200) : '',
    musicAudioUrl: safeMusicUrl,
    musicAudioFileName: safeMusicUrl ? (content.musicAudioFileName || '').trim().slice(0, 160) : '',
    updatedAt: serverTimestamp(),
    updatedByUid: uid
  };

  try {
    await setDoc(doc(db, 'siteContent', 'main'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, SITE_CONTENT_DOC_PATH);
  }
}

// ---------------------------------------------------------------------------
// 2. RSVP Submission & Admin Management
// ---------------------------------------------------------------------------
export async function submitGuestRsvp(input: {
  fullName: string;
  attending: boolean;
  guestCount: number;
  message: string;
  maxGuestsAllowed: number;
}): Promise<{ id: string }> {
  const fullName = input.fullName.trim();
  if (fullName.length < 2 || fullName.length > 100) {
    throw new Error('Please enter your full name (2 to 100 characters).');
  }

  const normalizedName = fullName.toLowerCase();
  const docId = normalizeRsvpId(fullName);
  const clampedCount = input.attending
    ? Math.max(1, Math.min(input.maxGuestsAllowed, Math.trunc(input.guestCount || 1)))
    : 0;

  const payload = {
    fullName,
    normalizedName,
    attending: input.attending,
    guestCount: clampedCount,
    message: input.message.trim().slice(0, 1000),
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'rsvps', docId), payload);
    return { id: docId };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (errMsg.includes('permission') || errMsg.includes('insufficient')) {
      throw new Error(
        'DUPLICATE_OR_CLOSED_RSVP'
      );
    }
    handleFirestoreError(error, OperationType.CREATE, `rsvps/${docId}`);
  }
}

export async function listAllRsvps(): Promise<RsvpRecord[]> {
  try {
    const snap = await getDocs(collection(db, 'rsvps'));
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          fullName: String(data.fullName || ''),
          normalizedName: String(data.normalizedName || ''),
          attending: Boolean(data.attending),
          guestCount: Number(data.guestCount || 0),
          message: String(data.message || ''),
          submittedAt: toJsDate(data.submittedAt),
          updatedAt: toJsDate(data.updatedAt)
        };
      })
      .sort((a, b) => (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'rsvps');
  }
}

export async function updateRsvpRecord(
  id: string,
  updates: {
    fullName: string;
    attending: boolean;
    guestCount: number;
    message: string;
  }
): Promise<void> {
  const fullName = updates.fullName.trim().slice(0, 100);
  const guestCount = updates.attending
    ? Math.max(1, Math.min(10, Math.trunc(updates.guestCount || 1)))
    : 0;

  try {
    await updateDoc(doc(db, 'rsvps', id), {
      fullName,
      normalizedName: fullName.toLowerCase(),
      attending: updates.attending,
      guestCount,
      message: updates.message.trim().slice(0, 1000),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rsvps/${id}`);
  }
}

export async function deleteRsvpRecord(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'rsvps', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `rsvps/${id}`);
  }
}

export function exportRsvpsToCsv(records: RsvpRecord[]): void {
  const escapeCsv = (value: string | number | boolean) => {
    const str = String(value);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = ['Full Name', 'Status', 'Guest Count', 'Message', 'Submitted At (WAT)'];
  const rows = records.map((r) => [
    escapeCsv(r.fullName),
    escapeCsv(r.attending ? 'Attending' : 'Unable to attend'),
    escapeCsv(r.guestCount),
    escapeCsv(r.message),
    escapeCsv(
      r.submittedAt
        ? new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Africa/Lagos',
            dateStyle: 'medium',
            timeStyle: 'short'
          }).format(r.submittedAt)
        : ''
    )
  ]);

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mjay2026-rsvps-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// 3. Gallery Server Status, Uploads & Moderation
// ---------------------------------------------------------------------------
export async function fetchGalleryServerStatus(): Promise<GalleryServerStatus> {
  const res = await fetch('/api/gallery/status');
  if (!res.ok) {
    throw new Error('Unable to verify server upload status.');
  }
  return (await res.json()) as GalleryServerStatus;
}

export function subscribeApprovedGalleryItems(
  onData: (items: GalleryItem[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(
    collection(db, 'galleryItems'),
    where('status', '==', 'approved')
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title || 'Wedding Moment'),
            guestName: String(data.guestName || ''),
            mediaType: (
              data.mediaType === 'video'
                ? 'video'
                : data.mediaType === 'audio'
                ? 'audio'
                : 'image'
            ) as GalleryItem['mediaType'],
            mimeType: String(data.mimeType || 'image/jpeg'),
            fileUrl: String(data.fileUrl || ''),
            storageProvider: (data.storageProvider || 'local_server') as GalleryItem['storageProvider'],
            driveFileId: String(data.driveFileId || ''),
            sizeBytes: Number(data.sizeBytes || 0),
            status: (data.status || 'approved') as GalleryItem['status'],
            createdAt: toJsDate(data.createdAt),
            updatedAt: toJsDate(data.updatedAt)
          };
        })
        .filter((item) => item.mediaType !== 'audio')
        .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function listAllGalleryItemsAdmin(): Promise<GalleryItem[]> {
  try {
    const q = query(collection(db, 'galleryItems'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: String(data.title || 'Wedding Moment'),
        guestName: String(data.guestName || ''),
        mediaType:
          data.mediaType === 'video'
            ? 'video'
            : data.mediaType === 'audio'
            ? 'audio'
            : 'image',
        mimeType: String(data.mimeType || 'image/jpeg'),
        fileUrl: String(data.fileUrl || ''),
        storageProvider: (data.storageProvider || 'local_server') as GalleryItem['storageProvider'],
        driveFileId: String(data.driveFileId || ''),
        sizeBytes: Number(data.sizeBytes || 0),
        status: (data.status || 'pending') as GalleryItem['status'],
        createdAt: toJsDate(data.createdAt),
        updatedAt: toJsDate(data.updatedAt)
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'galleryItems');
  }
}

export interface UploadMediaBatchOutcome {
  createdItems: GalleryItem[];
  results: UploadFileResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
  needsDriveReconnect: boolean;
  globalError: string | null;
}

const RESUMABLE_THRESHOLD_BYTES = 4 * 1024 * 1024; // Files > 4 MB and ALL videos use chunked resumable upload
const MAX_CHUNK_RETRIES = 3;

function parseRangeHeaderLastByte(rangeHeader: string | null): number | null {
  if (!rangeHeader) return null;
  const match = rangeHeader.match(/bytes=0-(\d+)/i);
  if (!match) return null;
  const val = Number(match[1]);
  return Number.isFinite(val) ? val : null;
}

function isVideoFileClient(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  const name = (file.name || '').toLowerCase();
  return /\.(mp4|mov|webm|m4v)$/.test(name);
}

function sendChunkXhr(params: {
  url: string;
  chunk: Blob;
  contentRange: string;
  contentType?: string;
  onChunkProgress: (loadedBytes: number) => void;
}): Promise<{
  status: number;
  rangeHeader: string | null;
  bodyText: string;
  networkError: boolean;
}> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', params.url, true);
    xhr.setRequestHeader('Content-Range', params.contentRange);
    if (params.contentType) {
      xhr.setRequestHeader('Content-Type', params.contentType);
    }

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        params.onChunkProgress(ev.loaded);
      }
    };

    xhr.onload = () => {
      let rangeHeader: string | null = null;
      try {
        rangeHeader =
          xhr.getResponseHeader('X-Drive-Range') || xhr.getResponseHeader('Range');
      } catch {
        rangeHeader = null;
      }
      resolve({
        status: xhr.status,
        rangeHeader,
        bodyText: xhr.responseText || '',
        networkError: false
      });
    };

    xhr.onerror = () => {
      resolve({ status: 0, rangeHeader: null, bodyText: '', networkError: true });
    };

    xhr.ontimeout = () => {
      resolve({ status: 0, rangeHeader: null, bodyText: '', networkError: true });
    };

    xhr.send(params.chunk);
  });
}

async function queryCommittedOffsetDirect(
  driveUploadUri: string,
  totalBytes: number
): Promise<{ status: number; nextOffset: number; driveFileId?: string }> {
  try {
    const res = await fetch(driveUploadUri, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes */${totalBytes}`
      }
    });
    if (res.status === 200 || res.status === 201) {
      const parsed = (await res.json().catch(() => ({}))) as { id?: string };
      return { status: res.status, nextOffset: totalBytes, driveFileId: parsed.id };
    }
    if (res.status === 308) {
      const lastByte = parseRangeHeaderLastByte(res.headers.get('Range'));
      return { status: 308, nextOffset: lastByte !== null ? lastByte + 1 : 0 };
    }
    return { status: res.status, nextOffset: 0 };
  } catch {
    return { status: 0, nextOffset: 0 };
  }
}

async function uploadSingleFileResumable(params: {
  entry: { id: string; file: File };
  category?: DriveMediaCategory;
  isAdmin?: boolean;
  idToken: string | null;
  driveToken: string | null;
  onFileBytesLoaded: (bytesLoaded: number) => void;
}): Promise<{
  result: UploadFileResult;
  needsDriveReconnect: boolean;
}> {
  const { entry, isAdmin, idToken, driveToken, onFileBytesLoaded } = params;
  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (idToken) authHeaders['Authorization'] = `Bearer ${idToken}`;
  if (driveToken) authHeaders['X-Google-Drive-Token'] = driveToken;

  let initRes: Response;
  try {
    initRes = await fetch('/api/gallery/upload/resumable/init', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        originalName: entry.file.name,
        mimeType: entry.file.type || 'application/octet-stream',
        sizeBytes: entry.file.size,
        category: params.category,
        clientFileId: entry.id
      })
    });
  } catch {
    return {
      result: {
        clientFileId: entry.id,
        originalName: entry.file.name,
        status: 'failed',
        errorCode: 'NETWORK_ERROR',
        errorMessage:
          'Upload could not start due to a network interruption. Check your connection and retry.'
      },
      needsDriveReconnect: false
    };
  }

  const initBody = (await initRes.json().catch(() => ({}))) as Partial<
    ResumableInitResponse & { error?: string; code?: UploadErrorCode }
  >;

  if (!initRes.ok || !initBody.sessionId || !initBody.driveUploadUri) {
    if (isAdmin && initRes.status === 401 && initBody.code === 'DRIVE_AUTH_EXPIRED') {
      clearExpiredDriveToken();
    }
    const needsReconnect = Boolean(
      isAdmin &&
        (initRes.status === 401 ||
          initBody.code === 'DRIVE_AUTH_MISSING' ||
          initBody.code === 'DRIVE_AUTH_EXPIRED' ||
          initBody.code === 'DRIVE_REFRESH_EXPIRED')
    );
    return {
      result: {
        clientFileId: entry.id,
        originalName: entry.file.name,
        status: initRes.status === 400 ? 'rejected' : 'failed',
        errorCode:
          initBody.code || (initRes.status >= 500 ? 'SERVER_ERROR' : 'VALIDATION_ERROR'),
        errorMessage:
          initBody.error ||
          `Upload could not be started (${initRes.status}). Please check your file and try again.`
      },
      needsDriveReconnect: needsReconnect
    };
  }

  const sessionId = initBody.sessionId;
  const driveUploadUri = initBody.driveUploadUri;
  const chunkSize = Math.max(256 * 1024, initBody.chunkBytes || 8 * 1024 * 1024);
  const totalBytes = entry.file.size;
  let offset = 0;
  let useServerRelay = false;
  let confirmedDriveFileId: string | undefined;

  try {
    while (offset < totalBytes) {
      const endExclusive = Math.min(offset + chunkSize, totalBytes);
      const chunkBlob = entry.file.slice(offset, endExclusive);
      const contentRange = `bytes ${offset}-${endExclusive - 1}/${totalBytes}`;
      let chunkDone = false;

      for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt++) {
        const targetUrl = useServerRelay
          ? `/api/gallery/upload/resumable/chunk/${encodeURIComponent(sessionId)}`
          : driveUploadUri;

        const resp = await sendChunkXhr({
          url: targetUrl,
          chunk: chunkBlob,
          contentRange,
          contentType: initBody.mimeType,
          onChunkProgress: (loaded) => {
            onFileBytesLoaded(Math.min(totalBytes, offset + loaded));
          }
        });

        // If browser CORS/sandbox blocks direct PUT to Google Drive on chunk 0, switch seamlessly to 8 MiB server relay
        if (!useServerRelay && resp.networkError && offset === 0 && attempt === 0) {
          useServerRelay = true;
          continue;
        }

        if (resp.status === 308 || (useServerRelay && resp.status === 200)) {
          let parsedRelay: {
            incomplete?: boolean;
            id?: string;
            range?: string | null;
          } = {};
          if (useServerRelay) {
            try {
              parsedRelay = JSON.parse(resp.bodyText || '{}') as typeof parsedRelay;
            } catch {
              parsedRelay = {};
            }
          }

          if (useServerRelay && parsedRelay.incomplete === false) {
            if (parsedRelay.id) confirmedDriveFileId = parsedRelay.id;
            offset = totalBytes;
            onFileBytesLoaded(totalBytes);
            chunkDone = true;
            break;
          }

          const lastByte = parseRangeHeaderLastByte(
            resp.rangeHeader || parsedRelay.range || null
          );
          offset = lastByte !== null ? Math.max(endExclusive, lastByte + 1) : endExclusive;
          onFileBytesLoaded(Math.min(totalBytes, offset));
          chunkDone = true;
          break;
        }

        if (resp.status === 200 || resp.status === 201) {
          try {
            const parsed = JSON.parse(resp.bodyText || '{}') as { id?: string };
            if (parsed.id) confirmedDriveFileId = parsed.id;
          } catch {
            // /complete will query Drive session status if CORS hid response JSON
          }
          offset = totalBytes;
          onFileBytesLoaded(totalBytes);
          chunkDone = true;
          break;
        }

        const retryable =
          resp.networkError ||
          resp.status === 408 ||
          resp.status === 429 ||
          resp.status >= 500;

        if (!retryable || attempt === MAX_CHUNK_RETRIES) {
          throw new Error(
            resp.networkError
              ? 'Upload interrupted due to a network drop. Check your connection and retry.'
              : `Upload chunk failed (${resp.status}). Please retry.`
          );
        }

        await new Promise((r) => window.setTimeout(r, 600 * Math.pow(2, attempt)));
        if (!useServerRelay) {
          const queried = await queryCommittedOffsetDirect(driveUploadUri, totalBytes);
          if (queried.status === 200 || queried.status === 201) {
            confirmedDriveFileId = queried.driveFileId;
            offset = totalBytes;
            onFileBytesLoaded(totalBytes);
            chunkDone = true;
            break;
          }
          if (queried.status === 308 && queried.nextOffset > offset) {
            offset = queried.nextOffset;
            onFileBytesLoaded(Math.min(totalBytes, offset));
            if (offset >= endExclusive) {
              chunkDone = true;
              break;
            }
          }
        }
      }

      if (!chunkDone) {
        throw new Error('Chunk upload did not complete. Please retry.');
      }
    }

    const completeRes = await fetch('/api/gallery/upload/resumable/complete', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sessionId,
        driveFileId: confirmedDriveFileId
      })
    });

    const completeBody = (await completeRes.json().catch(() => ({}))) as Partial<
      ResumableCompleteResponse & { error?: string; code?: UploadErrorCode }
    >;

    if (!completeRes.ok || !completeBody.item?.driveFileId) {
      throw new Error(
        completeBody.error ||
          `Upload could not be finalized (${completeRes.status}). Please retry.`
      );
    }

    return {
      result: {
        clientFileId: entry.id,
        originalName: entry.file.name,
        status: 'uploaded',
        item: completeBody.item
      },
      needsDriveReconnect: false
    };
  } catch (err) {
    // Clean up abandoned resumable session on Drive cleanly
    await fetch(`/api/gallery/upload/resumable/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE'
    }).catch(() => undefined);

    const msg =
      err instanceof Error
        ? err.message
        : 'Upload interrupted due to a network issue. Please retry.';
    return {
      result: {
        clientFileId: entry.id,
        originalName: entry.file.name,
        status: 'failed',
        errorCode: /network|interrupted|connection/i.test(msg) ? 'NETWORK_ERROR' : 'DRIVE_API_ERROR',
        errorMessage: msg
      },
      needsDriveReconnect: false
    };
  }
}

async function uploadSingleSmallFileMultipart(params: {
  entry: { id: string; file: File };
  category?: DriveMediaCategory;
  isAdmin?: boolean;
  idToken: string | null;
  driveToken: string | null;
  onFileBytesLoaded: (bytesLoaded: number) => void;
}): Promise<{
  result: UploadFileResult;
  needsDriveReconnect: boolean;
}> {
  const { entry, category, isAdmin, idToken, driveToken, onFileBytesLoaded } = params;
  const formData = new FormData();
  if (category) formData.append('category', category);
  formData.append('clientFileIds', JSON.stringify([entry.id]));
  formData.append('files', entry.file);

  const serverResponse = await new Promise<UploadBatchResponse>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/gallery/upload', true);
    if (idToken) xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    if (driveToken) xhr.setRequestHeader('X-Google-Drive-Token', driveToken);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const scaled = Math.round((ev.loaded / ev.total) * entry.file.size);
        onFileBytesLoaded(Math.min(entry.file.size, scaled));
      }
    };

    xhr.onload = () => {
      let body: Partial<UploadBatchResponse> = {};
      try {
        body = JSON.parse(xhr.responseText || '{}') as Partial<UploadBatchResponse>;
      } catch {
        body = {};
      }
      if (isAdmin && xhr.status === 401 && body.code === 'DRIVE_AUTH_EXPIRED') {
        clearExpiredDriveToken();
      }
      const fallbackMsg =
        xhr.status === 401
          ? isAdmin
            ? 'Google Drive authorization is missing or expired. Connect Google Drive or verify your server refresh token and retry.'
            : 'Photo and video uploads are temporarily unavailable while the couple finishes connecting the wedding gallery storage. Please try again shortly.'
          : xhr.status === 403
          ? isAdmin
            ? "You don't have permission to upload files to this Google Drive folder."
            : 'Gallery uploads are not open yet or storage is temporarily restricted.'
          : xhr.status >= 500
          ? 'Something went wrong on our end while uploading your files. Please try again in a moment.'
          : `Upload could not be completed (${xhr.status}). Please check your selected files and try again.`;

      const singleResult: UploadFileResult =
        Array.isArray(body.results) && body.results[0]
          ? body.results[0]
          : {
              clientFileId: entry.id,
              originalName: entry.file.name,
              status: 'failed',
              errorCode: body.code || (xhr.status >= 500 ? 'SERVER_ERROR' : 'VALIDATION_ERROR'),
              errorMessage: body.error || fallbackMsg
            };

      resolve({
        uploaded: Array.isArray(body.uploaded) ? body.uploaded : [],
        results: [singleResult],
        summary: {
          total: 1,
          succeeded: singleResult.status === 'uploaded' ? 1 : 0,
          failed: singleResult.status === 'uploaded' ? 0 : 1
        },
        error: xhr.status >= 200 && xhr.status < 300 ? body.error : body.error || fallbackMsg,
        code: body.code,
        needsDriveReconnect: Boolean(
          isAdmin &&
            (body.needsDriveReconnect ||
              xhr.status === 401 ||
              body.code === 'DRIVE_AUTH_MISSING' ||
              body.code === 'DRIVE_AUTH_EXPIRED' ||
              body.code === 'DRIVE_REFRESH_EXPIRED')
        )
      });
    };

    xhr.onerror = () => {
      const msg = 'Upload interrupted due to a network issue. Check your connection and retry your upload.';
      resolve({
        uploaded: [],
        results: [
          {
            clientFileId: entry.id,
            originalName: entry.file.name,
            status: 'failed',
            errorCode: 'NETWORK_ERROR',
            errorMessage: msg
          }
        ],
        summary: { total: 1, succeeded: 0, failed: 1 },
        error: msg,
        code: 'NETWORK_ERROR',
        needsDriveReconnect: false
      });
    };

    xhr.ontimeout = () => {
      const msg = 'The upload timed out before finishing. Check your connection and retry your upload.';
      resolve({
        uploaded: [],
        results: [
          {
            clientFileId: entry.id,
            originalName: entry.file.name,
            status: 'failed',
            errorCode: 'NETWORK_ERROR',
            errorMessage: msg
          }
        ],
        summary: { total: 1, succeeded: 0, failed: 1 },
        error: msg,
        code: 'NETWORK_ERROR',
        needsDriveReconnect: false
      });
    };

    xhr.send(formData);
  });

  return {
    result: serverResponse.results[0],
    needsDriveReconnect: Boolean(serverResponse.needsDriveReconnect)
  };
}

export async function uploadGalleryMediaFiles(params: {
  entries: Array<{ id: string; file: File }>;
  guestName: string;
  caption: string;
  category?: DriveMediaCategory;
  isAdmin?: boolean;
  onProgress?: (percent: number) => void;
}): Promise<UploadMediaBatchOutcome> {
  const idToken =
    params.isAdmin && auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const driveToken = params.isAdmin ? getDriveAccessToken() : null;

  const totalBatchBytes = Math.max(
    1,
    params.entries.reduce((sum, entry) => sum + Math.max(1, entry.file.size), 0)
  );
  const loadedByFile = new Map<string, number>();

  const updateAggregateProgress = () => {
    if (!params.onProgress) return;
    let totalLoaded = 0;
    for (const v of loadedByFile.values()) {
      totalLoaded += v;
    }
    params.onProgress(Math.min(99, Math.round((totalLoaded / totalBatchBytes) * 100)));
  };

  const finalResults: UploadFileResult[] = [];
  let needsDriveReconnect = false;
  let globalError: string | null = null;

  for (const entry of params.entries) {
    const useResumable =
      isVideoFileClient(entry.file) || entry.file.size > RESUMABLE_THRESHOLD_BYTES;

    const singleOutcome = useResumable
      ? await uploadSingleFileResumable({
          entry,
          category: params.category,
          isAdmin: params.isAdmin,
          idToken,
          driveToken,
          onFileBytesLoaded: (bytes) => {
            loadedByFile.set(entry.id, bytes);
            updateAggregateProgress();
          }
        })
      : await uploadSingleSmallFileMultipart({
          entry,
          category: params.category,
          isAdmin: params.isAdmin,
          idToken,
          driveToken,
          onFileBytesLoaded: (bytes) => {
            loadedByFile.set(entry.id, bytes);
            updateAggregateProgress();
          }
        });

    if (singleOutcome.needsDriveReconnect) {
      needsDriveReconnect = true;
    }
    if (singleOutcome.result.status !== 'uploaded' && !globalError) {
      globalError = singleOutcome.result.errorMessage || null;
    }

    loadedByFile.set(entry.id, entry.file.size);
    finalResults.push(singleOutcome.result);
  }

  if (params.onProgress) {
    params.onProgress(100);
  }

  // Persist Firestore records ONLY for files confirmed created on Google Drive
  const createdItems: GalleryItem[] = [];

  for (let i = 0; i < finalResults.length; i++) {
    const resItem = finalResults[i];
    if (resItem.status !== 'uploaded' || !resItem.item?.driveFileId) {
      continue;
    }

    const uploaded: UploadedFileMetadata = resItem.item;
    const itemId = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const title = (params.caption.trim() || uploaded.originalName || 'Wedding Moment').slice(0, 160);
    const guestName = params.guestName.trim().slice(0, 80);
    const status =
      uploaded.mediaType === 'audio' ? 'hidden' : params.isAdmin ? 'approved' : 'pending';

    try {
      await setDoc(doc(db, 'galleryItems', itemId), {
        title,
        guestName,
        mediaType: uploaded.mediaType,
        mimeType: uploaded.mimeType.slice(0, 80),
        fileUrl: uploaded.fileUrl.slice(0, 500),
        storageProvider: uploaded.storageProvider,
        driveFileId: uploaded.driveFileId.slice(0, 200),
        sizeBytes: Math.max(1, Math.trunc(uploaded.sizeBytes)),
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      createdItems.push({
        id: itemId,
        title,
        guestName,
        mediaType: uploaded.mediaType,
        mimeType: uploaded.mimeType,
        fileUrl: uploaded.fileUrl,
        storageProvider: uploaded.storageProvider,
        driveFileId: uploaded.driveFileId,
        sizeBytes: uploaded.sizeBytes,
        status,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } catch {
      finalResults[i] = {
        clientFileId: resItem.clientFileId,
        originalName: resItem.originalName,
        status: 'failed',
        errorCode: 'SERVER_ERROR',
        errorMessage: `Uploaded ${resItem.originalName} to Drive, but could not save its gallery entry. Please contact the couple.`
      };
      if (!globalError) {
        globalError = finalResults[i].errorMessage || null;
      }
    }
  }

  const succeededCount = createdItems.length;
  const failedCount = Math.max(0, params.entries.length - succeededCount);

  return {
    createdItems,
    results: finalResults,
    summary: {
      total: params.entries.length,
      succeeded: succeededCount,
      failed: failedCount
    },
    needsDriveReconnect,
    globalError: failedCount > 0 ? globalError : null
  };
}

export async function moderateGalleryItem(
  item: GalleryItem,
  nextStatus: 'pending' | 'approved' | 'hidden',
  nextTitle?: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'galleryItems', item.id), {
      title: (nextTitle ?? item.title).trim().slice(0, 160) || 'Wedding Moment',
      guestName: item.guestName.slice(0, 80),
      status: nextStatus,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `galleryItems/${item.id}`);
  }
}

export async function deleteGalleryItem(item: GalleryItem): Promise<void> {
  // Delete underlying stored media on server if applicable
  if (item.storageProvider !== 'site_asset' && item.driveFileId && auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      const driveToken = getDriveAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      };
      if (driveToken) {
        headers['X-Google-Drive-Token'] = driveToken;
      }
      await fetch('/api/gallery/media', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({
          storageProvider: item.storageProvider,
          driveFileId: item.driveFileId
        })
      });
    } catch (err) {
      console.warn('Server file cleanup warning:', err);
    }
  }

  try {
    await deleteDoc(doc(db, 'galleryItems', item.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `galleryItems/${item.id}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Google Drive OAuth Connection Admin Helpers
// ---------------------------------------------------------------------------
async function adminDriveFetch<T>(
  endpoint: string,
  method: 'GET' | 'POST',
  driveAccessToken?: string
): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator sign-in is required.');
  const idToken = await user.getIdToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${idToken}`
  };
  if (driveAccessToken) {
    headers['X-Google-Drive-Token'] = driveAccessToken;
  }

  const res = await fetch(endpoint, { method, headers });
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) {
    if (res.status === 401 && body.code === 'DRIVE_AUTH_EXPIRED') {
      clearExpiredDriveToken();
    }
    throw new Error(body.error || `Drive request failed (${res.status})`);
  }
  return body as T;
}

export function fetchDriveConnectionStatusAdmin(): Promise<DriveConnectionStatus> {
  const token = getDriveAccessToken() || undefined;
  return adminDriveFetch<DriveConnectionStatus>('/api/drive/status', 'GET', token);
}

export function verifyDriveConnectionWithServer(
  driveAccessToken: string
): Promise<DriveConnectionStatus> {
  return adminDriveFetch<DriveConnectionStatus>('/api/drive/verify', 'POST', driveAccessToken);
}

export function initDriveFoldersWithServer(
  driveAccessToken?: string
): Promise<DriveConnectionStatus> {
  return adminDriveFetch<DriveConnectionStatus>('/api/drive/folders/init', 'POST', driveAccessToken);
}

export function testDriveConnectionWithServer(
  driveAccessToken?: string
): Promise<DriveTestConnectionResponse> {
  return adminDriveFetch<DriveTestConnectionResponse>(
    '/api/drive/test',
    'POST',
    driveAccessToken
  );
}

export function testServerRefreshTokenWithServer(): Promise<DriveTestConnectionResponse> {
  return adminDriveFetch<DriveTestConnectionResponse>('/api/drive/test-refresh', 'POST');
}

export function disconnectDriveWithServer(): Promise<DriveConnectionStatus> {
  return adminDriveFetch<DriveConnectionStatus>('/api/drive/disconnect', 'POST');
}

// ---------------------------------------------------------------------------
// 5. Admin Authorization & RBAC Registry
// ---------------------------------------------------------------------------
async function ensureBootstrappedAdminDoc(
  uid: string,
  email: string,
  displayName: string
): Promise<void> {
  try {
    const adminRef = doc(db, 'admins', uid);
    const existing = await getDoc(adminRef);
    if (!existing.exists()) {
      await setDoc(adminRef, {
        uid,
        email: email.slice(0, 160),
        displayName: (displayName || 'Wedding Owner').slice(0, 100),
        addedAt: serverTimestamp(),
        addedBy: uid
      });
    }
  } catch (err) {
    console.warn('Bootstrap admin record check:', err);
  }
}

export async function checkCurrentUserIsAdmin(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return false;

  const isBootstrappedOwner =
    user.uid === BOOTSTRAPPED_ADMIN_UID ||
    (user.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;

  if (isBootstrappedOwner) {
    await ensureBootstrappedAdminDoc(
      user.uid,
      user.email || BOOTSTRAPPED_ADMIN_EMAIL,
      user.displayName || 'Joseph (Wedding Owner)'
    );
    return true;
  }

  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    if (!snap.exists()) return false;

    const idToken = await user.getIdToken();
    const res = await fetch('/api/admin/verify', {
      headers: { Authorization: `Bearer ${idToken}` }
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listAdmins(): Promise<AdminUser[]> {
  try {
    const snap = await getDocs(collection(db, 'admins'));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        email: String(data.email || ''),
        displayName: String(data.displayName || ''),
        addedAt: toJsDate(data.addedAt),
        addedBy: String(data.addedBy || '')
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'admins');
  }
}

export async function addAdminUser(input: {
  uid: string;
  email: string;
  displayName: string;
}): Promise<void> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error('Not authenticated');
  const cleanUid = input.uid.trim();
  if (!/^[a-zA-Z0-9_\-]+$/.test(cleanUid)) {
    throw new Error('Invalid Firebase UID format.');
  }

  try {
    await setDoc(doc(db, 'admins', cleanUid), {
      uid: cleanUid,
      email: input.email.trim().slice(0, 160),
      displayName: input.displayName.trim().slice(0, 100),
      addedAt: serverTimestamp(),
      addedBy: currentUid
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `admins/${cleanUid}`);
  }
}

export async function removeAdminUser(uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'admins', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `admins/${uid}`);
  }
}
