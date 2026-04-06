"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatDistanceToNow } from "date-fns";

// ─── Types ─────────────────────────────────────────────────────────────────────

type AdRow = {
  ad_id: string;
  ad_name: string | null;
  adset_id: string | null;
  spend: number;
  conversions: number;
  conversion_value: number;
  impressions: number;
  clicks: number;
  roas: number | null;
  ctr: number | null;
  hook_rate: number | null;
  thumbnail_url: string | null;
};

type AdsetRow = {
  adset_name: string;
  adset_id: string | null;
  spend: number;
  conversions: number;
  conversion_value: number;
  impressions: number;
  roas: number | null;
  ads: AdRow[];
};

type LiveCampaign = {
  id: string;
  campaign_name: string;
  status: string;
  meta_campaign_id: string | null;
  spend_cap: number | null;
  spend_cap_period: "lifetime" | "monthly" | "daily";
  auto_paused_at: string | null;
  auto_paused_reason: string | null;
  daily_budget: number | null;
  live_spend: number | null;
  account: { id: string; name: string; account_id: string; currency: string } | null;
  adsets: AdsetRow[];
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number | null, currency = "USD") {
  if (n === null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}
function fmtMoneyDec(n: number | null, currency = "USD") {
  if (n === null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
function fmt(n: number, dec = 2) { return n.toFixed(dec); }
function spendPct(spend: number | null, cap: number | null) {
  if (!spend || !cap) return 0;
  return Math.min((spend / cap) * 100, 100);
}
function progressColor(pct: number) {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-400";
  return "bg-green-500";
}

const PERIOD_LABELS: Record<string, string> = { lifetime: "Lifetime", monthly: "This Month", daily: "Today" };
const AUTO_REFRESH_MS = 50 * 60 * 1000;

function roasColor(r: number) {
  if (r >= 2) return "text-green-700";
  if (r < 1)  return "text-red-500";
  return "text-gray-700";
}

// ─── Inline editor ─────────────────────────────────────────────────────────────

function BudgetInput({
  label, currency, onSave, onCancel,
}: { label: string; currency: string; onSave: (v: number) => Promise<void>; onCancel: () => void }) {
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  async function save() {
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) return;
    setSaving(true);
    try { await onSave(n); } finally { setSaving(false); }
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs text-gray-400">{currency}</span>
      <input
        ref={ref} type="number" min="1" step="1" placeholder="0"
        value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}
        className="w-20 text-xs border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <button onClick={save} disabled={saving}
        className="text-xs px-2 py-0.5 bg-[#3A5635] text-white rounded disabled:opacity-50 hover:bg-[#2e4429]">
        {saving ? "…" : "Set"}
      </button>
      <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function LiveAdsView() {
  const [ads, setAds] = useState<LiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [days, setDays] = useState<7 | 14 | 30>(7);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");

  // Accordion
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set());

  // Thumbnails fetched on-demand per adset: key=adsetKey → { adId: url }
  const [thumbnails, setThumbnails] = useState<Record<string, Record<string, string>>>({});
  const fetchingThumbsRef = useRef<Set<string>>(new Set());

  // Toggle loading states
  const [togglingCampaign, setTogglingCampaign] = useState<string | null>(null);
  const [togglingAdset, setTogglingAdset]   = useState<string | null>(null);
  const [togglingAd, setTogglingAd]         = useState<string | null>(null);

  // Local paused-adset / paused-ad state (optimistic)
  const [pausedAdsets, setPausedAdsets] = useState<Set<string>>(new Set());
  const [pausedAds, setPausedAds]       = useState<Set<string>>(new Set());

  // Spend cap editor
  const [editingCap, setEditingCap]   = useState<string | null>(null);
  const [capAmount, setCapAmount]     = useState("");
  const [capPeriod, setCapPeriod]     = useState<"lifetime" | "monthly" | "daily">("lifetime");
  const [savingCap, setSavingCap]     = useState(false);

  // Budget editors
  const [editingAdsetBudget, setEditingAdsetBudget] = useState<string | null>(null); // adset_id
  const [editingCapCampaignId, setEditingCapCampaignId] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAds = useCallback(async (d = days) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ad-ops/live-ads?days=${d}`);
      if (!res.ok) return;
      setAds(await res.json());
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, [days]);

  // Cap enforcement on load
  useEffect(() => {
    ads.forEach((ad) => {
      if (ad.status === "active" && ad.spend_cap !== null && ad.live_spend !== null && ad.live_spend >= ad.spend_cap) {
        handleCampaignToggle(ad.id, "active", true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads]);

  useEffect(() => {
    fetchAds(days);
    const t = setInterval(() => fetchAds(days), AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [days, fetchAds]);

  // ── Thumbnail fetch on adset expand ───────────────────────────────────────

  async function loadThumbnails(adsetKey: string, adRows: AdRow[]) {
    if (fetchingThumbsRef.current.has(adsetKey)) return;
    const needIds = adRows.filter((a) => !thumbnails[adsetKey]?.[a.ad_id]).map((a) => a.ad_id);
    if (!needIds.length) return;
    fetchingThumbsRef.current.add(adsetKey);
    try {
      const res = await fetch(`/api/ad-ops/live-ads/thumbnails?ad_ids=${needIds.join(",")}`);
      if (!res.ok) return;
      const map: Record<string, string> = await res.json();
      setThumbnails((prev) => ({ ...prev, [adsetKey]: { ...(prev[adsetKey] ?? {}), ...map } }));
    } finally {
      fetchingThumbsRef.current.delete(adsetKey);
    }
  }

  // ── Campaign toggle ────────────────────────────────────────────────────────

  async function handleCampaignToggle(id: string, currentStatus: string, isAuto = false) {
    setTogglingCampaign(id);
    const action = currentStatus === "active" ? "pause" : "resume";
    try {
      const res = await fetch("/api/ad-ops/live-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployment_id: id, action }),
      });
      if (res.ok) {
        setAds((prev) => prev.map((a) => a.id === id ? {
          ...a,
          status: action === "pause" ? "paused" : "active",
          auto_paused_at: action === "pause" ? new Date().toISOString() : null,
          auto_paused_reason: isAuto ? "Spend cap reached" : action === "pause" ? "Manually paused via Live Ads" : null,
        } : a));
      }
    } finally {
      setTogglingCampaign(null);
    }
  }

  // ── Adset toggle ───────────────────────────────────────────────────────────

  async function handleAdsetToggle(adsetId: string) {
    const isPaused = pausedAdsets.has(adsetId);
    const action = isPaused ? "resume" : "pause";
    setTogglingAdset(adsetId);
    try {
      const res = await fetch("/api/ad-ops/live-ads/adset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adset_id: adsetId, action }),
      });
      if (res.ok) {
        setPausedAdsets((prev) => {
          const next = new Set(prev);
          isPaused ? next.delete(adsetId) : next.add(adsetId);
          return next;
        });
      }
    } finally {
      setTogglingAdset(null);
    }
  }

  // ── Adset budget ───────────────────────────────────────────────────────────

  async function handleAdsetBudget(adsetId: string, budget: number) {
    await fetch("/api/ad-ops/live-ads/adset", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adset_id: adsetId, daily_budget: budget }),
    });
    setEditingAdsetBudget(null);
  }

  // ── Ad toggle ──────────────────────────────────────────────────────────────

  async function handleAdToggle(adId: string) {
    const isPaused = pausedAds.has(adId);
    const action = isPaused ? "resume" : "pause";
    setTogglingAd(adId);
    try {
      const res = await fetch("/api/ad-ops/live-ads/ad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ad_id: adId, action }),
      });
      if (res.ok) {
        setPausedAds((prev) => {
          const next = new Set(prev);
          isPaused ? next.delete(adId) : next.add(adId);
          return next;
        });
      }
    } finally {
      setTogglingAd(null);
    }
  }

  // ── Spend cap ──────────────────────────────────────────────────────────────

  function openCapEditor(ad: LiveCampaign) {
    setEditingCap(ad.id);
    setEditingCapCampaignId(ad.id);
    setCapAmount(ad.spend_cap?.toString() ?? "");
    setCapPeriod(ad.spend_cap_period ?? "lifetime");
  }

  async function handleSaveCap(id: string) {
    const parsed = parseFloat(capAmount);
    if (isNaN(parsed) || parsed <= 0) return;
    setSavingCap(true);
    try {
      const res = await fetch("/api/ad-ops/live-ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployment_id: id, spend_cap: parsed, spend_cap_period: capPeriod }),
      });
      if (res.ok) {
        setAds((prev) => prev.map((a) => a.id === id ? { ...a, spend_cap: parsed, spend_cap_period: capPeriod } : a));
        setEditingCap(null);
        setEditingCapCampaignId(null);
      }
    } finally {
      setSavingCap(false);
    }
  }

  async function handleClearCap(id: string) {
    setSavingCap(true);
    try {
      await fetch("/api/ad-ops/live-ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployment_id: id, spend_cap: null }),
      });
      setAds((prev) => prev.map((a) => a.id === id ? { ...a, spend_cap: null } : a));
      setEditingCap(null);
      setEditingCapCampaignId(null);
    } finally {
      setSavingCap(false);
    }
  }

  // ── Adset accordion ────────────────────────────────────────────────────────

  function toggleAdset(campaignId: string, adsetName: string, adRows: AdRow[]) {
    const key = `${campaignId}__${adsetName}`;
    const opening = !expandedAdsets.has(key);
    setExpandedAdsets((prev) => {
      const next = new Set(prev);
      opening ? next.add(key) : next.delete(key);
      return next;
    });
    if (opening) loadThumbnails(key, adRows);
  }

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = ads.filter((a) => {
    if (filter === "active") return a.status === "active";
    if (filter === "paused") return a.status === "paused";
    return true;
  });

  const activeCount = ads.filter((a) => a.status === "active").length;
  const pausedCount = ads.filter((a) => a.status === "paused").length;
  const autoCount   = ads.filter((a) => a.auto_paused_at && a.auto_paused_reason !== "Manually paused via Live Ads").length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Live Ads</h1>
          <p className="text-sm text-gray-500 mt-0.5">Real-time spend · auto-refreshes every 50 min</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {([7, 14, 30] as const).map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 ${days === d ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                {d}d
              </button>
            ))}
          </div>
          {lastRefreshed && (
            <span className="text-xs text-gray-400 hidden sm:block">
              Updated {formatDistanceToNow(lastRefreshed, { addSuffix: true })}
            </span>
          )}
          <button onClick={() => fetchAds(days)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <svg className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active", value: activeCount, color: "text-green-600" },
          { label: "Paused", value: pausedCount, color: "text-amber-500" },
          { label: "Auto-Paused", value: autoCount, color: "text-red-500" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(["all", "active", "paused"] as const).map((tab) => (
          <button key={tab} onClick={() => setFilter(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              filter === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            {tab === "all" ? `All (${ads.length})` : tab === "active" ? `Active (${activeCount})` : `Paused (${pausedCount})`}
          </button>
        ))}
      </div>

      {/* Skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          No {filter !== "all" ? filter : ""} campaigns found
        </div>
      )}

      {/* Campaign accordion */}
      {!loading && (
        <div className="space-y-2">
          {filtered.map((ad) => {
            const isActive   = ad.status === "active";
            const isAutoP    = !!ad.auto_paused_at;
            const isExpanded = expandedCampaign === ad.id;
            const currency   = ad.account?.currency ?? "USD";
            const pct        = spendPct(ad.live_spend, ad.spend_cap);
            const totalSpend = ad.adsets.reduce((s, a) => s + a.spend, 0);
            const totalConvV = ad.adsets.reduce((s, a) => s + a.conversion_value, 0);
            const roas       = totalSpend > 0 ? totalConvV / totalSpend : null;
            const totalAds   = ad.adsets.reduce((s, a) => s + a.ads.length, 0);
            const isCampToggling = togglingCampaign === ad.id;
            const isEditingThisCap = editingCap === ad.id;

            return (
              <div key={ad.id} className={`bg-white rounded-xl border overflow-hidden ${
                isAutoP ? "border-red-200" : isActive ? "border-gray-200" : "border-amber-200"
              }`}>

                {/* ── Campaign row ── */}
                <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50">
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                    isAutoP ? "bg-red-100 text-red-700" : isActive ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {isAutoP ? "⚠ Auto-Paused" : isActive ? "● Active" : "⏸ Paused"}
                  </span>

                  <button className="flex-1 text-left min-w-0" onClick={() => setExpandedCampaign(isExpanded ? null : ad.id)}>
                    <p className="text-sm font-medium text-gray-900 truncate">{ad.campaign_name}</p>
                    {ad.account?.name && <p className="text-xs text-gray-400">{ad.account.name}</p>}
                  </button>

                  <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
                    <span className="text-gray-500">
                      <span className="font-semibold text-gray-800">{fmtMoney(ad.live_spend, currency)}</span> live
                    </span>
                    {roas !== null && (
                      <span className={`font-semibold ${roasColor(roas)}`}>{fmt(roas)}x ROAS</span>
                    )}
                    {totalAds > 0 && (
                      <span className="text-gray-400">{ad.adsets.length} adsets · {totalAds} ads</span>
                    )}
                  </div>

                  <button onClick={() => handleCampaignToggle(ad.id, ad.status)} disabled={isCampToggling}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium border disabled:opacity-50 transition-colors ${
                      isActive
                        ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200"
                        : "bg-green-50 text-green-700 hover:bg-green-100 border-green-200"
                    }`}>
                    {isCampToggling ? "…" : isActive ? "⏸ Pause" : "▶ Resume"}
                  </button>

                  <button onClick={() => setExpandedCampaign(isExpanded ? null : ad.id)} className="shrink-0 p-1">
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Spend cap bar */}
                {ad.spend_cap && (
                  <div className="px-5 pb-2 -mt-1">
                    <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                      <span>{fmtMoney(ad.live_spend, currency)}</span>
                      <span>Cap: {fmtMoney(ad.spend_cap, currency)} · {PERIOD_LABELS[ad.spend_cap_period]}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${progressColor(pct)}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                {/* ── Expanded section ── */}
                {isExpanded && (
                  <div className="border-t border-gray-100">

                    {/* Controls bar */}
                    <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-x-8 gap-y-3">
                      {/* Daily budget */}
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Daily Budget</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {ad.daily_budget ? `${fmtMoney(ad.daily_budget, currency)}/day` : "—"}
                        </p>
                      </div>

                      {/* Auto-pause banner */}
                      {isAutoP && (
                        <div className="flex-1 bg-red-50 rounded-lg px-3 py-1.5 text-xs text-red-700">
                          <span className="font-semibold">Auto-paused: </span>
                          <span className="text-red-500">{ad.auto_paused_reason}</span>
                        </div>
                      )}

                      {/* Spend cap */}
                      <div className="flex-1 min-w-[240px]">
                        <p className="text-xs text-gray-500 mb-0.5">Spend Cap</p>
                        {isEditingThisCap ? (
                          <div className="flex flex-wrap gap-2 items-center">
                            <input type="number" min="1" step="1" placeholder="Amount"
                              value={capAmount} onChange={(e) => setCapAmount(e.target.value)}
                              className="w-24 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <select value={capPeriod} onChange={(e) => setCapPeriod(e.target.value as "lifetime" | "monthly" | "daily")}
                              className="text-sm border border-gray-200 rounded px-2 py-1 bg-white">
                              <option value="lifetime">Lifetime</option>
                              <option value="monthly">Monthly</option>
                              <option value="daily">Daily</option>
                            </select>
                            <button onClick={() => handleSaveCap(ad.id)} disabled={savingCap && editingCapCampaignId === ad.id}
                              className="text-xs px-3 py-1.5 bg-[#3A5635] text-white rounded font-medium hover:bg-[#2e4429] disabled:opacity-50">
                              {savingCap ? "…" : "Save"}
                            </button>
                            {ad.spend_cap && (
                              <button onClick={() => handleClearCap(ad.id)}
                                className="text-xs px-2 py-1.5 border border-gray-200 rounded text-gray-500 hover:bg-gray-100">
                                Clear
                              </button>
                            )}
                            <button onClick={() => { setEditingCap(null); setEditingCapCampaignId(null); }}
                              className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => openCapEditor(ad)} className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2">
                            {ad.spend_cap ? `${fmtMoneyDec(ad.spend_cap, currency)} / ${PERIOD_LABELS[ad.spend_cap_period]}` : "+ Set spend cap"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── Adset list ── */}
                    {ad.adsets.length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-gray-400">No ad data for this period</div>
                    ) : (
                      <div>
                        {ad.adsets.map((adset) => {
                          const adsetKey   = `${ad.id}__${adset.adset_name}`;
                          const adsetOpen  = expandedAdsets.has(adsetKey);
                          const adsetId    = adset.adset_id;
                          const isPausedAdset = adsetId ? pausedAdsets.has(adsetId) : false;
                          const isTogAdset = adsetId ? togglingAdset === adsetId : false;
                          const isEditBudget = adsetId ? editingAdsetBudget === adsetId : false;

                          return (
                            <div key={adsetKey} className="border-b border-gray-100 last:border-b-0">
                              {/* Adset row */}
                              <div className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50/70">
                                <button onClick={() => toggleAdset(ad.id, adset.adset_name, adset.ads)} className="shrink-0">
                                  <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${adsetOpen ? "rotate-90" : ""}`}
                                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>

                                <button className="flex-1 text-left min-w-0" onClick={() => toggleAdset(ad.id, adset.adset_name, adset.ads)}>
                                  <span className={`text-sm font-medium truncate block ${isPausedAdset ? "line-through text-gray-400" : "text-gray-700"}`}>
                                    {adset.adset_name}
                                  </span>
                                </button>

                                {/* Adset stats */}
                                <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500 shrink-0">
                                  <span><span className="font-semibold text-gray-700">{fmtMoney(adset.spend, currency)}</span></span>
                                  {adset.roas !== null && (
                                    <span className={`font-semibold ${roasColor(adset.roas)}`}>{fmt(adset.roas)}x</span>
                                  )}
                                  <span className="text-gray-400">{adset.ads.length} ads</span>
                                </div>

                                {/* Budget editor inline */}
                                {isEditBudget && adsetId ? (
                                  <BudgetInput
                                    label="Daily" currency={currency}
                                    onSave={(v) => handleAdsetBudget(adsetId, v)}
                                    onCancel={() => setEditingAdsetBudget(null)}
                                  />
                                ) : (
                                  adsetId && (
                                    <button onClick={() => setEditingAdsetBudget(adsetId)}
                                      className="text-xs text-gray-400 hover:text-gray-700 px-1 shrink-0" title="Set budget">
                                      💰
                                    </button>
                                  )
                                )}

                                {/* Adset pause/resume */}
                                {adsetId && (
                                  <button onClick={() => handleAdsetToggle(adsetId)} disabled={isTogAdset}
                                    className={`shrink-0 text-xs px-2 py-1 rounded border disabled:opacity-50 transition-colors ${
                                      isPausedAdset
                                        ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                        : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                    }`}>
                                    {isTogAdset ? "…" : isPausedAdset ? "▶" : "⏸"}
                                  </button>
                                )}
                              </div>

                              {/* ── Ad rows ── */}
                              {adsetOpen && (
                                <div className="bg-gray-50/50 border-t border-gray-100">
                                  {adset.ads.map((adRow) => {
                                    const thumbKey   = adsetKey;
                                    const thumbUrl   = thumbnails[thumbKey]?.[adRow.ad_id] ?? adRow.thumbnail_url;
                                    const isPausedAd = pausedAds.has(adRow.ad_id);
                                    const isTogAd    = togglingAd === adRow.ad_id;
                                    const previewUrl = ad.account?.account_id
                                      ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${ad.account.account_id}&selected_ad_ids=${adRow.ad_id}`
                                      : null;

                                    return (
                                      <div key={adRow.ad_id}
                                        className="flex items-center gap-3 px-8 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-white transition-colors">

                                        {/* Thumbnail */}
                                        <div className="w-16 h-9 rounded overflow-hidden bg-gray-200 shrink-0">
                                          {thumbUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                                          ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                  d="M15 10l4.553-2.069A1 1 0 0121 8.81v6.38a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                                              </svg>
                                            </div>
                                          )}
                                        </div>

                                        {/* Ad name + preview link */}
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <p className={`text-sm truncate ${isPausedAd ? "line-through text-gray-400" : "text-gray-700"}`}>
                                              {adRow.ad_name ?? adRow.ad_id}
                                            </p>
                                            {previewUrl && (
                                              <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                                                className="shrink-0 text-gray-400 hover:text-blue-600 transition-colors" title="Open in Ads Manager">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                  <path strokeLinecap="round" strokeLinejoin="round"
                                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                              </a>
                                            )}
                                          </div>
                                        </div>

                                        {/* Ad metrics */}
                                        <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0 flex-wrap justify-end">
                                          <span className="font-semibold text-gray-800">{fmtMoney(adRow.spend, currency)}</span>
                                          {adRow.roas !== null && (
                                            <span className={`font-semibold ${roasColor(adRow.roas)}`}>{fmt(adRow.roas)}x</span>
                                          )}
                                          <span>{adRow.conversions} conv.</span>
                                          {adRow.ctr !== null && <span>{fmt(adRow.ctr, 2)}% CTR</span>}
                                          {adRow.hook_rate !== null && (
                                            <span className={adRow.hook_rate >= 4 ? "text-green-700" : ""}>
                                              {fmt(adRow.hook_rate, 1)}% hook
                                            </span>
                                          )}
                                          <span className="text-gray-400 hidden lg:block">{fmtK(adRow.impressions)} impr.</span>
                                        </div>

                                        {/* Ad pause/resume */}
                                        <button onClick={() => handleAdToggle(adRow.ad_id)} disabled={isTogAd}
                                          className={`shrink-0 text-xs px-2 py-1 rounded border disabled:opacity-50 transition-colors ${
                                            isPausedAd
                                              ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                              : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                          }`}>
                                          {isTogAd ? "…" : isPausedAd ? "▶" : "⏸"}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
