import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  Images,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { WEDDING_PHOTOS } from '../../data/weddingSite';
import { GalleryItem, SiteContentData, SlideshowSlideItem } from '../../types';
import { uploadGalleryMediaFiles } from '../../services/weddingRepository';
import {
  createSelectedUploadEntry
} from '../../utils/uploadValidation';
import { GallerySlideshow } from '../GallerySlideshow';

interface AdminSlideshowPanelProps {
  draftContent: SiteContentData;
  setDraftContent: React.Dispatch<React.SetStateAction<SiteContentData>>;
  galleryItems: GalleryItem[];
  coupleNames: string;
  maxImageBytes: number;
  savingContent: boolean;
  onSaveSlideshow: (settings: {
    slideshowAutoplay: boolean;
    slideshowIntervalMs: number;
    slideshowItems: SlideshowSlideItem[];
  }) => Promise<boolean>;
  onRefreshData: () => Promise<void>;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onNeedsDriveReconnect: () => void;
}

export const AdminSlideshowPanel: React.FC<AdminSlideshowPanelProps> = ({
  draftContent,
  setDraftContent,
  galleryItems,
  coupleNames,
  maxImageBytes,
  savingContent,
  onSaveSlideshow,
  onRefreshData,
  onNotify,
  onNeedsDriveReconnect
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const slides = useMemo<SlideshowSlideItem[]>(
    () =>
      [...(draftContent.slideshowItems || [])].sort((a, b) => a.order - b.order),
    [draftContent.slideshowItems]
  );

  const libraryImageCandidates = useMemo(() => {
    const builtins: Array<{
      key: string;
      title: string;
      caption: string;
      fileUrl: string;
      driveFileId: string;
      storageProvider: SlideshowSlideItem['storageProvider'];
    }> = [
      {
        key: 'builtin-hero',
        title: 'Couple Hero Portrait',
        caption: WEDDING_PHOTOS.hero.alt,
        fileUrl: WEDDING_PHOTOS.hero.src,
        driveFileId: '',
        storageProvider: 'site_asset'
      },
      {
        key: 'builtin-story',
        title: 'Our Story Portrait',
        caption: WEDDING_PHOTOS.story.alt,
        fileUrl: WEDDING_PHOTOS.story.src,
        driveFileId: '',
        storageProvider: 'site_asset'
      },
      {
        key: 'builtin-schedule',
        title: 'Celebration Portrait',
        caption: WEDDING_PHOTOS.schedule.alt,
        fileUrl: WEDDING_PHOTOS.schedule.src,
        driveFileId: '',
        storageProvider: 'site_asset'
      },
      {
        key: 'builtin-qa',
        title: 'Formal Portrait',
        caption: WEDDING_PHOTOS.qa.alt,
        fileUrl: WEDDING_PHOTOS.qa.src,
        driveFileId: '',
        storageProvider: 'site_asset'
      }
    ];

    const uploaded = galleryItems
      .filter((item) => item.mediaType === 'image' && item.fileUrl)
      .map((item) => ({
        key: item.id,
        title: item.title || 'Wedding Photograph',
        caption: item.guestName ? `Captured by ${item.guestName}` : '',
        fileUrl: item.fileUrl,
        driveFileId: item.driveFileId || '',
        storageProvider: (
          item.storageProvider === 'local_server' ? 'local_server' : 'google_drive'
        ) as SlideshowSlideItem['storageProvider']
      }));

    return [...builtins, ...uploaded];
  }, [galleryItems]);

  const setSlides = (updater: (prev: SlideshowSlideItem[]) => SlideshowSlideItem[]) => {
    setDraftContent((prev) => {
      const current = [...(prev.slideshowItems || [])].sort((a, b) => a.order - b.order);
      const next = updater(current).map((item, idx) => ({ ...item, order: idx }));
      return { ...prev, slideshowItems: next };
    });
  };

  const handleUploadSlideshowImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length === 0 || uploading) return;

    setUploadError(null);

    const remainingSlots = Math.max(0, 30 - slides.length);
    if (remainingSlots === 0) {
      setUploadError('Maximum of 30 slideshow pictures reached. Remove an existing slide first.');
      return;
    }

    const picked = files.slice(0, remainingSlots);
    const validEntries = [];
    for (const file of picked) {
      const entry = createSelectedUploadEntry(file, {
        maxImageBytes,
        maxVideoBytes: 100 * 1024 * 1024
      });
      if (entry.mediaType !== 'image' || entry.validationError) {
        setUploadError(
          entry.validationError ||
            `"${file.name}" is not a supported image (JPG, PNG, WebP, GIF, HEIC, HEIF up to 50 MB).`
        );
        return;
      }
      validEntries.push({ id: entry.id, file });
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // forceStatus: 'hidden' keeps admin slideshow uploads separated from the public guest "Captured by You" gallery
      const outcome = await uploadGalleryMediaFiles({
        entries: validEntries,
        guestName: coupleNames,
        caption: 'Wedding Highlights Slideshow',
        category: 'admin_media',
        isAdmin: true,
        forceStatus: 'hidden',
        onProgress: setUploadProgress
      });

      if (outcome.needsDriveReconnect) {
        onNeedsDriveReconnect();
      }

      if (outcome.createdItems.length > 0) {
        const validCreatedItems = outcome.createdItems.filter((item) => {
          const cleanUrl = (item.fileUrl || '').trim();
          if (!cleanUrl || cleanUrl.startsWith('blob:')) return false;
          if (item.storageProvider === 'google_drive' && !item.driveFileId && !cleanUrl.includes('/api/gallery/drive/')) {
            return false;
          }
          return true;
        });

        if (validCreatedItems.length === 0) {
          setUploadError(
            'Uploaded image did not return a valid storage reference. Please retry the upload.'
          );
          return;
        }

        const additions: SlideshowSlideItem[] = validCreatedItems.map((item, idx) => ({
          id: `slide_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          fileUrl: item.fileUrl.trim(),
          driveFileId: (item.driveFileId || '').trim(),
          storageProvider: item.storageProvider === 'local_server' ? 'local_server' : 'google_drive',
          title: item.title || 'Wedding Highlight',
          caption: '',
          enabled: true,
          order: slides.length + idx
        }));

        const nextSlides = [...slides, ...additions].map((s, idx) => ({ ...s, order: idx }));

        setDraftContent((prev) => ({
          ...prev,
          slideshowItems: nextSlides
        }));

        const saved = await onSaveSlideshow({
          slideshowAutoplay: draftContent.slideshowAutoplay !== false,
          slideshowIntervalMs: draftContent.slideshowIntervalMs || 5000,
          slideshowItems: nextSlides
        });
        await onRefreshData();
        if (saved) {
          onNotify(
            'success',
            `${additions.length} slideshow ${additions.length === 1 ? 'picture' : 'pictures'} uploaded and saved to Wedding Highlights.`
          );
        } else {
          setUploadError(
            'The image was uploaded to Google Drive, but saving the slideshow list failed. Click "Save Slideshow" to retry without re-uploading.'
          );
        }
      } else {
        setUploadError(
          outcome.results[0]?.errorMessage ||
            outcome.globalError ||
            'Could not upload slideshow image.'
        );
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not upload slideshow image.');
    } finally {
      setUploading(false);
    }
  };

  const handleAddFromLibrary = (candidate: {
    title: string;
    caption: string;
    fileUrl: string;
    driveFileId: string;
    storageProvider: SlideshowSlideItem['storageProvider'];
  }) => {
    if (slides.length >= 30) {
      setUploadError('Maximum of 30 slideshow pictures reached.');
      return;
    }
    setSlides((prev) => [
      ...prev,
      {
        id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        fileUrl: candidate.fileUrl,
        driveFileId: candidate.driveFileId,
        storageProvider: candidate.storageProvider,
        title: candidate.title.slice(0, 120),
        caption: candidate.caption.slice(0, 200),
        enabled: true,
        order: prev.length
      }
    ]);
  };

  const handleMoveSlide = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= slides.length) return;
    setSlides((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
  };

  return (
    <section className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#C5A04A]/40 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#07543E]/10 pb-4">
        <div className="flex items-start gap-3">
          <Images className="w-5 h-5 text-[#07543E] mt-1 shrink-0" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#737746] font-semibold">
              Part 1 of Gallery · Admin Curated
            </p>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E]">
              Wedding Highlights Slideshow ({slides.filter((s) => s.enabled).length} active)
            </h2>
            <p className="text-xs sm:text-sm text-[#262820]/75 mt-1">
              Curated slideshow pictures appear at the top of the Gallery section, completely separate from guest uploads (&ldquo;Captured by You&rdquo;). Removing a slide never deletes the original file.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg border border-[#C5A04A] bg-[#F2EBDD] hover:bg-[#EADFC9] text-[#07543E] text-xs font-semibold uppercase tracking-wider cursor-pointer"
          >
            <Eye className="w-4 h-4" />
            <span>Preview</span>
          </button>

          <button
            type="button"
            disabled={savingContent || uploading}
            onClick={() => {
              setUploadError(null);
              void onSaveSlideshow({
                slideshowAutoplay: draftContent.slideshowAutoplay !== false,
                slideshowIntervalMs: draftContent.slideshowIntervalMs || 5000,
                slideshowItems: slides
              });
            }}
            className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[44px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            {savingContent ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4 text-[#F3E5AB]" />
            )}
            <span>Save Slideshow</span>
          </button>
        </div>
      </div>

      {/* Autoplay & Interval + Upload / Library Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[#FAF7F0] border border-[#07543E]/12">
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#07543E] cursor-pointer">
            <input
              type="checkbox"
              checked={draftContent.slideshowAutoplay !== false}
              onChange={(e) =>
                setDraftContent((d) => ({ ...d, slideshowAutoplay: e.target.checked }))
              }
              className="w-4 h-4 accent-[#07543E]"
            />
            <span>Autoplay Slideshow</span>
          </label>

          <div className="inline-flex items-center gap-2">
            <label
              htmlFor="slideshow-interval-select"
              className="text-xs font-semibold uppercase tracking-wider text-[#737746]"
            >
              Interval
            </label>
            <select
              id="slideshow-interval-select"
              value={draftContent.slideshowIntervalMs || 5000}
              onChange={(e) =>
                setDraftContent((d) => ({
                  ...d,
                  slideshowIntervalMs: Number(e.target.value) || 5000
                }))
              }
              className="px-3 py-1.5 min-h-[40px] text-xs font-semibold rounded-lg border border-[#07543E]/20 bg-white text-[#07543E]"
            >
              <option value={3000}>3 seconds</option>
              <option value={4000}>4 seconds</option>
              <option value={5000}>5 seconds</option>
              <option value={6000}>6 seconds</option>
              <option value={8000}>8 seconds</option>
              <option value={10000}>10 seconds</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label
            htmlFor="admin-slideshow-upload-input"
            className={`inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] text-white text-xs font-semibold uppercase tracking-wider ${
              uploading ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
            }`}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 text-[#F3E5AB]" />
            )}
            <span>{uploading ? `Uploading (${uploadProgress}%)...` : 'Upload Slideshow Photo'}</span>
          </label>
          <input
            ref={fileInputRef}
            id="admin-slideshow-upload-input"
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif"
            disabled={uploading}
            onChange={(e) => void handleUploadSlideshowImages(e)}
            className="sr-only"
          />

          <button
            type="button"
            onClick={() => setShowLibraryPicker((prev) => !prev)}
            className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg border border-[#07543E]/25 bg-white hover:bg-[#F2EBDD] text-[#07543E] text-xs font-semibold uppercase tracking-wider cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#C5A04A]" />
            <span>{showLibraryPicker ? 'Hide Photo Library' : 'Add From Library'}</span>
          </button>
        </div>
      </div>

      {uploadError && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Existing Media Library Picker */}
      {showLibraryPicker && (
        <div className="p-4 rounded-xl bg-white border border-[#07543E]/15 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#737746]">
              Click any photo to add it to the Wedding Highlights slideshow
            </p>
            <button
              type="button"
              onClick={() => setShowLibraryPicker(false)}
              className="text-xs font-semibold text-[#07543E] hover:underline cursor-pointer"
            >
              Done
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-72 overflow-y-auto pr-1">
            {libraryImageCandidates.map((photo) => {
              const alreadyAdded = slides.some((s) => s.fileUrl === photo.fileUrl);
              return (
                <button
                  key={photo.key}
                  type="button"
                  onClick={() => handleAddFromLibrary(photo)}
                  className={`group text-left rounded-lg overflow-hidden border transition-all cursor-pointer ${
                    alreadyAdded
                      ? 'border-[#C5A04A] ring-1 ring-[#C5A04A]'
                      : 'border-[#07543E]/15 hover:border-[#07543E]'
                  }`}
                >
                  <div className="aspect-[4/3] bg-[#F2EBDD] overflow-hidden relative">
                    <img
                      src={photo.fileUrl}
                      alt={photo.title}
                      loading="lazy"
                      className="w-full h-full object-cover object-[50%_20%] group-hover:scale-105 transition-transform"
                    />
                    {alreadyAdded && (
                      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-[#07543E] text-[10px] font-semibold text-[#F3E5AB]">
                        In Slideshow
                      </span>
                    )}
                  </div>
                  <p className="p-2 text-[11px] font-medium text-[#07543E] truncate bg-[#FFFDF8]">
                    {photo.title}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Slideshow Items List */}
      {slides.length === 0 ? (
        <div className="p-6 rounded-xl bg-white border border-dashed border-[#07543E]/20 text-center text-sm text-[#262820]/70">
          No pictures in the slideshow yet. Upload photos or pick from your wedding library above.
        </div>
      ) : (
        <div className="space-y-3">
          {slides.map((slide, idx) => (
            <div
              key={slide.id}
              className={`p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-4 ${
                slide.enabled
                  ? 'bg-white border-[#07543E]/15'
                  : 'bg-[#F2EBDD]/40 border-[#07543E]/10 opacity-75'
              }`}
            >
              <div className="w-full sm:w-28 h-24 sm:h-20 rounded-lg overflow-hidden bg-[#073B2B] shrink-0 border border-[#C5A04A]/30">
                <img
                  src={slide.fileUrl}
                  alt={slide.title || `Slide ${idx + 1}`}
                  className="w-full h-full object-cover object-[50%_20%]"
                />
              </div>

              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  maxLength={120}
                  value={slide.title || ''}
                  onChange={(e) =>
                    setSlides((prev) =>
                      prev.map((s) =>
                        s.id === slide.id ? { ...s, title: e.target.value } : s
                      )
                    )
                  }
                  placeholder="Optional title"
                  aria-label={`Slide ${idx + 1} title`}
                  className="px-3 py-2 min-h-[40px] text-xs sm:text-sm rounded-lg border border-[#07543E]/20 bg-[#FAF7F0]"
                />
                <input
                  type="text"
                  maxLength={200}
                  value={slide.caption || ''}
                  onChange={(e) =>
                    setSlides((prev) =>
                      prev.map((s) =>
                        s.id === slide.id ? { ...s, caption: e.target.value } : s
                      )
                    )
                  }
                  placeholder="Optional caption"
                  aria-label={`Slide ${idx + 1} caption`}
                  className="px-3 py-2 min-h-[40px] text-xs sm:text-sm rounded-lg border border-[#07543E]/20 bg-[#FAF7F0]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => handleMoveSlide(idx, -1)}
                  aria-label="Move slide up"
                  className="w-10 h-10 rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] disabled:opacity-40 flex items-center justify-center text-[#07543E] cursor-pointer"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={idx === slides.length - 1}
                  onClick={() => handleMoveSlide(idx, 1)}
                  aria-label="Move slide down"
                  className="w-10 h-10 rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] disabled:opacity-40 flex items-center justify-center text-[#07543E] cursor-pointer"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSlides((prev) =>
                      prev.map((s) =>
                        s.id === slide.id ? { ...s, enabled: !s.enabled } : s
                      )
                    )
                  }
                  className="px-3 min-h-[40px] rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] text-xs font-semibold text-[#07543E] cursor-pointer"
                >
                  {slide.enabled ? 'Enabled' : 'Hidden'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSlides((prev) => prev.filter((s) => s.id !== slide.id))
                  }
                  aria-label="Remove from slideshow"
                  title="Remove from slideshow (keeps original media)"
                  className="w-10 h-10 rounded-lg text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live Preview Modal */}
      {showPreviewModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Wedding Highlights Slideshow Preview"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="relative w-full max-w-4xl bg-[#FAF7F0] rounded-2xl border border-[#C5A04A]/50 p-4 sm:p-6 shadow-2xl my-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#737746] font-semibold">
                  Admin Slideshow Preview
                </p>
                <h3 className="font-serif text-2xl font-semibold text-[#07543E]">
                  Wedding Highlights
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                aria-label="Close slideshow preview"
                className="w-11 h-11 rounded-full bg-white border border-[#07543E]/15 hover:bg-[#F2EBDD] text-[#07543E] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <GallerySlideshow
              slides={slides}
              coupleNames={coupleNames}
              autoplay={draftContent.slideshowAutoplay !== false}
              intervalMs={draftContent.slideshowIntervalMs || 5000}
              compactPreview
            />
          </div>
        </div>
      )}
    </section>
  );
};
