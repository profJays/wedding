import { getApps, initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  Auth
} from 'firebase/auth';

/**
 * Secondary Firebase App instance configured with the GCP project where
 * the Google Workspace Drive OAuth 2.0 client was provisioned (`set_up_oauth`).
 * Primary Firestore & Admin Auth remain on `helpful-mode-w67m6` via `firebase.ts`.
 * OAuth access tokens are stored strictly in memory (never localStorage/sessionStorage).
 */
const DRIVE_OAUTH_APP_CONFIG = {
  projectId: 'gen-lang-client-0965460316',
  appId: '1:322851410105:web:cc1400d5046130ee824b68',
  apiKey: 'AIzaSyAYZrakkC_cnCqM6j-66kiV6giKIMF7epg',
  authDomain: 'gen-lang-client-0965460316.firebaseapp.com',
  storageBucket: 'gen-lang-client-0965460316.firebasestorage.app',
  messagingSenderId: '322851410105',
  oAuthClientId: '322851410105-6fm8mlk23pk2h562uf9ngejitbdkr56g.apps.googleusercontent.com'
};

const DRIVE_APP_NAME = 'google-drive-oauth';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

interface InMemoryDriveToken {
  accessToken: string;
  email: string;
  expiresAtMs: number;
}

let cachedDriveToken: InMemoryDriveToken | null = null;

function getDriveOAuthApp(): FirebaseApp {
  const existing = getApps().find((a) => a.name === DRIVE_APP_NAME);
  if (existing) return existing;
  return initializeApp(DRIVE_OAUTH_APP_CONFIG, DRIVE_APP_NAME);
}

function getDriveAuth(): Auth {
  return getAuth(getDriveOAuthApp());
}

export async function connectGoogleDrive(): Promise<{
  accessToken: string;
  email: string;
}> {
  const driveAuth = getDriveAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  provider.setCustomParameters({
    prompt: 'consent select_account',
    login_hint: 'joepreserve@gmail.com',
    include_granted_scopes: 'true'
  });

  const result = await signInWithPopup(driveAuth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;

  if (!accessToken) {
    throw new Error(
      'Google Drive authorization did not return an OAuth access token. Please grant Google Drive access in the popup and try again.'
    );
  }

  const email = result.user.email || '';
  cachedDriveToken = {
    accessToken,
    email,
    // Google OAuth access tokens typically last 60 minutes; refresh/re-prompt at 50 min
    expiresAtMs: Date.now() + 50 * 60 * 1000
  };

  return { accessToken, email };
}

export function getDriveAccessToken(): string | null {
  if (!cachedDriveToken) return null;
  if (Date.now() >= cachedDriveToken.expiresAtMs) {
    cachedDriveToken = null;
    return null;
  }
  return cachedDriveToken.accessToken;
}

export function getDriveConnectedEmail(): string {
  return cachedDriveToken?.email || '';
}

export function clearExpiredDriveToken(): void {
  cachedDriveToken = null;
}

export async function disconnectGoogleDrive(): Promise<void> {
  cachedDriveToken = null;
  try {
    await signOut(getDriveAuth());
  } catch {
    // Ignore secondary signOut failure
  }
}
