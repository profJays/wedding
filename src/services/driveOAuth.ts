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

export interface ServerDriveOAuthPopupResult {
  ok: boolean;
  refreshTokenIssued: boolean;
  message: string;
  driveStatus?: import('../types').DriveConnectionStatus;
}

/**
 * Opens a popup synchronously during a click event so browsers do not block it
 * while the client requests the signed Google OAuth authorization URL from the server.
 */
export function openServerDriveOAuthPopup(): Window {
  const width = 560;
  const height = 700;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const popup = window.open(
    'about:blank',
    'mjay_drive_server_oauth',
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );

  if (!popup) {
    throw new Error(
      'Your browser blocked the Google Drive authorization popup. Please allow popups for this site and click "Reconnect Google Drive" again.'
    );
  }

  try {
    popup.document.title = 'Connecting Google Drive — Mary & Joseph';
    popup.document.body.innerHTML =
      '<div style="font-family:system-ui,-apple-system,sans-serif;background:#FAF7F0;color:#07543E;height:100vh;display:flex;align-items:center;justify-content:center;margin:0;text-align:center;padding:24px;box-sizing:border-box;"><div><h2 style="margin:0 0 8px;font-size:18px;">Connecting to Google Drive…</h2><p style="margin:0;color:#3D4035;font-size:13px;">Preparing secure server-side authorization.</p></div></div>';
  } catch {
    // Cross-origin restriction if reused window; ignore safely
  }

  return popup;
}

/**
 * Navigates the opened popup directly to Google's OAuth 2.0 authorization URL
 * and waits for the server callback page to post back the non-sensitive result.
 */
export function awaitServerDriveOAuthResult(
  popup: Window,
  authUrl: string,
  expectedRedirectUri?: string
): Promise<ServerDriveOAuthPopupResult> {
  let expectedOrigin = '';
  if (expectedRedirectUri) {
    try {
      expectedOrigin = new URL(expectedRedirectUri).origin;
    } catch {
      expectedOrigin = '';
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let closeGraceTimer: number | null = null;
    let pollTimer: number | null = null;
    let timeoutTimer: number | null = null;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (closeGraceTimer !== null) window.clearTimeout(closeGraceTimer);
      if (timeoutTimer !== null) window.clearTimeout(timeoutTimer);
    };

    const finishResolve = (result: ServerDriveOAuthPopupResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const finishReject = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        if (!popup.closed) popup.close();
      } catch {
        // Ignore close errors
      }
      reject(err);
    };

    const handleMessage = (event: MessageEvent) => {
      const data = event.data as
        | {
            type?: string;
            ok?: boolean;
            refreshTokenIssued?: boolean;
            message?: string;
            driveStatus?: import('../types').DriveConnectionStatus;
          }
        | undefined;

      if (!data || data.type !== 'DRIVE_OAUTH_SERVER_RESULT') return;

      // Accept messages from the canonical callback origin, current origin, or verified Cloud Run preview origin
      const originMatches =
        (expectedOrigin !== '' && event.origin === expectedOrigin) ||
        event.origin === window.location.origin ||
        event.origin.endsWith('.run.app') ||
        event.origin.startsWith('http://localhost:');
      if (!originMatches) return;

      finishResolve({
        ok: Boolean(data.ok),
        refreshTokenIssued: Boolean(data.refreshTokenIssued),
        message:
          typeof data.message === 'string' && data.message.trim()
            ? data.message
            : data.ok
            ? 'Google Drive is fully connected. Server-side authentication is working.'
            : 'Google Drive server authorization did not complete.',
        driveStatus: data.driveStatus
      });
    };

    window.addEventListener('message', handleMessage);

    try {
      popup.location.href = authUrl;
    } catch {
      finishReject(
        new Error('Could not navigate authorization popup to Google. Please allow popups and try again.')
      );
      return;
    }

    pollTimer = window.setInterval(() => {
      if (popup.closed && !settled && closeGraceTimer === null) {
        // Allow a short grace window for postMessage to arrive right before window.close()
        closeGraceTimer = window.setTimeout(() => {
          if (!settled) {
            finishReject(
              new Error(
                'Google Drive authorization window was closed before completing server-side sign-in.'
              )
            );
          }
        }, 1200);
      }
    }, 400);

    timeoutTimer = window.setTimeout(() => {
      finishReject(
        new Error('Google Drive authorization timed out after 5 minutes. Please try again.')
      );
    }, 5 * 60 * 1000);
  });
}
