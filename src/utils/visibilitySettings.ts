import type { AppView, VisibilitySettingsData } from '../types';

export const DEFAULT_VISIBILITY_SETTINGS: VisibilitySettingsData = {
  experience: {
    digitalInvitation: true,
    challenge: true,
    photoPuzzle: true,
    backgroundMusic: true,
    mainWebsite: true
  },
  sections: {
    welcome: true,
    ourStory: true,
    schedule: true,
    gifting: true,
    qa: true,
    rsvp: true,
    gallery: true
  },
  interactions: {
    guestUploads: true,
    songSuggestions: true,
    puzzleSongRewards: true
  }
};

function asBoolDefaultTrue(val: unknown): boolean {
  return typeof val === 'boolean' ? val : true;
}

/**
 * Safely merges partial, legacy, or missing Firestore visibilitySettings data
 * with all-TRUE defaults so existing features never disappear unexpectedly.
 */
export function normalizeVisibilitySettings(raw: unknown): VisibilitySettingsData {
  if (!raw || typeof raw !== 'object') {
    return cloneVisibilitySettings(DEFAULT_VISIBILITY_SETTINGS);
  }
  const obj = raw as Record<string, unknown>;
  const exp = (obj.experience && typeof obj.experience === 'object'
    ? obj.experience
    : {}) as Record<string, unknown>;
  const sec = (obj.sections && typeof obj.sections === 'object'
    ? obj.sections
    : {}) as Record<string, unknown>;
  const inter = (obj.interactions && typeof obj.interactions === 'object'
    ? obj.interactions
    : {}) as Record<string, unknown>;

  return {
    experience: {
      digitalInvitation: asBoolDefaultTrue(exp.digitalInvitation),
      challenge: asBoolDefaultTrue(exp.challenge),
      photoPuzzle: asBoolDefaultTrue(exp.photoPuzzle),
      backgroundMusic: asBoolDefaultTrue(exp.backgroundMusic),
      mainWebsite: asBoolDefaultTrue(exp.mainWebsite)
    },
    sections: {
      welcome: asBoolDefaultTrue(sec.welcome),
      ourStory: asBoolDefaultTrue(sec.ourStory),
      schedule: asBoolDefaultTrue(sec.schedule),
      gifting: asBoolDefaultTrue(sec.gifting),
      qa: asBoolDefaultTrue(sec.qa),
      rsvp: asBoolDefaultTrue(sec.rsvp),
      gallery: asBoolDefaultTrue(sec.gallery)
    },
    interactions: {
      guestUploads: asBoolDefaultTrue(inter.guestUploads),
      songSuggestions: asBoolDefaultTrue(inter.songSuggestions),
      puzzleSongRewards: asBoolDefaultTrue(inter.puzzleSongRewards)
    },
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : undefined,
    updatedByUid: typeof obj.updatedByUid === 'string' ? obj.updatedByUid : undefined
  };
}

export function cloneVisibilitySettings(
  settings: VisibilitySettingsData
): VisibilitySettingsData {
  return {
    experience: { ...settings.experience },
    sections: { ...settings.sections },
    interactions: { ...settings.interactions },
    updatedAt: settings.updatedAt,
    updatedByUid: settings.updatedByUid
  };
}

export function areVisibilitySettingsEqual(
  a: VisibilitySettingsData,
  b: VisibilitySettingsData
): boolean {
  return (
    a.experience.digitalInvitation === b.experience.digitalInvitation &&
    a.experience.challenge === b.experience.challenge &&
    a.experience.photoPuzzle === b.experience.photoPuzzle &&
    a.experience.backgroundMusic === b.experience.backgroundMusic &&
    a.experience.mainWebsite === b.experience.mainWebsite &&
    a.sections.welcome === b.sections.welcome &&
    a.sections.ourStory === b.sections.ourStory &&
    a.sections.schedule === b.sections.schedule &&
    a.sections.gifting === b.sections.gifting &&
    a.sections.qa === b.sections.qa &&
    a.sections.rsvp === b.sections.rsvp &&
    a.sections.gallery === b.sections.gallery &&
    a.interactions.guestUploads === b.interactions.guestUploads &&
    a.interactions.songSuggestions === b.interactions.songSuggestions &&
    a.interactions.puzzleSongRewards === b.interactions.puzzleSongRewards
  );
}

export interface VisibilityCountsSummary {
  enabled: number;
  total: number;
  experienceEnabled: number;
  experienceTotal: number;
  sectionsEnabled: number;
  sectionsTotal: number;
  interactionsEnabled: number;
  interactionsTotal: number;
}

export function countEnabledVisibilityControls(
  settings: VisibilitySettingsData
): VisibilityCountsSummary {
  const expVals = Object.values(settings.experience);
  const secVals = Object.values(settings.sections);
  const intVals = Object.values(settings.interactions);

  const experienceEnabled = expVals.filter(Boolean).length;
  const sectionsEnabled = secVals.filter(Boolean).length;
  const interactionsEnabled = intVals.filter(Boolean).length;

  return {
    enabled: experienceEnabled + sectionsEnabled + interactionsEnabled,
    total: expVals.length + secVals.length + intVals.length,
    experienceEnabled,
    experienceTotal: expVals.length,
    sectionsEnabled,
    sectionsTotal: secVals.length,
    interactionsEnabled,
    interactionsTotal: intVals.length
  };
}

/**
 * Computes the exact visitor entry view on initial load, honoring admin hash
 * access unconditionally and skipping any disabled experiences automatically.
 */
export function resolveInitialVisitorView(
  settings: VisibilitySettingsData,
  locationHash = ''
): AppView {
  if (locationHash === '#admin') {
    return 'admin';
  }
  if (!settings.experience.mainWebsite) {
    return 'maintenance';
  }
  if (settings.experience.digitalInvitation) {
    return 'invitation';
  }
  if (settings.experience.challenge) {
    return 'welcome';
  }
  return 'website';
}

/**
 * Computes the next view after the guest clicks CONTINUE on the Digital Invitation.
 */
export function resolveNextViewAfterInvitation(
  settings: VisibilitySettingsData
): AppView {
  if (!settings.experience.mainWebsite) {
    return 'maintenance';
  }
  if (settings.experience.challenge) {
    return 'welcome';
  }
  return 'website';
}

/**
 * Ensures an active visitor is never stranded on a disabled, unavailable, or
 * empty view when visibility settings update live in Firestore.
 * Admin sessions are never redirected away from the Admin Dashboard.
 */
export function resolveSafeViewForSettings(
  currentView: AppView,
  settings: VisibilitySettingsData,
  hasEnteredWebsite: boolean
): AppView {
  if (currentView === 'admin') {
    return 'admin';
  }

  if (!settings.experience.mainWebsite) {
    return 'maintenance';
  }

  if (currentView === 'maintenance') {
    return hasEnteredWebsite ? 'website' : resolveInitialVisitorView(settings, '');
  }

  if (currentView === 'invitation' && !settings.experience.digitalInvitation) {
    if (!hasEnteredWebsite && settings.experience.challenge) {
      return 'welcome';
    }
    return 'website';
  }

  const isChallengeView =
    currentView === 'welcome' ||
    currentView === 'quiz' ||
    currentView === 'uninvited' ||
    currentView === 'approved';

  if (isChallengeView && !settings.experience.challenge) {
    return 'website';
  }

  return currentView;
}

/**
 * Produces a concise human-readable description of the active public visitor flow
 * for display inside the Admin Visibility & Experience Controls summary.
 */
export function describeVisitorFlow(settings: VisibilitySettingsData): string {
  if (!settings.experience.mainWebsite) {
    return 'Temporary Maintenance / Coming-Soon Screen (Admin Access Open)';
  }
  const steps: string[] = [];
  if (settings.experience.digitalInvitation) {
    steps.push('Digital Invitation');
  }
  if (settings.experience.challenge) {
    steps.push('Wedding Challenge');
  }
  steps.push(
    settings.experience.photoPuzzle
      ? 'Main Website (Photo Puzzle ON)'
      : 'Main Website (Photo Puzzle OFF)'
  );
  return steps.join(' → ');
}
