import React, { useState, useEffect, useRef } from 'react';
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
  Maximize2
} from 'lucide-react';
import { AUTHORITATIVE_GALLERY_LOCK_MESSAGE } from '../data/weddingSite';
import {
  fetchGalleryServerStatus,
  subscribeApprovedGalleryItems,
  uploadGalleryMediaFiles
} from '../services/weddingRepository';
import { GalleryItem, GalleryServerStatus } from '../types';

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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
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

  const isServerUnlocked = Boolean(serverStatus?.isUnlocked && countdown.unlocked);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setUploadSuccess(null);
    const files = Array.from(e.target.files || []);
    const maxBatch = serverStatus?.limits.maxBatchFiles || 10;
    const maxImg = serverStatus?.limits.maxImageBytes || 15 * 1024 * 1024;
    const maxVid = serverStatus?.limits.maxVideoBytes || 100 * 1024 * 1024;

    if (files.length > maxBatch) {
      setUploadError(`Please select up to ${maxBatch} files per upload.`);
      return;
    }

    for (const f of files) {
      const isImg = f.type.startsWith('image/');
      const isVid = f.type.startsWith('video/');
      if (!isImg && !isVid) {
        setUploadError(`"${f.name}" is not a supported image or video file.`);
        return;
      }
      if (isImg && f.size > maxImg) {
        setUploadError(`"${f.name}" exceeds the 15 MB photo size limit.`);
        return;
      }
      if (isVid && f.size > maxVid) {
        setUploadError(`"${f.name}" exceeds the 100 MB video size limit.`);
        return;
      }
    }

    setSelectedFiles(files);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isServerUnlocked || selectedFiles.length === 0) return;
    setUploadError(null);
    setUploadSuccess(null);
    setUploading(true);
    setUploadProgress(0);

    try {
      const created = await uploadGalleryMediaFiles({
        files: selectedFiles,
        guestName,
        caption,
        onProgress: setUploadProgress
      });
      setSelectedFiles([]);
      setCaption('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadSuccess(
        `Thank you! ${created.length} ${
          created.length === 1 ? 'moment has' : 'moments have'
        } been uploaded and submitted for couple moderation before appearing in the public gallery.`
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <section
      id="gallery"
      className="scroll-mt-20 py-16 sm:py-24 px-4 sm:px-6 bg-[#F2EBDD] border-b border-[#07543E]/10"
    >
      <div className="max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
          <p className="text-xs uppercase tracking-[0.22em] text-[#737746] font-semibold mb-2">
            Wedding Gallery
          </p>
          <h2 className="font-serif text-3xl sm:text-5xl font-semibold text-[#07543E] text-balance mb-4">
            Moments Shared With Us
          </h2>
          <p className="text-sm sm:text-base text-[#262820]/80 leading-relaxed">
            {AUTHORITATIVE_GALLERY_LOCK_MESSAGE}
          </p>
          <div className="mt-6 h-[1px] w-24 mx-auto bg-gradient-to-r from-transparent via-[#C5A04A] to-transparent" />
        </div>

        {statusError && (
          <div className="max-w-xl mx-auto mb-6 p-3.5 rounded-lg bg-[#FFFDF8] border border-[#C5A04A]/40 text-xs text-[#262820]/80 flex items-center gap-2 justify-center">
            <AlertCircle className="w-4 h-4 text-[#C5A04A] shrink-0" />
            <span>{statusError}</span>
          </div>
        )}

        {/* BEFORE THE WEDDING DAY: Server-Enforced Locked Upload Card + Gallery Unlock Countdown */}
        {!isServerUnlocked ? (
          <div className="max-w-2xl mx-auto p-6 sm:p-10 rounded-xl bg-[#FAF7F0] border border-[#C5A04A]/40 text-center space-y-6">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#07543E]/10 text-[#07543E] flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#737746] font-semibold mb-1">
                Uploads Open At Midnight (00:00 WAT)
              </p>
              <h3 className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E]">
                Saturday, 12 December 2026
              </h3>
            </div>

            {/* Separate Gallery Midnight Countdown */}
            <div
              aria-label="Countdown until guest photo uploads open"
              className="inline-grid grid-cols-4 gap-4 sm:gap-7 px-6 py-4 rounded-xl bg-[#073B2B] text-[#FAF7F0]"
            >
              {[
                { label: 'Days', value: countdown.days },
                { label: 'Hours', value: countdown.hours },
                { label: 'Minutes', value: countdown.minutes },
                { label: 'Seconds', value: countdown.seconds }
              ].map((u) => (
                <div key={u.label} className="text-center min-w-[48px]">
                  <div className="font-serif text-2xl sm:text-3xl font-semibold text-[#F3E5AB] tabular-nums leading-none">
                    {String(u.value).padStart(2, '0')}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[#FAF7F0]/75">
                    {u.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Locked Upload Dropzone Preview */}
            <div className="p-6 rounded-lg border border-dashed border-[#07543E]/25 bg-[#F2EBDD]/60 text-[#262820]/65 space-y-2">
              <div className="flex items-center justify-center gap-3 text-[#07543E]/50">
                <ImageIcon className="w-5 h-5" />
                <Film className="w-5 h-5" />
              </div>
              <p className="text-xs sm:text-sm font-medium text-[#262820]/75">
                Guest photo &amp; video uploads are locked until 12 December 2026 (00:00 Africa/Lagos)
              </p>
              <p className="text-[11px] text-[#262820]/55 flex items-center justify-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
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
            className="max-w-2xl mx-auto p-6 sm:p-9 rounded-xl bg-[#FAF7F0] border border-[#07543E]/20 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-[#07543E]/10 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#07543E] font-semibold">
                  Gallery Open Now
                </p>
                <h3 className="font-serif text-2xl font-semibold text-[#07543E]">
                  Share Your Photos &amp; Videos
                </h3>
              </div>
              <Upload className="w-5 h-5 text-[#C5A04A]" />
            </div>

            {uploadError && (
              <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}

            {uploadSuccess && (
              <div role="status" className="p-3.5 rounded-lg bg-[#07543E]/8 border border-[#07543E]/25 text-xs sm:text-sm text-[#07543E] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{uploadSuccess}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="gallery-guest-name" className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Your Name (Optional)
                </label>
                <input
                  id="gallery-guest-name"
                  type="text"
                  maxLength={80}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Guest name"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white focus:outline-none focus:border-[#07543E]"
                />
              </div>

              <div>
                <label htmlFor="gallery-caption" className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5">
                  Caption (Optional)
                </label>
                <input
                  id="gallery-caption"
                  type="text"
                  maxLength={160}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="e.g. First dance at the reception"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white focus:outline-none focus:border-[#07543E]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="gallery-file-input"
                className="flex flex-col items-center justify-center p-6 rounded-lg border border-dashed border-[#07543E]/35 bg-white hover:bg-[#FAF7F0] cursor-pointer transition-colors text-center"
              >
                <Upload className="w-6 h-6 text-[#07543E] mb-2" />
                <span className="text-sm font-medium text-[#07543E]">
                  Select Photos or Videos (up to 10 files)
                </span>
                <span className="text-xs text-[#262820]/60 mt-1">
                  Photos up to 15 MB · Videos up to 100 MB (JPEG, PNG, WebP, HEIC, MP4, MOV)
                </span>
              </label>
              <input
                ref={fileInputRef}
                id="gallery-file-input"
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="sr-only"
              />
            </div>

            {selectedFiles.length > 0 && (
              <div className="text-xs text-[#262820]/80 space-y-1">
                <p className="font-semibold text-[#07543E]">
                  {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} ready to upload:
                </p>
                <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                  {selectedFiles.map((file, idx) => (
                    <li key={`${file.name}-${idx}`} className="truncate">
                      {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {uploading && (
              <div className="space-y-1.5">
                <div className="w-full h-2 rounded-full bg-[#07543E]/15 overflow-hidden">
                  <div
                    className="h-full bg-[#07543E] transition-all duration-150"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-[#07543E] text-right tabular-nums">{uploadProgress}%</p>
              </div>
            )}

            <button
              type="submit"
              disabled={uploading || selectedFiles.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] transition-colors cursor-pointer"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-[#C5A04A]" />
                  <span>Upload Selected Moments</span>
                </>
              )}
            </button>
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
                        <span className="absolute bottom-2.5 right-2.5 p-1.5 rounded-md bg-black/55 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          <Maximize2 className="w-3.5 h-3.5" />
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="p-4 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-serif text-base font-semibold text-[#07543E] truncate">
                        {item.title}
                      </p>
                      <p className="text-[#262820]/65 truncate">
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
              className="max-w-full max-h-[78vh] object-contain rounded-lg"
            />
            <p className="mt-3 text-sm text-[#FAF7F0] font-serif">
              {lightboxItem.title}
              {lightboxItem.guestName ? ` · Shared by ${lightboxItem.guestName}` : ''}
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
