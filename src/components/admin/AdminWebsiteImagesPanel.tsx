import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Images,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X
} from 'lucide-react';
import { WEDDING_PHOTOS } from '../../data/weddingSite';
import {
  GalleryItem,
  HeroOverlayIntensity,
  ImageFitMode,
  ImageFocalPosition,
  SectionImagesMap,
  SiteContentData,
  WebsiteImageSlotConfig,
  WebsiteImageSlotId
} from '../../types';
import { uploadGalleryMediaFiles } from '../../services/weddingRepository';
import {
  createSelectedUploadEntry,
  formatFileSize
} from '../../utils/uploadValidation';
import {
  WEBSITE_IMAGE_SLOTS,
  WebsiteImageSlotDefinition,
  buildDefaultSlotConfig,
  getHeroOverlayGradient,
  getImageFitClass,
  getImageObjectPositionClass,
  isSlotAtOriginalDefault,
  isValidSavedImageUrl,
  resolveWebsiteImageSlot
} from '../../utils/websiteImages';

interface AdminWebsiteImagesPanelProps {
  siteContent: SiteContentData;
  draftContent: SiteContentData;
  setDraftContent: React.Dispatch<React.SetStateAction<SiteContentData>>;
  galleryItems: GalleryItem[];
  coupleNames: string;
  maxImageBytes: number;
  savingContent: boolean;
  onSaveWebsiteImages: (input: {
    sectionImages: SectionImagesMap;
    fallbackHeroImageUrl?: string;
    fallbackPuzzleImageUrl?: string;
    fallbackPuzzleImageFileId?: string;
  }) => Promise<boolean>;
  onRefreshData: () => Promise<void>;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onNeedsDriveReconnect: () => void;
}

interface MediaCandidate {
  key: string;
  title: string;
  subtitle: string;
  fileUrl: string;
  driveFileId: string;
  storageProvider: WebsiteImageSlotConfig['storageProvider'];
  sourceGroup: 'original' | 'uploaded';
}

function slotConfigsEqual(
  a: WebsiteImageSlotConfig,
  b: WebsiteImageSlotConfig
): boolean {
  return (
    a.fileUrl === b.fileUrl &&
    (a.driveFileId || '') === (b.driveFileId || '') &&
    a.fitMode === b.fitMode &&
    a.focalPosition === b.focalPosition &&
    (a.overlayIntensity || '') === (b.overlayIntensity || '') &&
    (a.altText || '') === (b.altText || '') &&
    Boolean(a.hidden) === Boolean(b.hidden)
  );
}

const FOCAL_OPTIONS: Array<{ value: ImageFocalPosition; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Centre' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' }
];

const OVERLAY_OPTIONS: Array<{ value: HeroOverlayIntensity; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'strong', label: 'Strong' }
];

export const AdminWebsiteImagesPanel: React.FC<AdminWebsiteImagesPanelProps> = ({
  siteContent,
  draftContent,
  setDraftContent,
  galleryItems,
  coupleNames,
  maxImageBytes,
  savingContent,
  onSaveWebsiteImages,
  onRefreshData,
  onNotify,
  onNeedsDriveReconnect
}) => {
  const [expandedOptions, setExpandedOptions] = useState<
    Partial<Record<WebsiteImageSlotId, boolean>>
  >({});

  // Change Image modal state
  const [activeModalSlot, setActiveModalSlot] =
    useState<WebsiteImageSlotDefinition | null>(null);
  const [modalTab, setModalTab] = useState<'upload' | 'library'>('upload');
  const [librarySearch, setLibrarySearch] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Pending selection inside the Change Image modal (confirmed on "Use This Image")
  const [pendingCandidate, setPendingCandidate] = useState<{
    fileUrl: string;
    driveFileId: string;
    storageProvider: WebsiteImageSlotConfig['storageProvider'];
    label: string;
  } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Build existing media library (original wedding portraits + uploaded images)
  const mediaCandidates = useMemo<MediaCandidate[]>(() => {
    const builtins: MediaCandidate[] = [
      {
        key: 'builtin-hero',
        title: 'Original Welcome Hero Portrait',
        subtitle: 'Built-in wedding photo',
        fileUrl: WEDDING_PHOTOS.hero.src,
        driveFileId: '',
        storageProvider: 'site_asset',
        sourceGroup: 'original'
      },
      {
        key: 'builtin-story',
        title: 'Original Our Story Portrait',
        subtitle: 'Built-in wedding photo',
        fileUrl: WEDDING_PHOTOS.story.src,
        driveFileId: '',
        storageProvider: 'site_asset',
        sourceGroup: 'original'
      },
      {
        key: 'builtin-schedule',
        title: 'Original Schedule Banner',
        subtitle: 'Built-in wedding photo',
        fileUrl: WEDDING_PHOTOS.schedule.src,
        driveFileId: '',
        storageProvider: 'site_asset',
        sourceGroup: 'original'
      },
      {
        key: 'builtin-qa',
        title: 'Original Q&A Portrait',
        subtitle: 'Built-in wedding photo',
        fileUrl: WEDDING_PHOTOS.qa.src,
        driveFileId: '',
        storageProvider: 'site_asset',
        sourceGroup: 'original'
      }
    ];

    const seenUrls = new Set<string>(builtins.map((b) => b.fileUrl));
    const uploaded: MediaCandidate[] = [];

    for (const item of galleryItems) {
      if (item.mediaType !== 'image') continue;
      if (!isValidSavedImageUrl(item.fileUrl)) continue;
      const cleanUrl = item.fileUrl.trim();
      if (seenUrls.has(cleanUrl)) continue;
      seenUrls.add(cleanUrl);
      uploaded.push({
        key: item.id,
        title: item.title || 'Uploaded Wedding Photo',
        subtitle: item.guestName
          ? `Uploaded by ${item.guestName}`
          : 'Google Drive Library',
        fileUrl: cleanUrl,
        driveFileId: item.driveFileId || '',
        storageProvider:
          item.storageProvider === 'local_server'
            ? 'local_server'
            : 'google_drive',
        sourceGroup: 'uploaded'
      });
    }

    return [...uploaded, ...builtins];
  }, [galleryItems]);

  const filteredCandidates = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return mediaCandidates;
    return mediaCandidates.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q)
    );
  }, [mediaCandidates, librarySearch]);

  // Track dirty status per slot and overall
  const dirtySlots = useMemo(() => {
    const dirty = new Set<WebsiteImageSlotId>();
    for (const slot of WEBSITE_IMAGE_SLOTS) {
      const savedConfig = resolveWebsiteImageSlot(siteContent, slot.id);
      const draftConfig = resolveWebsiteImageSlot(draftContent, slot.id);
      if (!slotConfigsEqual(savedConfig, draftConfig)) {
        dirty.add(slot.id);
      }
    }
    return dirty;
  }, [siteContent, draftContent]);

  const hasUnsavedChanges = dirtySlots.size > 0;

  const updateSlotConfig = (
    slotId: WebsiteImageSlotId,
    updater: (current: WebsiteImageSlotConfig) => WebsiteImageSlotConfig
  ) => {
    setDraftContent((prev) => {
      const current = resolveWebsiteImageSlot(prev, slotId);
      const updated = updater(current);
      const nextSectionImages: SectionImagesMap = {
        ...(prev.sectionImages || {}),
        [slotId]: updated
      };
      const next: SiteContentData = {
        ...prev,
        sectionImages: nextSectionImages
      };
      if (slotId === 'hero') {
        next.heroImageUrl = updated.fileUrl;
      }
      if (slotId === 'puzzle') {
        next.puzzleImageUrl = updated.fileUrl;
        next.puzzleImageFileId = updated.driveFileId || '';
      }
      return next;
    });
  };

  const buildPayloadFromDraft = (): SectionImagesMap => {
    const map: SectionImagesMap = {};
    for (const slot of WEBSITE_IMAGE_SLOTS) {
      map[slot.id] = resolveWebsiteImageSlot(draftContent, slot.id);
    }
    return map;
  };

  const handleSaveAll = async () => {
    const sectionImages = buildPayloadFromDraft();
    await onSaveWebsiteImages({
      sectionImages,
      fallbackHeroImageUrl: draftContent.heroImageUrl,
      fallbackPuzzleImageUrl: draftContent.puzzleImageUrl,
      fallbackPuzzleImageFileId: draftContent.puzzleImageFileId
    });
  };

  const handleResetSlot = (slot: WebsiteImageSlotDefinition) => {
    const original = buildDefaultSlotConfig(slot.id);
    updateSlotConfig(slot.id, () => original);
  };

  const handleDiscardAllDrafts = () => {
    setDraftContent((prev) => ({
      ...prev,
      sectionImages: siteContent.sectionImages,
      heroImageUrl: siteContent.heroImageUrl,
      puzzleImageUrl: siteContent.puzzleImageUrl,
      puzzleImageFileId: siteContent.puzzleImageFileId
    }));
  };

  const openChangeModal = (slot: WebsiteImageSlotDefinition) => {
    const current = resolveWebsiteImageSlot(draftContent, slot.id);
    setActiveModalSlot(slot);
    setModalTab('upload');
    setLibrarySearch('');
    setUploadError(null);
    setUploadProgress(0);
    setIsDragging(false);
    setPendingCandidate({
      fileUrl: current.fileUrl,
      driveFileId: current.driveFileId || '',
      storageProvider: current.storageProvider,
      label: 'Current image'
    });
  };

  const closeChangeModal = () => {
    if (uploading) return;
    setActiveModalSlot(null);
    setPendingCandidate(null);
    setUploadError(null);
    setUploadProgress(0);
    setIsDragging(false);
  };

  const handleConfirmModalSelection = () => {
    if (!activeModalSlot || !pendingCandidate) return;
    updateSlotConfig(activeModalSlot.id, (current) => ({
      ...current,
      fileUrl: pendingCandidate.fileUrl,
      driveFileId: pendingCandidate.driveFileId,
      storageProvider: pendingCandidate.storageProvider,
      hidden: false
    }));
    closeChangeModal();
  };

  const processUploadFile = async (file: File) => {
    if (!activeModalSlot || uploading) return;
    setUploadError(null);

    const entry = createSelectedUploadEntry(file, {
      maxImageBytes,
      maxVideoBytes: 100 * 1024 * 1024
    });

    if (entry.mediaType !== 'image' || entry.validationError) {
      setUploadError(
        entry.validationError ||
          `Please select a supported image (JPG, PNG, WebP, GIF, HEIC, or HEIF) up to ${formatFileSize(
            maxImageBytes
          )}.`
      );
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // forceStatus: 'hidden' keeps website section uploads separate from the public guest "Captured by You" gallery
      const outcome = await uploadGalleryMediaFiles({
        entries: [{ id: entry.id, file }],
        guestName: coupleNames,
        caption: activeModalSlot.title,
        category: activeModalSlot.driveCategory,
        isAdmin: true,
        forceStatus: 'hidden',
        onProgress: setUploadProgress
      });

      if (outcome.needsDriveReconnect) {
        onNeedsDriveReconnect();
      }

      if (outcome.createdItems.length > 0) {
        const created = outcome.createdItems[0];
        if (!isValidSavedImageUrl(created.fileUrl)) {
          setUploadError(
            'The uploaded image did not return a valid saved URL. Please retry.'
          );
          return;
        }
        setPendingCandidate({
          fileUrl: created.fileUrl.trim(),
          driveFileId: (created.driveFileId || '').trim(),
          storageProvider:
            created.storageProvider === 'local_server'
              ? 'local_server'
              : 'google_drive',
          label: file.name
        });
        await onRefreshData();
        onNotify(
          'success',
          `Image uploaded to Google Drive for "${activeModalSlot.sectionLabel}". Click "Use This Image" and then "Save Changes" to publish it live.`
        );
      } else {
        setUploadError(
          outcome.results[0]?.errorMessage ||
            outcome.globalError ||
            'Could not upload image. Please check your Google Drive connection and try again.'
        );
      }
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : 'Could not upload image. Please try again.'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (file) {
      void processUploadFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processUploadFile(file);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Global Save Bar */}
      <section className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#C5A04A]/40 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#07543E]/10 text-[#07543E] flex items-center justify-center shrink-0 mt-0.5">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#737746] font-semibold">
                Visual Section Media
              </p>
              <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E]">
                Website Images
              </h2>
              <p className="text-sm text-[#262820]/75 mt-1 max-w-2xl">
                Manage the pictures displayed across your wedding website. Select a section to preview and replace its image.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {hasUnsavedChanges && (
              <button
                type="button"
                disabled={savingContent}
                onClick={handleDiscardAllDrafts}
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg border border-[#07543E]/25 bg-white hover:bg-[#FAF7F0] disabled:opacity-50 text-[#07543E] text-xs font-semibold uppercase tracking-wider cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard</span>
              </button>
            )}

            <button
              type="button"
              disabled={savingContent || !hasUnsavedChanges}
              onClick={() => void handleSaveAll()}
              className={`inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                hasUnsavedChanges
                  ? 'bg-[#07543E] hover:bg-[#073B2B] text-white shadow-sm'
                  : 'bg-[#07543E]/15 text-[#07543E]/60 cursor-not-allowed'
              }`}
            >
              {savingContent ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4 text-[#F3E5AB]" />
              )}
              <span>
                {savingContent
                  ? 'Saving...'
                  : hasUnsavedChanges
                  ? `Save Changes (${dirtySlots.size})`
                  : 'All Changes Saved'}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#07543E]/10 text-xs text-[#262820]/70">
          <p>
            <strong>Safe media handling:</strong> Replacing or hiding an image here only updates that section—original files remain safely stored in Google Drive.
          </p>
          <p className="text-[#737746] font-medium">
            Gallery Slideshow &amp; Guest Uploads stay in the <strong>Gallery</strong> tab.
          </p>
        </div>
      </section>

      {/* Section Image Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {WEBSITE_IMAGE_SLOTS.map((slot) => {
          const config = resolveWebsiteImageSlot(draftContent, slot.id);
          const isDirty = dirtySlots.has(slot.id);
          const isOriginal = isSlotAtOriginalDefault(slot.id, config);
          const optionsOpen = Boolean(expandedOptions[slot.id]);
          const isHero = slot.id === 'hero';
          const isSchedule = slot.id === 'schedule';

          return (
            <article
              key={slot.id}
              className={`rounded-xl bg-[#FFFDF8] border overflow-hidden flex flex-col transition-shadow ${
                isDirty
                  ? 'border-[#C5A04A] ring-1 ring-[#C5A04A]/40 shadow-md'
                  : 'border-[#07543E]/15 shadow-xs'
              }`}
            >
              {/* Visual Preview Frame */}
              <div
                className={`relative w-full ${
                  isSchedule ? 'aspect-[16/9]' : 'aspect-[16/10]'
                } overflow-hidden ${
                  isHero ? 'bg-[#073B2B]' : 'bg-[#F2EBDD]'
                } border-b border-[#07543E]/10`}
              >
                {config.hidden ? (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-[#F2EBDD] via-[#FAF7F0] to-[#F2EBDD]">
                    <div className="w-11 h-11 rounded-full bg-[#07543E]/10 text-[#07543E]/70 flex items-center justify-center mb-2.5">
                      <EyeOff className="w-5 h-5" />
                    </div>
                    <p className="font-serif text-lg font-semibold text-[#07543E]">
                      Image Removed From Section
                    </p>
                    <p className="text-xs text-[#262820]/65 mt-1 max-w-xs">
                      This section will display cleanly without a photo until you restore or choose a new image.
                    </p>
                  </div>
                ) : (
                  <>
                    <img
                      src={config.fileUrl}
                      alt={config.altText || slot.defaultAlt}
                      referrerPolicy="no-referrer"
                      className={`w-full h-full transition-all duration-300 ${getImageFitClass(
                        config.fitMode
                      )} ${getImageObjectPositionClass(
                        config.focalPosition,
                        slot.id
                      )}`}
                    />
                    {slot.supportsOverlay && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: getHeroOverlayGradient(
                            config.overlayIntensity
                          )
                        }}
                      />
                    )}
                    {isHero && (
                      <div className="absolute inset-x-0 bottom-3 px-4 text-center pointer-events-none">
                        <p className="font-serif text-lg sm:text-xl font-semibold text-white drop-shadow-xs">
                          {coupleNames}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[#F3E5AB]">
                          Hero readability preview
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Top Status Badges */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
                  <span className="px-2.5 py-1 rounded-md bg-[#073B2B]/85 backdrop-blur-xs text-[#F3E5AB] text-[10px] font-bold uppercase tracking-[0.16em]">
                    {slot.sectionLabel}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {config.hidden ? (
                      <span className="px-2 py-0.5 rounded-md bg-stone-800/85 text-white text-[10px] font-semibold uppercase tracking-wider">
                        Hidden
                      </span>
                    ) : isOriginal ? (
                      <span className="px-2 py-0.5 rounded-md bg-white/90 text-[#07543E] text-[10px] font-semibold uppercase tracking-wider border border-[#07543E]/15">
                        Original
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-[#C5A04A] text-[#073B2B] text-[10px] font-bold uppercase tracking-wider">
                        Custom
                      </span>
                    )}

                    {isDirty && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-950 border border-amber-300 text-[10px] font-bold uppercase tracking-wider">
                        Unsaved
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="font-serif text-xl sm:text-2xl font-semibold text-[#07543E] leading-snug">
                    {slot.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#262820]/75 leading-relaxed">
                    {slot.description}
                  </p>
                  <p className="text-[11px] font-medium text-[#737746] pt-0.5">
                    Location: {slot.locationHint}
                  </p>
                </div>

                {/* Primary Action Buttons */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openChangeModal(slot)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[42px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] text-white text-xs font-semibold uppercase tracking-wider cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-[#F3E5AB]" />
                      <span>Change Image</span>
                    </button>

                    {slot.canRemove && (
                      <button
                        type="button"
                        onClick={() =>
                          updateSlotConfig(slot.id, (curr) => ({
                            ...curr,
                            hidden: !curr.hidden
                          }))
                        }
                        className={`inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[42px] rounded-lg border text-xs font-semibold uppercase tracking-wider cursor-pointer ${
                          config.hidden
                            ? 'border-[#07543E]/30 bg-[#07543E]/8 text-[#07543E] hover:bg-[#07543E]/15'
                            : 'border-red-200 bg-white text-red-700 hover:bg-red-50'
                        }`}
                      >
                        {config.hidden ? (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>Restore Image</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Remove Image</span>
                          </>
                        )}
                      </button>
                    )}

                    {!isOriginal && (
                      <button
                        type="button"
                        onClick={() => handleResetSlot(slot)}
                        title="Restore the original built-in wedding photograph and framing"
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[42px] rounded-lg border border-[#C5A04A]/60 bg-[#FAF7F0] hover:bg-[#F2EBDD] text-[#07543E] text-xs font-semibold cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-[#C5A04A]" />
                        <span>Reset to Original</span>
                      </button>
                    )}

                    {isDirty && (
                      <button
                        type="button"
                        disabled={savingContent}
                        onClick={() => void handleSaveAll()}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[42px] rounded-lg bg-[#C5A04A] hover:bg-[#B48E3B] disabled:opacity-60 text-[#073B2B] text-xs font-bold uppercase tracking-wider cursor-pointer"
                      >
                        {savingContent ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Save Changes</span>
                      </button>
                    )}
                  </div>

                  {/* Collapsible Display & Accessibility Controls */}
                  <div className="pt-2 border-t border-[#07543E]/10">
                    <button
                      type="button"
                      aria-expanded={optionsOpen}
                      onClick={() =>
                        setExpandedOptions((prev) => ({
                          ...prev,
                          [slot.id]: !prev[slot.id]
                        }))
                      }
                      className="w-full flex items-center justify-between py-1.5 text-xs font-semibold text-[#07543E] hover:text-[#073B2B] cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-[#C5A04A]" />
                        <span>Display &amp; Accessibility Options</span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          optionsOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {optionsOpen && (
                      <div className="mt-3 p-3.5 rounded-lg bg-[#FAF7F0] border border-[#07543E]/12 space-y-3.5">
                        {slot.supportsFitMode && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#737746] mb-1.5">
                              Framing Mode
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {(
                                [
                                  { value: 'cover', label: 'Cover (Fill Frame)' },
                                  {
                                    value: 'contain',
                                    label: 'Contain (Full Photo)'
                                  }
                                ] as Array<{ value: ImageFitMode; label: string }>
                              ).map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() =>
                                    updateSlotConfig(slot.id, (curr) => ({
                                      ...curr,
                                      fitMode: opt.value
                                    }))
                                  }
                                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                    config.fitMode === opt.value
                                      ? 'bg-[#07543E] text-white border-[#07543E]'
                                      : 'bg-white text-[#262820] border-[#07543E]/20 hover:border-[#07543E]'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {slot.supportsFocalPosition && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#737746] mb-1.5">
                              Focal Position
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {FOCAL_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() =>
                                    updateSlotConfig(slot.id, (curr) => ({
                                      ...curr,
                                      focalPosition: opt.value
                                    }))
                                  }
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                    config.focalPosition === opt.value
                                      ? 'bg-[#07543E] text-white border-[#07543E]'
                                      : 'bg-white text-[#262820] border-[#07543E]/20 hover:border-[#07543E]'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {slot.supportsOverlay && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#737746] mb-1.5">
                              Banner Overlay Readability
                            </p>
                            <div className="grid grid-cols-3 gap-1.5">
                              {OVERLAY_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() =>
                                    updateSlotConfig(slot.id, (curr) => ({
                                      ...curr,
                                      overlayIntensity: opt.value
                                    }))
                                  }
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                    (config.overlayIntensity || 'medium') ===
                                    opt.value
                                      ? 'bg-[#07543E] text-white border-[#07543E]'
                                      : 'bg-white text-[#262820] border-[#07543E]/20 hover:border-[#07543E]'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <label
                            htmlFor={`alt-text-${slot.id}`}
                            className="block text-[11px] font-semibold uppercase tracking-wider text-[#737746] mb-1.5"
                          >
                            Alt Text (Accessibility Description)
                          </label>
                          <input
                            id={`alt-text-${slot.id}`}
                            type="text"
                            maxLength={200}
                            value={config.altText || ''}
                            onChange={(e) =>
                              updateSlotConfig(slot.id, (curr) => ({
                                ...curr,
                                altText: e.target.value
                              }))
                            }
                            placeholder={slot.defaultAlt}
                            className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-[#07543E]/20 bg-white text-[#262820]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Sticky Bottom Save Bar when edits are pending */}
      {hasUnsavedChanges && (
        <div className="sticky bottom-4 z-20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-[#073B2B] text-[#FAF7F0] border border-[#C5A04A]/60 shadow-xl">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm">
            <Sparkles className="w-4 h-4 text-[#F3E5AB] shrink-0" />
            <span>
              You have unsaved image changes in{' '}
              <strong>
                {dirtySlots.size}{' '}
                {dirtySlots.size === 1 ? 'section' : 'sections'}
              </strong>
              . Click Save Changes to publish them live.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={savingContent}
              onClick={handleDiscardAllDrafts}
              className="px-4 min-h-[42px] rounded-lg border border-white/25 hover:bg-white/10 text-xs font-semibold uppercase tracking-wider cursor-pointer"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={savingContent}
              onClick={() => void handleSaveAll()}
              className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[42px] rounded-lg bg-[#C5A04A] hover:bg-[#D4B05B] disabled:opacity-60 text-[#073B2B] text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              {savingContent ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>{savingContent ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ====================================================================
          CHANGE IMAGE MODAL (Upload New Image OR Choose from Existing Media)
      ==================================================================== */}
      {activeModalSlot && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Change image for ${activeModalSlot.title}`}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
          onClick={closeChangeModal}
        >
          <div
            className="relative w-full max-w-3xl bg-[#FAF7F0] rounded-2xl border border-[#C5A04A]/50 shadow-2xl my-auto overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-4 bg-[#FFFDF8] border-b border-[#07543E]/12 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#737746] font-semibold">
                  {activeModalSlot.sectionLabel} Section
                </p>
                <h3 className="font-serif text-xl sm:text-2xl font-semibold text-[#07543E]">
                  Change Image — {activeModalSlot.title}
                </h3>
              </div>
              <button
                type="button"
                disabled={uploading}
                onClick={closeChangeModal}
                aria-label="Close image picker"
                className="w-10 h-10 rounded-full bg-white border border-[#07543E]/15 hover:bg-[#F2EBDD] disabled:opacity-50 text-[#07543E] flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Option Tabs */}
            <div className="px-5 sm:px-6 pt-4 bg-[#FAF7F0]">
              <div
                role="tablist"
                aria-label="Image source"
                className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#F2EBDD] border border-[#07543E]/10"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={modalTab === 'upload'}
                  onClick={() => setModalTab('upload')}
                  className={`inline-flex items-center justify-center gap-2 min-h-[42px] px-3 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                    modalTab === 'upload'
                      ? 'bg-[#07543E] text-white shadow-xs'
                      : 'text-[#07543E] hover:bg-white/60'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload New Image</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={modalTab === 'library'}
                  onClick={() => setModalTab('library')}
                  className={`inline-flex items-center justify-center gap-2 min-h-[42px] px-3 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                    modalTab === 'library'
                      ? 'bg-[#07543E] text-white shadow-xs'
                      : 'text-[#07543E] hover:bg-white/60'
                  }`}
                >
                  <Images className="w-4 h-4" />
                  <span>Choose Existing ({mediaCandidates.length})</span>
                </button>
              </div>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {uploadError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}

              {modalTab === 'upload' ? (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!uploading) setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`rounded-xl border-2 border-dashed p-7 sm:p-9 text-center transition-colors ${
                      isDragging
                        ? 'border-[#C5A04A] bg-[#F2EBDD]/70'
                        : 'border-[#07543E]/25 bg-white'
                    }`}
                  >
                    <div className="w-12 h-12 mx-auto rounded-full bg-[#07543E]/10 text-[#07543E] flex items-center justify-center mb-3">
                      {uploading ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <Upload className="w-6 h-6" />
                      )}
                    </div>

                    <p className="font-serif text-xl font-semibold text-[#07543E]">
                      {uploading
                        ? `Uploading to Google Drive (${uploadProgress}%)...`
                        : 'Upload a photograph for this section'}
                    </p>
                    <p className="text-xs sm:text-sm text-[#262820]/70 mt-1 max-w-md mx-auto">
                      Drag and drop an image here or browse from your device. Supports JPG, PNG, WebP, GIF, HEIC, and HEIF up to{' '}
                      {formatFileSize(maxImageBytes)}.
                    </p>

                    {uploading ? (
                      <div className="mt-5 max-w-sm mx-auto space-y-2">
                        <div className="w-full h-2.5 rounded-full bg-[#F2EBDD] overflow-hidden">
                          <div
                            className="h-full bg-[#07543E] transition-all duration-200"
                            style={{ width: `${Math.max(4, uploadProgress)}%` }}
                          />
                        </div>
                        <p className="text-xs font-semibold text-[#07543E]">
                          {uploadProgress}% complete
                        </p>
                      </div>
                    ) : (
                      <div className="mt-5">
                        <label
                          htmlFor="website-images-modal-file-input"
                          className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] text-white text-xs font-semibold uppercase tracking-wider cursor-pointer"
                        >
                          <Upload className="w-4 h-4 text-[#F3E5AB]" />
                          <span>Choose Image File</span>
                        </label>
                        <input
                          ref={fileInputRef}
                          id="website-images-modal-file-input"
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif"
                          disabled={uploading}
                          onChange={handleFileInputChange}
                          className="sr-only"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="w-4 h-4 text-[#07543E]/55 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      placeholder="Search uploaded wedding photos..."
                      aria-label="Search existing wedding photos"
                      className="w-full pl-10 pr-4 py-2.5 min-h-[44px] text-sm rounded-xl bg-white border border-[#07543E]/20 text-[#262820]"
                    />
                  </div>

                  {filteredCandidates.length === 0 ? (
                    <div className="p-8 rounded-xl bg-white border border-[#07543E]/12 text-center text-sm text-[#262820]/70">
                      No matching photos found. Try a different search term or upload a new image.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {filteredCandidates.map((item) => {
                        const isSelected =
                          pendingCandidate?.fileUrl === item.fileUrl;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() =>
                              setPendingCandidate({
                                fileUrl: item.fileUrl,
                                driveFileId: item.driveFileId,
                                storageProvider: item.storageProvider,
                                label: item.title
                              })
                            }
                            className={`group text-left rounded-xl overflow-hidden border transition-all cursor-pointer bg-white ${
                              isSelected
                                ? 'border-[#C5A04A] ring-2 ring-[#C5A04A]'
                                : 'border-[#07543E]/15 hover:border-[#07543E]'
                            }`}
                          >
                            <div className="aspect-[4/3] bg-[#F2EBDD] overflow-hidden relative">
                              <img
                                src={item.fileUrl}
                                alt={item.title}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover object-[50%_20%] group-hover:scale-105 transition-transform"
                              />
                              {isSelected && (
                                <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#07543E] text-[#F3E5AB] flex items-center justify-center shadow-md">
                                  <Check className="w-3.5 h-3.5" />
                                </span>
                              )}
                              {item.sourceGroup === 'original' && (
                                <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/65 text-white text-[9px] font-semibold uppercase tracking-wider">
                                  Original
                                </span>
                              )}
                            </div>
                            <div className="p-2">
                              <p className="text-xs font-semibold text-[#07543E] truncate">
                                {item.title}
                              </p>
                              <p className="text-[10px] text-[#262820]/60 truncate">
                                {item.subtitle}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Selected Image Preview Strip */}
              {pendingCandidate && (
                <div className="p-3.5 rounded-xl bg-white border border-[#C5A04A]/50 flex flex-col sm:flex-row sm:items-center gap-3.5">
                  <div className="w-full sm:w-28 h-24 sm:h-20 rounded-lg overflow-hidden bg-[#073B2B] border border-[#07543E]/15 shrink-0">
                    <img
                      src={pendingCandidate.fileUrl}
                      alt={pendingCandidate.label}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-[50%_20%]"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#737746] font-semibold">
                      Selected Preview
                    </p>
                    <p className="font-serif text-base font-semibold text-[#07543E] truncate">
                      {pendingCandidate.label}
                    </p>
                    <p className="text-xs text-[#262820]/65 mt-0.5">
                      Click &ldquo;Use This Image&rdquo; to apply it to{' '}
                      <strong>{activeModalSlot.sectionLabel}</strong>, then save your changes to publish live.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 sm:px-6 py-4 bg-[#FFFDF8] border-t border-[#07543E]/12 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={uploading}
                onClick={closeChangeModal}
                className="px-4 min-h-[42px] rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] disabled:opacity-50 text-xs font-semibold uppercase tracking-wider text-[#07543E] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploading || !pendingCandidate}
                onClick={handleConfirmModalSelection}
                className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[42px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                <Check className="w-4 h-4 text-[#F3E5AB]" />
                <span>Use This Image</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
