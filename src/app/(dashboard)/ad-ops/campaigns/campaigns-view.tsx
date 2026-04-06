"use client";

import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";

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

type Props = {
  campaigns: Campaign[];
  accounts: Account[];
  stats: AdStat[];
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

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:   "bg-green-50 text-green-700",
  PAUSED:   "bg-amber-50 text-amber-600",
  ARCHIVED: "bg-gray-100 text-gray-400",
  DELETED:  "bg-red-50 text-red-400",
};

function fmt(n: number, dec = 2) { return n.toFixed(dec); }
function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
function fmtMoney(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function CampaignsView({ campaigns, accounts, stats }: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<"7" | "14" | "30">("7");

  const accountMap = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);

  // Date-filter stats
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(dateRange));
    return d.toISOString().split("T")[0];
  }, [dateRange]);

  const filteredStats = useMemo(
    () => stats.filter((s) => s.metric_date >= cutoff),
    [stats, cutoff],
  );

  // Roll up stats per campaign_id
  const campaignTotals = useMemo(() => {
    const map = new Map<string, CampaignTotals>();
    for (const s of filteredStats) {
      const key = `${s.meta_account_id}__${s.campaign_id}`;
      const existing = map.get(key) ?? {
        spend: 0, impressions: 0, clicks: 0, conversions: 0,
        conversion_value: 0, video_plays: 0, video_plays_25pct: 0, adCount: 0,
      };
      existing.spend += s.spend;
      existing.impressions += s.impressions;
      existing.clicks += s.clicks;
      existing.conversions += s.conversions;
      existing.conversion_value += s.conversion_value;
      existing.video_plays += s.video_plays;
      existing.video_plays_25pct += s.video_plays_25pct;
      map.set(key, existing);
    }
    // Count unique ads per campaign
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

  // Filter by account
  const visibleCampaigns = useMemo(() =>
    campaigns.filter((c) => selectedAccountId === "all" || c.meta_account_id === selectedAccountId),
    [campaigns, selectedAccountId],
  );

  // Overall account-level totals
  const overallTotals = useMemo(() => {
    const filtered = Array.from(campaignTotals.values());
    return filtered.reduce((acc, t) => ({
      spend: acc.spend + t.spend,
      impressions: acc.impressions + t.impressions,
      clicks: acc.clicks + t.clicks,
      conversions: acc.conversions + t.conversions,
      conversion_value: acc.conversion_value + t.conversion_value,
    }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0 });
  }, [campaignTotals]);

  const overallROAS = overallTotals.spend > 0 ? overallTotals.conversion_value / overallTotals.spend : null;

  // Per-campaign ad breakdown
  function getAdsForCampaign(campaign: Campaign) {
    const adMap = new Map<string, { ad_id: string; ad_name: string | null; adset_name: string | null } & CampaignTotals>();
    filteredStats
      .filter((s) => s.campaign_id === campaign.campaign_id && s.meta_account_id === campaign.meta_account_id)
      .forEach((s) => {
        const existing = adMap.get(s.ad_id) ?? {
          ad_id: s.ad_id, ad_name: s.ad_name, adset_name: s.adset_name,
          spend: 0, impressions: 0, clicks: 0, conversions: 0,
          conversion_value: 0, video_plays: 0, video_plays_25pct: 0, adCount: 1,
        };
        existing.spend += s.spend;
        existing.impressions += s.impressions;
        existing.clicks += s.clicks;
        existing.conversions += s.conversions;
        existing.conversion_value += s.conversion_value;
        existing.video_plays += s.video_plays;
        existing.video_plays_25pct += s.video_plays_25pct;
        adMap.set(s.ad_id, existing);
      });
    return Array.from(adMap.values()).sort((a, b) => b.spend - a.spend);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Live Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">
            Auto-synced from Meta · {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
            {campaigns[0]?.last_synced_at && (
              <> · Last sync: {format(parseISO(campaigns[0].last_synced_at), "d MMM, h:mm a")}</>
            )}
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {accounts.length > 1 && (
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="all">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
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
        </div>
      </div>

      {/* Overall summary cards */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total Spend", value: fmtMoney(overallTotals.spend) },
            { label: "Conv. Value", value: fmtMoney(overallTotals.conversion_value) },
            { label: "ROAS", value: overallROAS != null ? `${fmt(overallROAS)}x` : "—" },
            { label: "Impressions", value: fmtK(overallTotals.impressions) },
            { label: "Conversions", value: overallTotals.conversions.toLocaleString() },
          ].map((card) => (
            <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{card.label}</p>
              <p className="text-xl font-bold text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-16 text-center">
          <p className="text-sm font-medium text-gray-500">No campaigns synced yet</p>
          <p className="text-xs text-gray-400 mt-1">Use the Sync Now button on the dashboard to pull your Meta campaigns</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleCampaigns.map((campaign) => {
            const key = `${campaign.meta_account_id}__${campaign.campaign_id}`;
            const totals = campaignTotals.get(key);
            const account = accountMap[campaign.meta_account_id];
            const isExpanded = expandedId === campaign.id;
            const roas = totals && totals.spend > 0 ? totals.conversion_value / totals.spend : null;
            const hookRate = totals && totals.impressions > 0
              ? (totals.video_plays_25pct / totals.impressions) * 100 : null;
            const ctr = totals && totals.impressions > 0
              ? (totals.clicks / totals.impressions) * 100 : null;

            return (
              <div key={campaign.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Campaign row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : campaign.id)}
                  className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Status dot */}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLES[campaign.effective_status] ?? "bg-gray-100 text-gray-400"}`}>
                      {campaign.effective_status}
                    </span>

                    {/* Name */}
                    <span className="flex-1 text-sm font-medium text-gray-900 min-w-0 truncate">
                      {campaign.campaign_name}
                    </span>

                    {/* Account badge (multi-account) */}
                    {accounts.length > 1 && account && (
                      <span className="text-xs text-gray-400 shrink-0">{account.name}</span>
                    )}

                    {/* Stats */}
                    {totals ? (
                      <div className="flex items-center gap-4 text-xs shrink-0 flex-wrap">
                        <span className="text-gray-500">
                          <span className="font-semibold text-gray-800">{fmtMoney(totals.spend, account?.currency)}</span> spend
                        </span>
                        <span className="text-gray-500">
                          <span className="font-semibold text-gray-800">{roas != null ? `${fmt(roas)}x` : "—"}</span> ROAS
                        </span>
                        <span className="text-gray-500">
                          <span className="font-semibold text-gray-800">{hookRate != null ? `${fmt(hookRate, 1)}%` : "—"}</span> hook
                        </span>
                        <span className="text-gray-500">
                          <span className="font-semibold text-gray-800">{totals.conversions}</span> conv.
                        </span>
                        <span className="text-gray-400">{totals.adCount} ad{totals.adCount !== 1 ? "s" : ""}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 shrink-0">No data in period</span>
                    )}

                    {/* Expand chevron */}
                    <svg
                      className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {/* Budget line */}
                  {(campaign.daily_budget || campaign.lifetime_budget) && (
                    <p className="text-xs text-gray-400 mt-1 ml-0 pl-0">
                      {campaign.daily_budget
                        ? `${fmtMoney(campaign.daily_budget, account?.currency)}/day budget`
                        : `${fmtMoney(campaign.lifetime_budget!, account?.currency)} lifetime budget`}
                      {campaign.objective && ` · ${campaign.objective.replace(/_/g, " ")}`}
                    </p>
                  )}
                </button>

                {/* Expanded: per-ad breakdown */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {(() => {
                      const ads = getAdsForCampaign(campaign);
                      if (ads.length === 0) {
                        return (
                          <div className="px-5 py-6 text-center text-sm text-gray-400">
                            No ad-level data for the selected period
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
                                const adCtr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : null;
                                return (
                                  <tr key={ad.ad_id} className="hover:bg-gray-50">
                                    <td className="px-5 py-2.5">
                                      <p className="text-gray-800 font-medium truncate max-w-[200px]">{ad.ad_name ?? ad.ad_id}</p>
                                      {ad.adset_name && <p className="text-gray-400 truncate max-w-[200px]">{ad.adset_name}</p>}
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
