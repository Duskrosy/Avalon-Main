"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatDistanceToNow, format } from "date-fns";

// ─── Types ─────────────────────────────────────────────────────────────────────

type LiveDeployment = {
  id: string;
  campaign_name: string | null;
  status: string; // "active" | "paused"
  meta_campaign_id: string | null;
  spend_cap: number | null;
  spend_cap_period: "lifetime" | "monthly" | "daily";
  auto_paused_at: string | null;
  auto_paused_reason: string | null;
  launched_at: string | null;
  live_spend: number | null;
  asset: {
    id: string;
    asset_code: string;
    title: string;
    thumbnail_url: string | null;
    content_type: string | null;
    hook_type: string | null;
  } | null;
  account: {
    id: string;
    name: string;
    account_id: string;
    currency: string | null;
  } | null;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(n: number | null, currency = "USD") {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function spendPct(spend: number | null, cap: number | null): number {
  if (!spend || !cap) return 0;
  return Math.min((spend / cap) * 100, 100);
}

function progressColor(pct: number) {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-400";
  return "bg-green-500";
}

const PERIOD_LABELS: Record<string, string> = {
  lifetime: "Lifetime",
  monthly: "This Month",
  daily: "Today",
};

const AUTO_REFRESH_MS = 50 * 60 * 1000; // 50 minutes

// ─── Component ─────────────────────────────────────────────────────────────────

export function LiveAdsView() {
  const [ads, setAds] = useState<LiveDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");

  // Cap editor state
  const [editingCap, setEditingCap] = useState<string | null>(null);
  const [capAmount, setCapAmount] = useState("");
  const [capPeriod, setCapPeriod] = useState<"lifetime" | "monthly" | "daily">("lifetime");
  const [savingCap, setSavingCap] = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAds = useCallback(async () => {
    try {
      const res = await fetch("/api/ad-ops/live-ads");
      if (!res.ok) return;
      const data: LiveDeployment[] = await res.json();
      setAds(data);
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-enforce caps after every fetch
  const enforceOnceRef = useRef(false);
  useEffect(() => {
    if (!ads.length) return;
    // After data loads, auto-pause any that exceeded their cap
    ads.forEach((ad) => {
      if (
        ad.status === "active" &&
        ad.spend_cap !== null &&
        ad.live_spend !== null &&
        ad.live_spend >= ad.spend_cap
      ) {
        handleToggle(ad.id, "active", /* autoPause */ true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads]);

  useEffect(() => {
    fetchAds();
    const interval = setInterval(fetchAds, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchAds]);

  // ── Toggle pause / resume ──────────────────────────────────────────────────

  async function handleToggle(
    deploymentId: string,
    currentStatus: string,
    isAutomatic = false,
  ) {
    setToggling(deploymentId);
    const action = currentStatus === "active" ? "pause" : "resume";
    try {
      const res = await fetch("/api/ad-ops/live-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployment_id: deploymentId, action, is_automatic: isAutomatic }),
      });
      if (res.ok) {
        setAds((prev) =>
          prev.map((a) =>
            a.id === deploymentId
              ? {
                  ...a,
                  status: action === "pause" ? "paused" : "active",
                  auto_paused_at: isAutomatic && action === "pause" ? new Date().toISOString() : null,
                  auto_paused_reason: isAutomatic ? "Spend cap reached" : null,
                }
              : a,
          ),
        );
      }
    } finally {
      setToggling(null);
    }
  }

  // ── Set spend cap ──────────────────────────────────────────────────────────

  function openCapEditor(ad: LiveDeployment) {
    setEditingCap(ad.id);
    setCapAmount(ad.spend_cap?.toString() ?? "");
    setCapPeriod(ad.spend_cap_period ?? "lifetime");
  }

  async function handleSaveCap(deploymentId: string) {
    const parsed = parseFloat(capAmount);
    if (isNaN(parsed) || parsed <= 0) return;
    setSavingCap(true);
    try {
      const res = await fetch("/api/ad-ops/live-ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deployment_id: deploymentId,
          spend_cap: parsed,
          spend_cap_period: capPeriod,
        }),
      });
      if (res.ok) {
        setAds((prev) =>
          prev.map((a) =>
            a.id === deploymentId
              ? { ...a, spend_cap: parsed, spend_cap_period: capPeriod }
              : a,
          ),
        );
        setEditingCap(null);
      }
    } finally {
      setSavingCap(false);
    }
  }

  async function handleClearCap(deploymentId: string) {
    setSavingCap(true);
    try {
      const res = await fetch("/api/ad-ops/live-ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployment_id: deploymentId, spend_cap: null }),
      });
      if (res.ok) {
        setAds((prev) =>
          prev.map((a) =>
            a.id === deploymentId ? { ...a, spend_cap: null } : a,
          ),
        );
        setEditingCap(null);
      }
    } finally {
      setSavingCap(false);
    }
  }

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filtered = ads.filter((a) => {
    if (filter === "active") return a.status === "active";
    if (filter === "paused") return a.status === "paused";
    return true;
  });

  const activeCount = ads.filter((a) => a.status === "active").length;
  const pausedCount = ads.filter((a) => a.status === "paused").length;
  const autoPausedCount = ads.filter((a) => a.auto_paused_at).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-gray-100 rounded w-40 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Live Ads</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Real-time spend monitoring — auto-refreshes every 50 minutes
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-gray-400">
              Last updated {formatDistanceToNow(lastRefreshed, { addSuffix: true })}
            </span>
          )}
          <button
            onClick={() => { setLoading(true); fetchAds(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Active</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Paused</p>
          <p className="text-2xl font-bold text-amber-500 mt-1">{pausedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Auto-Paused</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{autoPausedCount}</p>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(["all", "active", "paused"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              filter === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "all" ? `All (${ads.length})` : tab === "active" ? `Active (${activeCount})` : `Paused (${pausedCount})`}
          </button>
        ))}
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-sm">No {filter !== "all" ? filter : ""} deployments found</p>
        </div>
      )}

      {/* ── Ad cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filtered.map((ad) => {
          const isActive = ad.status === "active";
          const isAutoP = !!ad.auto_paused_at;
          const pct = spendPct(ad.live_spend, ad.spend_cap);
          const currency = ad.account?.currency ?? "USD";
          const isEditingThis = editingCap === ad.id;
          const isToggling = toggling === ad.id;

          return (
            <div
              key={ad.id}
              className={`bg-white rounded-xl border overflow-hidden flex flex-col transition-shadow hover:shadow-md ${
                isAutoP
                  ? "border-red-200"
                  : isActive
                  ? "border-green-200"
                  : "border-gray-200"
              }`}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-gray-100">
                {ad.asset?.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ad.asset.thumbnail_url}
                    alt={ad.asset.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M15 10l4.553-2.069A1 1 0 0121 8.81v6.38a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                    </svg>
                  </div>
                )}

                {/* Status badge */}
                <span
                  className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    isAutoP
                      ? "bg-red-100 text-red-700"
                      : isActive
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {isAutoP ? "⚠ Auto-Paused" : isActive ? "● Active" : "⏸ Paused"}
                </span>

                {/* Content type tag */}
                {ad.asset?.content_type && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium bg-black/50 text-white">
                    {ad.asset.content_type}
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="p-4 flex flex-col gap-3 flex-1">
                {/* Title */}
                <div>
                  <p className="font-medium text-gray-900 text-sm leading-snug line-clamp-2">
                    {ad.campaign_name ?? ad.asset?.title ?? "Unnamed Campaign"}
                  </p>
                  {ad.asset?.asset_code && (
                    <p className="text-xs text-gray-400 mt-0.5">{ad.asset.asset_code}</p>
                  )}
                  {ad.account?.name && (
                    <p className="text-xs text-gray-400">{ad.account.name}</p>
                  )}
                </div>

                {/* Auto-paused reason */}
                {isAutoP && (
                  <div className="bg-red-50 rounded-lg px-3 py-2 text-xs text-red-700">
                    <span className="font-semibold">Auto-paused</span>
                    {ad.auto_paused_at && (
                      <span className="text-red-500 ml-1">
                        {format(new Date(ad.auto_paused_at), "MMM d, HH:mm")}
                      </span>
                    )}
                    {ad.auto_paused_reason && (
                      <p className="mt-0.5 text-red-500">{ad.auto_paused_reason}</p>
                    )}
                  </div>
                )}

                {/* Spend + cap */}
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-gray-500">
                      Spend
                      {ad.spend_cap_period && ad.spend_cap && (
                        <span className="text-xs text-gray-400 ml-1">
                          ({PERIOD_LABELS[ad.spend_cap_period]})
                        </span>
                      )}
                    </span>
                    <span className="font-semibold text-gray-900">
                      {fmtCurrency(ad.live_spend, currency)}
                      {ad.spend_cap && (
                        <span className="text-gray-400 font-normal">
                          {" "}/ {fmtCurrency(ad.spend_cap, currency)}
                        </span>
                      )}
                    </span>
                  </div>

                  {ad.spend_cap && (
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${progressColor(pct)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Spend cap editor */}
                {isEditingThis ? (
                  <div className="space-y-2 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-600">Set Spend Cap</p>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        placeholder="Amount"
                        value={capAmount}
                        onChange={(e) => setCapAmount(e.target.value)}
                        className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <select
                        value={capPeriod}
                        onChange={(e) => setCapPeriod(e.target.value as "lifetime" | "monthly" | "daily")}
                        className="text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none"
                      >
                        <option value="lifetime">Lifetime</option>
                        <option value="monthly">Monthly</option>
                        <option value="daily">Daily</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveCap(ad.id)}
                        disabled={savingCap}
                        className="flex-1 text-xs py-1.5 bg-[#3A5635] text-white rounded font-medium hover:bg-[#2e4429] disabled:opacity-50"
                      >
                        {savingCap ? "Saving…" : "Save"}
                      </button>
                      {ad.spend_cap && (
                        <button
                          onClick={() => handleClearCap(ad.id)}
                          disabled={savingCap}
                          className="text-xs px-2 py-1.5 border border-gray-200 rounded text-gray-500 hover:bg-gray-50"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        onClick={() => setEditingCap(null)}
                        className="text-xs px-2 py-1.5 text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => openCapEditor(ad)}
                    className="text-left text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {ad.spend_cap ? "✏ Edit spend cap" : "+ Set spend cap"}
                  </button>
                )}

                {/* Launched date */}
                {ad.launched_at && (
                  <p className="text-xs text-gray-400">
                    Launched {format(new Date(ad.launched_at), "MMM d, yyyy")}
                  </p>
                )}

                {/* Toggle button */}
                <div className="mt-auto pt-2">
                  <button
                    onClick={() => handleToggle(ad.id, ad.status)}
                    disabled={isToggling}
                    className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                        : "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                    } disabled:opacity-50`}
                  >
                    {isToggling
                      ? "Updating…"
                      : isActive
                      ? "⏸ Pause Campaign"
                      : "▶ Resume Campaign"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
