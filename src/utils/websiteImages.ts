import { WEDDING_PHOTOS } from '../data/weddingSite';
import {
  DriveMediaCategory,
  HeroOverlayIntensity,
  ImageFitMode,
  ImageFocalPosition,
  SectionImagesMap,
  SiteContentData,
  WebsiteImageSlotConfig,
  WebsiteImageSlotId
} from '../types';

export interface WebsiteImageSlotDefinition {
  id: WebsiteImageSlotId;
  sectionLabel: string;
  title: string;
  description: string;
  locationHint: string;
  defaultUrl: string;
  defaultAlt: string;
  defaultFitMode: ImageFitMode;
  defaultFocalPosition: ImageFocalPosition;
  defaultOverlayIntensity?: HeroOverlayIntensity;
  supportsOverlay: boolean;
  supportsFitMode: boolean;
  supportsFocalPosition: boolean;
  canRemove: boolean;
  driveCategory: DriveMediaCategory;
}

export const WEBSITE_IMAGE_SLOTS: WebsiteImageSlotDefinition[] = [
  {
    id: 'hero',
    sectionLabel: 'Welcome',
    title: 'Welcome — Main Hero Banner',
    description:
      'Full-bleed portrait at the very top of the wedding website behind your names, venue, and ceremony countdown.',
    locationHint: 'Top of homepage (Hero Banner)',
    defaultUrl: WEDDING_PHOTOS.hero.src,
    defaultAlt: WEDDING_PHOTOS.hero.alt,
    defaultFitMode: 'cover',
    defaultFocalPosition: 'top',
    defaultOverlayIntensity: 'medium',
    supportsOverlay: true,
    supportsFitMode: true,
    supportsFocalPosition: true,
    canRemove: false,
    driveCategory: 'website_homepage'
  },
  {
    id: 'story',
    sectionLabel: 'Our Story',
    title: 'Our Story — Couple Portrait',
    description:
      'Editorial portrait displayed alongside your love story narrative in the Our Story section.',
    locationHint: 'Our Story section (left photo card)',
    defaultUrl: WEDDING_PHOTOS.story.src,
    defaultAlt: WEDDING_PHOTOS.story.alt,
    defaultFitMode: 'cover',
    defaultFocalPosition: 'top',
    supportsOverlay: false,
    supportsFitMode: true,
    supportsFocalPosition: true,
    canRemove: true,
    driveCategory: 'website_story'
  },
  {
    id: 'schedule',
    sectionLabel: 'Schedule',
    title: 'Schedule — Event & Venue Banner',
    description:
      'Wide banner photograph featured above the Friday and Saturday wedding schedule timeline.',
    locationHint: 'Schedule of Events section (wide top banner)',
    defaultUrl: WEDDING_PHOTOS.schedule.src,
    defaultAlt: WEDDING_PHOTOS.schedule.alt,
    defaultFitMode: 'cover',
    defaultFocalPosition: 'center',
    supportsOverlay: false,
    supportsFitMode: true,
    supportsFocalPosition: true,
    canRemove: true,
    driveCategory: 'website_schedule'
  },
  {
    id: 'puzzle',
    sectionLabel: 'Puzzle',
    title: 'Wedding Photo Puzzle Image',
    description:
      'Photograph scrambled into the interactive 3×3 wedding photo puzzle guests solve to unlock a song choice.',
    locationHint: 'Wedding Photo Puzzle section (3×3 sliding board)',
    defaultUrl: WEDDING_PHOTOS.story.src,
    defaultAlt: 'Mary and Joseph wedding photo puzzle portrait',
    defaultFitMode: 'cover',
    defaultFocalPosition: 'center',
    supportsOverlay: false,
    supportsFitMode: false,
    supportsFocalPosition: false,
    canRemove: false,
    driveCategory: 'admin_media'
  },
  {
    id: 'qa',
    sectionLabel: 'Q&A',
    title: 'Q&A — Guest Information Portrait',
    description:
      'Sticky portrait displayed beside the Guest Information Q&A accordion.',
    locationHint: 'Q&A / Guest Information section (left portrait)',
    defaultUrl: WEDDING_PHOTOS.qa.src,
    defaultAlt: WEDDING_PHOTOS.qa.alt,
    defaultFitMode: 'cover',
    defaultFocalPosition: 'top',
    supportsOverlay: false,
    supportsFitMode: true,
    supportsFocalPosition: true,
    canRemove: true,
    driveCategory: 'admin_media'
  }
];

const ALLOWED_SLOT_IDS = new Set<WebsiteImageSlotId>(
  WEBSITE_IMAGE_SLOTS.map((s) => s.id)
);
const ALLOWED_FIT_MODES = new Set<ImageFitMode>(['cover', 'contain']);
const ALLOWED_FOCAL_POSITIONS = new Set<ImageFocalPosition>([
  'center',
  'top',
  'bottom',
  'left',
  'right'
]);
const ALLOWED_OVERLAYS = new Set<HeroOverlayIntensity>(['light', 'medium', 'strong']);

export function getWebsiteImageSlotDef(
  slotId: WebsiteImageSlotId
): WebsiteImageSlotDefinition {
  return (
    WEBSITE_IMAGE_SLOTS.find((s) => s.id === slotId) || WEBSITE_IMAGE_SLOTS[0]
  );
}

export function buildDefaultSlotConfig(
  slotId: WebsiteImageSlotId
): WebsiteImageSlotConfig {
  const def = getWebsiteImageSlotDef(slotId);
  return {
    fileUrl: def.defaultUrl,
    driveFileId: '',
    storageProvider: 'site_asset',
    fitMode: def.defaultFitMode,
    focalPosition: def.defaultFocalPosition,
    ...(def.supportsOverlay
      ? { overlayIntensity: def.defaultOverlayIntensity || 'medium' }
      : {}),
    altText: def.defaultAlt,
    hidden: false
  };
}

export function isValidSavedImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return false;
  }
  return (
    trimmed.startsWith('/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://')
  );
}

export function sanitizeWebsiteImageSlotConfig(
  slotId: WebsiteImageSlotId,
  raw: unknown
): WebsiteImageSlotConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const def = getWebsiteImageSlotDef(slotId);
  const input = raw as Record<string, unknown>;

  const rawUrl = typeof input.fileUrl === 'string' ? input.fileUrl.trim() : '';
  if (!isValidSavedImageUrl(rawUrl)) return undefined;

  const storageProvider: WebsiteImageSlotConfig['storageProvider'] =
    input.storageProvider === 'google_drive' || input.storageProvider === 'local_server'
      ? input.storageProvider
      : rawUrl.includes('/api/gallery/drive/')
      ? 'google_drive'
      : 'site_asset';

  const driveFileId =
    typeof input.driveFileId === 'string' ? input.driveFileId.trim().slice(0, 200) : '';

  if (
    storageProvider === 'google_drive' &&
    !driveFileId &&
    !rawUrl.includes('/api/gallery/drive/')
  ) {
    return undefined;
  }

  const fitMode: ImageFitMode = ALLOWED_FIT_MODES.has(input.fitMode as ImageFitMode)
    ? (input.fitMode as ImageFitMode)
    : def.defaultFitMode;

  const focalPosition: ImageFocalPosition = ALLOWED_FOCAL_POSITIONS.has(
    input.focalPosition as ImageFocalPosition
  )
    ? (input.focalPosition as ImageFocalPosition)
    : def.defaultFocalPosition;

  const altText =
    typeof input.altText === 'string' && input.altText.trim().length > 0
      ? input.altText.trim().slice(0, 200)
      : def.defaultAlt;

  const out: WebsiteImageSlotConfig = {
    fileUrl: rawUrl.slice(0, 500),
    driveFileId,
    storageProvider,
    fitMode,
    focalPosition,
    altText,
    hidden: def.canRemove ? Boolean(input.hidden) : false
  };

  if (def.supportsOverlay) {
    out.overlayIntensity = ALLOWED_OVERLAYS.has(
      input.overlayIntensity as HeroOverlayIntensity
    )
      ? (input.overlayIntensity as HeroOverlayIntensity)
      : def.defaultOverlayIntensity || 'medium';
  }

  return out;
}

export function sanitizeSectionImagesMap(raw: unknown): SectionImagesMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const result: SectionImagesMap = {};

  for (const [key, val] of Object.entries(input)) {
    if (!ALLOWED_SLOT_IDS.has(key as WebsiteImageSlotId)) continue;
    const clean = sanitizeWebsiteImageSlotConfig(key as WebsiteImageSlotId, val);
    if (clean) {
      result[key as WebsiteImageSlotId] = clean;
    }
  }

  return result;
}

/**
 * Resolves the effective image configuration for any section, preserving
 * 100% backwards compatibility with existing heroImageUrl, puzzleImageUrl,
 * and built-in WEDDING_PHOTOS defaults when sectionImages has not been set.
 */
export function resolveWebsiteImageSlot(
  siteContent: SiteContentData,
  slotId: WebsiteImageSlotId
): WebsiteImageSlotConfig {
  const def = getWebsiteImageSlotDef(slotId);
  const stored = siteContent.sectionImages?.[slotId];
  if (stored && isValidSavedImageUrl(stored.fileUrl)) {
    return {
      ...buildDefaultSlotConfig(slotId),
      ...stored,
      hidden: def.canRemove ? Boolean(stored.hidden) : false,
      altText:
        stored.altText && stored.altText.trim().length > 0
          ? stored.altText.trim()
          : def.defaultAlt
    };
  }

  if (slotId === 'hero' && isValidSavedImageUrl(siteContent.heroImageUrl)) {
    const heroUrl = siteContent.heroImageUrl.trim();
    return {
      ...buildDefaultSlotConfig('hero'),
      fileUrl: heroUrl,
      storageProvider: heroUrl.includes('/api/gallery/drive/')
        ? 'google_drive'
        : 'site_asset'
    };
  }

  if (slotId === 'puzzle' && isValidSavedImageUrl(siteContent.puzzleImageUrl)) {
    const puzzleUrl = siteContent.puzzleImageUrl.trim();
    return {
      ...buildDefaultSlotConfig('puzzle'),
      fileUrl: puzzleUrl,
      driveFileId: (siteContent.puzzleImageFileId || '').trim(),
      storageProvider:
        siteContent.puzzleImageFileId || puzzleUrl.includes('/api/gallery/drive/')
          ? 'google_drive'
          : 'site_asset'
    };
  }

  return buildDefaultSlotConfig(slotId);
}

export function isSlotAtOriginalDefault(
  slotId: WebsiteImageSlotId,
  config: WebsiteImageSlotConfig
): boolean {
  const def = buildDefaultSlotConfig(slotId);
  return (
    config.fileUrl === def.fileUrl &&
    config.fitMode === def.fitMode &&
    config.focalPosition === def.focalPosition &&
    Boolean(config.hidden) === Boolean(def.hidden) &&
    (config.altText || def.altText) === def.altText &&
    (def.overlayIntensity
      ? (config.overlayIntensity || def.overlayIntensity) === def.overlayIntensity
      : true)
  );
}

export function getImageObjectPositionClass(
  focalPosition: ImageFocalPosition,
  slotId?: WebsiteImageSlotId
): string {
  switch (focalPosition) {
    case 'top':
      // Preserves flattering portrait framing (20% from top) for hero/story/qa
      return 'object-[50%_20%]';
    case 'bottom':
      return 'object-bottom';
    case 'left':
      return 'object-left';
    case 'right':
      return 'object-right';
    case 'center':
    default:
      // Preserves existing schedule banner default framing when unchanged
      return slotId === 'schedule' ? 'object-[50%_26%]' : 'object-center';
  }
}

export function getHeroResponsiveObjectPositionClass(
  focalPosition: ImageFocalPosition
): string {
  switch (focalPosition) {
    case 'top':
      // Tailored across mobile, tablet, and desktop so both faces stay centered and clear of the lower editorial strip
      return 'object-[52%_20%] sm:object-[52%_18%] md:object-[52%_16%] lg:object-[52%_14%] xl:object-[52%_15%]';
    case 'bottom':
      return 'object-[52%_82%] lg:object-bottom';
    case 'left':
      return 'object-left';
    case 'right':
      return 'object-right';
    case 'center':
    default:
      return 'object-[52%_36%] lg:object-[52%_32%]';
  }
}

export function getImageFitClass(fitMode: ImageFitMode): string {
  return fitMode === 'contain' ? 'object-contain' : 'object-cover';
}

export function getHeroOverlayGradient(
  intensity: HeroOverlayIntensity = 'medium'
): string {
  switch (intensity) {
    case 'light':
      return 'linear-gradient(to top, rgba(7, 59, 43, 0.76) 0%, rgba(7, 59, 43, 0.40) 20%, rgba(7, 59, 43, 0.08) 38%, rgba(7, 59, 43, 0) 54%)';
    case 'strong':
      return 'linear-gradient(to top, rgba(7, 59, 43, 0.90) 0%, rgba(7, 59, 43, 0.60) 26%, rgba(7, 59, 43, 0.16) 46%, rgba(7, 59, 43, 0) 64%)';
    case 'medium':
    default:
      return 'linear-gradient(to top, rgba(7, 59, 43, 0.84) 0%, rgba(7, 59, 43, 0.48) 22%, rgba(7, 59, 43, 0.10) 40%, rgba(7, 59, 43, 0) 56%)';
  }
}
