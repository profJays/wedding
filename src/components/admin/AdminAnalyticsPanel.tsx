import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  Monitor,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tablet,
  TrendingUp,
  Users
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type {
  AdminDiagnosticTestResult,
  AnalyticsDateRange,
  AnalyticsRealtimeData,
  AnalyticsReportData,
  FrontendAnalyticsDiagnostics
} from '../../types';
import {
  fetchAdminAnalyticsRealtime,
  fetchAdminAnalyticsReport
} from '../../services/analyticsApi';
import {
  getFrontendAnalyticsDiagnostics,
  refreshFrontendAnalyticsDiagnostics,
  sendAdminDiagnosticTestEvent,
  setAdminDebugModeEnabled,
  subscribeFrontendAnalyticsDiagnostics
} from '../../services/analytics';

const DATE_RANGE_OPTIONS: Array<{ id: AnalyticsDateRange; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 Days' },
  { id: '30d', label: 'Last 30 Days' },
  { id: 'all', label: 'All Time' }
];

const REALTIME_POLL_MS = 30_000;
const WEDDING_CHART_COLORS = ['#07543E', '#C5A04A', '#737746', '#0A6E52', '#A68334'];

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function formatNumber(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return '—';
  return val.toLocaleString();
}

function formatRelativeMinutes(minutesAgo: number): string {
  if (minutesAgo <= 0) return 'Just now';
  if (minutesAgo === 1) return '1 min ago';
  return `${minutesAgo} mins ago`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Not yet refreshed';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not yet refreshed';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function capitalizeDevice(category: string): string {
  const clean = category.trim().toLowerCase();
  if (clean === 'mobile') return 'Mobile';
  if (clean === 'desktop') return 'Desktop';
  if (clean === 'tablet') return 'Tablet';
  return category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Unknown';
}

function DeviceIcon({ category }: { category: string }) {
  const clean = category.trim().toLowerCase();
  if (clean === 'mobile') return <Smartphone className="w-4 h-4 text-[#07543E] shrink-0" aria-hidden="true" />;
  if (clean === 'tablet') return <Tablet className="w-4 h-4 text-[#737746] shrink-0" aria-hidden="true" />;
  return <Monitor className="w-4 h-4 text-[#C5A04A] shrink-0" aria-hidden="true" />;
}

interface AdminAnalyticsPanelProps {
  siteUrl?: string;
}

export const AdminAnalyticsPanel: React.FC<AdminAnalyticsPanelProps> = ({
  siteUrl = 'https://mary-joseph.com'
}) => {
  const [range, setRange] = useState<AnalyticsDateRange>('7d');
  const [chartGranularity, setChartGranularity] = useState<'daily' | 'weekly'>('daily');
  const [autoRefreshLive, setAutoRefreshLive] = useState<boolean>(true);

  const [report, setReport] = useState<AnalyticsReportData | null>(null);
  const [realtime, setRealtime] = useState<AnalyticsRealtimeData | null>(null);
  const [loadingReport, setLoadingReport] = useState<boolean>(true);
  const [loadingRealtime, setLoadingRealtime] = useState<boolean>(true);
  const [refreshingManual, setRefreshingManual] = useState<boolean>(false);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [setupGuideExpanded, setSetupGuideExpanded] = useState<boolean>(false);
  const [frontendDiag, setFrontendDiag] = useState<FrontendAnalyticsDiagnostics>(() =>
    getFrontendAnalyticsDiagnostics()
  );
  const [sendingTestKind, setSendingTestKind] = useState<'diagnostic' | 'page_view' | null>(null);
  const [lastTestResult, setLastTestResult] = useState<AdminDiagnosticTestResult | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeFrontendAnalyticsDiagnostics((snapshot) => {
      setFrontendDiag(snapshot);
    });
    return unsubscribe;
  }, []);

  const handleToggleAdminDebugMode = () => {
    setAdminDebugModeEnabled(!frontendDiag.debugModeEnabled);
  };

  const handleSendDiagnosticTest = async (kind: 'diagnostic' | 'page_view') => {
    setSendingTestKind(kind);
    try {
      const result = await sendAdminDiagnosticTestEvent(kind);
      setLastTestResult(result);
    } finally {
      setSendingTestKind(null);
    }
  };

  const loadReport = useCallback(
    async (targetRange: AnalyticsDateRange, forceRefresh = false) => {
      if (!forceRefresh) setLoadingReport(true);
      setTransportError(null);
      try {
        const data = await fetchAdminAnalyticsReport(targetRange, forceRefresh);
        setReport(data);
        if (!data.available) {
          setSetupGuideExpanded(true);
        }
      } catch (err) {
        setTransportError(
          err instanceof Error ? err.message : 'Unable to reach analytics reporting endpoint.'
        );
      } finally {
        setLoadingReport(false);
      }
    },
    []
  );

  const loadRealtime = useCallback(async (forceRefresh = false) => {
    try {
      const data = await fetchAdminAnalyticsRealtime(forceRefresh);
      setRealtime(data);
    } catch {
      // Realtime error is non-fatal when historical report handles transport feedback
    } finally {
      setLoadingRealtime(false);
    }
  }, []);

  useEffect(() => {
    void loadReport(range, false);
  }, [range, loadReport]);

  useEffect(() => {
    void loadRealtime(false);
  }, [loadRealtime]);

  useEffect(() => {
    if (!autoRefreshLive) return;
    const id = window.setInterval(() => {
      void loadRealtime(false);
    }, REALTIME_POLL_MS);
    return () => window.clearInterval(id);
  }, [autoRefreshLive, loadRealtime]);

  const handleManualRefresh = async () => {
    setRefreshingManual(true);
    try {
      await Promise.all([loadReport(range, true), loadRealtime(true)]);
    } finally {
      setRefreshingManual(false);
    }
  };

  // Derived Traffic Chart Data
  const activeTimeSeries = useMemo(() => {
    if (!report || !report.available) return [];
    if (chartGranularity === 'weekly' && report.weeklySeries.length > 0) {
      return report.weeklySeries.map((pt) => ({
        label: pt.label,
        users: pt.users,
        sessions: pt.sessions,
        pageViews: pt.pageViews
      }));
    }
    return report.dailySeries.map((pt) => ({
      label: pt.label,
      users: pt.users,
      sessions: pt.sessions,
      pageViews: pt.pageViews
    }));
  }, [report, chartGranularity]);

  // Derived Section Highlights
  const sectionInsights = useMemo(() => {
    if (!report || !report.available || !report.sectionMetricsAvailable) {
      return { mostPopular: null, highestEngagement: null, lowestEngagement: null, maxViews: 1 };
    }
    const populated = report.sections.filter((s) => s.views !== null);
    if (populated.length === 0) {
      return { mostPopular: null, highestEngagement: null, lowestEngagement: null, maxViews: 1 };
    }

    const withViews = populated.filter((s) => (s.views ?? 0) > 0);
    const byViews = [...populated].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    const byEngagement = [...withViews].sort(
      (a, b) => (b.avgEngagementSeconds ?? 0) - (a.avgEngagementSeconds ?? 0)
    );

    return {
      mostPopular: (byViews[0]?.views ?? 0) > 0 ? byViews[0] : null,
      highestEngagement: byEngagement.length > 0 ? byEngagement[0] : null,
      lowestEngagement: byEngagement.length > 1 ? byEngagement[byEngagement.length - 1] : null,
      maxViews: Math.max(1, ...populated.map((s) => s.views ?? 0))
    };
  }, [report]);

  // Derived Device & Location Totals
  const totalDeviceUsers = useMemo(
    () => (report?.devices || []).reduce((acc, d) => acc + d.users, 0),
    [report]
  );

  const maxTrafficSessions = useMemo(
    () => Math.max(1, ...(report?.trafficSources || []).map((s) => s.sessions)),
    [report]
  );

  const isGa4Connected = Boolean(report?.available);
  const isRealtimeConnected = Boolean(realtime?.available);
  const status = report?.status;

  const newReturningSplit = useMemo(() => {
    const newU = report?.overview.newUsers;
    const retU = report?.overview.returningUsers;
    if (newU === null || newU === undefined || retU === null || retU === undefined) {
      return { available: false, newPct: 0, retPct: 0 };
    }
    const sum = newU + retU;
    if (sum <= 0) return { available: true, newPct: 0, retPct: 0 };
    const newPct = Math.round((newU / sum) * 100);
    return { available: true, newPct, retPct: 100 - newPct };
  }, [report]);

  return (
    <div className="space-y-6">
      {/* ====================================================================
          HEADER & CONTROL BAR
      ==================================================================== */}
      <section className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#737746]">
              Google Analytics 4 · {siteUrl.replace(/^https?:\/\//, '')}
            </p>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E] text-balance">
              Website Analytics Dashboard
            </h2>
            <p className="text-xs sm:text-sm text-[#262820]/75 leading-relaxed flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                {isGa4Connected
                  ? 'Connected to GA4 Data API (read-only)'
                  : status?.errorCode === 'api_not_enabled'
                  ? 'Google Analytics Data API Not Enabled'
                  : status?.errorCode === 'invalid_credentials'
                  ? 'Invalid GA4 Service Account Credentials'
                  : status?.errorCode === 'permission_denied'
                  ? 'GA4 Property Permission Required'
                  : status?.errorCode === 'quota_exceeded'
                  ? 'GA4 API Quota Reached Temporarily'
                  : status?.errorCode === 'not_configured'
                  ? 'Awaiting GA4 Configuration'
                  : 'Google Analytics Data API Error'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                Last sync: {formatTimestamp(realtime?.fetchedAt || report?.fetchedAt || null)}
              </span>
              {status?.measurementIdMasked && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-xs text-[#07543E]">
                    {status.measurementIdMasked}
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Live Auto-Refresh Toggle */}
            <button
              type="button"
              onClick={() => setAutoRefreshLive((prev) => !prev)}
              className={`inline-flex items-center gap-2 px-3.5 min-h-[42px] rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                autoRefreshLive && isRealtimeConnected
                  ? 'bg-[#07543E]/8 border-[#07543E]/30 text-[#07543E]'
                  : 'bg-white border-[#07543E]/20 text-[#262820]/80 hover:bg-[#FAF7F0]'
              }`}
            >
              {autoRefreshLive ? (
                <Pause className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Play className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>
                {autoRefreshLive ? 'Live Refresh: 30s' : 'Live Refresh: Paused'}
              </span>
            </button>

            {/* Manual Refresh */}
            <button
              type="button"
              onClick={() => void handleManualRefresh()}
              disabled={refreshingManual || loadingReport}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[42px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshingManual ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Refresh Now</span>
            </button>

            {/* Setup Guide Toggle */}
            <button
              type="button"
              onClick={() => setSetupGuideExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[42px] rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] text-xs font-semibold text-[#07543E] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Info className="w-3.5 h-3.5 text-[#C5A04A]" aria-hidden="true" />
              <span>GA4 Setup</span>
              {setupGuideExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Date Filter Segmented Control + Admin Exclusion Notice */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-[#07543E]/10">
          <div
            role="group"
            aria-label="Analytics date range filter"
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#FAF7F0] border border-[#07543E]/12 overflow-x-auto max-w-full"
          >
            {DATE_RANGE_OPTIONS.map((opt) => {
              const active = range === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRange(opt.id)}
                  aria-pressed={active}
                  className={`px-3.5 min-h-[38px] rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#07543E] text-white'
                      : 'text-[#262820]/75 hover:text-[#07543E] hover:bg-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs text-[#262820]/70">
            <ShieldCheck className="w-4 h-4 text-[#737746] shrink-0" aria-hidden="true" />
            <span>
              Admin dashboard visits &amp; signed-in couple sessions are excluded · Zero PII tracked
            </span>
          </div>
        </div>

        {/* Transport / API Error Alert */}
        {(transportError || (status && status.errorCode !== 'none' && status.errorMessage)) && (
          <div
            role="status"
            className={`p-4 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5 leading-relaxed ${
              status?.errorCode === 'not_configured' || status?.errorCode === 'api_not_enabled'
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-2 min-w-0">
              <p className="font-semibold">
                {transportError
                  ? 'Analytics Request Error'
                  : status?.errorCode === 'api_not_enabled'
                  ? 'Google Analytics Data API Not Enabled'
                  : status?.errorCode === 'invalid_credentials'
                  ? 'Invalid GA4 Service Account Credentials'
                  : status?.errorCode === 'not_configured'
                  ? 'GA4 Credentials Not Yet Connected'
                  : status?.errorCode === 'permission_denied'
                  ? 'Service Account Viewer Permission Needed'
                  : status?.errorCode === 'quota_exceeded'
                  ? 'Google Analytics API Quota Limit Reached'
                  : 'Google Analytics Data API Error'}
              </p>
              <p>{transportError || status?.errorMessage}</p>
              {!transportError && status?.errorCode === 'api_not_enabled' && status.activationUrl && (
                <div className="pt-1">
                  <a
                    href={status.activationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#07543E] hover:bg-[#073B2B] text-white text-xs font-semibold transition-colors"
                  >
                    <span>Enable Google Analytics Data API in Google Cloud Console</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Collapsible GA4 Setup & Custom Dimensions Checklist */}
        {setupGuideExpanded && (
          <div className="p-4 sm:p-5 rounded-xl bg-[#FAF7F0] border border-[#C5A04A]/40 space-y-4 text-xs sm:text-sm text-[#262820]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#07543E]/10 pb-3">
              <h3 className="font-serif text-lg font-semibold text-[#07543E]">
                Google Analytics 4 Configuration Checklist
              </h3>
              <span className="text-xs text-[#737746] font-medium">
                Isolated from Google Drive OAuth credentials
              </span>
            </div>

            {status && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 rounded-lg bg-white border border-[#07543E]/10 text-xs">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
                    GA4 Property ID
                  </p>
                  <p className="font-mono text-[#07543E] mt-0.5">
                    {status.propertyIdMasked || 'Not set'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
                    Service Account
                  </p>
                  <p className="font-mono text-[#07543E] mt-0.5 break-all">
                    {status.serviceAccountEmailMasked || 'Not loaded'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
                    GCP Project
                  </p>
                  <p className="font-mono text-[#07543E] mt-0.5 break-all">
                    {status.serviceAccountProjectId || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
                    Credential Source
                  </p>
                  <p className="font-mono text-[#07543E] mt-0.5">
                    {status.credentialSource === 'service_account_json'
                      ? 'GA4_SERVICE_ACCOUNT_JSON'
                      : status.credentialSource === 'email_and_private_key'
                      ? 'Email + Private Key'
                      : 'Not configured'}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="font-semibold text-[#07543E] flex items-center gap-1.5">
                  {status?.trackingConfigured ? (
                    <CheckCircle2 className="w-4 h-4 text-[#07543E]" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-700" aria-hidden="true" />
                  )}
                  <span>1. Website Tag (Measurement ID)</span>
                </p>
                <p className="text-xs text-[#262820]/75 leading-relaxed">
                  Set <code className="font-mono font-semibold">GA4_MEASUREMENT_ID</code> (e.g.{' '}
                  <code className="font-mono">G-XXXXXXXXXX</code>) in server secrets. The public website loads{' '}
                  <code className="font-mono">gtag.js</code> automatically without rebuilding.
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-[#07543E] flex items-center gap-1.5">
                  {status?.reportingConfigured && status?.errorCode !== 'api_not_enabled' ? (
                    <CheckCircle2 className="w-4 h-4 text-[#07543E]" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-700" aria-hidden="true" />
                  )}
                  <span>2. Read-Only Reporting API</span>
                </p>
                <p className="text-xs text-[#262820]/75 leading-relaxed">
                  Set <code className="font-mono font-semibold">GA4_PROPERTY_ID</code> (numeric ID) and{' '}
                  <code className="font-mono font-semibold">GA4_SERVICE_ACCOUNT_JSON</code>. Enable the{' '}
                  <strong>Google Analytics Data API</strong> (<code className="font-mono">analyticsdata.googleapis.com</code>)
                  in the service account&apos;s Google Cloud project, and grant the service account email the{' '}
                  <strong>Viewer</strong> role under GA4 Admin → Property Access Management.
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-[#07543E] flex items-center gap-1.5">
                  {status?.customDimensionsRegistered ? (
                    <CheckCircle2 className="w-4 h-4 text-[#07543E]" aria-hidden="true" />
                  ) : (
                    <Info className="w-4 h-4 text-[#737746]" aria-hidden="true" />
                  )}
                  <span>3. GA4 Custom Dimensions (Event-Scoped)</span>
                </p>
                <p className="text-xs text-[#262820]/75 leading-relaxed">
                  In GA4 Admin → Custom definitions, register event-scoped dimensions:{' '}
                  <code className="font-mono font-semibold">section_name</code>,{' '}
                  <code className="font-mono font-semibold">interaction_type</code>, and{' '}
                  <code className="font-mono font-semibold">interaction_status</code> to unlock per-section engagement and completed vs. failed breakdowns.
                </p>
              </div>
            </div>

            {/* Frontend Tag Diagnostics & Temporary Admin DebugView Testing */}
            <div className="pt-4 border-t border-[#07543E]/15 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-serif text-base font-semibold text-[#07543E]">
                    Frontend Tag Diagnostics (This Browser)
                  </h4>
                  <p className="text-xs text-[#262820]/70">
                    Distinguishes browser-side tag dispatch from confirmed Google Analytics property receipt.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFrontendDiag(refreshFrontendAnalyticsDiagnostics())}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] text-xs font-semibold text-[#07543E] cursor-pointer self-start sm:self-auto"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Re-check Tag</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 rounded-lg bg-white border border-[#07543E]/12 text-xs">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
                    gtag.js Library
                  </p>
                  <p
                    className={`font-semibold mt-0.5 ${
                      frontendDiag.gtagScriptStatus === 'loaded'
                        ? 'text-[#07543E]'
                        : frontendDiag.gtagScriptStatus === 'blocked_or_failed'
                        ? 'text-red-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {frontendDiag.gtagScriptStatus === 'loaded'
                      ? 'Loaded'
                      : frontendDiag.gtagScriptStatus === 'blocked_or_failed'
                      ? 'Blocked or Failed'
                      : 'Loading…'}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
                    Detected Measurement ID
                  </p>
                  <p className="font-mono text-[#07543E] mt-0.5">
                    {frontendDiag.measurementId || 'Not detected'}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
                    GA4 Initialization
                  </p>
                  <p
                    className={`font-semibold mt-0.5 ${
                      frontendDiag.initialized ? 'text-[#07543E]' : 'text-red-700'
                    }`}
                  >
                    {frontendDiag.initialized ? 'Succeeded (gtag configured)' : 'Not initialized'}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
                    Browser Hostname
                  </p>
                  <p className="font-mono text-[#07543E] mt-0.5 break-all">
                    {frontendDiag.browserHostname || 'Unknown'}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
                    page_view Dispatch (Browser)
                  </p>
                  <p
                    className={`font-semibold mt-0.5 ${
                      frontendDiag.pageViewStatus === 'dispatched'
                        ? 'text-[#07543E]'
                        : 'text-[#262820]/80'
                    }`}
                  >
                    {frontendDiag.pageViewStatus === 'dispatched'
                      ? `Dispatched (${frontendDiag.lastPageViewPath || '/'})`
                      : frontendDiag.pageViewStatus === 'suppressed_admin'
                      ? 'Suppressed (Admin session excluded)'
                      : 'Not yet dispatched'}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
                    Network /g/collect Hit
                  </p>
                  <p
                    className={`font-semibold mt-0.5 ${
                      frontendDiag.collectBeaconObserved ? 'text-[#07543E]' : 'text-[#262820]/75'
                    }`}
                  >
                    {frontendDiag.collectBeaconObserved
                      ? `Observed (${frontendDiag.collectBeaconCount} browser request${
                          frontendDiag.collectBeaconCount === 1 ? '' : 's'
                        })`
                      : 'None sent from this tab yet'}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
                    Section Tracking
                  </p>
                  <p className="font-semibold text-[#07543E] mt-0.5">
                    {frontendDiag.sectionTrackingActive
                      ? `Active (${frontendDiag.observedSectionCount} sections)`
                      : 'Inactive (Admin dashboard view)'}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
                    GA4 Property Receipt (Server)
                  </p>
                  <p
                    className={`font-semibold mt-0.5 ${
                      realtime?.available &&
                      ((realtime.activeUsersLast30Min ?? 0) > 0 ||
                        realtime.recentEvents.length > 0)
                        ? 'text-[#07543E]'
                        : report?.available && (report.overview.pageViews ?? 0) > 0
                        ? 'text-[#07543E]'
                        : 'text-amber-800'
                    }`}
                  >
                    {realtime?.available &&
                    ((realtime.activeUsersLast30Min ?? 0) > 0 ||
                      realtime.recentEvents.length > 0)
                      ? 'Confirmed (live events received)'
                      : report?.available && (report.overview.pageViews ?? 0) > 0
                      ? 'Confirmed (historical data received)'
                      : report?.available || realtime?.available
                      ? 'Not yet received by GA4'
                      : 'Awaiting Data API status'}
                  </p>
                </div>
              </div>

              {frontendDiag.errors.length > 0 ? (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 space-y-1">
                  <p className="font-semibold">Detected Frontend Tracking Errors:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {frontendDiag.errors.map((errMsg, idx) => (
                      <li key={idx}>{errMsg}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-[#262820]/70">
                  <strong>Tracking Errors:</strong> None detected. Browser dispatch confirms your device sent a request; verify actual GA4 receipt in <strong>GA4 Admin → DebugView</strong> (for admin tests) or <strong>GA4 Realtime</strong> (for signed-out guest visits).
                </p>
              )}

              {/* Temporary Administrator DebugView Testing */}
              <div className="p-3.5 rounded-lg bg-white border border-[#C5A04A]/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-[#07543E] text-xs sm:text-sm">
                      Temporary Admin Diagnostic Testing (GA4 DebugView)
                    </p>
                    <p className="text-xs text-[#262820]/75 leading-relaxed">
                      Permanent admin exclusion remains active by default. Diagnostic test events always include{' '}
                      <code className="font-mono">debug_mode: true</code> and{' '}
                      <code className="font-mono">traffic_type: &apos;internal&apos;</code> so you can verify tag delivery in{' '}
                      <strong>GA4 Admin → DebugView</strong> or <strong>Google Tag Assistant</strong> without counting your session as normal guest traffic.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSendDiagnosticTest('diagnostic')}
                    disabled={sendingTestKind !== null}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {sendingTestKind === 'diagnostic' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Activity className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>Send DebugView Test Event</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSendDiagnosticTest('page_view')}
                    disabled={sendingTestKind !== null}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-lg border border-[#07543E]/25 bg-[#FAF7F0] hover:bg-white disabled:opacity-60 text-[#07543E] text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {sendingTestKind === 'page_view' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>Send DebugView Test page_view</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleAdminDebugMode}
                    aria-pressed={frontendDiag.debugModeEnabled}
                    className={`inline-flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                      frontendDiag.debugModeEnabled
                        ? 'bg-amber-50 border-amber-400 text-amber-950'
                        : 'bg-white border-[#07543E]/20 text-[#262820]/80 hover:bg-[#FAF7F0]'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {frontendDiag.debugModeEnabled
                        ? 'Temporary DebugView Mode: ON (This Tab)'
                        : 'Enable Temporary DebugView Mode (This Tab)'}
                    </span>
                  </button>
                </div>

                {frontendDiag.debugModeEnabled && (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    Temporary DebugView Mode is active for this browser tab only (clears automatically when you close the tab). Visiting the public website in this tab will send events marked{' '}
                    <code className="font-mono">debug_mode: true</code> and{' '}
                    <code className="font-mono">traffic_type: internal</code> for GA4 DebugView inspection.
                  </p>
                )}

                {lastTestResult && (
                  <div
                    role="status"
                    className={`p-3 rounded-md border text-xs leading-relaxed ${
                      lastTestResult.error
                        ? 'bg-red-50 border-red-200 text-red-900'
                        : lastTestResult.collectBeaconObserved
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                        : 'bg-amber-50 border-amber-200 text-amber-950'
                    }`}
                  >
                    {lastTestResult.error ? (
                      <p>
                        <strong>Diagnostic test failed:</strong> {lastTestResult.error}
                      </p>
                    ) : (
                      <p>
                        <strong>Browser dispatched</strong>{' '}
                        <code className="font-mono">{lastTestResult.eventName}</code> (with{' '}
                        <code className="font-mono">debug_mode: true</code>,{' '}
                        <code className="font-mono">traffic_type: internal</code>) at{' '}
                        {formatTimestamp(lastTestResult.timestamp)}.{' '}
                        {lastTestResult.collectBeaconObserved
                          ? 'A /g/collect network request was observed in this browser. Open GA4 Admin → DebugView to confirm Google Analytics received it.'
                          : 'No /g/collect network entry was visible in PerformanceResourceTiming (an ad blocker or browser privacy shield may be blocking google-analytics.com).'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ====================================================================
          SECTION A: LIVE OVERVIEW KPI CARDS
      ==================================================================== */}
      <section aria-label="Live Overview">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Active Visitors Now */}
          <div className="p-5 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#737746]">
                Visitors Active Now
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#07543E]">
                {isRealtimeConnected ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"
                    />
                    <span>Live</span>
                  </>
                ) : (
                  <span className="text-[#262820]/55">Offline</span>
                )}
              </span>
            </div>
            {loadingRealtime ? (
              <div className="h-10 w-24 rounded-md bg-[#07543E]/8 animate-pulse" />
            ) : (
              <p className="font-serif text-4xl font-semibold text-[#07543E] tabular-nums">
                {formatNumber(realtime?.activeUsersNow ?? null)}
              </p>
            )}
            <p className="text-xs text-[#262820]/70">
              {isRealtimeConnected
                ? 'Active in the last 5 minutes (GA4 Realtime)'
                : 'Unavailable until GA4 Realtime API is connected'}
            </p>
          </div>

          {/* 2. Active Users (Last 30 Minutes) */}
          <div className="p-5 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#737746]">
                Active Users (30 Min)
              </p>
              <Activity className="w-4 h-4 text-[#C5A04A]" aria-hidden="true" />
            </div>
            {loadingRealtime ? (
              <div className="h-10 w-24 rounded-md bg-[#07543E]/8 animate-pulse" />
            ) : (
              <p className="font-serif text-4xl font-semibold text-[#07543E] tabular-nums">
                {formatNumber(realtime?.activeUsersLast30Min ?? null)}
              </p>
            )}
            <p className="text-xs text-[#262820]/70">
              {isRealtimeConnected
                ? 'Rolling 30-minute active visitor window'
                : 'Unavailable until GA4 Realtime API is connected'}
            </p>
          </div>

          {/* 3. Total Users & Sessions */}
          <div className="p-5 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#737746]">
                Total Users &amp; Sessions
              </p>
              <Users className="w-4 h-4 text-[#07543E]" aria-hidden="true" />
            </div>
            {loadingReport ? (
              <div className="h-10 w-28 rounded-md bg-[#07543E]/8 animate-pulse" />
            ) : (
              <p className="font-serif text-4xl font-semibold text-[#07543E] tabular-nums">
                {formatNumber(report?.overview.totalUsers ?? null)}
              </p>
            )}
            <p className="text-xs text-[#262820]/70 tabular-nums">
              {isGa4Connected
                ? `${formatNumber(report?.overview.sessions ?? 0)} sessions · ${formatNumber(
                    report?.overview.activeUsers ?? 0
                  )} active users`
                : 'Unavailable — connect GA4 Property ID'}
            </p>
          </div>

          {/* 4. Page Views */}
          <div className="p-5 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#737746]">
                Page Views
              </p>
              <TrendingUp className="w-4 h-4 text-[#737746]" aria-hidden="true" />
            </div>
            {loadingReport ? (
              <div className="h-10 w-24 rounded-md bg-[#07543E]/8 animate-pulse" />
            ) : (
              <p className="font-serif text-4xl font-semibold text-[#07543E] tabular-nums">
                {formatNumber(report?.overview.pageViews ?? null)}
              </p>
            )}
            <p className="text-xs text-[#262820]/70">
              {isGa4Connected
                ? 'Deduplicated SPA & page transitions'
                : 'Unavailable — connect GA4 Property ID'}
            </p>
          </div>

          {/* 5. Average Engagement Time */}
          <div className="p-5 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#737746]">
                Avg. Engagement Time
              </p>
              <Clock className="w-4 h-4 text-[#C5A04A]" aria-hidden="true" />
            </div>
            {loadingReport ? (
              <div className="h-10 w-24 rounded-md bg-[#07543E]/8 animate-pulse" />
            ) : (
              <p className="font-serif text-4xl font-semibold text-[#07543E] tabular-nums">
                {formatDuration(report?.overview.avgEngagementSeconds ?? null)}
              </p>
            )}
            <p className="text-xs text-[#262820]/70">
              {isGa4Connected
                ? 'Average active foreground time per session'
                : 'Unavailable — connect GA4 Property ID'}
            </p>
          </div>

          {/* 6. New vs Returning Visitors */}
          <div className="p-5 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#737746]">
                New vs. Returning Visitors
              </p>
              <BarChart3 className="w-4 h-4 text-[#07543E]" aria-hidden="true" />
            </div>
            {loadingReport ? (
              <div className="h-10 w-36 rounded-md bg-[#07543E]/8 animate-pulse" />
            ) : (
              <div className="space-y-2">
                <p className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E] tabular-nums">
                  {formatNumber(report?.overview.newUsers ?? null)}{' '}
                  <span className="text-sm font-sans font-normal text-[#262820]/65">new</span>
                  <span className="mx-1.5 text-[#C5A04A]" aria-hidden="true">
                    ·
                  </span>
                  {formatNumber(report?.overview.returningUsers ?? null)}{' '}
                  <span className="text-sm font-sans font-normal text-[#262820]/65">returning</span>
                </p>
                {newReturningSplit.available && (
                  <div className="w-full h-2 rounded-full bg-[#07543E]/10 overflow-hidden flex">
                    <div
                      className="h-full bg-[#07543E]"
                      style={{ width: `${newReturningSplit.newPct}%` }}
                      title={`New visitors: ${newReturningSplit.newPct}%`}
                    />
                    <div
                      className="h-full bg-[#C5A04A]"
                      style={{ width: `${newReturningSplit.retPct}%` }}
                      title={`Returning visitors: ${newReturningSplit.retPct}%`}
                    />
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-[#262820]/70 tabular-nums">
              {newReturningSplit.available
                ? `${newReturningSplit.newPct}% new · ${newReturningSplit.retPct}% returning`
                : 'Unavailable — connect GA4 Property ID'}
            </p>
          </div>
        </div>
      </section>

      {/* ====================================================================
          SECTION E: TRAFFIC & ENGAGEMENT CHARTS (VISITORS & PAGE VIEWS OVER TIME)
      ==================================================================== */}
      <section className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#07543E]/10 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#737746]">
              Traffic Trends
            </p>
            <h3 className="font-serif text-xl sm:text-2xl font-semibold text-[#07543E]">
              Visitors &amp; Page Views Over Time
            </h3>
          </div>

          <div
            role="group"
            aria-label="Chart interval"
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#FAF7F0] border border-[#07543E]/12 self-start sm:self-auto"
          >
            <button
              type="button"
              onClick={() => setChartGranularity('daily')}
              aria-pressed={chartGranularity === 'daily'}
              className={`px-3 min-h-[34px] rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                chartGranularity === 'daily'
                  ? 'bg-[#07543E] text-white'
                  : 'text-[#262820]/75 hover:text-[#07543E]'
              }`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setChartGranularity('weekly')}
              aria-pressed={chartGranularity === 'weekly'}
              className={`px-3 min-h-[34px] rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                chartGranularity === 'weekly'
                  ? 'bg-[#07543E] text-white'
                  : 'text-[#262820]/75 hover:text-[#07543E]'
              }`}
            >
              Weekly
            </button>
          </div>
        </div>

        {loadingReport ? (
          <div className="h-72 w-full rounded-lg bg-[#07543E]/5 animate-pulse" />
        ) : !isGa4Connected ? (
          <div className="h-60 rounded-lg border border-dashed border-[#07543E]/20 bg-[#FAF7F0]/60 flex flex-col items-center justify-center text-center px-6 gap-2">
            <BarChart3 className="w-6 h-6 text-[#737746]" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#07543E]">
              Traffic Trend Data Unavailable
            </p>
            <p className="text-xs text-[#262820]/70 max-w-md">
              Connect your GA4 Property ID and read-only service account to render live daily and weekly visitor and page-view trends.
            </p>
          </div>
        ) : activeTimeSeries.length === 0 ? (
          <div className="h-60 rounded-lg border border-dashed border-[#07543E]/20 bg-[#FAF7F0]/60 flex flex-col items-center justify-center text-center px-6 gap-2">
            <p className="text-sm font-semibold text-[#07543E]">
              No Recorded Visits in This Date Range (0)
            </p>
            <p className="text-xs text-[#262820]/70 max-w-md">
              Google Analytics is connected, and 0 visits were recorded during this window. Try expanding to Last 30 Days or All Time.
            </p>
          </div>
        ) : (
          <div className="h-72 sm:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={activeTimeSeries}
                margin={{ top: 10, right: 12, left: 0, bottom: 4 }}
              >
                <defs>
                  <linearGradient id="mjayPageViewsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#07543E" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#07543E" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="mjayVisitorsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C5A04A" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#C5A04A" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(7, 84, 62, 0.1)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#262820', fontSize: 12 }}
                  axisLine={{ stroke: 'rgba(7, 84, 62, 0.2)' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#262820', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFDF8',
                    border: '1px solid rgba(197, 160, 74, 0.5)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    color: '#262820'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pageViews"
                  name="Page Views"
                  stroke="#07543E"
                  strokeWidth={2.2}
                  fill="url(#mjayPageViewsFill)"
                />
                <Area
                  type="monotone"
                  dataKey="users"
                  name="Visitors"
                  stroke="#C5A04A"
                  strokeWidth={2.2}
                  fill="url(#mjayVisitorsFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-5 text-xs text-[#262820]/75 pt-1">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-0.5 bg-[#07543E] inline-block" aria-hidden="true" />
            <span>Page Views</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-0.5 bg-[#C5A04A] inline-block" aria-hidden="true" />
            <span>Visitors</span>
          </span>
        </div>
      </section>

      {/* ====================================================================
          SECTION C: SECTION ENGAGEMENT REPORT & POPULARITY CHART
      ==================================================================== */}
      <section className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#07543E]/10 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#737746]">
              Single-Page Engagement
            </p>
            <h3 className="font-serif text-xl sm:text-2xl font-semibold text-[#07543E]">
              Section Engagement Breakdown
            </h3>
          </div>
          <p className="text-xs text-[#262820]/70">
            Measures active foreground viewing only (pauses on hidden tabs or 45s idle)
          </p>
        </div>

        {isGa4Connected && !report?.sectionMetricsAvailable && (
          <div className="p-3.5 rounded-lg bg-[#FAF7F0] border border-[#C5A04A]/40 text-xs text-[#262820]/85 flex items-start gap-2">
            <Info className="w-4 h-4 text-[#C5A04A] shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Section-level tracking events (<code className="font-mono">section_view</code> and{' '}
              <code className="font-mono">section_engagement</code>) are active on the website. Register the event-scoped custom dimension{' '}
              <code className="font-mono font-semibold">section_name</code> in GA4 Admin → Custom definitions to populate per-section metrics below.
            </span>
          </div>
        )}

        {/* Section Highlight Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-lg bg-[#FAF7F0] border border-[#07543E]/10">
            <p className="text-xs uppercase tracking-wider text-[#737746] font-semibold">
              Most Popular Section
            </p>
            <p className="font-serif text-xl font-semibold text-[#07543E] mt-1">
              {sectionInsights.mostPopular ? sectionInsights.mostPopular.label : '—'}
            </p>
            <p className="text-xs text-[#262820]/70 tabular-nums mt-0.5">
              {sectionInsights.mostPopular
                ? `${formatNumber(sectionInsights.mostPopular.views)} views`
                : 'Awaiting section data'}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#FAF7F0] border border-[#07543E]/10">
            <p className="text-xs uppercase tracking-wider text-[#737746] font-semibold">
              Highest Avg. Engagement
            </p>
            <p className="font-serif text-xl font-semibold text-[#07543E] mt-1">
              {sectionInsights.highestEngagement ? sectionInsights.highestEngagement.label : '—'}
            </p>
            <p className="text-xs text-[#262820]/70 tabular-nums mt-0.5">
              {sectionInsights.highestEngagement
                ? `${formatDuration(sectionInsights.highestEngagement.avgEngagementSeconds)} average`
                : 'Awaiting section data'}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#FAF7F0] border border-[#07543E]/10">
            <p className="text-xs uppercase tracking-wider text-[#737746] font-semibold">
              Lowest Engagement
            </p>
            <p className="font-serif text-xl font-semibold text-[#07543E] mt-1">
              {sectionInsights.lowestEngagement ? sectionInsights.lowestEngagement.label : '—'}
            </p>
            <p className="text-xs text-[#262820]/70 tabular-nums mt-0.5">
              {sectionInsights.lowestEngagement
                ? `${formatDuration(sectionInsights.lowestEngagement.avgEngagementSeconds)} average`
                : 'Awaiting section data'}
            </p>
          </div>
        </div>

        {/* Popular Sections Bar Chart (rendered when section data is available) */}
        {isGa4Connected && report?.sectionMetricsAvailable && (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={report.sections.map((s) => ({
                  name: s.label,
                  views: s.views ?? 0,
                  avgSec: s.avgEngagementSeconds ?? 0
                }))}
                layout="vertical"
                margin={{ top: 4, right: 18, left: 20, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(7, 84, 62, 0.1)" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: '#262820', fontSize: 12 }}
                  axisLine={{ stroke: 'rgba(7, 84, 62, 0.2)' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={145}
                  tick={{ fill: '#07543E', fontSize: 12, fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFDF8',
                    border: '1px solid rgba(197, 160, 74, 0.5)',
                    borderRadius: '10px',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="views" name="Section Views" fill="#07543E" radius={[0, 6, 6, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Section Engagement Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-[#07543E]/15 text-[#737746] text-xs uppercase tracking-wider">
                <th className="py-2.5 pr-4 font-semibold">Website Section</th>
                <th className="py-2.5 px-3 font-semibold text-right">Total Views</th>
                <th className="py-2.5 px-3 font-semibold text-right">Avg. Active Time</th>
                <th className="py-2.5 px-3 font-semibold text-right">Total Active Time</th>
                <th className="py-2.5 pl-4 font-semibold w-40 hidden sm:table-cell">Relative Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#07543E]/10">
              {(report?.sections || []).map((sec) => {
                const sharePct =
                  sec.views !== null && sectionInsights.maxViews > 0
                    ? Math.round((sec.views / sectionInsights.maxViews) * 100)
                    : 0;
                return (
                  <tr key={sec.sectionKey} className="hover:bg-[#FAF7F0]/70 transition-colors">
                    <td className="py-3 pr-4 font-medium text-[#07543E]">{sec.label}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#262820]">
                      {formatNumber(sec.views)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#262820]">
                      {formatDuration(sec.avgEngagementSeconds)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#262820]/75">
                      {formatDuration(sec.totalEngagementSeconds)}
                    </td>
                    <td className="py-3 pl-4 hidden sm:table-cell">
                      <div className="w-full h-2 rounded-full bg-[#07543E]/10 overflow-hidden">
                        <div
                          className="h-full bg-[#C5A04A] rounded-full"
                          style={{ width: `${sharePct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ====================================================================
          SECTION D: WEDDING EXPERIENCE TRACKING REPORT
      ==================================================================== */}
      <section className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#07543E]/10 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#737746]">
              Guest Journeys &amp; Outcomes
            </p>
            <h3 className="font-serif text-xl sm:text-2xl font-semibold text-[#07543E]">
              Wedding Experience Tracking
            </h3>
          </div>
          <p className="text-xs text-[#262820]/70">
            Separates clicks/starts, completed actions, and failed attempts
          </p>
        </div>

        {isGa4Connected && !report?.interactionStatusAvailable && (
          <div className="p-3.5 rounded-lg bg-[#FAF7F0] border border-[#C5A04A]/40 text-xs text-[#262820]/85 flex items-start gap-2">
            <Info className="w-4 h-4 text-[#C5A04A] shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Event counts are live. Register the event-scoped custom dimension{' '}
              <code className="font-mono font-semibold">interaction_status</code> in GA4 Admin to break out failed vs. completed attempts on RSVP, Song Suggestions, Gifting copies, and Guest Uploads.
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-[#07543E]/15 text-[#737746] text-xs uppercase tracking-wider">
                <th className="py-2.5 pr-4 font-semibold">Wedding Experience</th>
                <th className="py-2.5 px-3 font-semibold text-right">Clicks / Started</th>
                <th className="py-2.5 px-3 font-semibold text-right">Completed</th>
                <th className="py-2.5 px-3 font-semibold text-right">Failed</th>
                <th className="py-2.5 pl-4 font-semibold hidden md:table-cell">Breakdown</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#07543E]/10">
              {(report?.weddingExperience || []).map((item) => (
                <tr key={item.key} className="hover:bg-[#FAF7F0]/70 transition-colors">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-[#07543E]">{item.label}</p>
                    <p className="text-xs text-[#737746] mt-0.5">{item.category}</p>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-[#262820]">
                    {formatNumber(item.clicksOrStarted)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#07543E]">
                    {formatNumber(item.completed)}
                  </td>
                  <td
                    className={`py-3 px-3 text-right tabular-nums ${
                      item.failed !== null && item.failed > 0
                        ? 'font-semibold text-red-700'
                        : 'text-[#262820]/70'
                    }`}
                  >
                    {formatNumber(item.failed)}
                  </td>
                  <td className="py-3 pl-4 text-xs text-[#262820]/75 hidden md:table-cell">
                    {item.detailNote || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ====================================================================
          SECTION B: LIVE VISITOR ACTIVITY & TOP PAGES
      ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Live Recent Events Feed */}
        <section className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 border-b border-[#07543E]/10 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#737746]">
                Realtime Stream
              </p>
              <h3 className="font-serif text-xl font-semibold text-[#07543E]">
                Recent Visitor Events
              </h3>
            </div>
            <span className="text-xs text-[#262820]/65 tabular-nums">
              {isRealtimeConnected
                ? `${realtime?.recentEvents.length ?? 0} event groups`
                : 'Unavailable'}
            </span>
          </div>

          {loadingRealtime ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-9 rounded-md bg-[#07543E]/6 animate-pulse" />
              ))}
            </div>
          ) : !isRealtimeConnected ? (
            <p className="text-xs sm:text-sm text-[#262820]/70 py-6 text-center">
              Realtime event feed is unavailable until GA4 Realtime API credentials are configured.
            </p>
          ) : realtime && realtime.recentEvents.length === 0 ? (
            <p className="text-xs sm:text-sm text-[#262820]/70 py-6 text-center">
              Connected to GA4 Realtime — no visitor events in the last 30 minutes (0).
            </p>
          ) : (
            <ul className="divide-y divide-[#07543E]/10 text-xs sm:text-sm max-h-80 overflow-y-auto pr-1">
              {(realtime?.recentEvents || []).map((ev, idx) => (
                <li
                  key={`${ev.eventName}-${ev.minutesAgo}-${idx}`}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[#07543E] truncate">{ev.label}</p>
                    <p className="text-xs text-[#262820]/65">
                      <span className="font-mono">{ev.eventName}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{formatRelativeMinutes(ev.minutesAgo)}</span>
                    </p>
                  </div>
                  <span className="font-semibold text-[#07543E] tabular-nums shrink-0">
                    {ev.eventCount.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Active Pages Now + Most Visited Pages */}
        <section className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 flex flex-col gap-4">
          <div className="border-b border-[#07543E]/10 pb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#737746]">
              Page &amp; Route Attention
            </p>
            <h3 className="font-serif text-xl font-semibold text-[#07543E]">
              Most Visited Pages &amp; Active Views
            </h3>
          </div>

          {/* Pages Currently Receiving Attention (Realtime) */}
          {isRealtimeConnected && realtime && realtime.activePages.length > 0 && (
            <div className="p-3.5 rounded-lg bg-[#FAF7F0] border border-[#07543E]/12 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#07543E]">
                Currently Receiving Attention (Last 30 Min)
              </p>
              <div className="divide-y divide-[#07543E]/10 text-xs">
                {realtime.activePages.slice(0, 5).map((pg, idx) => (
                  <div
                    key={`${pg.screenName}-${idx}`}
                    className="py-1.5 flex items-center justify-between gap-2"
                  >
                    <span className="text-[#262820] truncate">{pg.screenName}</span>
                    <span className="font-semibold text-[#07543E] tabular-nums shrink-0">
                      {pg.activeUsers.toLocaleString()} active
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Pages Table (Historical Range) */}
          {loadingReport ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-9 rounded-md bg-[#07543E]/6 animate-pulse" />
              ))}
            </div>
          ) : !isGa4Connected ? (
            <p className="text-xs sm:text-sm text-[#262820]/70 py-6 text-center">
              Page analytics are unavailable until GA4 Data API credentials are configured.
            </p>
          ) : report && report.topPages.length === 0 ? (
            <p className="text-xs sm:text-sm text-[#262820]/70 py-6 text-center">
              No page views recorded in this date range (0).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-[#07543E]/15 text-[#737746] text-xs uppercase tracking-wider">
                    <th className="py-2 pr-3 font-semibold">Route</th>
                    <th className="py-2 px-2 font-semibold text-right">Views</th>
                    <th className="py-2 px-2 font-semibold text-right">Users</th>
                    <th className="py-2 pl-2 font-semibold text-right">Avg. Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#07543E]/10">
                  {(report?.topPages || []).slice(0, 8).map((pg, idx) => (
                    <tr key={`${pg.pagePath}-${idx}`} className="hover:bg-[#FAF7F0]/70">
                      <td className="py-2.5 pr-3 max-w-[200px]">
                        <p className="font-mono text-xs text-[#07543E] truncate">{pg.pagePath}</p>
                        <p className="text-xs text-[#262820]/65 truncate">{pg.pageTitle}</p>
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-[#262820]">
                        {pg.pageViews.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-[#262820]/80">
                        {pg.users.toLocaleString()}
                      </td>
                      <td className="py-2.5 pl-2 text-right tabular-nums text-[#262820]/75">
                        {formatDuration(pg.avgEngagementSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* ====================================================================
          AUDIENCE BREAKDOWN: DEVICES, LOCATIONS & TRAFFIC SOURCES
      ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Device Breakdown */}
        <section className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 flex flex-col gap-4">
          <div className="border-b border-[#07543E]/10 pb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#737746]">
              Devices
            </p>
            <h3 className="font-serif text-xl font-semibold text-[#07543E]">
              Device Breakdown
            </h3>
          </div>

          {loadingReport ? (
            <div className="h-48 rounded-lg bg-[#07543E]/6 animate-pulse" />
          ) : !isGa4Connected ? (
            <p className="text-xs text-[#262820]/70 py-8 text-center">
              Device breakdown unavailable.
            </p>
          ) : report && report.devices.length === 0 ? (
            <p className="text-xs text-[#262820]/70 py-8 text-center">
              No device sessions recorded in this period (0).
            </p>
          ) : (
            <>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={report?.devices.map((d) => ({
                        name: capitalizeDevice(d.deviceCategory),
                        value: d.users
                      }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={70}
                      paddingAngle={2}
                    >
                      {(report?.devices || []).map((entry, idx) => (
                        <Cell
                          key={entry.deviceCategory}
                          fill={WEDDING_CHART_COLORS[idx % WEDDING_CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFDF8',
                        border: '1px solid rgba(197, 160, 74, 0.5)',
                        borderRadius: '10px',
                        fontSize: '12px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="divide-y divide-[#07543E]/10 text-xs sm:text-sm">
                {(report?.devices || []).map((dev) => {
                  const pct =
                    totalDeviceUsers > 0 ? Math.round((dev.users / totalDeviceUsers) * 100) : 0;
                  return (
                    <div
                      key={dev.deviceCategory}
                      className="py-2 flex items-center justify-between gap-2"
                    >
                      <span className="inline-flex items-center gap-2 font-medium text-[#262820]">
                        <DeviceIcon category={dev.deviceCategory} />
                        <span>{capitalizeDevice(dev.deviceCategory)}</span>
                      </span>
                      <span className="tabular-nums text-[#07543E] font-semibold">
                        {dev.users.toLocaleString()}{' '}
                        <span className="font-normal text-[#262820]/65">({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* Visitor Locations */}
        <section className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 border-b border-[#07543E]/10 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#737746]">
                Geography
              </p>
              <h3 className="font-serif text-xl font-semibold text-[#07543E]">
                Visitor Locations
              </h3>
            </div>
            <Globe className="w-4 h-4 text-[#C5A04A]" aria-hidden="true" />
          </div>

          {loadingReport ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-8 rounded-md bg-[#07543E]/6 animate-pulse" />
              ))}
            </div>
          ) : !isGa4Connected ? (
            <p className="text-xs text-[#262820]/70 py-8 text-center">
              Geographic data unavailable.
            </p>
          ) : report && report.locations.length === 0 ? (
            <p className="text-xs text-[#262820]/70 py-8 text-center">
              No visitor locations recorded in this period (0).
            </p>
          ) : (
            <div className="divide-y divide-[#07543E]/10 text-xs sm:text-sm max-h-72 overflow-y-auto pr-1">
              {(report?.locations || []).map((loc, idx) => (
                <div
                  key={`${loc.country}-${loc.city}-${idx}`}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[#07543E] truncate">
                      {loc.city !== '(not set)' ? `${loc.city}, ${loc.country}` : loc.country}
                    </p>
                    <p className="text-xs text-[#262820]/65 tabular-nums">
                      {loc.sessions.toLocaleString()} sessions
                    </p>
                  </div>
                  <span className="font-semibold text-[#262820] tabular-nums shrink-0">
                    {loc.users.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Traffic Sources & Referrals */}
        <section className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 flex flex-col gap-4">
          <div className="border-b border-[#07543E]/10 pb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#737746]">
              Acquisition
            </p>
            <h3 className="font-serif text-xl font-semibold text-[#07543E]">
              Traffic Sources &amp; Referrals
            </h3>
          </div>

          {loadingReport ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-8 rounded-md bg-[#07543E]/6 animate-pulse" />
              ))}
            </div>
          ) : !isGa4Connected ? (
            <p className="text-xs text-[#262820]/70 py-8 text-center">
              Traffic source breakdown unavailable.
            </p>
          ) : report && report.trafficSources.length === 0 ? (
            <p className="text-xs text-[#262820]/70 py-8 text-center">
              No traffic sources recorded in this period (0).
            </p>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {(report?.trafficSources || []).map((src, idx) => {
                const widthPct = Math.max(
                  4,
                  Math.round((src.sessions / maxTrafficSessions) * 100)
                );
                return (
                  <div key={`${src.source}-${src.medium}-${idx}`} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                      <span className="font-medium text-[#07543E] truncate">
                        {src.source}
                        <span className="text-[#262820]/55 font-normal"> / {src.medium}</span>
                      </span>
                      <span className="tabular-nums font-semibold text-[#262820] shrink-0">
                        {src.sessions.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[#07543E]/10 overflow-hidden">
                        <div
                          className="h-full bg-[#737746] rounded-full"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-[#262820]/65 shrink-0">
                        {src.channelGroup}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Subtle Loading Footer Indicator when refreshing in background */}
      {refreshingManual && (
        <div className="flex items-center justify-end gap-2 text-xs text-[#07543E]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span>Syncing latest Google Analytics 4 reports...</span>
        </div>
      )}
    </div>
  );
};
