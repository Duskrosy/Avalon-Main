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
  const activeGroups = groups.filter((g) =>
    g.smm_group_platforms.some((p) => p.is_active)
  );

  const [groupId, setGroupId]   = useState<string>(activeGroups[0]?.id ?? "");
  const [platId,  setPlatId]    = useState<string>("");
  const [preset,  setPreset]    = useState<number>(30);

  const [rows,     setRows]     = useState<AnalyticsRow[]>([]);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [loading,  setLoading]  = useState(false);

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
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Social Analytics</h1>
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-16 text-center mt-6">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-sm font-medium text-gray-700">No platforms configured</p>
          <p className="text-xs text-gray-400 mt-1">
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
          <h1 className="text-2xl font-semibold text-gray-900">Social Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Performance metrics by platform and date range</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setManualForm((f) => ({ ...f, metric_date: yesterday() })); setShowManual(true); }}
            className="text-xs px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
          >
            + Add manually
          </button>
          <button
            onClick={handleSync}
            disabled={syncState === "syncing" || !platId}
            className="text-xs px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
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
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

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
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
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
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
          {summary?.lastSynced && (
            <span>Last synced {format(parseISO(summary.lastSynced), "d MMM, HH:mm")}</span>
          )}
          {summary?.hasApi && (
            <span className="px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">Auto</span>
          )}
          {summary?.hasManual && !summary.hasApi && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">Manual</span>
          )}
          {summary?.hasManual && summary.hasApi && (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">Mixed</span>
          )}
        </div>
      </div>

      {/* ── Sync error / no-API banner ── */}
      {(syncState === "no_api" || syncState === "failed") && syncError && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-amber-500 mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-amber-800 font-medium">
              {syncState === "no_api" ? "Auto-sync not available" : "Sync failed"}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">{syncError}</p>
          </div>
          <button
            onClick={() => { setManualForm((f) => ({ ...f, metric_date: yesterday() })); setShowManual(true); }}
            className="text-xs text-amber-700 underline shrink-0 hover:text-amber-900"
          >
            Enter manually
          </button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      )}

      {/* ── No data state ── */}
      {!loading && !hasData && (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-12 text-center">
          <p className="text-3xl mb-3">📭</p>
          <p className="text-sm font-medium text-gray-700 mb-1">No data for this period</p>
          <p className="text-xs text-gray-400 mb-5">
            Try syncing automatically, or enter yesterday&apos;s metrics by hand.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncState === "syncing"}
              className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {syncState === "syncing" ? "Syncing…" : "↻ Sync Now"}
            </button>
            <button
              onClick={() => { setManualForm((f) => ({ ...f, metric_date: yesterday() })); setShowManual(true); }}
              className="text-sm px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
            >
              Enter manually
            </button>
          </div>
        </div>
      )}

      {/* ── Data: KPI cards + charts ── */}
      {!loading && hasData && summary && (
        <>
          {/* KPI Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Impressions</p>
              <p className="text-2xl font-bold text-gray-900">{fmtK(summary.totalImpressions)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Avg Engagement Rate</p>
              <p className="text-2xl font-bold text-gray-900">{fmtPct(summary.avgEngRate)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Follower Growth</p>
              <p className={`text-2xl font-bold ${summary.totalFollowerGrow >= 0 ? "text-green-600" : "text-red-500"}`}>
                {summary.totalFollowerGrow >= 0 ? "+" : ""}{fmtK(summary.totalFollowerGrow)}
              </p>
              {summary.latestFollowers != null && (
                <p className="text-xs text-gray-400 mt-0.5">{fmtK(summary.latestFollowers)} total</p>
              )}
            </div>
            {isVideoFirst ? (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Avg Hook Rate</p>
                <p className="text-2xl font-bold text-gray-900">{fmtPct(summary.avgHookRate)}</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Total Video Plays</p>
                <p className="text-2xl font-bold text-gray-900">{fmtK(summary.totalVideoPlays)}</p>
              </div>
            )}
          </div>

          {/* Chart 1: Impressions & Reach */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Impressions & Reach</h3>
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
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Daily Engagement Rate (%)</h3>
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
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Video Plays & Hook Rate (%)</h3>
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
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Follower Count</h3>
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

          {/* Top Posts table */}
          {topPosts.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">Top Posts (by impressions)</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {topPosts.map((p) => (
                  <div key={p.id} className="px-5 py-3 flex items-start gap-3">
                    {/* Thumbnail */}
                    <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 overflow-hidden">
                      {p.thumbnail_url ? (
                        <img src={p.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg">▶</div>
                      )}
                    </div>
                    {/* Caption */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate">
                        {p.caption_preview ?? "(no caption)"}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {p.post_type ?? "post"}
                        {p.published_at ? ` · ${format(parseISO(p.published_at), "d MMM yyyy")}` : ""}
                        {p.post_url && (
                          <> · <a href={p.post_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">View</a></>
                        )}
                      </p>
                    </div>
                    {/* Metrics */}
                    <div className="text-right shrink-0 space-y-0.5">
                      <p className="text-xs font-medium text-gray-800">{fmtK(p.impressions)} imp</p>
                      <p className="text-[10px] text-gray-400">
                        {fmtK(p.engagements)} eng
                        {p.video_plays != null ? ` · ${fmtK(p.video_plays)} plays` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw data table (collapsed by default) */}
          <details className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <summary className="px-5 py-3 text-sm font-medium text-gray-700 cursor-pointer select-none hover:bg-gray-50">
              Daily data — {rows.length} rows
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-t border-gray-100">
                  <tr>
                    {["Date", "Impressions", "Reach", "Engagements", "Eng. Rate", "Video Plays", "Hook Rate", "Followers", "Source"].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-gray-500 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{format(parseISO(r.metric_date), "d MMM yyyy")}</td>
                      <td className="px-4 py-2 text-gray-600">{r.impressions.toLocaleString()}</td>
                      <td className="px-4 py-2 text-gray-600">{r.reach.toLocaleString()}</td>
                      <td className="px-4 py-2 text-gray-600">{r.engagements.toLocaleString()}</td>
                      <td className="px-4 py-2 text-gray-600">{fmtPct(r.engagement_rate)}</td>
                      <td className="px-4 py-2 text-gray-600">{r.video_plays.toLocaleString()}</td>
                      <td className="px-4 py-2 text-gray-600">{fmtPct(r.hook_rate)}</td>
                      <td className="px-4 py-2 text-gray-600">{r.follower_count != null ? fmtK(r.follower_count) : "—"}</td>
                      <td className="px-4 py-2">
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          r.data_source === "api" ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">
                Enter Metrics Manually
                {activePlatform && (
                  <span className="ml-2 text-sm font-normal" style={{ color: platColor }}>
                    — {PLATFORM_LABELS[activePlatform.platform]}
                  </span>
                )}
              </h2>
              <button onClick={() => { setShowManual(false); setSyncState("idle"); setSyncError(null); }}
                className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {manualError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
                {manualError}
              </div>
            )}

            {/* Hint when auto-sync wasn't available */}
            {syncState === "no_api" && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-700">
                Auto-sync wasn't available for this platform. Enter yesterday's stats from your platform's dashboard below.
              </div>
            )}

            <form onSubmit={handleManualSave} className="space-y-3">
              {/* Date */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date <span className="text-red-400">*</span></label>
                <input type="date" required
                  value={manualForm.metric_date}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setManualForm((f) => ({ ...f, metric_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              {/* Core reach metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Impressions</label>
                  <input type="number" min="0" placeholder="0"
                    value={manualForm.impressions}
                    onChange={(e) => setManualForm((f) => ({ ...f, impressions: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Reach</label>
                  <input type="number" min="0" placeholder="0"
                    value={manualForm.reach}
                    onChange={(e) => setManualForm((f) => ({ ...f, reach: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Engagements</label>
                  <input type="number" min="0" placeholder="0"
                    value={manualForm.engagements}
                    onChange={(e) => setManualForm((f) => ({ ...f, engagements: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Follower Count</label>
                  <input type="number" min="0" placeholder="Current total"
                    value={manualForm.follower_count}
                    onChange={(e) => setManualForm((f) => ({ ...f, follower_count: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Follower Growth</label>
                  <input type="number" placeholder="± delta"
                    value={manualForm.follower_growth}
                    onChange={(e) => setManualForm((f) => ({ ...f, follower_growth: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              {/* Video metrics — always shown but labelled as optional */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">Video metrics (leave blank if not applicable)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Video Plays</label>
                    <input type="number" min="0" placeholder="0"
                      value={manualForm.video_plays}
                      onChange={(e) => setManualForm((f) => ({ ...f, video_plays: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">3s Plays (Hook)</label>
                    <input type="number" min="0" placeholder="0"
                      value={manualForm.video_plays_3s}
                      onChange={(e) => setManualForm((f) => ({ ...f, video_plays_3s: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Avg Play Time (seconds)</label>
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      value={manualForm.avg_play_time_secs}
                      onChange={(e) => setManualForm((f) => ({ ...f, avg_play_time_secs: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button"
                  onClick={() => { setShowManual(false); setSyncState("idle"); setSyncError(null); }}
                  className="flex-1 border border-gray-200 text-sm py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button type="submit" disabled={savingManual}
                  className="flex-1 bg-gray-900 text-white text-sm py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  {savingManual ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
