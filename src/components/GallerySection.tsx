import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Lock,
  Upload,
  Image as ImageIcon,
  Film,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Maximize2,
  RotateCcw,
  Info,
  Trash2
} from 'lucide-react';
import { AUTHORITATIVE_GALLERY_LOCK_MESSAGE } from '../data/weddingSite';
import {
  fetchGalleryServerStatus,
  subscribeApprovedGalleryItems,
  uploadGalleryMediaFiles
} from '../services/weddingRepository';
import { GalleryItem, GalleryServerStatus } from '../types';
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

interface GallerySectionProps {
  galleryPublicEnabled: boolean;
  galleryUnlockISO: string;
}

interface UnlockCountdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  unlocked: boolean;
}

function computeCountdownFromServerOffset(
  unlockAtMs: number,
  serverClockOffsetMs: number
): UnlockCountdown {
  const approxServerNow = Date.now() + serverClockOffsetMs;
  const diff = unlockAtMs - approxServerNow;
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, unlocked: true };
  }
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    unlocked: false
  };
}

export const GallerySection: React.FC<GallerySectionProps> = ({
  galleryPublicEnabled,
  galleryUnlockISO
}) => {
  const [serverStatus, setServerStatus] = useState<GalleryServerStatus | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<UnlockCountdown>(() =>
    computeCountdownFromServerOffset(new Date(galleryUnlockISO).getTime(), 0)
  );
  const [approvedItems, setApprovedItems] = useState<GalleryItem[]>([]);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);

  // Upload form state (active once server confirms unlocked)
  const [guestName, setGuestName] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedEntries, setSelectedEntries] = useState<SelectedUploadEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [batchSummaryNotice, setBatchSummaryNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    const loadStatus = async () => {
      try {
        const status = await fetchGalleryServerStatus();
        if (!mounted) return;
        setServerStatus(status);
        setServerOffsetMs(status.serverTimeMs - Date.now());
        setStatusError(null);
      } catch {
        if (!mounted) return;
        setStatusError('Unable to reach the upload server to verify current West Africa Time.');
      }
    };
    void loadStatus();
    const refreshInterval = window.setInterval(loadStatus, 60000);
    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
    };
  }, [galleryUnlockISO]);

  useEffect(() => {
    const targetMs = serverStatus?.unlockAtEpochMs ?? new Date(galleryUnlockISO).getTime();
    const tick = () => {
      setCountdown(computeCountdownFromServerOffset(targetMs, serverOffsetMs));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [serverStatus, serverOffsetMs, galleryUnlockISO]);

  useEffect(() => {
    if (!galleryPublicEnabled) {
      setApprovedItems([]);
      return;
    }
    const unsub = subscribeApprovedGalleryItems(
      (items) => setApprovedItems(items),
      () => setApprovedItems([])
    );
    return () => unsub();
  }, [galleryPublicEnabled]);

  useEffect(() => {
    if (!lightboxItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxItem(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxItem]);

  const isServerUnlocked = Boolean(serverStatus?.isUnlocked && countdown.unlocked);

  const activeLimits = useMemo(
    () => ({
      maxBatchFiles: serverStatus?.limits.maxBatchFiles || MAX_BATCH_FILES,
      maxImageBytes: serverStatus?.limits.maxImageBytes || MAX_IMAGE_BYTES,
      maxVideoBytes: serverStatus?.limits.maxVideoBytes || MAX_VIDEO_BYTES
    }),
    [serverStatus]
  );

  const validationReport = useMemo(
    () => validateUploadEntries(selectedEntries, activeLimits),
    [selectedEntries, activeLimits]
  );

  const failedEntries = useMemo(
    () => validationReport.entries.filter((entry) => entry.uploadStatus === 'failed'),
    [validationReport.entries]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uploading) return;
    setUploadError(null);
    setUploadSuccess(null);
    setBatchSummaryNotice(null);

    const incoming = Array.from(e.target.files || []);
    if (incoming.length === 0) return;

    setSelectedEntries((prev) => {
      const existingSignatures = new Set(
        prev.map((item) => `${item.file.name}::${item.file.size}::${item.file.lastModified}`)
      );
      const additions = incoming
        .filter(
          (file) =>
            !existingSignatures.has(`${file.name}::${file.size}::${file.lastModified}`)
        )
        .map((file) => createSelectedUploadEntry(file, activeLimits));
      return [...prev, ...additions];
    });

    // Clear input so the user can re-select a file after fixing/compressing it
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    if (uploading) return;
    setSelectedEntries((prev) => prev.filter((item) => item.id !== id));
    setUploadError(null);
    setBatchSummaryNotice(null);
  };

  const handleClearAllFiles = () => {
    if (uploading) return;
    setSelectedEntries([]);
    setUploadError(null);
    setUploadSuccess(null);
    setBatchSummaryNotice(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const executeUploadBatch = async (entriesToSend: SelectedUploadEntry[]) => {
    if (!isServerUnlocked || uploading || entriesToSend.length === 0) return;

    const reportForBatch = validateUploadEntries(entriesToSend, activeLimits);
    if (reportForBatch.hasErrors) {
      setUploadError('Please fix or remove the highlighted invalid files before uploading.');
      return;
    }

    const sendIds = new Set(entriesToSend.map((entry) => entry.id));
    setUploadError(null);
    setUploadSuccess(null);
    setBatchSummaryNotice(null);
    setUploading(true);
    setUploadProgress(0);

    setSelectedEntries((prev) =>
      prev.map((entry) =>
        sendIds.has(entry.id)
          ? { ...entry, uploadStatus: 'uploading', uploadError: null }
          : entry
      )
    );

    try {
      const outcome = await uploadGalleryMediaFiles({
        entries: entriesToSend.map((entry) => ({ id: entry.id, file: entry.file })),
        guestName,
        caption,
        onProgress: setUploadProgress
      });

      const resultById = new Map(outcome.results.map((r) => [r.clientFileId, r]));

      if (outcome.summary.failed === 0 && outcome.summary.succeeded > 0) {
        setSelectedEntries((prev) => prev.filter((entry) => !sendIds.has(entry.id)));
        setCaption('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        setUploadSuccess(
          `Thank you! ${outcome.summary.succeeded} ${
            outcome.summary.succeeded === 1 ? 'moment has' : 'moments have'
          } been uploaded and submitted for couple moderation before appearing in the public gallery.`
        );
      } else if (outcome.summary.succeeded > 0 && outcome.summary.failed > 0) {
        // Keep ONLY failed files in the queue so succeeded files are never duplicated
        setSelectedEntries((prev) =>
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
        setBatchSummaryNotice(
          `${outcome.summary.total} files selected. ${outcome.summary.succeeded} uploaded successfully. ${outcome.summary.failed} failed.`
        );
        setUploadError(
          outcome.globalError ||
            'Some files could not be uploaded. Review the errors below and click "Retry Failed Files Only".'
        );
      } else {
        setSelectedEntries((prev) =>
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
        setUploadError(
          outcome.globalError || 'We could not complete your upload. Please review the errors below and try again.'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setSelectedEntries((prev) =>
        prev.map((entry) =>
          sendIds.has(entry.id)
            ? { ...entry, uploadStatus: 'failed', uploadError: msg }
            : entry
        )
      );
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeUploadBatch(validationReport.entries);
  };

  const handleRetryFailedOnly = async () => {
    if (failedEntries.length === 0) return;
    await executeUploadBatch(failedEntries);
  };

  return (
    <section
      id="gallery"
      className="scroll-mt-20 py-16 sm:py-24 px-4 sm:px-6 bg-[#F2EBDD] border-b border-[#07543E]/10"
    >
      <div className="max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
          <p className="text-xs sm:text-sm uppercase tracking-[0.22em] text-[#737746] font-semibold mb-2">
            Wedding Gallery
          </p>
          <h2 className="font-serif text-[34px] sm:text-5xl font-semibold text-[#07543E] text-balance leading-tight mb-4">
            Moments Shared With Us
          </h2>
          <p className="text-base sm:text-lg text-[#262820]/80 leading-relaxed">
            {AUTHORITATIVE_GALLERY_LOCK_MESSAGE}
          </p>
          <div className="mt-6 h-[1px] w-24 mx-auto bg-gradient-to-r from-transparent via-[#C5A04A] to-transparent" />
        </div>

        {statusError && (
          <div className="max-w-xl mx-auto mb-6 p-4 rounded-lg bg-[#FFFDF8] border border-[#C5A04A]/40 text-sm text-[#262820]/85 flex items-center gap-2.5 justify-center">
            <AlertCircle className="w-4 h-4 text-[#C5A04A] shrink-0" />
            <span>{statusError}</span>
          </div>
        )}

        {/* BEFORE THE WEDDING DAY: Server-Enforced Locked Upload Card + Gallery Unlock Countdown */}
        {!isServerUnlocked ? (
          <div className="max-w-2xl mx-auto p-5 min-[360px]:p-6 sm:p-10 rounded-xl bg-[#FAF7F0] border border-[#C5A04A]/40 text-center space-y-6">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#07543E]/10 text-[#07543E] flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>

            <div>
              <p className="text-xs sm:text-sm uppercase tracking-[0.18em] text-[#737746] font-semibold mb-1.5">
                Uploads Open At Midnight (00:00 WAT)
              </p>
              <h3 className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E]">
                Saturday, 12 December 2026
              </h3>
            </div>

            {/* Separate Gallery Midnight Countdown */}
            <div
              aria-label="Countdown until guest photo uploads open"
              className="grid grid-cols-4 gap-2 sm:gap-7 px-3.5 sm:px-6 py-4 rounded-xl bg-[#073B2B] text-[#FAF7F0] w-full max-w-md mx-auto"
            >
              {[
                { label: 'Days', value: countdown.days },
                { label: 'Hours', value: countdown.hours },
                { label: 'Minutes', value: countdown.minutes },
                { label: 'Seconds', value: countdown.seconds }
              ].map((u) => (
                <div key={u.label} className="text-center min-w-0">
                  <div className="font-serif text-2xl sm:text-3xl font-semibold text-[#F3E5AB] tabular-nums leading-none">
                    {String(u.value).padStart(2, '0')}
                  </div>
                  <div className="mt-1.5 text-[11px] sm:text-xs uppercase tracking-[0.08em] sm:tracking-[0.16em] text-[#FAF7F0]/80 truncate">
                    {u.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Locked Upload Dropzone Preview */}
            <div className="p-5 sm:p-6 rounded-lg border border-dashed border-[#07543E]/25 bg-[#F2EBDD]/60 text-[#262820]/75 space-y-2.5">
              <div className="flex items-center justify-center gap-3 text-[#07543E]/60">
                <ImageIcon className="w-5 h-5" />
                <Film className="w-5 h-5" />
              </div>
              <p className="text-sm sm:text-base font-medium text-[#262820]/80 leading-relaxed">
                Guest photo &amp; video uploads are locked until 12 December 2026 (00:00 Africa/Lagos)
              </p>
              <p className="text-xs sm:text-sm text-[#262820]/65 flex flex-wrap items-center justify-center gap-1.5">
                <Clock className="w-4 h-4 shrink-0" />
                <span>
                  Enforced via server time ({serverStatus?.serverTimeLagosFormatted || 'Africa/Lagos'})
                </span>
              </p>
            </div>
          </div>
        ) : (
          /* ON & AFTER WEDDING DAY: Active Multi-File Uploader */
          <form
            onSubmit={handleUploadSubmit}
            noValidate
            className="max-w-2xl mx-auto p-5 min-[360px]:p-6 sm:p-9 rounded-xl bg-[#FAF7F0] border border-[#07543E]/20 space-y-5"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#07543E]/10 pb-4">
              <div>
                <p className="text-xs sm:text-sm uppercase tracking-[0.16em] text-[#07543E] font-semibold">
                  Gallery Open Now
                </p>
                <h3 className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E]">
                  Share Your Photos &amp; Videos
                </h3>
              </div>
              <Upload className="w-5 h-5 text-[#C5A04A] shrink-0" />
            </div>

            {serverStatus && !serverStatus.unattendedUploadsReady && (
              <div
                role="status"
                className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-950 flex items-start gap-2.5 leading-relaxed"
              >
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  Photo and video uploads are temporarily awaiting final storage setup by the couple. Please check back shortly or reach out to Mary &amp; Joseph if you need assistance.
                </span>
              </div>
            )}

            {/* Clear Upload Guidelines Before Submission */}
            <div className="p-4 rounded-xl bg-[#F2EBDD]/80 border border-[#C5A04A]/35 text-xs sm:text-sm text-[#262820]/85 space-y-1.5 leading-relaxed">
              <p className="font-semibold text-[#07543E] flex items-center gap-1.5">
                <Info className="w-4 h-4 text-[#C5A04A] shrink-0" />
                <span>Upload Guidelines</span>
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Maximum <strong>{activeLimits.maxBatchFiles} files</strong> per upload</li>
                <li>Photos: maximum <strong>{Math.round(activeLimits.maxImageBytes / (1024 * 1024))} MB</strong> each (JPG, JPEG, PNG, WebP, GIF, HEIC, HEIF)</li>
                <li>Videos: maximum <strong>{Math.round(activeLimits.maxVideoBytes / (1024 * 1024))} MB</strong> each (MP4, MOV, WebM, M4V)</li>
              </ul>
            </div>

            {batchSummaryNotice && (
              <div
                role="status"
                className="p-4 rounded-lg bg-[#07543E]/8 border border-[#07543E]/25 text-sm text-[#07543E] font-medium flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{batchSummaryNotice}</span>
              </div>
            )}

            {uploadSuccess && (
              <div
                role="status"
                className="p-4 rounded-lg bg-[#07543E]/8 border border-[#07543E]/25 text-sm text-[#07543E] flex items-start gap-2.5 leading-relaxed"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{uploadSuccess}</span>
              </div>
            )}

            {(uploadError || validationReport.hasErrors) && (
              <div
                role="alert"
                className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-900 space-y-2 leading-relaxed"
              >
                {uploadError && (
                  <div className="flex items-start gap-2 font-medium">
                    <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                    <span>{uploadError}</span>
                  </div>
                )}
                {validationReport.allErrors.length > 0 && (
                  <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
                    {validationReport.allErrors.map((errMsg, index) => (
                      <li key={index}>{errMsg}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="gallery-guest-name"
                  className="block text-xs sm:text-sm font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
                >
                  Your Name (Optional)
                </label>
                <input
                  id="gallery-guest-name"
                  type="text"
                  maxLength={80}
                  value={guestName}
                  disabled={uploading}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Guest name"
                  className="w-full px-3.5 py-3 min-h-[48px] text-base sm:text-sm rounded-lg border border-[#07543E]/20 bg-white focus:outline-none focus:border-[#07543E] disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="gallery-caption"
                  className="block text-xs sm:text-sm font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
                >
                  Caption (Optional)
                </label>
                <input
                  id="gallery-caption"
                  type="text"
                  maxLength={160}
                  value={caption}
                  disabled={uploading}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="e.g. First dance at the reception"
                  className="w-full px-3.5 py-3 min-h-[48px] text-base sm:text-sm rounded-lg border border-[#07543E]/20 bg-white focus:outline-none focus:border-[#07543E] disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="gallery-file-input"
                className={`flex flex-col items-center justify-center p-6 min-h-[128px] rounded-xl border border-dashed border-[#07543E]/35 bg-white hover:bg-[#FAF7F0] transition-colors text-center ${
                  uploading ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                }`}
              >
                <Upload className="w-6 h-6 text-[#07543E] mb-2" />
                <span className="text-sm sm:text-base font-semibold text-[#07543E]">
                  {selectedEntries.length > 0
                    ? 'Add More Photos or Videos'
                    : `Select Photos or Videos (up to ${activeLimits.maxBatchFiles} files)`}
                </span>
                <span className="text-xs sm:text-sm text-[#262820]/65 mt-1">
                  Photos up to {Math.round(activeLimits.maxImageBytes / (1024 * 1024))} MB · Videos up to {Math.round(activeLimits.maxVideoBytes / (1024 * 1024))} MB
                </span>
              </label>
              <input
                ref={fileInputRef}
                id="gallery-file-input"
                type="file"
                multiple
                disabled={uploading}
                accept={FILE_INPUT_ACCEPT}
                onChange={handleFileChange}
                className="sr-only"
              />
            </div>

            {/* Selected Files Summary List with Individual Remove & Status */}
            {validationReport.entries.length > 0 && (
              <div className="rounded-xl border border-[#07543E]/15 bg-white overflow-hidden">
                <div className="px-4 py-3 bg-[#F2EBDD]/70 border-b border-[#07543E]/10 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                  <span className="font-semibold text-[#07543E]">
                    {validationReport.entries.length}{' '}
                    {validationReport.entries.length === 1 ? 'file' : 'files'} selected · Total{' '}
                    {formatFileSize(validationReport.totalSizeBytes)}
                  </span>
                  {!uploading && (
                    <button
                      type="button"
                      onClick={handleClearAllFiles}
                      className="inline-flex items-center gap-1 min-h-[36px] px-2 text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                <ul className="divide-y divide-[#07543E]/10 max-h-72 overflow-y-auto">
                  {validationReport.entries.map((entry) => {
                    const rowError = entry.validationError || entry.uploadError;
                    return (
                      <li
                        key={entry.id}
                        className={`px-4 py-3 flex items-start justify-between gap-3 ${
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

                        {!uploading && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(entry.id)}
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

            {uploading && (
              <div className="space-y-1.5">
                <div className="w-full h-2.5 rounded-full bg-[#07543E]/15 overflow-hidden">
                  <div
                    className="h-full bg-[#07543E] transition-all duration-150"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs sm:text-sm text-[#07543E] text-right tabular-nums font-medium">
                  Uploading ({uploadProgress}%)
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              {failedEntries.length > 0 && !uploading && (
                <button
                  type="button"
                  onClick={() => void handleRetryFailedOnly()}
                  disabled={validationReport.hasErrors}
                  className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 min-h-[48px] rounded-lg bg-[#C5A04A] hover:bg-[#D4B05B] disabled:opacity-50 text-[#073B2B] text-xs sm:text-sm font-bold uppercase tracking-[0.12em] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Retry Failed Files Only ({failedEntries.length})</span>
                </button>
              )}

              <button
                type="submit"
                disabled={
                  uploading ||
                  validationReport.entries.length === 0 ||
                  validationReport.hasErrors
                }
                className="w-full flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] transition-colors cursor-pointer"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Uploading ({uploadProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-[#C5A04A]" />
                    <span>
                      Upload {validationReport.entries.length > 0 ? `${validationReport.entries.length} ` : ''}
                      Selected {validationReport.entries.length === 1 ? 'Moment' : 'Moments'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Public Approved Gallery Grid */}
        {galleryPublicEnabled && approvedItems.length > 0 && (
          <div className="mt-12 sm:mt-16">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {approvedItems.map((item) => (
                <article
                  key={item.id}
                  className="group rounded-xl overflow-hidden bg-[#FAF7F0] border border-[#07543E]/12 flex flex-col"
                >
                  <div className="relative aspect-[4/3] bg-[#262820]/5 overflow-hidden">
                    {item.mediaType === 'video' ? (
                      <video
                        src={item.fileUrl}
                        controls
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLightboxItem(item)}
                        className="w-full h-full block cursor-pointer relative"
                        aria-label={`View full size: ${item.title}`}
                      >
                        <img
                          src={item.fileUrl}
                          alt={item.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        />
                        <span className="absolute bottom-2.5 right-2.5 p-2 rounded-md bg-black/55 text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <Maximize2 className="w-4 h-4" />
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="p-4 flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-serif text-lg font-semibold text-[#07543E] truncate">
                        {item.title}
                      </p>
                      <p className="text-xs sm:text-sm text-[#262820]/70 truncate">
                        {item.guestName ? `Shared by ${item.guestName}` : 'Wedding Guest'}
                        {item.createdAt && (
                          <>
                            <span className="mx-1.5">·</span>
                            <span>
                              {new Intl.DateTimeFormat('en-GB', {
                                timeZone: 'Africa/Lagos',
                                day: 'numeric',
                                month: 'short'
                              }).format(item.createdAt)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox Modal for Full-Screen Image Viewing */}
      {lightboxItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightboxItem.title}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxItem(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxItem(null)}
            aria-label="Close full-screen photo"
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="max-w-4xl max-h-[88vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxItem.fileUrl}
              alt={lightboxItem.title}
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[75vh] object-contain rounded-lg"
            />
            <p className="mt-3 text-base text-[#FAF7F0] font-serif text-center px-2">
              {lightboxItem.title}
              {lightboxItem.guestName ? ` · Shared by ${lightboxItem.guestName}` : ''}
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
