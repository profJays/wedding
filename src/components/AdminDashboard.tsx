import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LayoutDashboard,
  FileEdit,
  Users,
  Images,
  Settings,
  LogOut,
  ArrowLeft,
  Download,
  Trash2,
  Edit3,
  Check,
  X,
  Plus,
  Upload,
  CheckCircle2,
  AlertCircle,
  EyeOff,
  Loader2,
  ShieldCheck,
  HardDrive,
  Search,
  FolderTree,
  RefreshCw,
  Link2,
  Unlink,
  RotateCcw,
  Info
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  signInAdminWithGoogle,
  signOutAdmin
} from '../services/firebase';
import {
  connectGoogleDrive,
  getDriveAccessToken,
  disconnectGoogleDrive
} from '../services/driveOAuth';
import {
  saveSiteContent,
  listAllRsvps,
  updateRsvpRecord,
  deleteRsvpRecord,
  exportRsvpsToCsv,
  fetchGalleryServerStatus,
  fetchDriveConnectionStatusAdmin,
  verifyDriveConnectionWithServer,
  initDriveFoldersWithServer,
  testDriveConnectionWithServer,
  disconnectDriveWithServer,
  listAllGalleryItemsAdmin,
  uploadGalleryMediaFiles,
  moderateGalleryItem,
  deleteGalleryItem,
  listAdmins,
  addAdminUser,
  removeAdminUser
} from '../services/weddingRepository';
import { WEDDING_PHOTOS } from '../data/weddingSite';
import {
  SiteContentData,
  RsvpRecord,
  GalleryItem,
  AdminUser,
  GalleryServerStatus,
  DriveConnectionStatus,
  DriveMediaCategory,
  CoupleQAItem,
  WeddingScheduleEvent,
  GuestFAQItem
} from '../types';
import {
  FILE_INPUT_ACCEPT,
  MAX_BATCH_FILES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  SelectedUploadEntry,
  createSelectedUploadEntry,
  formatFileSize,
  validateUploadEntries
} from '../utils/uploadValidation';

interface AdminDashboardProps {
  siteContent: SiteContentData;
  currentUser: User | null;
  isAuthorizedAdmin: boolean;
  authLoading: boolean;
  onReturnToWebsite: () => void;
}

type AdminTab = 'overview' | 'content' | 'rsvps' | 'gallery' | 'settings';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  siteContent,
  currentUser,
  isAuthorizedAdmin,
  authLoading,
  onReturnToWebsite
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  // Admin data states
  const [rsvps, setRsvps] = useState<RsvpRecord[]>([]);
  const [rsvpLoadError, setRsvpLoadError] = useState<string | null>(null);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [serverStatus, setServerStatus] = useState<GalleryServerStatus | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveConnectionStatus | null>(null);
  const [hasBrowserDriveToken, setHasBrowserDriveToken] = useState<boolean>(() =>
    Boolean(getDriveAccessToken())
  );
  const [driveActionBusy, setDriveActionBusy] = useState<boolean>(false);
  const [loadingData, setLoadingData] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Draft siteContent for editing in Content / Settings tabs
  const [draftContent, setDraftContent] = useState<SiteContentData>(siteContent);
  const [savingContent, setSavingContent] = useState(false);

  // RSVP Filters & Edit
  const [rsvpSearch, setRsvpSearch] = useState('');
  const [rsvpFilter, setRsvpFilter] = useState<'all' | 'attending' | 'declined'>('all');
  const [editingRsvpId, setEditingRsvpId] = useState<string | null>(null);
  const [editRsvpDraft, setEditRsvpDraft] = useState({
    fullName: '',
    attending: true,
    guestCount: 1,
    message: ''
  });
  const [confirmDeleteRsvpId, setConfirmDeleteRsvpId] = useState<string | null>(null);

  // Gallery Filter, Edit & Admin Upload
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'pending' | 'approved' | 'hidden'>('all');
  const [editingMediaId, setEditingMediaId] = useState<string | null>(null);
  const [editingMediaTitle, setEditingMediaTitle] = useState('');
  const [confirmDeleteMediaId, setConfirmDeleteMediaId] = useState<string | null>(null);
  const [adminUploadCategory, setAdminUploadCategory] = useState<DriveMediaCategory>('admin_media');
  const [adminUploadCaption, setAdminUploadCaption] = useState('');
  const [adminUploadEntries, setAdminUploadEntries] = useState<SelectedUploadEntry[]>([]);
  const [adminUploading, setAdminUploading] = useState(false);
  const [adminUploadProgress, setAdminUploadProgress] = useState(0);
  const [adminUploadError, setAdminUploadError] = useState<string | null>(null);
  const [adminBatchSummaryNotice, setAdminBatchSummaryNotice] = useState<string | null>(null);
  const [adminNeedsDriveReconnect, setAdminNeedsDriveReconnect] = useState(false);
  const adminFileInputRef = useRef<HTMLInputElement>(null);

  // Add Admin form
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');

  useEffect(() => {
    setDraftContent(siteContent);
  }, [siteContent]);

  const loadAllAdminData = async () => {
    if (!isAuthorizedAdmin) return;
    setLoadingData(true);
    setRsvpLoadError(null);
    try {
      const [rsvpResult, mediaResult, adminResult, statusResult, driveResult] = await Promise.allSettled([
        listAllRsvps(),
        listAllGalleryItemsAdmin(),
        listAdmins(),
        fetchGalleryServerStatus(),
        fetchDriveConnectionStatusAdmin()
      ]);

      if (rsvpResult.status === 'fulfilled') {
        setRsvps(rsvpResult.value);
      } else {
        const msg = rsvpResult.reason instanceof Error ? rsvpResult.reason.message : 'Unable to load RSVP records.';
        setRsvpLoadError(msg);
      }

      if (mediaResult.status === 'fulfilled') {
        setGalleryItems(mediaResult.value);
      }
      if (adminResult.status === 'fulfilled') {
        setAdmins(adminResult.value);
      }
      if (statusResult.status === 'fulfilled') {
        setServerStatus(statusResult.value);
        if (driveResult.status !== 'fulfilled') {
          setDriveStatus(statusResult.value.driveStatus);
        }
      }
      if (driveResult.status === 'fulfilled') {
        setDriveStatus(driveResult.value);
      }
      setHasBrowserDriveToken(Boolean(getDriveAccessToken()));
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to load dashboard records.'
      });
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAuthorizedAdmin) {
      void loadAllAdminData();
    }
  }, [isAuthorizedAdmin]);

  const handleConnectGoogleDrive = async () => {
    setDriveActionBusy(true);
    setBannerMessage(null);
    try {
      const { accessToken, email } = await connectGoogleDrive();
      setHasBrowserDriveToken(true);
      const nextStatus = await verifyDriveConnectionWithServer(accessToken);
      setDriveStatus(nextStatus);
      setAdminNeedsDriveReconnect(false);
      setBannerMessage({
        type: 'success',
        text: `Google Drive connected as ${nextStatus.connectedEmail || email} (Folder: "${nextStatus.folderName}").`
      });
    } catch (err) {
      setHasBrowserDriveToken(Boolean(getDriveAccessToken()));
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to connect Google Drive.'
      });
    } finally {
      setDriveActionBusy(false);
    }
  };

  const handleInitDriveFolders = async () => {
    setDriveActionBusy(true);
    setBannerMessage(null);
    try {
      let token = getDriveAccessToken();
      if (!token) {
        const connected = await connectGoogleDrive();
        token = connected.accessToken;
        setHasBrowserDriveToken(true);
      }
      const nextStatus = await initDriveFoldersWithServer(token);
      setDriveStatus(nextStatus);
      setBannerMessage({
        type: 'success',
        text: 'Wedding Google Drive folder structure ("Mary and Joseph Wedding") verified and initialized.'
      });
    } catch (err) {
      setHasBrowserDriveToken(Boolean(getDriveAccessToken()));
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to initialize Drive folders.'
      });
    } finally {
      setDriveActionBusy(false);
    }
  };

  const handleTestDriveConnection = async () => {
    setDriveActionBusy(true);
    setBannerMessage(null);
    try {
      let token = getDriveAccessToken();
      if (!token) {
        const connected = await connectGoogleDrive();
        token = connected.accessToken;
        setHasBrowserDriveToken(true);
      }
      const res = await testDriveConnectionWithServer(token);
      setDriveStatus(res.driveStatus);
      setBannerMessage({
        type: 'success',
        text: `Drive connection verified! Upload target "${res.driveStatus.folderName}" is ready.`
      });
    } catch (err) {
      setHasBrowserDriveToken(Boolean(getDriveAccessToken()));
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Google Drive connection test failed.'
      });
    } finally {
      setDriveActionBusy(false);
    }
  };

  const handleDisconnectGoogleDrive = async () => {
    setDriveActionBusy(true);
    setBannerMessage(null);
    try {
      await disconnectGoogleDrive();
      setHasBrowserDriveToken(false);
      const nextStatus = await disconnectDriveWithServer();
      setDriveStatus(nextStatus);
      setBannerMessage({
        type: 'success',
        text: 'Google Drive session disconnected.'
      });
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to disconnect Google Drive.'
      });
    } finally {
      setDriveActionBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSignInError(null);
    setSigningIn(true);
    try {
      await signInAdminWithGoogle();
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : 'Google Sign-In did not complete.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSaveSiteContent = async (next: SiteContentData) => {
    setSavingContent(true);
    setBannerMessage(null);
    try {
      await saveSiteContent(next);
      setBannerMessage({
        type: 'success',
        text: 'Website changes saved and published live.'
      });
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not save website changes.'
      });
    } finally {
      setSavingContent(false);
    }
  };

  // KPI Metrics
  const rsvpMetrics = useMemo(() => {
    const attendingRecords = rsvps.filter((r) => r.attending);
    const declinedRecords = rsvps.filter((r) => !r.attending);
    const totalConfirmedGuests = attendingRecords.reduce((acc, r) => acc + (r.guestCount || 1), 0);
    return {
      totalRsvps: rsvps.length,
      attendingCount: attendingRecords.length,
      totalConfirmedGuests,
      declinedCount: declinedRecords.length
    };
  }, [rsvps]);

  const galleryMetrics = useMemo(() => {
    const photos = galleryItems.filter((i) => i.mediaType === 'image').length;
    const videos = galleryItems.filter((i) => i.mediaType === 'video').length;
    const pending = galleryItems.filter((i) => i.status === 'pending').length;
    return { photos, videos, pending };
  }, [galleryItems]);

  const filteredRsvps = useMemo(() => {
    const q = rsvpSearch.trim().toLowerCase();
    return rsvps.filter((r) => {
      if (rsvpFilter === 'attending' && !r.attending) return false;
      if (rsvpFilter === 'declined' && r.attending) return false;
      if (!q) return true;
      return (
        r.fullName.toLowerCase().includes(q) ||
        r.message.toLowerCase().includes(q)
      );
    });
  }, [rsvps, rsvpSearch, rsvpFilter]);

  const filteredGallery = useMemo(() => {
    if (galleryFilter === 'all') return galleryItems;
    return galleryItems.filter((item) => item.status === galleryFilter);
  }, [galleryItems, galleryFilter]);

  const adminLimits = useMemo(
    () => ({
      maxBatchFiles: serverStatus?.limits.maxBatchFiles || MAX_BATCH_FILES,
      maxImageBytes: serverStatus?.limits.maxImageBytes || MAX_IMAGE_BYTES,
      maxVideoBytes: serverStatus?.limits.maxVideoBytes || MAX_VIDEO_BYTES
    }),
    [serverStatus]
  );

  const adminValidationReport = useMemo(
    () => validateUploadEntries(adminUploadEntries, adminLimits),
    [adminUploadEntries, adminLimits]
  );

  const adminFailedEntries = useMemo(
    () => adminValidationReport.entries.filter((entry) => entry.uploadStatus === 'failed'),
    [adminValidationReport.entries]
  );

  // -------------------------------------------------------------------------
  // Gate 1: Auth Loading
  // -------------------------------------------------------------------------
  if (authLoading) {
    return (
      <div className="w-full max-w-md mx-auto py-20 px-4 text-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#07543E] mx-auto mb-3" />
        <p className="text-sm text-[#262820]/75">Verifying administrator access...</p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Gate 2: Not Signed In -> Official Google Sign-In
  // -------------------------------------------------------------------------
  if (!currentUser) {
    return (
      <div className="w-full max-w-md mx-auto py-12 sm:py-20 px-4">
        <div className="p-7 sm:p-10 rounded-xl bg-[#FFFDF8] border border-[#C5A04A]/40 shadow-md text-center space-y-6">
          <div className="w-12 h-12 mx-auto rounded-full bg-[#07543E]/10 text-[#07543E] flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#737746] font-semibold mb-1">
              {siteContent.hashtag} · Couple Portal
            </p>
            <h1 className="font-serif text-3xl font-semibold text-[#07543E]">
              Admin Dashboard
            </h1>
            <p className="text-sm text-[#262820]/75 mt-2 leading-relaxed">
              Sign in with an authorized Google account to manage website content, RSVPs, and wedding gallery uploads.
            </p>
          </div>

          {signInError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900">
              {signInError}
            </div>
          )}

          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="gsi-material-button"
            >
              <div className="gsi-material-button-content-wrapper">
                <svg className="gsi-material-button-icon" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span>{signingIn ? 'Signing in...' : 'Sign in with Google'}</span>
              </div>
            </button>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={onReturnToWebsite}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#07543E] hover:underline underline-offset-4 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Wedding Website</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Gate 3: Signed In, Not Authorized Admin
  // -------------------------------------------------------------------------
  if (!isAuthorizedAdmin) {
    return (
      <div className="w-full max-w-md mx-auto py-12 sm:py-20 px-4">
        <div className="p-7 sm:p-10 rounded-xl bg-[#FFFDF8] border border-red-200 shadow-md text-center space-y-5">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-50 text-red-700 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-[#262820]">
            Administrator Access Required
          </h1>
          <p className="text-sm text-[#262820]/75 leading-relaxed">
            Signed in as <strong>{currentUser.email}</strong>. This account does not have couple administrator permissions for {siteContent.coupleNames}.
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
            <button
              type="button"
              onClick={() => void signOutAdmin()}
              className="px-4 py-2.5 rounded-lg border border-[#07543E]/25 text-xs font-semibold uppercase tracking-wider text-[#07543E] hover:bg-[#FAF7F0] cursor-pointer"
            >
              Sign Out &amp; Switch Account
            </button>
            <button
              type="button"
              onClick={onReturnToWebsite}
              className="px-4 py-2.5 rounded-lg bg-[#07543E] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#073B2B] cursor-pointer"
            >
              Back to Website
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main Authenticated Admin Dashboard
  // -------------------------------------------------------------------------
  const handleAdminFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (adminUploading) return;
    setAdminUploadError(null);
    setAdminBatchSummaryNotice(null);
    setBannerMessage(null);

    const incoming = Array.from(e.target.files || []);
    if (incoming.length === 0) return;

    setAdminUploadEntries((prev) => {
      const existing = new Set(
        prev.map((item) => `${item.file.name}::${item.file.size}::${item.file.lastModified}`)
      );
      const additions = incoming
        .filter(
          (file) => !existing.has(`${file.name}::${file.size}::${file.lastModified}`)
        )
        .map((file) => createSelectedUploadEntry(file, adminLimits));
      return [...prev, ...additions];
    });

    if (adminFileInputRef.current) {
      adminFileInputRef.current.value = '';
    }
  };

  const handleRemoveAdminFile = (id: string) => {
    if (adminUploading) return;
    setAdminUploadEntries((prev) => prev.filter((item) => item.id !== id));
    setAdminUploadError(null);
    setAdminBatchSummaryNotice(null);
  };

  const handleClearAdminFiles = () => {
    if (adminUploading) return;
    setAdminUploadEntries([]);
    setAdminUploadError(null);
    setAdminBatchSummaryNotice(null);
    if (adminFileInputRef.current) adminFileInputRef.current.value = '';
  };

  const executeAdminUploadBatch = async (entriesToSend: SelectedUploadEntry[]) => {
    if (adminUploading || entriesToSend.length === 0) return;

    const report = validateUploadEntries(entriesToSend, adminLimits);
    if (report.hasErrors) {
      setAdminUploadError('Please remove or fix the invalid files listed below before uploading.');
      return;
    }

    const sendIds = new Set(entriesToSend.map((entry) => entry.id));
    setAdminUploading(true);
    setAdminUploadProgress(0);
    setAdminUploadError(null);
    setAdminBatchSummaryNotice(null);
    setBannerMessage(null);

    setAdminUploadEntries((prev) =>
      prev.map((entry) =>
        sendIds.has(entry.id)
          ? { ...entry, uploadStatus: 'uploading', uploadError: null }
          : entry
      )
    );

    try {
      const outcome = await uploadGalleryMediaFiles({
        entries: entriesToSend.map((entry) => ({ id: entry.id, file: entry.file })),
        guestName: siteContent.coupleNames,
        caption: adminUploadCaption,
        category: adminUploadCategory,
        isAdmin: true,
        onProgress: setAdminUploadProgress
      });

      setHasBrowserDriveToken(Boolean(getDriveAccessToken()));
      if (outcome.needsDriveReconnect) {
        setAdminNeedsDriveReconnect(true);
      }

      const resultById = new Map(outcome.results.map((r) => [r.clientFileId, r]));

      if (outcome.summary.failed === 0 && outcome.summary.succeeded > 0) {
        setAdminUploadEntries((prev) => prev.filter((entry) => !sendIds.has(entry.id)));
        setAdminUploadCaption('');
        setAdminNeedsDriveReconnect(false);
        if (adminFileInputRef.current) adminFileInputRef.current.value = '';
        await loadAllAdminData();
        setBannerMessage({
          type: 'success',
          text: `${outcome.summary.succeeded} ${
            outcome.summary.succeeded === 1 ? 'file' : 'files'
          } uploaded to Google Drive and published to the approved gallery.`
        });
      } else if (outcome.summary.succeeded > 0 && outcome.summary.failed > 0) {
        // Remove already-uploaded items so retrying never creates duplicate Drive/Firestore entries
        setAdminUploadEntries((prev) =>
          prev
            .filter((entry) => {
              const res = resultById.get(entry.id);
              return !(res && res.status === 'uploaded');
            })
            .map((entry) => {
              const res = resultById.get(entry.id);
              if (!res) return entry;
              return {
                ...entry,
                uploadStatus: 'failed',
                uploadError: res.errorMessage || outcome.globalError || 'Upload failed.'
              };
            })
        );
        await loadAllAdminData();
        setAdminBatchSummaryNotice(
          `${outcome.summary.total} files selected. ${outcome.summary.succeeded} uploaded successfully. ${outcome.summary.failed} failed.`
        );
        setAdminUploadError(
          outcome.globalError ||
            'Some files failed to upload. Review the file errors below and click "Retry Failed Files Only".'
        );
      } else {
        setAdminUploadEntries((prev) =>
          prev.map((entry) => {
            const res = resultById.get(entry.id);
            if (!res) return entry;
            return {
              ...entry,
              uploadStatus: 'failed',
              uploadError: res.errorMessage || outcome.globalError || 'Upload failed.'
            };
          })
        );
        setAdminUploadError(
          outcome.globalError || 'Admin upload failed. Review the details below and try again.'
        );
      }
    } catch (err) {
      setHasBrowserDriveToken(Boolean(getDriveAccessToken()));
      const msg = err instanceof Error ? err.message : 'Admin upload failed.';
      setAdminUploadEntries((prev) =>
        prev.map((entry) =>
          sendIds.has(entry.id)
            ? { ...entry, uploadStatus: 'failed', uploadError: msg }
            : entry
        )
      );
      setAdminUploadError(msg);
    } finally {
      setAdminUploading(false);
    }
  };

  const handleAdminUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeAdminUploadBatch(adminValidationReport.entries);
  };

  const handleAdminRetryFailedOnly = async () => {
    if (adminFailedEntries.length === 0) return;
    await executeAdminUploadBatch(adminFailedEntries);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-3.5 min-[360px]:px-4 sm:px-6 py-6 sm:py-12">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-[#07543E]/15">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-[#737746] font-semibold">
            {siteContent.coupleNames} · {siteContent.hashtag}
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#07543E] leading-tight">
            Couple Admin Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-[#262820]/70 mt-1 break-all">
            Signed in as {currentUser.email}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onReturnToWebsite}
            className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg border border-[#07543E]/25 bg-white hover:bg-[#FAF7F0] text-xs sm:text-sm font-semibold text-[#07543E] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>View Live Site</span>
          </button>
          <button
            type="button"
            onClick={() => void signOutAdmin()}
            className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg border border-red-200 bg-white hover:bg-red-50 text-xs sm:text-sm font-semibold text-red-700 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs (Horizontally scrollable on narrow mobile phones, wrapped on tablet/desktop) */}
      <div
        role="tablist"
        aria-label="Admin dashboard sections"
        className="flex overflow-x-auto sm:flex-wrap gap-2 pb-4 mb-6 border-b border-[#07543E]/10"
      >
        {[
          { id: 'overview', label: 'Overview', icon: LayoutDashboard },
          { id: 'content', label: 'Website Content', icon: FileEdit },
          { id: 'rsvps', label: `RSVPs (${rsvpMetrics.totalRsvps})`, icon: Users },
          { id: 'gallery', label: `Gallery (${galleryItems.length})`, icon: Images },
          { id: 'settings', label: 'Site Settings', icon: Settings }
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={`inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#07543E] text-white'
                  : 'bg-[#FFFDF8] border border-[#07543E]/15 text-[#262820] hover:border-[#C5A04A]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Status Banner */}
      {bannerMessage && (
        <div
          role="status"
          className={`mb-6 p-4 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 ${
            bannerMessage.type === 'success'
              ? 'bg-[#07543E]/8 border-[#07543E]/25 text-[#07543E]'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{bannerMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            aria-label="Dismiss notice"
            className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loadingData && (
        <div className="mb-6 flex items-center gap-2 text-xs text-[#07543E]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Refreshing records...</span>
        </div>
      )}

      {/* ====================================================================
          TAB 1: OVERVIEW
      ==================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 sm:p-5 rounded-xl bg-[#FFFDF8] border border-[#07543E]/12">
              <p className="text-xs uppercase tracking-wider text-[#737746] font-semibold">
                Total RSVPs
              </p>
              <p className="font-serif text-3xl sm:text-4xl font-semibold text-[#07543E] mt-1 tabular-nums">
                {rsvpMetrics.totalRsvps}
              </p>
              <p className="text-xs text-[#262820]/70 mt-1">
                {rsvpMetrics.attendingCount} attending · {rsvpMetrics.declinedCount} declined
              </p>
            </div>

            <div className="p-4 sm:p-5 rounded-xl bg-[#FFFDF8] border border-[#07543E]/12">
              <p className="text-xs uppercase tracking-wider text-[#737746] font-semibold">
                Confirmed Guests
              </p>
              <p className="font-serif text-3xl sm:text-4xl font-semibold text-[#07543E] mt-1 tabular-nums">
                {rsvpMetrics.totalConfirmedGuests}
              </p>
              <p className="text-xs text-[#262820]/70 mt-1">Total headcount attending</p>
            </div>

            <div className="p-4 sm:p-5 rounded-xl bg-[#FFFDF8] border border-[#07543E]/12">
              <p className="text-xs uppercase tracking-wider text-[#737746] font-semibold">
                Uploaded Media
              </p>
              <p className="font-serif text-3xl sm:text-4xl font-semibold text-[#07543E] mt-1 tabular-nums">
                {galleryMetrics.photos + galleryMetrics.videos}
              </p>
              <p className="text-xs text-[#262820]/70 mt-1">
                {galleryMetrics.photos} photos · {galleryMetrics.videos} videos
              </p>
            </div>

            <div className="p-4 sm:p-5 rounded-xl bg-[#FFFDF8] border border-[#07543E]/12">
              <p className="text-xs uppercase tracking-wider text-[#737746] font-semibold">
                Pending Moderation
              </p>
              <p className="font-serif text-3xl sm:text-4xl font-semibold text-[#C5A04A] mt-1 tabular-nums">
                {galleryMetrics.pending}
              </p>
              <p className="text-xs text-[#262820]/70 mt-1">Awaiting couple approval</p>
            </div>
          </div>

          {/* Google Drive OAuth 2.0 Connection Panel */}
          <div className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <HardDrive className="w-5 h-5 text-[#07543E] mt-0.5 shrink-0" />
                <div>
                  <h2 className="font-serif text-xl sm:text-2xl font-semibold text-[#07543E]">
                    Google Drive OAuth 2.0 Storage Connection
                  </h2>
                  {serverStatus && (
                    <p className="text-xs sm:text-sm text-[#262820]/70 mt-0.5">
                      Server Time: {serverStatus.serverTimeLagosFormatted} ({serverStatus.timezone})
                    </p>
                  )}
                </div>
              </div>

              <span
                className={`self-start px-3 py-1.5 rounded-md text-xs font-semibold ${
                  !driveStatus?.configuredFolderId
                    ? 'bg-red-100 text-red-900'
                    : driveStatus.lastError &&
                      (driveStatus.lastError.toLowerCase().includes('revoked') ||
                        driveStatus.lastError.toLowerCase().includes('expired'))
                    ? 'bg-red-100 text-red-900'
                    : hasBrowserDriveToken && driveStatus.oauthConnected
                    ? 'bg-[#07543E] text-white'
                    : driveStatus.serverRefreshConfigured
                    ? 'bg-[#07543E] text-white'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {!driveStatus?.configuredFolderId
                  ? 'Missing GOOGLE_DRIVE_FOLDER_ID'
                  : driveStatus.lastError &&
                    (driveStatus.lastError.toLowerCase().includes('revoked') ||
                      driveStatus.lastError.toLowerCase().includes('expired'))
                  ? 'Reconnect Required'
                  : hasBrowserDriveToken && driveStatus.oauthConnected
                  ? 'Connected (Active OAuth Session)'
                  : driveStatus.serverRefreshConfigured
                  ? 'Connected (Server Refresh Token)'
                  : driveStatus.oauthConnected
                  ? 'Session Expired — Reconnect'
                  : 'Not Connected'}
              </span>
            </div>

            {!driveStatus?.configuredFolderId && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900 leading-relaxed">
                <strong>Missing Configuration:</strong> <code className="font-mono">GOOGLE_DRIVE_FOLDER_ID</code> is not set in the server environment secrets. Configure the target Google Drive folder ID owned by <code className="font-mono">joepreserve@gmail.com</code> in Secrets and restart the server.
              </div>
            )}

            {(driveStatus?.lastError || adminNeedsDriveReconnect) && (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 leading-relaxed">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    {driveStatus?.lastError ||
                      'Your Google Drive OAuth session needs to be reconnected before uploading files.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleConnectGoogleDrive()}
                  disabled={driveActionBusy || !driveStatus?.configuredFolderId}
                  className="shrink-0 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-50 text-white text-xs font-semibold uppercase tracking-wider cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5 text-[#C5A04A]" />
                  <span>Reconnect Google Drive</span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs sm:text-sm">
              <div className="p-3.5 rounded-lg bg-white border border-[#07543E]/12 min-w-0">
                <p className="text-xs uppercase tracking-wider text-[#737746] font-semibold">
                  Connected Account
                </p>
                <p className="font-semibold text-[#07543E] mt-1 break-all">
                  {driveStatus?.connectedEmail || 'Not authorized in this browser'}
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-white border border-[#07543E]/12 min-w-0">
                <p className="text-xs uppercase tracking-wider text-[#737746] font-semibold">
                  Target Drive Folder
                </p>
                <p className="font-semibold text-[#07543E] mt-1 truncate">
                  {driveStatus?.folderName || 'Pending verification'}
                </p>
                <p className="font-mono text-xs text-[#262820]/60 truncate">
                  {driveStatus?.folderIdPreview || '—'}
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-white border border-[#07543E]/12 min-w-0">
                <p className="text-xs uppercase tracking-wider text-[#737746] font-semibold">
                  Folder Hierarchy
                </p>
                <p className="font-semibold text-[#07543E] mt-1">
                  {driveStatus?.subfoldersInitialized ? 'Initialized (Ready)' : 'Not initialized yet'}
                </p>
                <p className="text-xs text-[#262820]/65 truncate">
                  Website · Guest Uploads · Admin Media
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-white border border-[#07543E]/12 min-w-0">
                <p className="text-xs uppercase tracking-wider text-[#737746] font-semibold">
                  Last Upload
                </p>
                <p className="font-semibold text-[#07543E] mt-1">
                  {driveStatus?.lastUploadAt
                    ? new Intl.DateTimeFormat('en-GB', {
                        timeZone: 'Africa/Lagos',
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      }).format(new Date(driveStatus.lastUploadAt))
                    : 'No uploads yet'}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void handleConnectGoogleDrive()}
                disabled={driveActionBusy || !driveStatus?.configuredFolderId}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-50 text-white text-xs font-semibold uppercase tracking-wider cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5 text-[#C5A04A]" />
                <span>
                  {hasBrowserDriveToken && driveStatus?.oauthConnected
                    ? 'Reconnect Google Drive'
                    : 'Connect Google Drive'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleInitDriveFolders()}
                disabled={driveActionBusy || !driveStatus?.configuredFolderId}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg border border-[#07543E]/25 bg-white hover:bg-[#FAF7F0] disabled:opacity-50 text-[#07543E] text-xs font-semibold uppercase tracking-wider cursor-pointer"
              >
                <FolderTree className="w-3.5 h-3.5" />
                <span>Initialize Folder Structure</span>
              </button>

              <button
                type="button"
                onClick={() => void handleTestDriveConnection()}
                disabled={driveActionBusy || !driveStatus?.configuredFolderId}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg border border-[#07543E]/25 bg-white hover:bg-[#FAF7F0] disabled:opacity-50 text-[#07543E] text-xs font-semibold uppercase tracking-wider cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${driveActionBusy ? 'animate-spin' : ''}`} />
                <span>Test Connection</span>
              </button>

              {(hasBrowserDriveToken || driveStatus?.oauthConnected) && (
                <button
                  type="button"
                  onClick={() => void handleDisconnectGoogleDrive()}
                  disabled={driveActionBusy}
                  className="w-full sm:w-auto sm:ml-auto inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg border border-red-200 bg-white hover:bg-red-50 disabled:opacity-50 text-red-700 text-xs font-semibold uppercase tracking-wider cursor-pointer"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Disconnect Google Drive</span>
                </button>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/12 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl font-semibold text-[#07543E]">
                  Recent RSVPs
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('rsvps')}
                  className="text-xs font-semibold text-[#07543E] hover:underline cursor-pointer"
                >
                  Manage All
                </button>
              </div>
              {rsvps.length === 0 ? (
                <p className="text-xs text-[#262820]/60 py-4">No RSVP responses recorded yet.</p>
              ) : (
                <ul className="divide-y divide-[#07543E]/10 text-sm">
                  {rsvps.slice(0, 5).map((r) => (
                    <li key={r.id} className="py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#262820] truncate">{r.fullName}</p>
                        {r.message && (
                          <p className="text-xs text-[#262820]/65 truncate mt-0.5">{r.message}</p>
                        )}
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          r.attending ? 'text-[#07543E]' : 'text-[#262820]/55'
                        }`}
                      >
                        {r.attending ? `Attending (${r.guestCount})` : 'Declined'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/12 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl font-semibold text-[#07543E]">
                  Recent Gallery Submissions
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('gallery')}
                  className="text-xs font-semibold text-[#07543E] hover:underline cursor-pointer"
                >
                  Open Gallery
                </button>
              </div>
              {galleryItems.length === 0 ? (
                <p className="text-xs text-[#262820]/60 py-4">No photos or videos uploaded yet.</p>
              ) : (
                <ul className="divide-y divide-[#07543E]/10 text-sm">
                  {galleryItems.slice(0, 5).map((item) => (
                    <li key={item.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#262820] truncate">{item.title}</p>
                        <p className="text-xs text-[#262820]/65">
                          {item.mediaType.toUpperCase()} · {item.guestName || 'Guest'}
                        </p>
                      </div>
                      <span className="text-xs font-mono uppercase text-[#737746] shrink-0">
                        {item.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 2: WEBSITE CONTENT EDITOR
      ==================================================================== */}
      {activeTab === 'content' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSaveSiteContent(draftContent);
          }}
          className="space-y-8"
        >
          {/* Welcome Editor */}
          <section className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-4">
            <h2 className="font-serif text-2xl font-semibold text-[#07543E]">
              Welcome Message
            </h2>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                Welcome Heading
              </label>
              <input
                type="text"
                value={draftContent.welcomeHeading}
                onChange={(e) =>
                  setDraftContent((d) => ({ ...d, welcomeHeading: e.target.value }))
                }
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#07543E]">
                  Welcome Paragraphs
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraftContent((d) => ({
                      ...d,
                      welcomeParagraphs: [...d.welcomeParagraphs, '']
                    }))
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#07543E] hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Paragraph
                </button>
              </div>
              {draftContent.welcomeParagraphs.map((para, idx) => (
                <div key={idx} className="flex gap-2">
                  <textarea
                    rows={2}
                    value={para}
                    onChange={(e) => {
                      const next = [...draftContent.welcomeParagraphs];
                      next[idx] = e.target.value;
                      setDraftContent((d) => ({ ...d, welcomeParagraphs: next }));
                    }}
                    className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-[#07543E]/20 bg-white"
                  />
                  {draftContent.welcomeParagraphs.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftContent((d) => ({
                          ...d,
                          welcomeParagraphs: d.welcomeParagraphs.filter((_, i) => i !== idx)
                        }))
                      }
                      aria-label="Remove welcome paragraph"
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg self-start cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                Welcome Sign-Off
              </label>
              <textarea
                rows={2}
                value={draftContent.welcomeSignOff}
                onChange={(e) =>
                  setDraftContent((d) => ({ ...d, welcomeSignOff: e.target.value }))
                }
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-[#07543E]/20 bg-white"
              />
            </div>
          </section>

          {/* Our Story Editor */}
          <section className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-4">
            <h2 className="font-serif text-2xl font-semibold text-[#07543E]">
              Our Story
            </h2>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                Story Heading
              </label>
              <input
                type="text"
                value={draftContent.storyHeading}
                onChange={(e) =>
                  setDraftContent((d) => ({ ...d, storyHeading: e.target.value }))
                }
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#07543E]">
                  Story Paragraphs
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraftContent((d) => ({
                      ...d,
                      storyParagraphs: [...d.storyParagraphs, '']
                    }))
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#07543E] hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Paragraph
                </button>
              </div>
              {draftContent.storyParagraphs.map((para, idx) => (
                <div key={idx} className="flex gap-2">
                  <textarea
                    rows={3}
                    value={para}
                    onChange={(e) => {
                      const next = [...draftContent.storyParagraphs];
                      next[idx] = e.target.value;
                      setDraftContent((d) => ({ ...d, storyParagraphs: next }));
                    }}
                    className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-[#07543E]/20 bg-white"
                  />
                  {draftContent.storyParagraphs.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftContent((d) => ({
                          ...d,
                          storyParagraphs: d.storyParagraphs.filter((_, i) => i !== idx)
                        }))
                      }
                      aria-label="Remove story paragraph"
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg self-start cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Couple Q&As Editor */}
          <section className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-semibold text-[#07543E]">
                Couple Q&amp;As
              </h2>
              <button
                type="button"
                onClick={() => {
                  const newItem: CoupleQAItem = {
                    id: `cqa-${Date.now()}`,
                    question: 'New Couple Question',
                    answer: ''
                  };
                  setDraftContent((d) => ({ ...d, coupleQas: [...d.coupleQas, newItem] }));
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#07543E] hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Couple Q&amp;A
              </button>
            </div>
            <div className="space-y-3">
              {draftContent.coupleQas.map((qa, idx) => (
                <div key={qa.id} className="p-4 rounded-lg border border-[#07543E]/15 bg-white space-y-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={qa.question}
                      onChange={(e) => {
                        const next = [...draftContent.coupleQas];
                        next[idx] = { ...qa, question: e.target.value };
                        setDraftContent((d) => ({ ...d, coupleQas: next }));
                      }}
                      placeholder="Question"
                      className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-[#07543E]/20"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraftContent((d) => ({
                          ...d,
                          coupleQas: d.coupleQas.filter((_, i) => i !== idx)
                        }))
                      }
                      aria-label="Delete couple Q&A"
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={qa.answer}
                    onChange={(e) => {
                      const next = [...draftContent.coupleQas];
                      next[idx] = { ...qa, answer: e.target.value };
                      setDraftContent((d) => ({ ...d, coupleQas: next }));
                    }}
                    placeholder="Answer"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[#07543E]/20"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Schedule Events Editor */}
          <section className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-semibold text-[#07543E]">
                Schedule Events
              </h2>
              <button
                type="button"
                onClick={() => {
                  const newEv: WeddingScheduleEvent = {
                    id: `evt-${Date.now()}`,
                    dayKey: 'dec-12',
                    dayHeading: 'SATURDAY, 12 DECEMBER 2026',
                    dateISO: '2026-12-12',
                    startTime24: '16:00',
                    timeLabel: '16:00',
                    title: 'New Wedding Event',
                    venueName: 'Abuja, Nigeria',
                    venueQuery: 'Abuja, Nigeria',
                    description: ''
                  };
                  setDraftContent((d) => ({
                    ...d,
                    scheduleEvents: [...d.scheduleEvents, newEv]
                  }));
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#07543E] hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Event
              </button>
            </div>

            <div className="space-y-4">
              {draftContent.scheduleEvents.map((ev, idx) => (
                <div key={ev.id} className="p-4 sm:p-5 rounded-lg border border-[#07543E]/15 bg-white space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-[#C5A04A] font-semibold">
                      Event {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftContent((d) => ({
                          ...d,
                          scheduleEvents: d.scheduleEvents.filter((_, i) => i !== idx)
                        }))
                      }
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove Event
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <select
                      value={ev.dayKey}
                      onChange={(e) => {
                        const dayKey = e.target.value as 'dec-11' | 'dec-12';
                        const next = [...draftContent.scheduleEvents];
                        next[idx] = {
                          ...ev,
                          dayKey,
                          dayHeading:
                            dayKey === 'dec-11'
                              ? 'FRIDAY, 11 DECEMBER 2026'
                              : 'SATURDAY, 12 DECEMBER 2026',
                          dateISO: dayKey === 'dec-11' ? '2026-12-11' : '2026-12-12'
                        };
                        setDraftContent((d) => ({ ...d, scheduleEvents: next }));
                      }}
                      className="px-3 py-2 text-sm rounded-lg border border-[#07543E]/20"
                    >
                      <option value="dec-11">Friday, 11 Dec 2026</option>
                      <option value="dec-12">Saturday, 12 Dec 2026</option>
                    </select>

                    <input
                      type="text"
                      value={ev.timeLabel}
                      onChange={(e) => {
                        const next = [...draftContent.scheduleEvents];
                        next[idx] = { ...ev, timeLabel: e.target.value };
                        setDraftContent((d) => ({ ...d, scheduleEvents: next }));
                      }}
                      placeholder="Display time (e.g. 10:00 to 12:00)"
                      className="px-3 py-2 text-sm rounded-lg border border-[#07543E]/20"
                    />

                    <input
                      type="text"
                      value={ev.startTime24}
                      onChange={(e) => {
                        const next = [...draftContent.scheduleEvents];
                        next[idx] = { ...ev, startTime24: e.target.value };
                        setDraftContent((d) => ({ ...d, scheduleEvents: next }));
                      }}
                      placeholder="24h start (HH:mm)"
                      className="px-3 py-2 text-sm rounded-lg border border-[#07543E]/20"
                    />
                  </div>

                  <input
                    type="text"
                    value={ev.title}
                    onChange={(e) => {
                      const next = [...draftContent.scheduleEvents];
                      next[idx] = { ...ev, title: e.target.value };
                      setDraftContent((d) => ({ ...d, scheduleEvents: next }));
                    }}
                    placeholder="Event title"
                    className="w-full px-3 py-2 text-sm font-semibold rounded-lg border border-[#07543E]/20"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={ev.venueName}
                      onChange={(e) => {
                        const next = [...draftContent.scheduleEvents];
                        next[idx] = {
                          ...ev,
                          venueName: e.target.value,
                          venueQuery: e.target.value
                        };
                        setDraftContent((d) => ({ ...d, scheduleEvents: next }));
                      }}
                      placeholder="Venue name & address"
                      className="px-3 py-2 text-sm rounded-lg border border-[#07543E]/20"
                    />

                    <input
                      type="text"
                      value={ev.dressCode || ''}
                      onChange={(e) => {
                        const next = [...draftContent.scheduleEvents];
                        const updated: WeddingScheduleEvent = { ...ev };
                        if (e.target.value.trim()) {
                          updated.dressCode = e.target.value;
                        } else {
                          delete updated.dressCode;
                        }
                        next[idx] = updated;
                        setDraftContent((d) => ({ ...d, scheduleEvents: next }));
                      }}
                      placeholder="Dress code (optional)"
                      className="px-3 py-2 text-sm rounded-lg border border-[#07543E]/20"
                    />
                  </div>

                  <input
                    type="text"
                    value={ev.coloursOfDay || ''}
                    onChange={(e) => {
                      const next = [...draftContent.scheduleEvents];
                      const updated: WeddingScheduleEvent = { ...ev };
                      if (e.target.value.trim()) {
                        updated.coloursOfDay = e.target.value;
                      } else {
                        delete updated.coloursOfDay;
                      }
                      next[idx] = updated;
                      setDraftContent((d) => ({ ...d, scheduleEvents: next }));
                    }}
                    placeholder="Colours of the day (optional)"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[#07543E]/20"
                  />

                  <textarea
                    rows={2}
                    value={ev.description}
                    onChange={(e) => {
                      const next = [...draftContent.scheduleEvents];
                      next[idx] = { ...ev, description: e.target.value };
                      setDraftContent((d) => ({ ...d, scheduleEvents: next }));
                    }}
                    placeholder="Event description"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[#07543E]/20"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Guest FAQs Editor */}
          <section className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-semibold text-[#07543E]">
                Guest Q&amp;As (FAQs)
              </h2>
              <button
                type="button"
                onClick={() => {
                  const newFaq: GuestFAQItem = {
                    id: `faq-${Date.now()}`,
                    question: 'New Guest Question',
                    answer: ''
                  };
                  setDraftContent((d) => ({ ...d, guestFaqs: [...d.guestFaqs, newFaq] }));
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#07543E] hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add FAQ
              </button>
            </div>
            <div className="space-y-3">
              {draftContent.guestFaqs.map((faq, idx) => (
                <div key={faq.id} className="p-4 rounded-lg border border-[#07543E]/15 bg-white space-y-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={faq.question}
                      onChange={(e) => {
                        const next = [...draftContent.guestFaqs];
                        next[idx] = { ...faq, question: e.target.value };
                        setDraftContent((d) => ({ ...d, guestFaqs: next }));
                      }}
                      placeholder="FAQ Question"
                      className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-[#07543E]/20"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraftContent((d) => ({
                          ...d,
                          guestFaqs: d.guestFaqs.filter((_, i) => i !== idx)
                        }))
                      }
                      aria-label="Delete FAQ"
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={faq.answer}
                    onChange={(e) => {
                      const next = [...draftContent.guestFaqs];
                      next[idx] = { ...faq, answer: e.target.value };
                      setDraftContent((d) => ({ ...d, guestFaqs: next }));
                    }}
                    placeholder="FAQ Answer"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[#07543E]/20"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Footer Note */}
          <section className="p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E]">
              Footer Note
            </label>
            <input
              type="text"
              value={draftContent.footerNote}
              onChange={(e) =>
                setDraftContent((d) => ({ ...d, footerNote: e.target.value }))
              }
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
            />
          </section>

          <div className="sticky bottom-4 flex justify-end">
            <button
              type="submit"
              disabled={savingContent}
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-60 text-white text-xs font-bold uppercase tracking-[0.16em] shadow-lg cursor-pointer"
            >
              {savingContent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-[#C5A04A]" />}
              <span>{savingContent ? 'Saving Changes...' : 'Save Website Content'}</span>
            </button>
          </div>
        </form>
      )}

      {/* ====================================================================
          TAB 3: RSVP MANAGEMENT
      ==================================================================== */}
      {activeTab === 'rsvps' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative flex-1 min-w-[200px] w-full sm:max-w-sm">
                <Search className="w-4 h-4 text-[#07543E]/55 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={rsvpSearch}
                  onChange={(e) => setRsvpSearch(e.target.value)}
                  placeholder="Search guest name or note..."
                  className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-base sm:text-sm rounded-lg bg-white border border-[#07543E]/20"
                />
              </div>

              <div className="flex flex-wrap rounded-lg border border-[#07543E]/15 bg-[#FFFDF8] p-1 w-full sm:w-auto">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'attending', label: 'Attending' },
                  { id: 'declined', label: 'Unable to Attend' }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRsvpFilter(f.id as 'all' | 'attending' | 'declined')}
                    className={`px-3 min-h-[40px] flex-1 sm:flex-initial rounded-md text-xs font-semibold cursor-pointer ${
                      rsvpFilter === f.id
                        ? 'bg-[#07543E] text-white'
                        : 'text-[#262820]/70 hover:text-[#07543E]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => exportRsvpsToCsv(filteredRsvps)}
              disabled={filteredRsvps.length === 0}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-50 text-white text-xs font-semibold uppercase tracking-wider cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#C5A04A]" />
              <span>Export CSV</span>
            </button>
          </div>

          {rsvpLoadError && (
            <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{rsvpLoadError}</span>
              </div>
              <button
                type="button"
                onClick={() => void loadAllAdminData()}
                className="px-3 py-1.5 rounded-md bg-red-700 text-white text-xs font-semibold cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          <div className="rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 overflow-hidden">
            {filteredRsvps.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#262820]/65">
                {rsvpLoadError
                  ? 'Could not load RSVP entries. Click Retry above.'
                  : rsvps.length === 0
                  ? 'No RSVP submissions have been recorded yet.'
                  : 'No RSVP entries match your current filter.'}
              </div>
            ) : (
              <div className="divide-y divide-[#07543E]/10">
                {filteredRsvps.map((r) => {
                  const isEditing = editingRsvpId === r.id;
                  const isConfirmDelete = confirmDeleteRsvpId === r.id;

                  return (
                    <div key={r.id} className="p-5 space-y-3">
                      {isEditing ? (
                        <div className="space-y-3 bg-white p-4 rounded-lg border border-[#07543E]/20">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <input
                              type="text"
                              value={editRsvpDraft.fullName}
                              onChange={(e) =>
                                setEditRsvpDraft((d) => ({ ...d, fullName: e.target.value }))
                              }
                              className="px-3 py-2 text-sm rounded-lg border border-[#07543E]/20"
                            />
                            <select
                              value={editRsvpDraft.attending ? 'yes' : 'no'}
                              onChange={(e) => {
                                const attending = e.target.value === 'yes';
                                setEditRsvpDraft((d) => ({
                                  ...d,
                                  attending,
                                  guestCount: attending ? Math.max(1, d.guestCount) : 0
                                }));
                              }}
                              className="px-3 py-2 text-sm rounded-lg border border-[#07543E]/20"
                            >
                              <option value="yes">Attending</option>
                              <option value="no">Unable to attend</option>
                            </select>
                            {editRsvpDraft.attending && (
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={editRsvpDraft.guestCount}
                                onChange={(e) =>
                                  setEditRsvpDraft((d) => ({
                                    ...d,
                                    guestCount: Number(e.target.value)
                                  }))
                                }
                                className="px-3 py-2 text-sm rounded-lg border border-[#07543E]/20"
                              />
                            )}
                          </div>
                          <textarea
                            rows={2}
                            value={editRsvpDraft.message}
                            onChange={(e) =>
                              setEditRsvpDraft((d) => ({ ...d, message: e.target.value }))
                            }
                            placeholder="Guest note"
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[#07543E]/20"
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setEditingRsvpId(null)}
                              className="px-3 py-1.5 text-xs font-semibold text-[#262820]/70 hover:text-[#262820] cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await updateRsvpRecord(r.id, editRsvpDraft);
                                  setEditingRsvpId(null);
                                  await loadAllAdminData();
                                  setBannerMessage({
                                    type: 'success',
                                    text: `Updated RSVP for ${editRsvpDraft.fullName}.`
                                  });
                                } catch (err) {
                                  setBannerMessage({
                                    type: 'error',
                                    text: err instanceof Error ? err.message : 'Update failed.'
                                  });
                                }
                              }}
                              className="px-4 py-1.5 rounded-md bg-[#07543E] text-white text-xs font-semibold cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="font-serif text-xl font-semibold text-[#07543E]">
                                {r.fullName}
                              </span>
                              <span
                                className={`text-xs font-semibold px-2.5 py-0.5 rounded-md ${
                                  r.attending
                                    ? 'bg-[#07543E]/10 text-[#07543E]'
                                    : 'bg-stone-200/70 text-[#262820]/70'
                                }`}
                              >
                                {r.attending
                                  ? `Attending · ${r.guestCount} ${r.guestCount === 1 ? 'guest' : 'guests'}`
                                  : 'Unable to attend'}
                              </span>
                            </div>
                            {r.message && (
                              <p className="text-sm text-[#262820]/80">{r.message}</p>
                            )}
                            <p className="text-[11px] text-[#262820]/55">
                              Submitted:{' '}
                              {r.submittedAt
                                ? new Intl.DateTimeFormat('en-GB', {
                                    timeZone: 'Africa/Lagos',
                                    dateStyle: 'medium',
                                    timeStyle: 'short'
                                  }).format(r.submittedAt)
                                : '—'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRsvpId(r.id);
                                setEditRsvpDraft({
                                  fullName: r.fullName,
                                  attending: r.attending,
                                  guestCount: r.guestCount,
                                  message: r.message
                                });
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#07543E]/20 text-xs font-semibold text-[#07543E] hover:bg-white cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Edit
                            </button>

                            {isConfirmDelete ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await deleteRsvpRecord(r.id);
                                      setConfirmDeleteRsvpId(null);
                                      await loadAllAdminData();
                                      setBannerMessage({
                                        type: 'success',
                                        text: `Deleted RSVP for ${r.fullName}.`
                                      });
                                    } catch (err) {
                                      setBannerMessage({
                                        type: 'error',
                                        text: err instanceof Error ? err.message : 'Unable to delete RSVP.'
                                      });
                                    }
                                  }}
                                  className="px-2.5 py-1.5 rounded-md bg-red-600 text-white text-xs font-semibold cursor-pointer"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteRsvpId(null)}
                                  className="px-2 py-1.5 text-xs text-[#262820]/70 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRsvpId(r.id)}
                                aria-label={`Delete RSVP for ${r.fullName}`}
                                className="p-1.5 rounded-md text-red-600 hover:bg-red-50 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 4: GALLERY MODERATION & ADMIN UPLOAD
      ==================================================================== */}
      {activeTab === 'gallery' && (
        <div className="space-y-8">
          {/* Quick Public Visibility Toggle + Admin Early Upload */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleAdminUploadSubmit}
              noValidate
              className="lg:col-span-8 p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-2xl font-semibold text-[#07543E]">
                    Upload Official Photos or Videos to Google Drive
                  </h2>
                  <p className="text-xs sm:text-sm text-[#262820]/75 mt-1 leading-relaxed">
                    Admin uploads bypass the December 12 guest lock, save into the selected Google Drive subfolder, and publish immediately as approved.
                  </p>
                </div>
                {(!hasBrowserDriveToken && !driveStatus?.serverRefreshConfigured) ||
                adminNeedsDriveReconnect ? (
                  <button
                    type="button"
                    onClick={() => void handleConnectGoogleDrive()}
                    disabled={driveActionBusy}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg bg-[#C5A04A]/25 border border-[#C5A04A] text-[#07543E] text-xs font-semibold cursor-pointer"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>
                      {adminNeedsDriveReconnect
                        ? 'Reconnect Google Drive'
                        : 'Connect Google Drive First'}
                    </span>
                  </button>
                ) : null}
              </div>

              {/* Upload Guidelines */}
              <div className="p-3.5 rounded-lg bg-[#F2EBDD]/80 border border-[#C5A04A]/35 text-xs sm:text-sm text-[#262820]/85 space-y-1">
                <p className="font-semibold text-[#07543E] flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-[#C5A04A] shrink-0" />
                  <span>Upload Limits</span>
                </p>
                <p>
                  Up to <strong>{adminLimits.maxBatchFiles} files</strong> per batch · Photos up to{' '}
                  <strong>{Math.round(adminLimits.maxImageBytes / (1024 * 1024))} MB</strong> (JPG, PNG, WebP, GIF, HEIC) · Videos up to{' '}
                  <strong>{Math.round(adminLimits.maxVideoBytes / (1024 * 1024))} MB</strong> (MP4, MOV, WebM, M4V)
                </p>
              </div>

              {adminBatchSummaryNotice && (
                <div
                  role="status"
                  className="p-3.5 rounded-lg bg-[#07543E]/8 border border-[#07543E]/25 text-xs sm:text-sm text-[#07543E] font-medium flex items-start gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{adminBatchSummaryNotice}</span>
                </div>
              )}

              {(adminUploadError || adminValidationReport.hasErrors) && (
                <div
                  role="alert"
                  className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900 space-y-2 leading-relaxed"
                >
                  {adminUploadError && (
                    <div className="flex items-start gap-2 font-medium">
                      <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                      <span>{adminUploadError}</span>
                    </div>
                  )}
                  {adminValidationReport.allErrors.length > 0 && (
                    <ul className="list-disc pl-5 space-y-1">
                      {adminValidationReport.allErrors.map((errMsg, idx) => (
                        <li key={idx}>{errMsg}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={adminUploadCategory}
                  disabled={adminUploading}
                  onChange={(e) => setAdminUploadCategory(e.target.value as DriveMediaCategory)}
                  aria-label="Target Google Drive subfolder"
                  className="px-3.5 py-2.5 min-h-[44px] text-base sm:text-sm rounded-lg border border-[#07543E]/20 bg-white"
                >
                  <option value="admin_media">Admin Media</option>
                  <option value="website_homepage">Website Photos · Homepage</option>
                  <option value="website_story">Website Photos · Our Story</option>
                  <option value="website_schedule">Website Photos · Schedule</option>
                  <option value="guest_photo">Guest Uploads · Photos</option>
                  <option value="guest_video">Guest Uploads · Videos</option>
                </select>

                <input
                  type="text"
                  disabled={adminUploading}
                  value={adminUploadCaption}
                  onChange={(e) => setAdminUploadCaption(e.target.value)}
                  placeholder="Optional title / caption"
                  className="px-3.5 py-2.5 min-h-[44px] text-base sm:text-sm rounded-lg border border-[#07543E]/20 bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-gallery-file-input"
                  className={`flex flex-col items-center justify-center p-5 min-h-[104px] rounded-xl border border-dashed border-[#07543E]/35 bg-white hover:bg-[#FAF7F0] transition-colors text-center ${
                    adminUploading ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                  }`}
                >
                  <Upload className="w-5 h-5 text-[#07543E] mb-1.5" />
                  <span className="text-sm font-semibold text-[#07543E]">
                    {adminUploadEntries.length > 0
                      ? 'Add More Photos or Videos'
                      : `Choose Up to ${adminLimits.maxBatchFiles} Photos or Videos`}
                  </span>
                </label>
                <input
                  ref={adminFileInputRef}
                  id="admin-gallery-file-input"
                  type="file"
                  multiple
                  disabled={adminUploading}
                  accept={FILE_INPUT_ACCEPT}
                  onChange={handleAdminFileChange}
                  className="sr-only"
                />
              </div>

              {adminValidationReport.entries.length > 0 && (
                <div className="rounded-xl border border-[#07543E]/15 bg-white overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#F2EBDD]/70 border-b border-[#07543E]/10 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                    <span className="font-semibold text-[#07543E]">
                      {adminValidationReport.entries.length}{' '}
                      {adminValidationReport.entries.length === 1 ? 'file' : 'files'} selected · Total{' '}
                      {formatFileSize(adminValidationReport.totalSizeBytes)}
                    </span>
                    {!adminUploading && (
                      <button
                        type="button"
                        onClick={handleClearAdminFiles}
                        className="inline-flex items-center gap-1 min-h-[36px] px-2 text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear All</span>
                      </button>
                    )}
                  </div>

                  <ul className="divide-y divide-[#07543E]/10 max-h-64 overflow-y-auto">
                    {adminValidationReport.entries.map((entry) => {
                      const rowError = entry.validationError || entry.uploadError;
                      return (
                        <li
                          key={entry.id}
                          className={`px-4 py-2.5 flex items-start justify-between gap-3 ${
                            rowError ? 'bg-red-50/60' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-[#262820] break-all">
                                {entry.file.name}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded bg-[#F2EBDD] text-[#07543E] font-medium shrink-0">
                                {entry.formatLabel} · {formatFileSize(entry.sizeBytes)}
                              </span>
                              {entry.uploadStatus === 'uploading' && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#07543E]">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Uploading
                                </span>
                              )}
                              {entry.uploadStatus === 'failed' && !entry.validationError && (
                                <span className="text-xs font-semibold text-red-700">Failed</span>
                              )}
                            </div>
                            {rowError && (
                              <p className="text-xs text-red-800 leading-snug">{rowError}</p>
                            )}
                          </div>

                          {!adminUploading && (
                            <button
                              type="button"
                              onClick={() => handleRemoveAdminFile(entry.id)}
                              aria-label={`Remove ${entry.file.name}`}
                              className="w-11 h-11 -my-1.5 -mr-2 flex items-center justify-center rounded-lg text-[#262820]/60 hover:text-red-700 hover:bg-red-50 shrink-0 cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {adminUploading && (
                <div className="space-y-1">
                  <div className="w-full h-2.5 rounded-full bg-[#07543E]/15 overflow-hidden">
                    <div
                      className="h-full bg-[#07543E] transition-all duration-150"
                      style={{ width: `${adminUploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-[#07543E] text-right tabular-nums">
                    Uploading ({adminUploadProgress}%)
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                {adminFailedEntries.length > 0 && !adminUploading && (
                  <button
                    type="button"
                    onClick={() => void handleAdminRetryFailedOnly()}
                    disabled={adminValidationReport.hasErrors}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-lg bg-[#C5A04A] hover:bg-[#D4B05B] disabled:opacity-50 text-[#073B2B] text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Retry Failed Files Only ({adminFailedEntries.length})</span>
                  </button>
                )}

                <button
                  type="submit"
                  disabled={
                    adminUploading ||
                    adminValidationReport.entries.length === 0 ||
                    adminValidationReport.hasErrors
                  }
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold uppercase tracking-wider cursor-pointer"
                >
                  {adminUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 text-[#C5A04A]" />
                  )}
                  <span>
                    {adminUploading
                      ? `Uploading (${adminUploadProgress}%)`
                      : `Publish ${adminValidationReport.entries.length || ''} Selected`}
                  </span>
                </button>
              </div>
            </form>

            <div className="lg:col-span-4 p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 flex flex-col justify-between gap-4">
              <div>
                <h3 className="font-serif text-xl font-semibold text-[#07543E] mb-1">
                  Public Gallery Display
                </h3>
                <p className="text-xs sm:text-sm text-[#262820]/75 leading-relaxed">
                  Control whether approved photos and videos are visible on the public website.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = {
                    ...draftContent,
                    galleryPublicEnabled: !draftContent.galleryPublicEnabled
                  };
                  setDraftContent(next);
                  void handleSaveSiteContent(next);
                }}
                className={`px-4 min-h-[44px] rounded-lg text-xs font-semibold uppercase tracking-wider cursor-pointer ${
                  draftContent.galleryPublicEnabled
                    ? 'bg-[#07543E] text-white'
                    : 'bg-stone-200 text-[#262820]'
                }`}
              >
                {draftContent.galleryPublicEnabled
                  ? 'Public Gallery: Visible'
                  : 'Public Gallery: Hidden'}
              </button>
            </div>
          </div>

          {/* Filter Strip */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: `All (${galleryItems.length})` },
              { id: 'pending', label: `Pending (${galleryMetrics.pending})` },
              { id: 'approved', label: 'Approved' },
              { id: 'hidden', label: 'Hidden' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  setGalleryFilter(tab.id as 'all' | 'pending' | 'approved' | 'hidden')
                }
                className={`px-3.5 min-h-[44px] rounded-lg text-xs font-semibold cursor-pointer ${
                  galleryFilter === tab.id
                    ? 'bg-[#07543E] text-white'
                    : 'bg-[#FFFDF8] border border-[#07543E]/15 text-[#262820]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Media Moderation Grid */}
          {filteredGallery.length === 0 ? (
            <div className="p-10 rounded-xl bg-[#FFFDF8] border border-[#07543E]/12 text-center text-sm text-[#262820]/65">
              No media items in this view yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredGallery.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 overflow-hidden flex flex-col"
                >
                  <div className="aspect-[4/3] bg-stone-100 relative">
                    {item.mediaType === 'video' ? (
                      <video
                        src={item.fileUrl}
                        controls
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={item.fileUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    )}
                    <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded bg-black/70 text-white font-mono text-xs uppercase">
                      {item.status}
                    </span>
                  </div>

                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    {editingMediaId === item.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editingMediaTitle}
                          onChange={(e) => setEditingMediaTitle(e.target.value)}
                          className="flex-1 px-2.5 py-2 min-h-[44px] text-base sm:text-xs rounded border border-[#07543E]/25 bg-white"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await moderateGalleryItem(item, item.status, editingMediaTitle);
                            setEditingMediaId(null);
                            await loadAllAdminData();
                          }}
                          className="px-3 min-h-[44px] rounded bg-[#07543E] text-white text-xs font-semibold cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="font-serif text-lg font-semibold text-[#07543E] truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-[#262820]/65">
                          {item.guestName || 'Guest'} · {(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#07543E]/10">
                      {item.status !== 'approved' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await moderateGalleryItem(item, 'approved');
                            await loadAllAdminData();
                          }}
                          className="inline-flex items-center gap-1 px-3 min-h-[40px] rounded bg-[#07543E] text-white text-xs font-semibold cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                      )}
                      {item.status !== 'hidden' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await moderateGalleryItem(item, 'hidden');
                            await loadAllAdminData();
                          }}
                          className="inline-flex items-center gap-1 px-3 min-h-[40px] rounded border border-[#07543E]/20 text-xs font-semibold text-[#262820] cursor-pointer"
                        >
                          <EyeOff className="w-3.5 h-3.5" /> Hide
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMediaId(item.id);
                          setEditingMediaTitle(item.title);
                        }}
                        className="inline-flex items-center gap-1 px-3 min-h-[40px] rounded border border-[#07543E]/20 text-xs font-semibold text-[#07543E] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Title
                      </button>
                      <a
                        href={`${item.fileUrl}${item.fileUrl.includes('?') ? '&' : '?'}download=1`}
                        className="inline-flex items-center gap-1 px-3 min-h-[40px] rounded border border-[#07543E]/20 text-xs font-semibold text-[#07543E]"
                      >
                        <Download className="w-3.5 h-3.5" /> Save
                      </a>
                      {confirmDeleteMediaId === item.id ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteGalleryItem(item);
                            setConfirmDeleteMediaId(null);
                            await loadAllAdminData();
                          }}
                          className="px-3 min-h-[40px] rounded bg-red-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Confirm Delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteMediaId(item.id)}
                          aria-label={`Delete ${item.title}`}
                          className="w-10 h-10 flex items-center justify-center text-red-600 hover:bg-red-50 rounded cursor-pointer ml-auto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 5: SITE SETTINGS & AUTHORIZED ADMINS
      ==================================================================== */}
      {activeTab === 'settings' && (
        <div className="space-y-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveSiteContent(draftContent);
            }}
            className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-6"
          >
            <h2 className="font-serif text-2xl font-semibold text-[#07543E]">
              Wedding Metadata, Dates, &amp; Controls
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Couple Names
                </label>
                <input
                  type="text"
                  value={draftContent.coupleNames}
                  onChange={(e) =>
                    setDraftContent((d) => ({ ...d, coupleNames: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Bride Name
                </label>
                <input
                  type="text"
                  value={draftContent.brideName}
                  onChange={(e) =>
                    setDraftContent((d) => ({ ...d, brideName: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Groom Name
                </label>
                <input
                  type="text"
                  value={draftContent.groomName}
                  onChange={(e) =>
                    setDraftContent((d) => ({ ...d, groomName: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Wedding Hashtag
                </label>
                <input
                  type="text"
                  value={draftContent.hashtag}
                  onChange={(e) =>
                    setDraftContent((d) => ({ ...d, hashtag: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Display Wedding Date
                </label>
                <input
                  type="text"
                  value={draftContent.weddingDateDisplay}
                  onChange={(e) =>
                    setDraftContent((d) => ({ ...d, weddingDateDisplay: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Ceremony Countdown ISO (WAT)
                </label>
                <input
                  type="text"
                  value={draftContent.ceremonyTargetISO}
                  onChange={(e) =>
                    setDraftContent((d) => ({ ...d, ceremonyTargetISO: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Gallery Unlock ISO (WAT)
                </label>
                <input
                  type="text"
                  value={draftContent.galleryUnlockISO}
                  onChange={(e) =>
                    setDraftContent((d) => ({ ...d, galleryUnlockISO: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={draftContent.contactName}
                  onChange={(e) =>
                    setDraftContent((d) => ({ ...d, contactName: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={draftContent.contactPhone}
                  onChange={(e) =>
                    setDraftContent((d) => ({ ...d, contactPhone: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                Main Venue Summary
              </label>
              <input
                type="text"
                value={draftContent.mainVenue}
                onChange={(e) =>
                  setDraftContent((d) => ({ ...d, mainVenue: e.target.value }))
                }
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Hero Image URL
                </label>
                <input
                  type="text"
                  value={draftContent.heroImageUrl}
                  onChange={(e) =>
                    setDraftContent((d) => ({ ...d, heroImageUrl: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {[
                    { label: 'Hero Portrait', url: WEDDING_PHOTOS.hero.src },
                    { label: 'Story Portrait', url: WEDDING_PHOTOS.story.src },
                    { label: 'Schedule Photo', url: WEDDING_PHOTOS.schedule.src },
                    { label: 'Formal Portrait', url: WEDDING_PHOTOS.qa.src }
                  ].map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() =>
                        setDraftContent((d) => ({ ...d, heroImageUrl: preset.url }))
                      }
                      className="text-[11px] px-2.5 py-1 rounded border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] text-[#07543E] cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                    RSVP Open / Closed
                  </label>
                  <select
                    value={draftContent.rsvpOpen ? 'open' : 'closed'}
                    onChange={(e) =>
                      setDraftContent((d) => ({ ...d, rsvpOpen: e.target.value === 'open' }))
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
                  >
                    <option value="open">Open for Submissions</option>
                    <option value="closed">Paused / Closed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                    Max Guests Per RSVP
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={draftContent.maxGuestsPerRsvp}
                    onChange={(e) =>
                      setDraftContent((d) => ({
                        ...d,
                        maxGuestsPerRsvp: Math.max(1, Math.min(10, Number(e.target.value) || 1))
                      }))
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Primary Emerald Hex
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={draftContent.themePrimaryHex}
                    onChange={(e) =>
                      setDraftContent((d) => ({ ...d, themePrimaryHex: e.target.value }))
                    }
                    className="h-10 w-12 rounded border border-[#07543E]/20 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={draftContent.themePrimaryHex}
                    onChange={(e) =>
                      setDraftContent((d) => ({ ...d, themePrimaryHex: e.target.value }))
                    }
                    className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-[#07543E]/20 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Olive Accent Hex
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={draftContent.themeAccentHex}
                    onChange={(e) =>
                      setDraftContent((d) => ({ ...d, themeAccentHex: e.target.value }))
                    }
                    className="h-10 w-12 rounded border border-[#07543E]/20 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={draftContent.themeAccentHex}
                    onChange={(e) =>
                      setDraftContent((d) => ({ ...d, themeAccentHex: e.target.value }))
                    }
                    className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-[#07543E]/20 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Warm Gold Hex
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={draftContent.themeGoldHex}
                    onChange={(e) =>
                      setDraftContent((d) => ({ ...d, themeGoldHex: e.target.value }))
                    }
                    className="h-10 w-12 rounded border border-[#07543E]/20 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={draftContent.themeGoldHex}
                    onChange={(e) =>
                      setDraftContent((d) => ({ ...d, themeGoldHex: e.target.value }))
                    }
                    className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-[#07543E]/20 bg-white"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingContent}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-60 text-white text-xs font-bold uppercase tracking-[0.14em] cursor-pointer"
            >
              {savingContent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-[#C5A04A]" />}
              <span>Save Site Settings</span>
            </button>
          </form>

          {/* Authorized Admin Accounts */}
          <section className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-5">
            <div>
              <h2 className="font-serif text-2xl font-semibold text-[#07543E]">
                Authorized Admin Accounts
              </h2>
              <p className="text-xs text-[#262820]/70 mt-1">
                Primary bootstrapped owner: <strong>joepreserve@gmail.com</strong>. Grant co-admin access below by Firebase User UID.
              </p>
            </div>

            {admins.length > 0 && (
              <ul className="divide-y divide-[#07543E]/10 rounded-lg border border-[#07543E]/12 bg-white">
                {admins.map((a) => (
                  <li key={a.uid} className="p-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#07543E] break-words">
                        {a.displayName || a.email}
                      </p>
                      <p className="text-[#262820]/65 font-mono text-xs break-all">
                        {a.email} · UID: {a.uid}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await removeAdminUser(a.uid);
                        await loadAllAdminData();
                      }}
                      className="w-11 h-11 flex items-center justify-center text-red-600 hover:bg-red-50 rounded cursor-pointer shrink-0"
                      aria-label={`Remove admin ${a.email}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <input
                type="text"
                value={newAdminUid}
                onChange={(e) => setNewAdminUid(e.target.value)}
                placeholder="Firebase User UID"
                className="px-3 py-2.5 min-h-[44px] text-base sm:text-xs rounded-lg border border-[#07543E]/20 bg-white font-mono"
              />
              <input
                type="email"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="Email address"
                className="px-3 py-2.5 min-h-[44px] text-base sm:text-xs rounded-lg border border-[#07543E]/20 bg-white"
              />
              <input
                type="text"
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                placeholder="Display name"
                className="px-3 py-2.5 min-h-[44px] text-base sm:text-xs rounded-lg border border-[#07543E]/20 bg-white"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await addAdminUser({
                      uid: newAdminUid,
                      email: newAdminEmail,
                      displayName: newAdminName
                    });
                    setNewAdminUid('');
                    setNewAdminEmail('');
                    setNewAdminName('');
                    await loadAllAdminData();
                    setBannerMessage({
                      type: 'success',
                      text: 'Co-admin added.'
                    });
                  } catch (err) {
                    setBannerMessage({
                      type: 'error',
                      text: err instanceof Error ? err.message : 'Unable to add admin.'
                    });
                  }
                }}
                disabled={!newAdminUid.trim() || !newAdminEmail.trim()}
                className="px-4 min-h-[44px] rounded-lg bg-[#07543E] disabled:opacity-50 text-white text-xs font-semibold uppercase tracking-wider cursor-pointer"
              >
                Add Co-Admin
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
