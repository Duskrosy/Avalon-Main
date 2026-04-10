"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ─── Types (matching /api/ad-ops/live-ads response) ──────────────────────────

type AdsetRow = {
  adset_name: string;
  adset_id: string | null;
  spend: number;
  live_spend: number | null;
  conversions: number;
  conversion_value: number;
  impressions: number;
  roas: number | null;
  spend_cap: number | null;
};

type LiveCampaign = {
  id: string;
  campaign_name: string;
  status: string;
  daily_budget: number | null;
  live_spend: number | null;
  auto_paused_at: string | null;
  account: { id: string; name: string; account_id: string; currency: string } | null;
  adsets: AdsetRow[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number, currency = "PHP") {
  const sym = currency === "PHP" ? "₱" : currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${sym}${(n / 1_000).toFixed(1)}K`;
  return `${sym}${n.toFixed(0)}`;
}

function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ─── Metric pill (for the top stat cards row) ─────────────────────────────────

function Pill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 min-w-0 bg-gray-50 rounded-xl p-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function LiveAdsPanel() {
  const [campaigns, setCampaigns] = useState<LiveCampaign[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/ad-ops/live-ads");
      if (!res.ok) { setError(true); return; }
      setCampaigns(await res.json());
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Aggregate totals ────────────────────────────────────────────────────────
  const activeCampaigns  = campaigns.filter((c) => c.status === "active");
  const pausedCampaigns  = campaigns.filter((c) => c.status !== "active");
  const currency = campaigns[0]?.account?.currency ?? "PHP";

  const totalLiveSpend   = campaigns.reduce((s, c) => s + (c.live_spend ?? 0), 0);
  const allAdsets        = campaigns.flatMap((c) => c.adsets);
  const totalSpend       = allAdsets.reduce((s, a) => s + a.spend, 0);
  const totalConvValue   = allAdsets.reduce((s, a) => s + a.conversion_value, 0);
  const totalImpressions = allAdsets.reduce((s, a) => s + a.impressions, 0);
  const overallRoas      = totalSpend > 0 ? totalConvValue / totalSpend : null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Ad Operations</h2>
            {!loading && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                Live
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading
              ? "Loading…"
              : `${activeCampaigns.length} active · ${fmtMoney(totalLiveSpend, currency)} today`
            }
            {!loading && overallRoas !== null && ` · ${overallRoas.toFixed(2)}x ROAS`}
          </p>
        </div>
        <Link href="/ad-ops/live" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-gray-400">Failed to load live ad data.</p>
          <button onClick={load} className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline">
            Retry
          </button>
        </div>
      ) : campaigns.length === 0 ? (
        <p className="px-5 py-8 text-sm text-gray-400 text-center">No campaigns found.</p>
      ) : (
        <>
          {/* Summary pills */}
          <div className="flex gap-2 px-4 pt-3 pb-1">
            <Pill
              label="Live spend today"
              value={fmtMoney(totalLiveSpend, currency)}
              sub={`${fmtK(totalImpressions)} impressions`}
            />
            <Pill
              label="ROAS (period)"
              value={overallRoas !== null ? `${overallRoas.toFixed(2)}x` : "—"}
              sub={`${fmtMoney(totalConvValue, currency)} conv. value`}
            />
            <Pill
              label="Campaigns"
              value={activeCampaigns.length.toString()}
              sub={pausedCampaigns.length > 0 ? `${pausedCampaigns.length} paused` : "all active"}
            />
          </div>

          {/* Campaign rows */}
          <div className="divide-y divide-gray-50 mt-2">
            {campaigns.slice(0, 6).map((c) => {
              const cur          = c.account?.currency ?? currency;
              const campSpend    = c.adsets.reduce((s, a) => s + a.spend, 0);
              const campConvVal  = c.adsets.reduce((s, a) => s + a.conversion_value, 0);
              const campImpr     = c.adsets.reduce((s, a) => s + a.impressions, 0);
              const roas         = campSpend > 0 ? campConvVal / campSpend : null;
              const isActive     = c.status === "active";
              const autoPaused   = !!c.auto_paused_at;

              const roasBadge =
                roas === null          ? "bg-gray-100 text-gray-400" :
                roas >= 2              ? "bg-green-50 text-green-700" :
                roas >= 1              ? "bg-amber-50 text-amber-700" :
                                         "bg-red-50 text-red-700";

              return (
                <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                  {/* Status indicator */}
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    autoPaused ? "bg-amber-400" : isActive ? "bg-green-500" : "bg-gray-300"
                  }`} />

                  {/* Name + account */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 font-medium truncate">{c.campaign_name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {c.account?.name ?? "—"}
                      {campImpr > 0 && ` · ${fmtK(campImpr)} impr.`}
                      {autoPaused && <span className="text-amber-500 ml-1">· auto-paused</span>}
                    </p>
                  </div>

                  {/* Spend + ROAS */}
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-sm font-semibold text-gray-900">{fmtMoney(campSpend, cur)}</p>
                    {roas !== null && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${roasBadge}`}>
                        {roas.toFixed(2)}x
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {campaigns.length > 6 && (
              <div className="px-5 py-2.5 bg-gray-50 text-center">
                <Link href="/ad-ops/live" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
                  +{campaigns.length - 6} more → View all live campaigns
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
