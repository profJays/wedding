export const MUSIC_USER_PAUSED_STORAGE_KEY = 'mjay2026_music_user_paused';

export interface AutoPlayDecisionInput {
  enabled: boolean;
  audioUrl?: string;
  isWebsiteView: boolean;
  userPaused: boolean;
}

export function isPlayableMusicUrl(audioUrl?: string): string {
  const clean = (audioUrl || '').trim();
  if (!clean || clean.startsWith('blob:')) return '';
  return clean;
}

export function readUserPausedPreference(
  storage?: Pick<Storage, 'getItem'> | null
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(MUSIC_USER_PAUSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeUserPausedPreference(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  paused: boolean
): void {
  if (!storage) return;
  try {
    storage.setItem(MUSIC_USER_PAUSED_STORAGE_KEY, paused ? '1' : '0');
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function shouldAttemptWebsiteAutoPlay(input: AutoPlayDecisionInput): boolean {
  return Boolean(
    input.enabled &&
      isPlayableMusicUrl(input.audioUrl) &&
      input.isWebsiteView &&
      !input.userPaused
  );
}
