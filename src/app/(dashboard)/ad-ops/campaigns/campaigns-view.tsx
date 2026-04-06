"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  effective_status: string;
  objective: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  last_synced_at: string;
  meta_account_id: string;
};

type Account = {
  id: string;
  name: string;
  account_id: string;
  currency: string;
};

type AdStat = {
  campaign_id: string;
  meta_account_id: string;
  ad_id: string;
  ad_name: string | null;
  adset_name: string | null;
  metric_date: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  video_plays: number;
  video_plays_25pct: number;
  conversions: number;
  conversion_value: number;
  hook_rate: number | null;
  ctr: number | null;
  roas: number | null;
};

type CampaignTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversion_value: number;
  video_plays: number;
  video_plays_25pct: number;
  adCount: number;
};

type Props = {
  campaigns: Campaign[];
  accounts: Account[];
  stats: AdStat[];
  canSync: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:   "bg-green-50 text-green-700",
  PAUSED:   "bg-amber-50 text-amber-600",
  ARCHIVED: "bg-gray-100 text-gray-400",
  DELETED:  "bg-red-50 text-red-400",
};

const SORT_OPTIONS = [
  { value: "spend",       label: "Spend (high→low)" },
  { value: "roas",        label: "ROAS (high→low)" },
  { value: "hook",        label: "Hook Rate (high→low)" },
  { value: "conversions", label: "Conversions (high→low)" },
  { value: "impressions", label: "Impressions (high→low)" },
  { value: "name",        label: "Name (A→Z)" },
];

const CURRENCIES = [
  "USD","PHP","AUD","GBP","EUR","SGD","CAD","HKD","NZD","MYR","IDR","THB","JPY","KRW",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) { return n.toFixed(dec); }
function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
function fmtMoney(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(n);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CampaignsView({ campaigns, accounts, stats, canSync }: Props) {
  const router = useRouter();

  // Sync state
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // Filter / sort state
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterStatus,  setFilterStatus]  = useState<string>("all");
  const [sortBy,        setSortBy]        = useState<string>("spend");
  const [dateRange,     setDateRange]     = useState<"7" | "14" | "30">("7");

  // Expand state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountCurrencies, setAccountCurrencies] = useState<Record<string, string>>(
    Object.fromEntries(accounts.map((a) => [a.id, a.currency ?? "USD"]))
  );
  const [savingCurrency, setSavingCurrency] = useState<string | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close settings on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    if (settingsOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [settingsOpen]);

  // Account map (uses live currency from local state so UI is instant)
  const accountMap = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, { ...a, currency: accountCurrencies[a.id] ?? a.currency }])),
    [accounts, accountCurrencies],
  );

  // ── Sync ──────────────────────────────────────────────────────────────────
  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res  = await fetch("/api/ad-ops/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncMsg({ type: "error", text: body.error ?? `Sync failed (${res.status})` });
      } else {
        setSyncMsg({ type: "ok", text: `Synced ${body.campaigns ?? 0} campaigns · ${body.ads ?? 0} ads` });
        router.refresh();
      }
    } catch {
      setSyncMsg({ type: "error", text: "Network error — sync request failed" });
    } finally {
      setSyncing(false);
    }
  }

  // ── Currency save ─────────────────────────────────────────────────────────
  async function saveCurrency(accountId: string, currency: string) {
    setAccountCurrencies((prev) => ({ ...prev, [accountId]: currency }));
    setSavingCurrency(accountId);
    try {
      await fetch("/api/ad-ops/meta-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: accountId, currency }),
      });
    } finally {
      setSavingCurrency(null);
    }
  }

  // ── Stats aggregation ─────────────────────────────────────────────────────
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(dateRange));
    return d.toISOString().split("T")[0];
  }, [dateRange]);

  const filteredStats = useMemo(
    () => stats.filter((s) => s.metric_date >= cutoff),
    [stats, cutoff],
  );

  const campaignTotals = useMemo(() => {
    const map = new Map<string, CampaignTotals>();
    for (const s of filteredStats) {
      const key = `${s.meta_account_id}__${s.campaign_id}`;
      const t = map.get(key) ?? {
        spend: 0, impressions: 0, clicks: 0, conversions: 0,
        conversion_value: 0, video_plays: 0, video_plays_25pct: 0, adCount: 0,
      };
      t.spend            += s.spend;
      t.impressions      += s.impressions;
      t.clicks           += s.clicks;
      t.conversions      += s.conversions;
      t.conversion_value += s.conversion_value;
      t.video_plays      += s.video_plays;
      t.video_plays_25pct += s.video_plays_25pct;
      map.set(key, t);
    }
    // count unique ads per campaign
    const adSets = new Map<string, Set<string>>();
    for (const s of filteredStats) {
      const key = `${s.meta_account_id}__${s.campaign_id}`;
      if (!adSets.has(key)) adSets.set(key, new Set());
      adSets.get(key)!.add(s.ad_id);
    }
    adSets.forEach((ads, key) => {
      const t = map.get(key);
      if (t) t.adCount = ads.size;
    });
    return map;
  }, [filteredStats]);

  // ── Filter + sort campaigns ───────────────────────────────────────────────
  const visibleCampaigns = useMemo(() => {
    let list = campaigns.filter((c) => {
      if (filterAccount !== "all" && c.meta_account_id !== filterAccount) return false;
      if (filterStatus  !== "all" && c.effective_status !== filterStatus)  return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      const tA = campaignTotals.get(`${a.meta_account_id}__${a.campaign_id}`);
      const tB = campaignTotals.get(`${b.meta_account_id}__${b.campaign_id}`);
      switch (sortBy) {
        case "spend":       return (tB?.spend ?? 0) - (tA?.spend ?? 0);
        case "roas": {
          const rA = tA && tA.spend > 0 ? tA.conversion_value / tA.spend : 0;
          const rB = tB && tB.spend > 0 ? tB.conversion_value / tB.spend : 0;
          return rB - rA;
        }
        case "hook": {
          const hA = tA && tA.impressions > 0 ? tA.video_plays_25pct / tA.impressions : 0;
          const hB = tB && tB.impressions > 0 ? tB.video_plays_25pct / tB.impressions : 0;
          return hB - hA;
        }
        case "conversions": return (tB?.conversions ?? 0) - (tA?.conversions ?? 0);
        case "impressions": return (tB?.impressions ?? 0) - (tA?.impressions ?? 0);
        case "name":        return a.campaign_name.localeCompare(b.campaign_name);
        default:            return 0;
      }
    });

    return list;
  }, [campaigns, filterAccount, filterStatus, sortBy, campaignTotals]);

  // ── Overall totals (respects account + status filter) ────────────────────
  const overallTotals = useMemo(() => {
    return visibleCampaigns.reduce(
      (acc, c) => {
        const t = campaignTotals.get(`${c.meta_account_id}__${c.campaign_id}`);
        if (!t) return acc;
        return {
          spend:            acc.spend + t.spend,
          impressions:      acc.impressions + t.impressions,
          clicks:           acc.clicks + t.clicks,
          conversions:      acc.conversions + t.conversions,
          conversion_value: acc.conversion_value + t.conversion_value,
        };
      },
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0 },
    );
  }, [visibleCampaigns, campaignTotals]);

  const overallROAS = overallTotals.spend > 0
    ? overallTotals.conversion_value / overallTotals.spend : null;

  // Derive display currency from visible campaigns (use filtered account's currency,
  // or the currency that appears most often across visible campaigns)
  const overallCurrency = useMemo(() => {
    if (filterAccount !== "all") return accountMap[filterAccount]?.currency ?? "USD";
    const currencies = visibleCampaigns
      .map((c) => accountMap[c.meta_account_id]?.currency)
      .filter(Boolean) as string[];
    if (currencies.length === 0) return "USD";
    // Most common currency
    const counts = currencies.reduce<Record<string, number>>((acc, c) => {
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }, [filterAccount, accountMap, visibleCampaigns]);

  // Unique statuses for filter dropdown
  const availableStatuses = useMemo(
    () => [...new Set(campaigns.map((c) => c.effective_status))].sort(),
    [campaigns],
  );

  // ── Per-campaign ad drill-down ────────────────────────────────────────────
  function getAdsForCampaign(campaign: Campaign) {
    const adMap = new Map<string, { ad_id: string; ad_name: string | null; adset_name: string | null } & CampaignTotals>();
    filteredStats
      .filter((s) => s.campaign_id === campaign.campaign_id && s.meta_account_id === campaign.meta_account_id)
      .forEach((s) => {
        const t = adMap.get(s.ad_id) ?? {
          ad_id: s.ad_id, ad_name: s.ad_name, adset_name: s.adset_name,
          spend: 0, impressions: 0, clicks: 0, conversions: 0,
          conversion_value: 0, video_plays: 0, video_plays_25pct: 0, adCount: 1,
        };
        t.spend            += s.spend;
        t.impressions      += s.impressions;
        t.clicks           += s.clicks;
        t.conversions      += s.conversions;
        t.conversion_value += s.conversion_value;
        t.video_plays      += s.video_plays;
        t.video_plays_25pct += s.video_plays_25pct;
        adMap.set(s.ad_id, t);
      });
    return Array.from(adMap.values()).sort((a, b) => b.spend - a.spend);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Live Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">
            Auto-synced from Meta · {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
            {campaigns[0]?.last_synced_at && (
              <> · Last sync: {format(parseISO(campaigns[0].last_synced_at), "d MMM, h:mm a")}</>
            )}
          </p>
          {syncMsg && (
            <p className={`text-xs mt-1 ${syncMsg.type === "ok" ? "text-green-600" : "text-red-500"}`}>
              {syncMsg.text}
            </p>
          )}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {(["7", "14", "30"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDateRange(d)}
                className={`px-3 py-1.5 ${dateRange === d ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Account settings gear */}
          {canSync && (
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setSettingsOpen((o) => !o)}
                title="Account settings"
                className={`border rounded-lg p-1.5 transition-colors ${settingsOpen ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {/* Settings dropdown */}
              {settingsOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Account Settings</p>
                  <div className="space-y-3">
                    {accounts.map((account) => (
                      <div key={account.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{account.name}</p>
                          <p className="text-xs text-gray-400">{account.account_id}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <select
                            value={accountCurrencies[account.id] ?? "USD"}
                            onChange={(e) => saveCurrency(account.id, e.target.value)}
                            disabled={savingCurrency === account.id}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50"
                          >
                            {CURRENCIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          {savingCurrency === account.id && (
                            <svg className="animate-spin w-3 h-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                            </svg>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sync button */}
          {canSync && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="bg-gray-900 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {syncing ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Syncing…
                </>
              ) : "Sync Now"}
            </button>
          )}
        </div>
      </div>

      {/* ── Filter / sort bar ───────────────────────────────────────────────── */}
      {campaigns.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-5">
          {/* Account filter */}
          {accounts.length > 1 && (
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            >
              <option value="all">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          >
            <option value="all">All statuses</option>
            {availableStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>Sort: {o.label}</option>
            ))}
          </select>

          {/* Result count */}
          <span className="text-xs text-gray-400 ml-1">
            {visibleCampaigns.length} of {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
          </span>

          {/* Clear filters */}
          {(filterAccount !== "all" || filterStatus !== "all") && (
            <button
              onClick={() => { setFilterAccount("all"); setFilterStatus("all"); }}
              className="text-xs text-gray-400 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Summary cards ───────────────────────────────────────────────────── */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          {[
            { label: "Total Spend",   value: fmtMoney(overallTotals.spend, overallCurrency) },
            { label: "Conv. Value",   value: fmtMoney(overallTotals.conversion_value, overallCurrency) },
            { label: "ROAS",          value: overallROAS != null ? `${fmt(overallROAS)}x` : "—" },
            { label: "Impressions",   value: fmtK(overallTotals.impressions) },
            { label: "Conversions",   value: overallTotals.conversions.toLocaleString() },
          ].map((card) => (
            <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{card.label}</p>
              <p className="text-xl font-bold text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Campaign list ───────────────────────────────────────────────────── */}
      {campaigns.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-16 text-center">
          <p className="text-sm font-medium text-gray-500">No campaigns synced yet</p>
          <p className="text-xs text-gray-400 mt-2">Click <strong>Sync Now</strong> to pull your campaigns from Meta</p>
          {canSync && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="mt-4 bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
          )}
        </div>
      ) : visibleCampaigns.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">No campaigns match the current filters</p>
          <button
            onClick={() => { setFilterAccount("all"); setFilterStatus("all"); }}
            className="mt-2 text-xs text-gray-500 underline hover:text-gray-800"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleCampaigns.map((campaign) => {
            const key     = `${campaign.meta_account_id}__${campaign.campaign_id}`;
            const totals  = campaignTotals.get(key);
            const account = accountMap[campaign.meta_account_id];
            const isExpanded = expandedId === campaign.id;
            const roas     = totals && totals.spend > 0 ? totals.conversion_value / totals.spend : null;
            const hookRate = totals && totals.impressions > 0
              ? (totals.video_plays_25pct / totals.impressions) * 100 : null;

            return (
              <div key={campaign.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : campaign.id)}
                  className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLES[campaign.effective_status] ?? "bg-gray-100 text-gray-400"}`}>
                      {campaign.effective_status}
                    </span>

                    <span className="flex-1 text-sm font-medium text-gray-900 min-w-0 truncate">
                      {campaign.campaign_name}
                    </span>

                    {accounts.length > 1 && account && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">
                        {account.name}
                      </span>
                    )}

                    {totals ? (
                      <div className="flex items-center gap-4 text-xs shrink-0 flex-wrap">
                        <span className="text-gray-500">
                          <span className="font-semibold text-gray-800">{fmtMoney(totals.spend, account?.currency)}</span> spend
                        </span>
                        <span className="text-gray-500">
                          <span className={`font-semibold ${roas != null && roas >= 2 ? "text-green-700" : roas != null && roas < 1 ? "text-red-500" : "text-gray-800"}`}>
                            {roas != null ? `${fmt(roas)}x` : "—"}
                          </span> ROAS
                        </span>
                        <span className="text-gray-500">
                          <span className={`font-semibold ${hookRate != null && hookRate >= 4 ? "text-green-700" : "text-gray-800"}`}>
                            {hookRate != null ? `${fmt(hookRate, 1)}%` : "—"}
                          </span> hook
                        </span>
                        <span className="text-gray-500">
                          <span className="font-semibold text-gray-800">{totals.conversions}</span> conv.
                        </span>
                        <span className="text-gray-400">{totals.adCount} ad{totals.adCount !== 1 ? "s" : ""}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 shrink-0">No data in period</span>
                    )}

                    <svg
                      className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {(campaign.daily_budget || campaign.lifetime_budget || campaign.objective) && (
                    <p className="text-xs text-gray-400 mt-1">
                      {campaign.daily_budget
                        ? `${fmtMoney(campaign.daily_budget, account?.currency)}/day`
                        : campaign.lifetime_budget
                        ? `${fmtMoney(campaign.lifetime_budget, account?.currency)} lifetime`
                        : null}
                      {campaign.objective && (campaign.daily_budget || campaign.lifetime_budget)
                        ? ` · ${campaign.objective.replace(/_/g, " ")}`
                        : campaign.objective?.replace(/_/g, " ")}
                    </p>
                  )}
                </button>

                {/* Expanded ad breakdown */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {(() => {
                      const ads = getAdsForCampaign(campaign);
                      if (ads.length === 0) {
                        return (
                          <div className="px-5 py-6 text-center text-sm text-gray-400">
                            No ad-level data for this period
                          </div>
                        );
                      }
                      return (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-400 bg-gray-50 border-b border-gray-100">
                                <th className="px-5 py-2.5 text-left font-medium">Ad</th>
                                <th className="px-4 py-2.5 text-right font-medium">Spend</th>
                                <th className="px-4 py-2.5 text-right font-medium">ROAS</th>
                                <th className="px-4 py-2.5 text-right font-medium">Hook Rate</th>
                                <th className="px-4 py-2.5 text-right font-medium">CTR</th>
                                <th className="px-4 py-2.5 text-right font-medium">Impressions</th>
                                <th className="px-4 py-2.5 text-right font-medium">Clicks</th>
                                <th className="px-4 py-2.5 text-right font-medium">Conv.</th>
                                <th className="px-4 py-2.5 text-right font-medium">Conv. Value</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {ads.map((ad) => {
                                const adRoas = ad.spend > 0 ? ad.conversion_value / ad.spend : null;
                                const adHook = ad.impressions > 0 ? (ad.video_plays_25pct / ad.impressions) * 100 : null;
                                const adCtr  = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : null;
                                return (
                                  <tr key={ad.ad_id} className="hover:bg-gray-50">
                                    <td className="px-5 py-2.5">
                                      <p className="text-gray-800 font-medium truncate max-w-[220px]">{ad.ad_name ?? ad.ad_id}</p>
                                      {ad.adset_name && <p className="text-gray-400 truncate max-w-[220px]">{ad.adset_name}</p>}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-gray-700 font-medium">
                                      {fmtMoney(ad.spend, account?.currency)}
                                    </td>
                                    <td className={`px-4 py-2.5 text-right font-medium ${adRoas != null && adRoas >= 2 ? "text-green-700" : adRoas != null && adRoas < 1 ? "text-red-500" : "text-gray-700"}`}>
                                      {adRoas != null ? `${fmt(adRoas)}x` : "—"}
                                    </td>
                                    <td className={`px-4 py-2.5 text-right ${adHook != null && adHook >= 4 ? "text-green-700" : "text-gray-600"}`}>
                                      {adHook != null ? `${fmt(adHook, 1)}%` : "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-gray-600">
                                      {adCtr != null ? `${fmt(adCtr, 2)}%` : "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-gray-600">{fmtK(ad.impressions)}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-600">{fmtK(ad.clicks)}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-600">{ad.conversions}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-600">
                                      {fmtMoney(ad.conversion_value, account?.currency)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
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
