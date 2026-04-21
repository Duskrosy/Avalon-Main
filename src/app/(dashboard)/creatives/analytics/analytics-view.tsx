"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format, parseISO, subDays, startOfDay } from "date-fns";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────────

type PlatformInfo = {
  id: string;
  platform: "facebook" | "instagram" | "tiktok" | "youtube";
  page_name: string | null;
  is_active: boolean;
};

type Group = {
  id: string;
  name: string;
  smm_group_platforms: PlatformInfo[];
};

export type SmmGroup = Group;

type AnalyticsRow = {
  id: string;
  metric_date: string;
  impressions: number;
  reach: number;
  engagements: number;
  follower_count: number | null;
  follower_growth: number | null;
  video_plays: number;
  video_plays_3s: number;
  avg_play_time_secs: number;
  engagement_rate: number;
  hook_rate: number;
  data_source: "manual" | "api";
  last_synced_at: string | null;
};

type TopPost = {
  id: string;
  post_url: string | null;
  thumbnail_url: string | null;
  caption_preview: string | null;
  post_type: string | null;
  published_at: string | null;
  impressions: number | null;
  reach: number | null;
  engagements: number | null;
  video_plays: number | null;
  avg_play_time_secs: number | null;
};

type SyncState = "idle" | "syncing" | "done" | "failed" | "no_api";

type ManualForm = {
  metric_date: string;
  impressions: string;
  reach: string;
  engagements: string;
  follower_count: string;
  follower_growth: string;
  video_plays: string;
  video_plays_3s: string;
  avg_play_time_secs: string;
};

type Props = { groups: Group[] };

// ─── Constants ─────────────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  facebook:  "#1877F2",
  instagram: "#E1306C",
  tiktok:    "#010101",
  youtube:   "#FF0000",
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook:  "Facebook",
  instagram: "Instagram",
  tiktok:    "TikTok",
  youtube:   "YouTube",
};

const PRESETS = [
  { label: "7d",  days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtK(n: number | null): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function fmtTime(secs: number | null): string {
  if (secs == null || secs === 0) return "—";
  if (secs < 60) return `${secs.toFixed(0)}s`;
  return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
}

function yesterday(): string {
  return subDays(startOfDay(new Date()), 1).toISOString().split("T")[0];
}

function dateRange(days: number): { from: string; to: string } {
  const to = new Date().toISOString().split("T")[0];
  const from = subDays(new Date(), days - 1).toISOString().split("T")[0];
  return { from, to };
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export function AnalyticsView({ groups }: Props) {
  const activeGroups = groups;
  const firstGroupWithPlatforms = groups.find((g) =>
    g.smm_group_platforms.some((p) => p.is_active)
  );

  const [groupId, setGroupId]   = useState<string>(firstGroupWithPlatforms?.id ?? groups[0]?.id ?? "");
  const [platId,  setPlatId]    = useState<string>("");
  const [preset,  setPreset]    = useState<number>(30);

  const [rows,     setRows]     = useState<AnalyticsRow[]>([]);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [loading,  setLoading]  = useState(false);

  const [selectedPost, setSelectedPost] = useState<TopPost | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState<ManualForm>({
    metric_date:        yesterday(),
    impressions:        "",
    reach:              "",
    engagements:        "",
    follower_count:     "",
    follower_growth:    "",
    video_plays:        "",
    video_plays_3s:     "",
    avg_play_time_secs: "",
  });
  const [savingManual, setSavingManual] = useState(false);
  const [manualError,  setManualError]  = useState<string | null>(null);

  // Active group and its platforms
  const activeGroup = groups.find((g) => g.id === groupId);
  const activePlatforms = useMemo(
    () => (activeGroup?.smm_group_platforms ?? []).filter((p) => p.is_active),
    [activeGroup]
  );

  // Initialise platId when group changes
  useEffect(() => {
    if (activePlatforms.length > 0) {
      setPlatId(activePlatforms[0].id);
    } else {
      setPlatId("");
    }
  }, [groupId, activePlatforms]);

  const activePlatform = activePlatforms.find((p) => p.id === platId);
  const isVideoFirst = ["tiktok", "youtube"].includes(activePlatform?.platform ?? "");

  // Date range
  const range = useMemo(() => dateRange(preset), [preset]);

  // ── Fetch data ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!platId) return;
    setLoading(true);
    setSyncState("idle");
    setSyncError(null);

    const params = new URLSearchParams({ platform_id: platId, from: range.from, to: range.to });
    const [analyticsRes, topPostsRes] = await Promise.all([
      fetch(`/api/smm/analytics?${params}`),
      fetch(`/api/smm/top-posts?${params}`),
    ]);

    if (analyticsRes.ok) setRows(await analyticsRes.json());
    if (topPostsRes.ok) setTopPosts(await topPostsRes.json());
    setLoading(false);
  }, [platId, range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Sync ─────────────────────────────────────────────────────────────────────
  async function handleSync() {
    if (!platId) return;
    setSyncState("syncing");
    setSyncError(null);

    const res = await fetch("/api/smm/social-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform_id: platId }),
    });
    const json = await res.json();

    if (json.ok) {
      setSyncState("done");
      await fetchData();
    } else if (json.needs_manual) {
      setSyncState("no_api");
      setSyncError(json.error ?? "Auto-sync not available.");
      // Automatically open manual entry — user doesn't need to ask twice
      setManualForm((f) => ({ ...f, metric_date: yesterday() }));
      setShowManual(true);
    } else {
      setSyncState("failed");
      setSyncError(json.error ?? "Sync failed.");
    }
  }

  // ── Manual save ───────────────────────────────────────────────────────────────
  async function handleManualSave(e: React.FormEvent) {
    e.preventDefault();
    if (!platId) return;
    setSavingManual(true);
    setManualError(null);

    const res = await fetch("/api/smm/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform_id: platId, ...manualForm }),
    });
    const json = await res.json();

    if (res.ok) {
      setShowManual(false);
      setSyncState("idle");
      setSyncError(null);
      await fetchData();
    } else {
      setManualError(json.error ?? "Failed to save.");
    }
    setSavingManual(false);
  }

  // ── Derived summary ───────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const totalImpressions  = rows.reduce((s, r) => s + r.impressions, 0);
    const totalReach        = rows.reduce((s, r) => s + r.reach, 0);
    const totalEngagements  = rows.reduce((s, r) => s + r.engagements, 0);
    const totalVideoPlays   = rows.reduce((s, r) => s + r.video_plays, 0);
    const totalFollowerGrow = rows.reduce((s, r) => s + (r.follower_growth ?? 0), 0);
    const avgEngRate        = totalReach > 0 ? totalEngagements / totalReach : 0;
    const avgHookRate       = rows.filter((r) => r.hook_rate > 0).length > 0
      ? rows.reduce((s, r) => s + r.hook_rate, 0) / rows.filter((r) => r.hook_rate > 0).length
      : 0;
    const latestFollowers   = rows.filter((r) => r.follower_count != null).at(-1)?.follower_count ?? null;
    const lastSynced        = rows.filter((r) => r.data_source === "api" && r.last_synced_at).at(-1)?.last_synced_at ?? null;
    const hasManual         = rows.some((r) => r.data_source === "manual");
    const hasApi            = rows.some((r) => r.data_source === "api");

    return { totalImpressions, totalReach, totalEngagements, totalVideoPlays, totalFollowerGrow, avgEngRate, avgHookRate, latestFollowers, lastSynced, hasManual, hasApi };
  }, [rows]);

  // ── Chart data ────────────────────────────────────────────────────────────────
  const chartData = useMemo(() =>
    rows.map((r) => ({
      date:         format(parseISO(r.metric_date), "d MMM"),
      Impressions:  r.impressions,
      Reach:        r.reach,
      Engagements:  r.engagements,
      "Eng. Rate":  parseFloat((r.engagement_rate * 100).toFixed(2)),
      "Hook Rate":  parseFloat((r.hook_rate * 100).toFixed(2)),
      "Video Plays": r.video_plays,
      Followers:    r.follower_count,
    })),
    [rows]
  );

  // ─── Empty state — no platforms ───────────────────────────────────────────────
  if (activeGroups.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-2">Social Analytics</h1>
        <div className="bg-[var(--color-bg-secondary)] border border-dashed border-[var(--color-border-primary)] rounded-2xl p-16 text-center mt-6">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">No platforms configured</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
            Go to <strong>Content → ⚙ Groups</strong> to add your social media pages.
          </p>
        </div>
      </div>
    );
  }

  const hasData = rows.length > 0;
  const platColor = PLATFORM_COLORS[activePlatform?.platform ?? ""] ?? "#6b7280";

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Social Analytics</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Performance metrics by platform and date range</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setManualForm((f) => ({ ...f, metric_date: yesterday() })); setShowManual(true); }}
            className="text-xs px-3 py-2 border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-surface-hover)]"
          >
            + Add manually
          </button>
          <button
            onClick={handleSync}
            disabled={syncState === "syncing" || !platId}
            className="text-xs px-3 py-2 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
          >
            {syncState === "syncing" ? "Syncing…" : syncState === "done" ? "✓ Synced" : "↻ Sync Now"}
          </button>
        </div>
      </div>

      {/* ── Group tabs ── */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {activeGroups.map((g) => (
          <button
            key={g.id}
            onClick={() => setGroupId(g.id)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              groupId === g.id
                ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] border-[var(--color-text-primary)]"
                : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)] hover:border-[var(--color-border-primary)]"
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* ── Empty state when selected group has no platforms ── */}
      {groupId && activePlatforms.length === 0 && (
        <div className="bg-[var(--color-bg-secondary)] border border-dashed border-[var(--color-border-primary)] rounded-2xl p-12 text-center mb-5">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">No platforms configured for {activeGroup?.name ?? "this group"}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
            Add Facebook, Instagram, TikTok, or YouTube credentials in <a href="/creatives/settings" className="underline">Creatives Settings</a>.
          </p>
        </div>
      )}

      {/* ── Platform tabs ── */}
      {activePlatforms.length > 0 && (
        <div className="flex items-center gap-1 mb-5 flex-wrap">
          {activePlatforms.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlatId(p.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                platId === p.id
                  ? "text-white border-transparent"
                  : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)] hover:border-[var(--color-border-primary)]"
              }`}
              style={platId === p.id ? { backgroundColor: PLATFORM_COLORS[p.platform] } : undefined}
            >
              {PLATFORM_LABELS[p.platform]}
              {p.page_name ? ` · ${p.page_name}` : ""}
            </button>
          ))}
        </div>
      )}

      {/* ── Date preset + sync status ── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => setPreset(p.days)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                preset === p.days
                  ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] border-[var(--color-text-primary)]"
                  : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)] hover:border-[var(--color-border-primary)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
          {summary?.lastSynced && (
            <span>Last synced {format(parseISO(summary.lastSynced), "d MMM, HH:mm")}</span>
          )}
          {summary?.hasApi && (
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--color-success-light)] text-[var(--color-success)] font-medium">Auto</span>
          )}
          {summary?.hasManual && !summary.hasApi && (
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--color-warning-light)] text-[var(--color-warning)] font-medium">Manual</span>
          )}
          {summary?.hasManual && summary.hasApi && (
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium">Mixed</span>
          )}
        </div>
      </div>

      {/* ── Sync error / no-API banner ── */}
      {(syncState === "no_api" || syncState === "failed") && syncError && (
        <div className="mb-4 bg-[var(--color-warning-light)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-4 py-3 flex items-start gap-3">
          <span className="text-amber-500 mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--color-warning-text)] font-medium">
              {syncState === "no_api" ? "Auto-sync not available" : "Sync failed"}
            </p>
            <p className="text-xs text-[var(--color-warning-text)] mt-0.5">{syncError}</p>
          </div>
          <button
            onClick={() => { setManualForm((f) => ({ ...f, metric_date: yesterday() })); setShowManual(true); }}
            className="text-xs text-[var(--color-warning-text)] underline shrink-0 hover:text-amber-900"
          >
            Enter manually
          </button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading…</div>
      )}

      {/* ── No data state ── */}
      {!loading && !hasData && (
        <div className="bg-[var(--color-bg-secondary)] border border-dashed border-[var(--color-border-primary)] rounded-2xl p-12 text-center">
          <p className="text-3xl mb-3">📭</p>
          <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">No data for this period</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-5">
            Try syncing automatically, or enter yesterday&apos;s metrics by hand.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncState === "syncing"}
              className="text-sm px-4 py-2 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
            >
              {syncState === "syncing" ? "Syncing…" : "↻ Sync Now"}
            </button>
            <button
              onClick={() => { setManualForm((f) => ({ ...f, metric_date: yesterday() })); setShowManual(true); }}
              className="text-sm px-4 py-2 border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-surface-hover)]"
            >
              Enter manually
            </button>
          </div>
        </div>
      )}

      {/* ── Data: KPI cards + charts ── */}
      {!loading && hasData && summary && (
        <>
          {/* KPI Summary cards — platform-specific */}
          {activePlatform?.platform === "facebook" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Reach</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.totalReach)}</p>
                <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">unique accounts reached</p>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Engagements</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.totalEngagements)}</p>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Page Views</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.totalVideoPlays)}</p>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Followers</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.latestFollowers)}</p>
                {summary.totalFollowerGrow !== 0 && (
                  <p className={`text-xs mt-0.5 font-medium ${summary.totalFollowerGrow >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
                    {summary.totalFollowerGrow >= 0 ? "+" : ""}{fmtK(summary.totalFollowerGrow)}
                  </p>
                )}
              </div>
            </div>
          )}

          {activePlatform?.platform === "instagram" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Views</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.totalImpressions)}</p>
                <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">impressions</p>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Reach</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.totalReach)}</p>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Interactions</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.totalEngagements)}</p>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Followers</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.latestFollowers)}</p>
                {summary.totalFollowerGrow !== 0 && (
                  <p className={`text-xs mt-0.5 font-medium ${summary.totalFollowerGrow >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
                    {summary.totalFollowerGrow >= 0 ? "+" : ""}{fmtK(summary.totalFollowerGrow)}
                  </p>
                )}
              </div>
            </div>
          )}

          {activePlatform?.platform === "youtube" && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Subscribers</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.latestFollowers)}</p>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Total Views</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.totalReach)}</p>
                <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">lifetime</p>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Follower Growth</p>
                <p className={`text-2xl font-bold ${summary.totalFollowerGrow >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
                  {summary.totalFollowerGrow >= 0 ? "+" : ""}{fmtK(summary.totalFollowerGrow)}
                </p>
              </div>
            </div>
          )}

          {activePlatform?.platform === "tiktok" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Views</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.totalImpressions)}</p>
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full text-[10px] bg-[var(--color-warning-light)] text-[var(--color-warning)] font-medium">Manual data</span>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Reach</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.totalReach)}</p>
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full text-[10px] bg-[var(--color-warning-light)] text-[var(--color-warning)] font-medium">Manual data</span>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Interactions</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.totalEngagements)}</p>
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full text-[10px] bg-[var(--color-warning-light)] text-[var(--color-warning)] font-medium">Manual data</span>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Followers</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(summary.latestFollowers)}</p>
                {summary.totalFollowerGrow !== 0 && (
                  <p className={`text-xs mt-0.5 font-medium ${summary.totalFollowerGrow >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
                    {summary.totalFollowerGrow >= 0 ? "+" : ""}{fmtK(summary.totalFollowerGrow)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Chart 1: Impressions & Reach */}
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5 mb-4">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Impressions & Reach</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => fmtK(v)} />
                <Tooltip
                  formatter={(v, name) => [fmtK(Number(v)), String(name)]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Impressions" stroke={platColor} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Reach" stroke="#9ca3af" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2: Engagement Rate (bar) */}
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5 mb-4">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Daily Engagement Rate (%)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  formatter={(v) => [`${Number(v)}%`, "Eng. Rate"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="Eng. Rate" fill={platColor} radius={[3, 3, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 3: Video metrics — only shown for video-first platforms OR if any video data exists */}
          {(isVideoFirst || summary.totalVideoPlays > 0) && (
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5 mb-4">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Video Plays & Hook Rate (%)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => fmtK(v)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(v, name) =>
                      String(name) === "Hook Rate" ? [`${Number(v)}%`, name] : [fmtK(Number(v)), name]
                    }
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="left" type="monotone" dataKey="Video Plays" stroke={platColor} strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="Hook Rate" stroke="#8b5cf6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Follower count trend */}
          {rows.some((r) => r.follower_count != null) && (
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5 mb-6">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Follower Count</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => fmtK(v)} domain={["auto", "auto"]} />
                  <Tooltip
                    formatter={(v) => [fmtK(Number(v)), "Followers"]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                  <Line type="monotone" dataKey="Followers" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Recent Posts grid */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Recent Posts</h3>
              {topPosts.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] font-medium">{topPosts.length}</span>
              )}
            </div>
            {topPosts.length === 0 ? (
              <p className="text-xs text-[var(--color-text-tertiary)]">Post stats will appear after the next sync</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {topPosts.map((p) => (
                  <div key={p.id} onClick={() => setSelectedPost(p)} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden flex flex-col cursor-pointer hover:ring-1 hover:ring-[var(--color-border-focus)] transition-shadow">
                    {/* Thumbnail */}
                    <div className="relative aspect-video bg-[var(--color-bg-tertiary)]">
                      {p.thumbnail_url ? (
                        <img src={p.thumbnail_url} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-2xl" style={{ color: platColor }}>
                            {activePlatform?.platform === "youtube" ? "▶" :
                             activePlatform?.platform === "instagram" ? "📷" :
                             activePlatform?.platform === "tiktok" ? "♪" : "▶"}
                          </span>
                        </div>
                      )}
                      {/* Post type badge */}
                      {p.post_type && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-black/60 text-white capitalize">
                          {p.post_type}
                        </span>
                      )}
                    </div>
                    {/* Body */}
                    <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                      {/* Caption */}
                      <p className="text-xs text-[var(--color-text-primary)] line-clamp-2 leading-snug">
                        {p.caption_preview ?? "(no caption)"}
                      </p>
                      {/* Date */}
                      {p.published_at && (
                        <p className="text-[10px] text-[var(--color-text-tertiary)]">
                          {format(parseISO(p.published_at), "d MMM yyyy")}
                        </p>
                      )}
                      {/* Metrics row */}
                      <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] mt-auto pt-1 border-t border-[var(--color-border-secondary)]">
                        <span title={activePlatform?.platform === "facebook" ? "Reach" : "Impressions"}>
                          👁 {activePlatform?.platform === "facebook" ? fmtK(p.reach) : fmtK(p.impressions)}
                        </span>
                        <span title="Engagements">❤️ {fmtK(p.engagements)}</span>
                        {(p.video_plays ?? 0) > 0 && (
                          <span title="Plays">▶ {fmtK(p.video_plays)}</span>
                        )}
                      </div>
                      {/* View post link */}
                      {p.post_url && (
                        <a
                          href={p.post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-[var(--color-accent)] hover:underline mt-0.5"
                        >
                          View post →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Raw data table (collapsed by default) */}
          <details className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
            <summary className="px-5 py-3 text-sm font-medium text-[var(--color-text-primary)] cursor-pointer select-none hover:bg-[var(--color-surface-hover)]">
              Daily data — {rows.length} rows
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[var(--color-bg-secondary)] border-t border-[var(--color-border-secondary)]">
                  <tr>
                    {["Date", "Impressions", "Reach", "Engagements", "Eng. Rate", "Video Plays", "Hook Rate", "Followers", "Source"].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-[var(--color-text-secondary)] font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-secondary)]">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-[var(--color-surface-hover)]">
                      <td className="px-4 py-2 text-[var(--color-text-primary)] whitespace-nowrap">{format(parseISO(r.metric_date), "d MMM yyyy")}</td>
                      <td className="px-4 py-2 text-[var(--color-text-secondary)]">{r.impressions.toLocaleString()}</td>
                      <td className="px-4 py-2 text-[var(--color-text-secondary)]">{r.reach.toLocaleString()}</td>
                      <td className="px-4 py-2 text-[var(--color-text-secondary)]">{r.engagements.toLocaleString()}</td>
                      <td className="px-4 py-2 text-[var(--color-text-secondary)]">{fmtPct(r.engagement_rate)}</td>
                      <td className="px-4 py-2 text-[var(--color-text-secondary)]">{r.video_plays.toLocaleString()}</td>
                      <td className="px-4 py-2 text-[var(--color-text-secondary)]">{fmtPct(r.hook_rate)}</td>
                      <td className="px-4 py-2 text-[var(--color-text-secondary)]">{r.follower_count != null ? fmtK(r.follower_count) : "—"}</td>
                      <td className="px-4 py-2">
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          r.data_source === "api" ? "bg-[var(--color-success-light)] text-[var(--color-success)]" : "bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                        }`}>
                          {r.data_source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}

      {/* ── Manual Entry Modal ── */}
      {showManual && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                Enter Metrics Manually
                {activePlatform && (
                  <span className="ml-2 text-sm font-normal" style={{ color: platColor }}>
                    — {PLATFORM_LABELS[activePlatform.platform]}
                  </span>
                )}
              </h2>
              <button onClick={() => { setShowManual(false); setSyncState("idle"); setSyncError(null); }}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">✕</button>
            </div>

            {manualError && (
              <div className="mb-4 bg-[var(--color-error-light)] border border-red-200 rounded-[var(--radius-lg)] px-3 py-2 text-xs text-[var(--color-error)]">
                {manualError}
              </div>
            )}

            {/* Hint when auto-sync wasn't available */}
            {syncState === "no_api" && (
              <div className="mb-4 bg-[var(--color-accent-light)] border border-[var(--color-accent)] rounded-[var(--radius-lg)] px-3 py-2 text-xs text-[var(--color-accent)]">
                Auto-sync wasn't available for this platform. Enter yesterday's stats from your platform's dashboard below.
              </div>
            )}

            <form onSubmit={handleManualSave} className="space-y-3">
              {/* Date */}
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Date <span className="text-red-400">*</span></label>
                <input type="date" required
                  value={manualForm.metric_date}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setManualForm((f) => ({ ...f, metric_date: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              {/* Core reach metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Impressions</label>
                  <input type="number" min="0" placeholder="0"
                    value={manualForm.impressions}
                    onChange={(e) => setManualForm((f) => ({ ...f, impressions: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Reach</label>
                  <input type="number" min="0" placeholder="0"
                    value={manualForm.reach}
                    onChange={(e) => setManualForm((f) => ({ ...f, reach: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Engagements</label>
                  <input type="number" min="0" placeholder="0"
                    value={manualForm.engagements}
                    onChange={(e) => setManualForm((f) => ({ ...f, engagements: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Follower Count</label>
                  <input type="number" min="0" placeholder="Current total"
                    value={manualForm.follower_count}
                    onChange={(e) => setManualForm((f) => ({ ...f, follower_count: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Follower Growth</label>
                  <input type="number" placeholder="± delta"
                    value={manualForm.follower_growth}
                    onChange={(e) => setManualForm((f) => ({ ...f, follower_growth: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              {/* Video metrics — always shown but labelled as optional */}
              <div className="pt-2 border-t border-[var(--color-border-secondary)]">
                <p className="text-xs text-[var(--color-text-tertiary)] mb-2">Video metrics (leave blank if not applicable)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Video Plays</label>
                    <input type="number" min="0" placeholder="0"
                      value={manualForm.video_plays}
                      onChange={(e) => setManualForm((f) => ({ ...f, video_plays: e.target.value }))}
                      className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">3s Plays (Hook)</label>
                    <input type="number" min="0" placeholder="0"
                      value={manualForm.video_plays_3s}
                      onChange={(e) => setManualForm((f) => ({ ...f, video_plays_3s: e.target.value }))}
                      className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Avg Play Time (seconds)</label>
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      value={manualForm.avg_play_time_secs}
                      onChange={(e) => setManualForm((f) => ({ ...f, avg_play_time_secs: e.target.value }))}
                      className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button"
                  onClick={() => { setShowManual(false); setSyncState("idle"); setSyncError(null); }}
                  className="flex-1 border border-[var(--color-border-primary)] text-sm py-2 rounded-lg hover:bg-[var(--color-surface-hover)]"
                >
                  Cancel
                </button>
                <button type="submit" disabled={savingManual}
                  className="flex-1 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  {savingManual ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Post Detail Modal ──────────────────────────────────────── */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedPost(null)} />
          <div className="relative bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-md p-5 mx-4 max-h-[90vh] overflow-y-auto">
            <button onClick={() => setSelectedPost(null)} className="absolute top-3 right-3 text-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&times;</button>

            {selectedPost.thumbnail_url && (
              <img src={selectedPost.thumbnail_url} onError={(e) => { e.currentTarget.style.display = "none"; }} className="w-full h-48 object-cover rounded-[var(--radius-md)] mb-4 bg-[var(--color-bg-tertiary)]" alt="" />
            )}

            <p className="text-sm text-[var(--color-text-primary)] mb-4 line-clamp-3">{selectedPost.caption_preview ?? "(no caption)"}</p>

            <div className="grid grid-cols-2 gap-3">
              {selectedPost.impressions != null && (
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Impressions</p>
                  <p className="text-lg font-semibold text-[var(--color-text-primary)]">{fmtK(selectedPost.impressions)}</p>
                </div>
              )}
              {selectedPost.reach != null && (
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Reach</p>
                  <p className="text-lg font-semibold text-[var(--color-text-primary)]">{fmtK(selectedPost.reach)}</p>
                </div>
              )}
              {selectedPost.engagements != null && (
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Engagements</p>
                  <p className="text-lg font-semibold text-[var(--color-text-primary)]">{fmtK(selectedPost.engagements)}</p>
                </div>
              )}
              {selectedPost.video_plays != null && selectedPost.video_plays > 0 && (
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]">
                  <p className="text-xs text-[var(--color-text-tertiary)]">{activePlatform?.platform === "tiktok" ? "Views" : "Video Plays"}</p>
                  <p className="text-lg font-semibold text-[var(--color-text-primary)]">{fmtK(selectedPost.video_plays)}</p>
                </div>
              )}
              {selectedPost.avg_play_time_secs != null && selectedPost.avg_play_time_secs > 0 && (
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]">
                  <p className="text-xs text-[var(--color-text-tertiary)]">Avg Watch Time</p>
                  <p className="text-lg font-semibold text-[var(--color-text-primary)]">{selectedPost.avg_play_time_secs.toFixed(1)}s</p>
                </div>
              )}
            </div>

            {selectedPost.published_at && (
              <p className="text-xs text-[var(--color-text-tertiary)] mt-4">
                Published {format(parseISO(selectedPost.published_at), "MMM d, yyyy 'at' h:mm a")}
              </p>
            )}

            {selectedPost.post_url && (
              <a href={selectedPost.post_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-sm text-[var(--color-accent)] hover:underline">
                View on {PLATFORM_LABELS[activePlatform?.platform ?? ""] ?? "platform"} &rarr;
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
