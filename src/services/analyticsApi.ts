import { auth } from './firebase';
import type {
  AnalyticsConnectionStatus,
  AnalyticsDateRange,
  AnalyticsRealtimeData,
  AnalyticsReportData
} from '../types';

async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Administrator sign-in is required to view website analytics.');
  }
  const idToken = await user.getIdToken();
  return {
    Authorization: `Bearer ${idToken}`,
    Accept: 'application/json'
  };
}

export async function fetchAdminAnalyticsStatus(): Promise<AnalyticsConnectionStatus> {
  const headers = await getAdminAuthHeaders();
  const res = await fetch('/api/analytics/status', {
    method: 'GET',
    headers
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || `Analytics status request failed (${res.status}).`);
  }
  return (await res.json()) as AnalyticsConnectionStatus;
}

export async function fetchAdminAnalyticsRealtime(
  forceRefresh = false
): Promise<AnalyticsRealtimeData> {
  const headers = await getAdminAuthHeaders();
  const query = forceRefresh ? '?refresh=1' : '';
  const res = await fetch(`/api/analytics/realtime${query}`, {
    method: 'GET',
    headers
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || `Realtime analytics request failed (${res.status}).`);
  }
  return (await res.json()) as AnalyticsRealtimeData;
}

export async function fetchAdminAnalyticsReport(
  range: AnalyticsDateRange,
  forceRefresh = false
): Promise<AnalyticsReportData> {
  const headers = await getAdminAuthHeaders();
  const params = new URLSearchParams({ range });
  if (forceRefresh) params.set('refresh', '1');
  const res = await fetch(`/api/analytics/report?${params.toString()}`, {
    method: 'GET',
    headers
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || `Analytics report request failed (${res.status}).`);
  }
  return (await res.json()) as AnalyticsReportData;
}
