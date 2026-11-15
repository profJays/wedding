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
  DriveMediaCategory
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
            mediaType: (data.mediaType === 'video' ? 'video' : 'image') as 'image' | 'video',
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
        mediaType: data.mediaType === 'video' ? 'video' : 'image',
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

export async function uploadGalleryMediaFiles(params: {
  files: File[];
  guestName: string;
  caption: string;
  category?: DriveMediaCategory;
  isAdmin?: boolean;
  onProgress?: (percent: number) => void;
}): Promise<GalleryItem[]> {
  const formData = new FormData();
  if (params.category) {
    formData.append('category', params.category);
  }
  params.files.forEach((f) => formData.append('files', f));

  const idToken = params.isAdmin && auth.currentUser
    ? await auth.currentUser.getIdToken()
    : null;
  const driveToken = getDriveAccessToken();

  // Use XMLHttpRequest so callers receive real upload progress events
  const serverResponse = await new Promise<{
    uploaded: Array<{
      mediaType: 'image' | 'video';
      mimeType: string;
      fileUrl: string;
      storageProvider: 'google_drive' | 'local_server';
      driveFileId: string;
      sizeBytes: number;
      originalName: string;
    }>;
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/gallery/upload', true);
    if (idToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    }
    if (driveToken) {
      xhr.setRequestHeader('X-Google-Drive-Token', driveToken);
    }
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && params.onProgress) {
        params.onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || '{}') as {
          error?: string;
          code?: string;
          uploaded?: Array<{
            mediaType: 'image' | 'video';
            mimeType: string;
            fileUrl: string;
            storageProvider: 'google_drive' | 'local_server';
            driveFileId: string;
            sizeBytes: number;
            originalName: string;
          }>;
        };
        if (xhr.status >= 200 && xhr.status < 300 && Array.isArray(body.uploaded)) {
          resolve({ uploaded: body.uploaded });
        } else {
          if (xhr.status === 401 && body.code === 'DRIVE_AUTH_EXPIRED') {
            clearExpiredDriveToken();
          }
          reject(new Error(body.error || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during media upload.'));
    xhr.send(formData);
  });

  const createdItems: GalleryItem[] = [];
  for (const uploaded of serverResponse.uploaded) {
    const itemId = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const title = (params.caption.trim() || uploaded.originalName || 'Wedding Moment').slice(0, 160);
    const guestName = params.guestName.trim().slice(0, 80);
    const status = params.isAdmin ? 'approved' : 'pending';

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
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `galleryItems/${itemId}`);
    }
  }

  return createdItems;
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
  return adminDriveFetch<DriveConnectionStatus>('/api/drive/status', 'GET');
}

export function verifyDriveConnectionWithServer(
  driveAccessToken: string
): Promise<DriveConnectionStatus> {
  return adminDriveFetch<DriveConnectionStatus>('/api/drive/verify', 'POST', driveAccessToken);
}

export function initDriveFoldersWithServer(
  driveAccessToken: string
): Promise<DriveConnectionStatus> {
  return adminDriveFetch<DriveConnectionStatus>('/api/drive/folders/init', 'POST', driveAccessToken);
}

export function testDriveConnectionWithServer(
  driveAccessToken: string
): Promise<{ ok: boolean; driveStatus: DriveConnectionStatus }> {
  return adminDriveFetch<{ ok: boolean; driveStatus: DriveConnectionStatus }>(
    '/api/drive/test',
    'POST',
    driveAccessToken
  );
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
