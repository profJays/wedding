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
  | 'maintenance'
  | 'admin';

export interface VisibilityExperienceControls {
  digitalInvitation: boolean;
  challenge: boolean;
  photoPuzzle: boolean;
  backgroundMusic: boolean;
  mainWebsite: boolean;
}

export interface VisibilitySectionControls {
  welcome: boolean;
  ourStory: boolean;
  schedule: boolean;
  gifting: boolean;
  qa: boolean;
  rsvp: boolean;
  gallery: boolean;
}

export interface VisibilityInteractionControls {
  guestUploads: boolean;
  songSuggestions: boolean;
  puzzleSongRewards: boolean;
}

export interface VisibilitySettingsData {
  experience: VisibilityExperienceControls;
  sections: VisibilitySectionControls;
  interactions: VisibilityInteractionControls;
  updatedAt?: string;
  updatedByUid?: string;
}

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

export type TypographySectionId =
  | 'welcome'
  | 'story'
  | 'schedule'
  | 'puzzle'
  | 'gifting'
  | 'faq'
  | 'rsvp'
  | 'gallery'
  | 'footer';

export type TypographyElementKey =
  | 'heading'
  | 'subheading'
  | 'body'
  | 'label'
  | 'caption'
  | 'button';

export type AllowedFontFamilyKey =
  | 'default'
  | 'cormorant'
  | 'playfair'
  | 'lora'
  | 'jakarta'
  | 'dm-sans'
  | 'pinyon';

export type AllowedFontWeight = '400' | '500' | '600' | '700';

export type AllowedTextAlign = 'default' | 'left' | 'center' | 'right';

export interface ElementTypographyStyle {
  fontFamily?: AllowedFontFamilyKey;
  fontSizePx?: number;
  fontWeight?: AllowedFontWeight;
  bold?: boolean;
  italic?: boolean;
  textAlign?: AllowedTextAlign;
  lineHeight?: number;
  letterSpacingEm?: number;
  color?: string;
}

export type SectionTypographyElements = Partial<
  Record<TypographyElementKey, ElementTypographyStyle>
>;

export type SectionTypographyMap = Partial<
  Record<TypographySectionId, SectionTypographyElements>
>;

export interface SlideshowSlideItem {
  id: string;
  title: string;
  caption?: string;
  fileUrl: string;
  driveFileId?: string;
  storageProvider: 'google_drive' | 'local_server' | 'site_asset';
  enabled: boolean;
  order: number;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  fileUrl: string;
  driveFileId: string;
  fileName: string;
  storageProvider: 'google_drive' | 'local_server' | 'site_asset';
  enabled: boolean;
  isDefault: boolean;
  order: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  updatedByUid: string;
}

export type SongSuggestionStatus = 'new' | 'reviewed' | 'added' | 'declined';

export interface SongSuggestion {
  id: string;
  title: string;
  artist: string;
  normalizedKey: string;
  status: SongSuggestionStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type WebsiteImageSlotId = 'hero' | 'story' | 'schedule' | 'puzzle' | 'qa';

export type ImageFitMode = 'cover' | 'contain';

export type ImageFocalPosition = 'center' | 'top' | 'bottom' | 'left' | 'right';

export type HeroOverlayIntensity = 'light' | 'medium' | 'strong';

export interface WebsiteImageSlotConfig {
  fileUrl: string;
  driveFileId?: string;
  storageProvider: 'google_drive' | 'local_server' | 'site_asset';
  fitMode: ImageFitMode;
  focalPosition: ImageFocalPosition;
  overlayIntensity?: HeroOverlayIntensity;
  altText?: string;
  hidden?: boolean;
}

export type SectionImagesMap = Partial<Record<WebsiteImageSlotId, WebsiteImageSlotConfig>>;

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
  puzzleEnabled?: boolean;
  puzzleImageFileId?: string;
  puzzleImageUrl?: string;
  musicEnabled?: boolean;
  musicTitle?: string;
  musicArtist?: string;
  musicAudioFileId?: string;
  musicAudioUrl?: string;
  musicAudioFileName?: string;
  giftingEnabled?: boolean;
  giftingHeading?: string;
  giftingIntro?: string;
  giftingClosing?: string;
  giftingAccountName?: string;
  giftingBankName?: string;
  giftingAccountNumber?: string;
  sectionTypography?: SectionTypographyMap;
  sectionImages?: SectionImagesMap;
  slideshowAutoplay?: boolean;
  slideshowIntervalMs?: number;
  slideshowItems?: SlideshowSlideItem[];
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
  mediaType: 'image' | 'video' | 'audio';
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
  | 'admin_music'
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
  websiteMusicId?: string;
}

export type DriveAuthState =
  | 'connected_server_refresh'
  | 'connected_browser_session'
  | 'not_connected'
  | 'reconnection_required'
  | 'missing_server_credentials';

export type DriveAuthStateLabel =
  | 'Connected — Server Refresh Token'
  | 'Connected — Browser Session Only'
  | 'Not Connected'
  | 'Reconnection Required'
  | 'Missing Server Credentials';

export type DriveBrowserSessionStatus = 'connected' | 'disconnected';

export type DriveServerRefreshStatus =
  | 'connected'
  | 'expired'
  | 'invalid'
  | 'missing'
  | 'unverified';

export type DriveOverallConnectionStatus =
  | 'fully_connected'
  | 'temporary_browser'
  | 'disconnected';

export interface DriveConnectionStatus {
  configuredFolderId: boolean;
  folderIdPreview: string;
  folderName: string;
  oauthConnected: boolean;
  connectedEmail: string;
  serverOAuthClientConfigured: boolean;
  serverRefreshConfigured: boolean;
  serverRefreshVerified: boolean | null;
  serverRefreshTokenSource: 'server_store' | 'env' | 'none';
  serverRefreshTokenPersistedAt: string | null;
  browserSessionStatus: DriveBrowserSessionStatus;
  serverRefreshStatus: DriveServerRefreshStatus;
  overallConnectionStatus: DriveOverallConnectionStatus;
  refreshErrorCategory: 'expired_or_revoked' | 'invalid_client' | 'missing' | 'network' | null;
  oauthCallbackPath: string;
  oauthRedirectUri: string;
  oauthRedirectUriSource: 'env_redirect_uri' | 'env_app_url' | 'request_fallback';
  oauthClientIdMasked: string;
  unattendedUploadsReady: boolean;
  authState: DriveAuthState;
  authStateLabel: DriveAuthStateLabel;
  missingServerEnvVars: string[];
  lastUploadAt: string | null;
  subfoldersInitialized: boolean;
  subfolders: DriveSubfolderMap;
  lastError: string | null;
}

export interface DriveTestConnectionResponse {
  ok: boolean;
  refreshTokenConfigured: boolean;
  refreshTokenValid: boolean;
  tokenObtained: boolean;
  folderVerified: boolean;
  authMode: 'server_refresh_token' | 'browser_session' | 'none';
  serverRefreshStatus: DriveServerRefreshStatus;
  verifiedEmail?: string;
  message: string;
  driveStatus: DriveConnectionStatus;
}

export interface GalleryServerStatus {
  isUnlocked: boolean;
  guestUploadsEnabled?: boolean;
  serverTimeMs: number;
  serverTimeLagosFormatted: string;
  unlockAtISO: string;
  unlockAtEpochMs: number;
  unlockAtLagosFormatted: string;
  timezone: string;
  storageProvider: 'google_drive' | 'local_server';
  googleDriveConfigured: boolean;
  unattendedUploadsReady: boolean;
  driveStatus: DriveConnectionStatus;
  limits: {
    maxImageBytes: number;
    maxVideoBytes: number;
    maxAudioBytes?: number;
    maxBatchFiles: number;
  };
}

export type UploadErrorCode =
  | 'VALIDATION_ERROR'
  | 'FILE_EMPTY'
  | 'UNSUPPORTED_FORMAT'
  | 'IMAGE_TOO_LARGE'
  | 'VIDEO_TOO_LARGE'
  | 'AUDIO_TOO_LARGE'
  | 'TOO_MANY_FILES'
  | 'GALLERY_LOCKED'
  | 'GUEST_UPLOADS_DISABLED'
  | 'DRIVE_NOT_CONFIGURED'
  | 'DRIVE_AUTH_MISSING'
  | 'DRIVE_AUTH_EXPIRED'
  | 'DRIVE_REFRESH_EXPIRED'
  | 'DRIVE_PERMISSION_ERROR'
  | 'DRIVE_API_ERROR'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR';

export interface UploadedFileMetadata {
  mediaType: 'image' | 'video' | 'audio';
  mimeType: string;
  fileUrl: string;
  storageProvider: 'google_drive' | 'local_server';
  driveFileId: string;
  sizeBytes: number;
  originalName: string;
  category: DriveMediaCategory;
  folderName: string;
}

export interface UploadFileResult {
  clientFileId: string;
  originalName: string;
  status: 'uploaded' | 'failed' | 'rejected';
  errorCode?: UploadErrorCode;
  errorMessage?: string;
  item?: UploadedFileMetadata;
}

export interface UploadBatchSummary {
  total: number;
  succeeded: number;
  failed: number;
}

export interface UploadBatchResponse {
  uploaded: UploadedFileMetadata[];
  results: UploadFileResult[];
  summary: UploadBatchSummary;
  error?: string;
  code?: UploadErrorCode;
  needsDriveReconnect?: boolean;
  serverTimeMs?: number;
  isAdminUpload?: boolean;
}

export interface ResumableInitRequest {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category?: DriveMediaCategory;
  clientFileId?: string;
}

export interface ResumableInitResponse {
  sessionId: string;
  driveUploadUri: string;
  chunkBytes: number;
  mediaType: 'image' | 'video' | 'audio';
  mimeType: string;
  category: DriveMediaCategory;
  folderName: string;
  isAdminUpload: boolean;
}

export interface ResumableCompleteRequest {
  sessionId: string;
  driveFileId?: string;
}

export interface ResumableCompleteResponse {
  item: UploadedFileMetadata;
  isAdminUpload: boolean;
}

// ---------------------------------------------------------------------------
// Google Analytics 4 (GA4) Reporting & Tracking Types
// ---------------------------------------------------------------------------
export type AnalyticsDateRange = 'today' | '7d' | '30d' | 'all';

export type AnalyticsSectionKey =
  | 'welcome'
  | 'our_story'
  | 'schedule'
  | 'wedding_challenge'
  | 'wedding_photo_puzzle'
  | 'gifting'
  | 'qa'
  | 'rsvp'
  | 'gallery';

export interface PublicAnalyticsConfig {
  enabled: boolean;
  measurementId: string | null;
  siteUrl: string;
}

export interface FrontendAnalyticsDiagnostics {
  gtagScriptLoaded: boolean;
  gtagScriptStatus: 'loaded' | 'loading' | 'blocked_or_failed';
  measurementId: string | null;
  initialized: boolean;
  pageViewDispatched: boolean;
  pageViewStatus: 'dispatched' | 'suppressed_admin' | 'not_yet_dispatched';
  lastPageViewPath: string | null;
  lastPageViewAt: string | null;
  browserHostname: string;
  sectionTrackingActive: boolean;
  observedSectionCount: number;
  collectBeaconObserved: boolean;
  collectBeaconCount: number;
  adminExcluded: boolean;
  debugModeEnabled: boolean;
  dispatchedEventCount: number;
  lastDispatchedEvent: {
    name: string;
    at: string;
    debugMode: boolean;
  } | null;
  errors: string[];
}

export interface AdminDiagnosticTestResult {
  dispatched: boolean;
  collectBeaconObserved: boolean;
  eventName: string;
  timestamp: string;
  error: string | null;
}

export type AnalyticsErrorCode =
  | 'none'
  | 'not_configured'
  | 'invalid_credentials'
  | 'api_not_enabled'
  | 'permission_denied'
  | 'quota_exceeded'
  | 'api_error';

export interface AnalyticsConnectionStatus {
  trackingConfigured: boolean;
  reportingConfigured: boolean;
  measurementIdMasked: string | null;
  propertyIdMasked: string | null;
  serviceAccountEmailMasked: string | null;
  serviceAccountProjectId: string | null;
  credentialSource: 'service_account_json' | 'email_and_private_key' | 'none';
  missingEnvVars: string[];
  customDimensionsRegistered: boolean | null;
  lastCheckedAt: string;
  errorCode: AnalyticsErrorCode;
  errorMessage: string | null;
  activationUrl: string | null;
}

export interface AnalyticsRealtimeEventItem {
  eventName: string;
  label: string;
  eventCount: number;
  minutesAgo: number;
}

export interface AnalyticsRealtimePageItem {
  screenName: string;
  activeUsers: number;
}

export interface AnalyticsRealtimeLocationItem {
  country: string;
  city: string;
  activeUsers: number;
}

export interface AnalyticsRealtimeDeviceItem {
  deviceCategory: string;
  activeUsers: number;
}

export interface AnalyticsRealtimeData {
  available: boolean;
  fetchedAt: string;
  activeUsersNow: number | null;
  activeUsersLast30Min: number | null;
  recentEvents: AnalyticsRealtimeEventItem[];
  activePages: AnalyticsRealtimePageItem[];
  locations: AnalyticsRealtimeLocationItem[];
  devices: AnalyticsRealtimeDeviceItem[];
  errorCode: AnalyticsErrorCode;
  errorMessage: string | null;
  activationUrl?: string | null;
}

export interface AnalyticsOverviewMetrics {
  totalUsers: number | null;
  activeUsers: number | null;
  sessions: number | null;
  pageViews: number | null;
  avgEngagementSeconds: number | null;
  newUsers: number | null;
  returningUsers: number | null;
}

export interface AnalyticsTimeSeriesPoint {
  date: string; // YYYY-MM-DD
  label: string;
  users: number;
  sessions: number;
  pageViews: number;
}

export interface AnalyticsWeeklySeriesPoint {
  weekStart: string; // YYYY-MM-DD
  label: string;
  users: number;
  sessions: number;
  pageViews: number;
}

export interface AnalyticsPageMetric {
  pagePath: string;
  pageTitle: string;
  pageViews: number;
  users: number;
  avgEngagementSeconds: number;
}

export interface AnalyticsDeviceMetric {
  deviceCategory: string;
  users: number;
  sessions: number;
}

export interface AnalyticsLocationMetric {
  country: string;
  city: string;
  users: number;
  sessions: number;
}

export interface AnalyticsTrafficSourceMetric {
  source: string;
  medium: string;
  channelGroup: string;
  sessions: number;
  users: number;
}

export interface AnalyticsSectionMetric {
  sectionKey: AnalyticsSectionKey;
  label: string;
  views: number | null;
  totalEngagementSeconds: number | null;
  avgEngagementSeconds: number | null;
}

export interface AnalyticsWeddingExperienceMetric {
  key: string;
  category:
    | 'Digital Invitation'
    | 'Wedding Challenge'
    | 'Wedding Photo Puzzle'
    | 'Music & Songs'
    | 'Gifting'
    | 'RSVP'
    | 'Gallery & Uploads';
  label: string;
  clicksOrStarted: number | null;
  completed: number | null;
  failed: number | null;
  totalEvents: number | null;
  detailNote?: string;
}

export interface AnalyticsReportData {
  available: boolean;
  range: AnalyticsDateRange;
  fetchedAt: string;
  cached: boolean;
  status: AnalyticsConnectionStatus;
  overview: AnalyticsOverviewMetrics;
  dailySeries: AnalyticsTimeSeriesPoint[];
  weeklySeries: AnalyticsWeeklySeriesPoint[];
  topPages: AnalyticsPageMetric[];
  devices: AnalyticsDeviceMetric[];
  locations: AnalyticsLocationMetric[];
  trafficSources: AnalyticsTrafficSourceMetric[];
  sections: AnalyticsSectionMetric[];
  sectionMetricsAvailable: boolean;
  weddingExperience: AnalyticsWeddingExperienceMetric[];
  interactionStatusAvailable: boolean;
}

