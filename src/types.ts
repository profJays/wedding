export interface AnswerOption {
  id: string;
  text: string;
  verdict: string;
  isFatal?: boolean; // For White dress in Q5
  personaTag?: string;
}

export interface Question {
  id: number;
  question: string;
  subtitle?: string;
  options: AnswerOption[];
}

export type AppView =
  | 'website'
  | 'invitation'
  | 'welcome'
  | 'quiz'
  | 'uninvited'
  | 'approved'
  | 'admin';

export interface CoupleQAItem {
  id: string;
  question: string;
  answer: string;
}

export interface WeddingScheduleEvent {
  id: string;
  dayKey: 'dec-11' | 'dec-12';
  dayHeading: string;
  dateISO: string; // YYYY-MM-DD in Africa/Lagos
  startTime24: string; // HH:mm
  endTime24?: string; // HH:mm
  timeLabel: string;
  title: string;
  venueName: string;
  venueQuery: string; // Actual address/venue name for Google Maps search & directions
  dressCode?: string;
  coloursOfDay?: string;
  description: string;
}

export interface GuestFAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface SiteContentData {
  coupleNames: string;
  brideName: string;
  groomName: string;
  hashtag: string;
  weddingDateDisplay: string;
  ceremonyTargetISO: string;
  galleryUnlockISO: string;
  galleryUnlockEpochMs: number;
  mainVenue: string;
  heroImageUrl: string;
  contactName: string;
  contactPhone: string;
  welcomeHeading: string;
  welcomeParagraphs: string[];
  welcomeSignOff: string;
  storyHeading: string;
  storyParagraphs: string[];
  coupleQas: CoupleQAItem[];
  scheduleEvents: WeddingScheduleEvent[];
  guestFaqs: GuestFAQItem[];
  footerNote: string;
  rsvpOpen: boolean;
  maxGuestsPerRsvp: number;
  galleryPublicEnabled: boolean;
  themePrimaryHex: string;
  themeAccentHex: string;
  themeGoldHex: string;
  updatedAt?: string;
  updatedByUid?: string;
}

export interface RsvpRecord {
  id: string;
  fullName: string;
  normalizedName: string;
  attending: boolean;
  guestCount: number;
  message: string;
  submittedAt: Date | null;
  updatedAt: Date | null;
}

export interface GalleryItem {
  id: string;
  title: string;
  guestName: string;
  mediaType: 'image' | 'video';
  mimeType: string;
  fileUrl: string;
  storageProvider: 'google_drive' | 'local_server' | 'site_asset';
  driveFileId: string;
  sizeBytes: number;
  status: 'pending' | 'approved' | 'hidden';
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  addedAt: Date | null;
  addedBy: string;
}

export type DriveMediaCategory =
  | 'admin_media'
  | 'website_homepage'
  | 'website_story'
  | 'website_schedule'
  | 'guest_photo'
  | 'guest_video';

export interface DriveSubfolderMap {
  rootId?: string;
  websitePhotosId?: string;
  homepageId?: string;
  ourStoryId?: string;
  scheduleId?: string;
  guestUploadsId?: string;
  guestPhotosId?: string;
  guestVideosId?: string;
  adminMediaId?: string;
}

export interface DriveConnectionStatus {
  configuredFolderId: boolean;
  folderIdPreview: string;
  folderName: string;
  oauthConnected: boolean;
  connectedEmail: string;
  serverRefreshConfigured: boolean;
  lastUploadAt: string | null;
  subfoldersInitialized: boolean;
  subfolders: DriveSubfolderMap;
  lastError: string | null;
}

export interface GalleryServerStatus {
  isUnlocked: boolean;
  serverTimeMs: number;
  serverTimeLagosFormatted: string;
  unlockAtISO: string;
  unlockAtEpochMs: number;
  unlockAtLagosFormatted: string;
  timezone: string;
  storageProvider: 'google_drive' | 'local_server';
  googleDriveConfigured: boolean;
  driveStatus: DriveConnectionStatus;
  limits: {
    maxImageBytes: number;
    maxVideoBytes: number;
    maxBatchFiles: number;
  };
}
