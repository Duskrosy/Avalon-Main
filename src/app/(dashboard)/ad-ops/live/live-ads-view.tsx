"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";

// ─── Types ─────────────────────────────────────────────────────────────────────

type AdRow = {
  ad_id: string;
  ad_name: string | null;
  spend: number;
  conversions: number;
  conversion_value: number;
  impressions: number;
  clicks: number;
  video_plays: number;
  roas: number | null;
  ctr: number | null;
  hook_rate: number | null;
  thumbnail_url: string | null;
};

type AdsetRow = {
  adset_name: string;
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
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
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

// ─── Component ─────────────────────────────────────────────────────────────────

export function LiveAdsView() {
  const [ads, setAds] = useState<LiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [days, setDays] = useState<7 | 14 | 30>(7);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");

  // Accordion state
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set());

  // Toggle state
  const [toggling, setToggling] = useState<string | null>(null);

  // Cap editor state
  const [editingCap, setEditingCap] = useState<string | null>(null);
  const [capAmount, setCapAmount] = useState("");
  const [capPeriod, setCapPeriod] = useState<"lifetime" | "monthly" | "daily">("lifetime");
  const [savingCap, setSavingCap] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAds = useCallback(async (d = days) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ad-ops/live-ads?days=${d}`);
      if (!res.ok) return;
      const data: LiveCampaign[] = await res.json();
      setAds(data);
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, [days]);

  // Auto-enforce caps after each fetch
  useEffect(() => {
    ads.forEach((ad) => {
      if (ad.status === "active" && ad.spend_cap !== null && ad.live_spend !== null && ad.live_spend >= ad.spend_cap) {
        handleToggle(ad.id, "active", true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads]);

  useEffect(() => {
    fetchAds(days);
    const interval = setInterval(() => fetchAds(days), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [days, fetchAds]);

  // ── Toggle ─────────────────────────────────────────────────────────────────

  async function handleToggle(id: string, currentStatus: string, isAuto = false) {
    setToggling(id);
    const action = currentStatus === "active" ? "pause" : "resume";
    try {
      const res = await fetch("/api/ad-ops/live-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployment_id: id, action }),
      });
      if (res.ok) {
        setAds((prev) => prev.map((a) =>
          a.id === id ? {
            ...a,
            status: action === "pause" ? "paused" : "active",
            auto_paused_at: action === "pause" ? new Date().toISOString() : null,
            auto_paused_reason: isAuto ? "Spend cap reached" : action === "pause" ? "Manually paused via Live Ads" : null,
          } : a,
        ));
      }
    } finally {
      setToggling(null);
    }
  }

  // ── Cap editor ─────────────────────────────────────────────────────────────

  function openCapEditor(ad: LiveCampaign) {
    setEditingCap(ad.id);
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
      }
    } finally {
      setSavingCap(false);
    }
  }

  async function handleClearCap(id: string) {
    setSavingCap(true);
    try {
      const res = await fetch("/api/ad-ops/live-ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployment_id: id, spend_cap: null }),
      });
      if (res.ok) {
        setAds((prev) => prev.map((a) => a.id === id ? { ...a, spend_cap: null } : a));
        setEditingCap(null);
      }
    } finally {
      setSavingCap(false);
    }
  }

  // ── Adset accordion ────────────────────────────────────────────────────────

  function toggleAdset(campaignId: string, adsetName: string) {
    const key = `${campaignId}__${adsetName}`;
    setExpandedAdsets((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
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
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Live Ads</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Real-time spend · auto-refreshes every 50 min
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {([7, 14, 30] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 ${days === d ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {d}d
              </button>
            ))}
          </div>

          {lastRefreshed && (
            <span className="text-xs text-gray-400 hidden sm:block">
              Updated {formatDistanceToNow(lastRefreshed, { addSuffix: true })}
            </span>
          )}

          <button
            onClick={() => fetchAds(days)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <svg className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active",      value: activeCount, color: "text-green-600" },
          { label: "Paused",      value: pausedCount, color: "text-amber-500" },
          { label: "Auto-Paused", value: autoCount,   color: "text-red-500"   },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(["all", "active", "paused"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              filter === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "all" ? `All (${ads.length})` : tab === "active" ? `Active (${activeCount})` : `Paused (${pausedCount})`}
          </button>
        ))}
      </div>

      {/* ── Empty / loading ── */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No {filter !== "all" ? filter : ""} campaigns found</p>
        </div>
      )}

      {/* ── Campaign accordion ── */}
      {!loading && (
        <div className="space-y-2">
          {filtered.map((ad) => {
            const isActive    = ad.status === "active";
            const isAutoP     = !!ad.auto_paused_at;
            const isExpanded  = expandedCampaign === ad.id;
            const isToggling  = toggling === ad.id;
            const currency    = ad.account?.currency ?? "USD";
            const pct         = spendPct(ad.live_spend, ad.spend_cap);
            const totalSpend  = ad.adsets.reduce((s, a) => s + a.spend, 0);
            const totalConvV  = ad.adsets.reduce((s, a) => s + a.conversion_value, 0);
            const roas        = totalSpend > 0 ? totalConvV / totalSpend : null;
            const totalAds    = ad.adsets.reduce((s, a) => s + a.ads.length, 0);
            const isEditingCap = editingCap === ad.id;

            return (
              <div
                key={ad.id}
                className={`bg-white rounded-xl border overflow-hidden ${
                  isAutoP ? "border-red-200" : isActive ? "border-gray-200" : "border-amber-200"
                }`}
              >
                {/* ── Campaign header row ── */}
                <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  {/* Status badge */}
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                    isAutoP ? "bg-red-100 text-red-700" : isActive ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {isAutoP ? "⚠ Auto-Paused" : isActive ? "● Active" : "⏸ Paused"}
                  </span>

                  {/* Campaign name + account — clickable to expand */}
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => setExpandedCampaign(isExpanded ? null : ad.id)}
                  >
                    <p className="text-sm font-medium text-gray-900 truncate">{ad.campaign_name}</p>
                    {ad.account?.name && (
                      <p className="text-xs text-gray-400">{ad.account.name}</p>
                    )}
                  </button>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
                    <span className="text-gray-500">
                      <span className="font-semibold text-gray-800">{fmtMoney(ad.live_spend, currency)}</span> live spend
                    </span>
                    {roas !== null && (
                      <span className={`font-semibold ${roas >= 2 ? "text-green-700" : roas < 1 ? "text-red-500" : "text-gray-700"}`}>
                        {fmt(roas)}x ROAS
                      </span>
                    )}
                    {totalAds > 0 && (
                      <span className="text-gray-400">{ad.adsets.length} adset{ad.adsets.length !== 1 ? "s" : ""} · {totalAds} ad{totalAds !== 1 ? "s" : ""}</span>
                    )}
                  </div>

                  {/* Pause/resume */}
                  <button
                    onClick={() => handleToggle(ad.id, ad.status)}
                    disabled={isToggling}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                      isActive
                        ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                        : "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                    }`}
                  >
                    {isToggling ? "…" : isActive ? "⏸ Pause" : "▶ Resume"}
                  </button>

                  {/* Chevron */}
                  <button onClick={() => setExpandedCampaign(isExpanded ? null : ad.id)} className="shrink-0">
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Spend progress bar (always visible if cap set) */}
                {ad.spend_cap && (
                  <div className="px-5 pb-2 -mt-1">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>{fmtMoney(ad.live_spend, currency)} spent</span>
                      <span>Cap: {fmtMoney(ad.spend_cap, currency)} {PERIOD_LABELS[ad.spend_cap_period]}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${progressColor(pct)}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                {/* ── Expanded section ── */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {/* Budget & Cap controls */}
                    <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex flex-wrap items-start gap-6">
                      {/* Budget info */}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Daily Budget</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {ad.daily_budget ? `${fmtMoney(ad.daily_budget, currency)}/day` : "—"}
                        </p>
                      </div>

                      {/* Auto-paused banner */}
                      {isAutoP && (
                        <div className="flex-1 bg-red-50 rounded-lg px-3 py-2 text-xs text-red-700">
                          <span className="font-semibold">Auto-paused</span>
                          {ad.auto_paused_reason && <span className="ml-1 text-red-500">{ad.auto_paused_reason}</span>}
                        </div>
                      )}

                      {/* Spend cap editor */}
                      <div className="flex-1 min-w-[260px]">
                        <p className="text-xs text-gray-500 mb-1">Spend Cap</p>
                        {isEditingCap ? (
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="number" min="1" step="0.01" placeholder="Amount"
                              value={capAmount} onChange={(e) => setCapAmount(e.target.value)}
                              className="w-28 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <select
                              value={capPeriod} onChange={(e) => setCapPeriod(e.target.value as "lifetime" | "monthly" | "daily")}
                              className="text-sm border border-gray-200 rounded px-2 py-1 bg-white"
                            >
                              <option value="lifetime">Lifetime</option>
                              <option value="monthly">Monthly</option>
                              <option value="daily">Daily</option>
                            </select>
                            <button onClick={() => handleSaveCap(ad.id)} disabled={savingCap}
                              className="text-xs px-3 py-1.5 bg-[#3A5635] text-white rounded font-medium hover:bg-[#2e4429] disabled:opacity-50">
                              {savingCap ? "Saving…" : "Save"}
                            </button>
                            {ad.spend_cap && (
                              <button onClick={() => handleClearCap(ad.id)} disabled={savingCap}
                                className="text-xs px-2 py-1.5 border border-gray-200 rounded text-gray-500 hover:bg-gray-100">
                                Clear
                              </button>
                            )}
                            <button onClick={() => setEditingCap(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => openCapEditor(ad)} className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2">
                            {ad.spend_cap
                              ? `${fmtMoneyDec(ad.spend_cap, currency)} / ${PERIOD_LABELS[ad.spend_cap_period]}`
                              : "+ Set spend cap"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── Adset list ── */}
                    {ad.adsets.length === 0 ? (
                      <div className="px-5 py-6 text-center text-sm text-gray-400">
                        No ad data for this period
                      </div>
                    ) : (
                      <div>
                        {ad.adsets.map((adset) => {
                          const adsetKey   = `${ad.id}__${adset.adset_name}`;
                          const adsetOpen  = expandedAdsets.has(adsetKey);
                          const adsetRoas  = adset.roas;

                          return (
                            <div key={adsetKey} className="border-b border-gray-100 last:border-b-0">
                              {/* Adset row */}
                              <button
                                onClick={() => toggleAdset(ad.id, adset.adset_name)}
                                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 text-left transition-colors"
                              >
                                <svg className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${adsetOpen ? "rotate-90" : ""}`}
                                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                                <span className="flex-1 text-sm text-gray-700 font-medium truncate">{adset.adset_name}</span>
                                <div className="flex items-center gap-4 text-xs text-gray-500 shrink-0">
                                  <span><span className="font-semibold text-gray-800">{fmtMoney(adset.spend, currency)}</span> spend</span>
                                  {adsetRoas !== null && (
                                    <span className={`font-semibold ${adsetRoas >= 2 ? "text-green-700" : adsetRoas < 1 ? "text-red-500" : "text-gray-700"}`}>
                                      {fmt(adsetRoas)}x ROAS
                                    </span>
                                  )}
                                  <span className="text-gray-400">{adset.ads.length} ad{adset.ads.length !== 1 ? "s" : ""}</span>
                                </div>
                              </button>

                              {/* ── Ad grid ── */}
                              {adsetOpen && (
                                <div className="bg-gray-50 border-t border-gray-100">
                                  {adset.ads.map((adRow) => (
                                    <div
                                      key={adRow.ad_id}
                                      className="flex items-center gap-4 px-8 py-3 border-b border-gray-100 last:border-b-0 hover:bg-white transition-colors"
                                    >
                                      {/* Thumbnail */}
                                      <div className="w-16 h-9 rounded overflow-hidden bg-gray-200 shrink-0">
                                        {adRow.thumbnail_url ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={adRow.thumbnail_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center">
                                            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                d="M15 10l4.553-2.069A1 1 0 0121 8.81v6.38a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                                            </svg>
                                          </div>
                                        )}
                                      </div>

                                      {/* Ad name */}
                                      <p className="flex-1 text-sm text-gray-700 truncate min-w-0">
                                        {adRow.ad_name ?? adRow.ad_id}
                                      </p>

                                      {/* Metrics */}
                                      <div className="flex items-center gap-4 text-xs text-gray-500 shrink-0 flex-wrap justify-end">
                                        <span>
                                          <span className="font-semibold text-gray-800">{fmtMoney(adRow.spend, currency)}</span>
                                        </span>
                                        {adRow.roas !== null && (
                                          <span className={`font-semibold ${adRow.roas >= 2 ? "text-green-700" : adRow.roas < 1 ? "text-red-500" : "text-gray-700"}`}>
                                            {fmt(adRow.roas)}x
                                          </span>
                                        )}
                                        <span>{adRow.conversions} conv.</span>
                                        {adRow.ctr !== null && <span>{fmt(adRow.ctr, 2)}% CTR</span>}
                                        {adRow.hook_rate !== null && (
                                          <span className={adRow.hook_rate >= 4 ? "text-green-700" : ""}>
                                            {fmt(adRow.hook_rate, 1)}% hook
                                          </span>
                                        )}
                                        <span className="text-gray-400">{fmtK(adRow.impressions)} impr.</span>
                                      </div>
                                    </div>
                                  ))}
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
