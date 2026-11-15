import crypto from 'node:crypto';

interface CertCache {
  certs: Record<string, string>;
  expiresAtMs: number;
}

export interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  emailVerified: boolean;
}

const FIREBASE_CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certCache: CertCache | null = null;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  if (certCache && Date.now() < certCache.expiresAtMs) {
    return certCache.certs;
  }

  const res = await fetch(FIREBASE_CERT_URL);
  if (!res.ok) {
    throw new Error(`Unable to load Firebase public certificates (${res.status})`);
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const ttlMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600 * 1000;
  const certs = (await res.json()) as Record<string, string>;

  certCache = {
    certs,
    expiresAtMs: Date.now() + ttlMs
  };
  return certs;
}

function base64UrlDecode(segment: string): Buffer {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

export async function verifyFirebaseIdToken(
  idToken: string,
  expectedProjectId: string
): Promise<VerifiedFirebaseToken | null> {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as {
      aud?: string;
      iss?: string;
      sub?: string;
      exp?: number;
      iat?: number;
      email?: string;
      email_verified?: boolean;
    };

    if (header.alg !== 'RS256' || !header.kid) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= nowSec) return null;
    if (payload.aud !== expectedProjectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${expectedProjectId}`) return null;
    if (!payload.sub || payload.sub.length > 128) return null;

    const certs = await getFirebasePublicCerts();
    const cert = certs[header.kid];
    if (!cert) return null;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    const signatureValid = verifier.verify(cert, base64UrlDecode(encodedSignature));
    if (!signatureValid) return null;

    return {
      uid: payload.sub,
      email: payload.email || '',
      emailVerified: Boolean(payload.email_verified)
    };
  } catch {
    return null;
  }
}

const BOOTSTRAPPED_ADMIN_UID = 'oFuTnbSimLQSRIaYzMIShk0oQm92';
const BOOTSTRAPPED_ADMIN_EMAIL = 'joepreserve@gmail.com';

export async function isAuthorizedWeddingAdmin(
  tokenInfo: VerifiedFirebaseToken,
  projectId: string,
  databaseId: string,
  rawIdToken: string
): Promise<boolean> {
  if (!tokenInfo.emailVerified) return false;
  if (
    tokenInfo.uid === BOOTSTRAPPED_ADMIN_UID ||
    tokenInfo.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL
  ) {
    return true;
  }

  // Verify membership in Firestore /admins/{uid} using the caller's own ID token
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/${encodeURIComponent(databaseId)}/documents/admins/${encodeURIComponent(tokenInfo.uid)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${rawIdToken}` }
    });
    return res.ok;
  } catch {
    return false;
  }
}
