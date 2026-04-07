import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { subDays } from "date-fns";
import Link from "next/link";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtMoney(n: number, currency: string) {
  const sym = currency === "PHP" ? "₱" : currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${sym}${(n / 1_000).toFixed(1)}K`;
  return `${sym}${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function roasColor(r: number) {
  return r >= 2 ? "bg-green-50 text-green-700" : r >= 1 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
}
function statusBadge(s: string) {
  return s.toUpperCase() === "ACTIVE"
    ? "bg-green-50 text-green-700 border-green-200"
    : "bg-gray-100 text-gray-500 border-gray-200";
}

const PRESET_LABELS: Record<string, string> = {
  today: "Today", yesterday: "Yesterday", "7d": "7 days", "30d": "30 days",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ExecutiveAdOpsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; preset?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const sp          = await searchParams;
  const todayStr    = new Date().toISOString().slice(0, 10);
  const preset      = sp.preset ?? "today";
  const dateFrom    = sp.from ?? todayStr;
  const dateTo      = sp.to   ?? todayStr;
  const periodLabel = PRESET_LABELS[preset] ?? `${dateFrom} – ${dateTo}`;

  // Previous period (same length, immediately before)
  const fromDate  = new Date(dateFrom);
  const toDate    = new Date(dateTo);
  const rangeDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
  const prevFrom  = subDays(fromDate, rangeDays).toISOString().slice(0, 10);
  const prevTo    = subDays(fromDate, 1).toISOString().slice(0, 10);

  const admin = createAdminClient();

  const [
    { data: campaigns },
    { data: accounts },
    { data: statsCur },
    { data: statsPrev },
  ] = await Promise.all([
    admin.from("meta_campaigns")
      .select("id, campaign_id, campaign_name, status, effective_status, meta_account_id")
      .order("last_synced_at", { ascending: false }),

    admin.from("ad_meta_accounts")
      .select("id, name, account_id, currency")
      .eq("is_active", true),

    admin.from("meta_ad_stats")
      .select("campaign_id, campaign_name, spend, impressions, clicks, conversions, conversion_value, metric_date, meta_account_id")
      .gte("metric_date", dateFrom)
      .lte("metric_date", dateTo),

    admin.from("meta_ad_stats")
      .select("campaign_id, spend, conversions, conversion_value, impressions, meta_account_id")
      .gte("metric_date", prevFrom)
      .lte("metric_date", prevTo),
  ]);

  // Primary currency from first active account
  const primaryCurrency = (accounts ?? []).find((a) => a.currency)?.currency ?? "PHP";

  // ── Current period totals ─────────────────────────────────────────────────
  const spendCur  = (statsCur ?? []).reduce((s, r) => s + Number(r.spend), 0);
  const valueCur  = (statsCur ?? []).reduce((s, r) => s + Number(r.conversion_value), 0);
  const imprCur   = (statsCur ?? []).reduce((s, r) => s + (r.impressions ?? 0), 0);
  const clicksCur = (statsCur ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0);
  const convCur   = (statsCur ?? []).reduce((s, r) => s + (r.conversions ?? 0), 0);
  const roasCur   = spendCur > 0 ? valueCur / spendCur : 0;
  const ctrCur    = imprCur  > 0 ? (clicksCur / imprCur) * 100 : 0;
  const cpaCur    = convCur  > 0 ? spendCur / convCur : 0;

  // ── Previous period totals ────────────────────────────────────────────────
  const spendPrev = (statsPrev ?? []).reduce((s, r) => s + Number(r.spend), 0);
  const valuePrev = (statsPrev ?? []).reduce((s, r) => s + Number(r.conversion_value), 0);
  const convPrev  = (statsPrev ?? []).reduce((s, r) => s + (r.conversions ?? 0), 0);
  const roasPrev  = spendPrev > 0 ? valuePrev / spendPrev : 0;

  function pct(curr: number, prev: number): number | null {
    if (prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  }
  function pctLabel(curr: number, prev: number) {
    const p = pct(curr, prev);
    if (p === null) return null;
    return `${p >= 0 ? "+" : ""}${p.toFixed(1)}% vs prev`;
  }

  // ── Per-campaign aggregation (current period) ─────────────────────────────
  const campaignStats: Record<string, {
    name: string; spend: number; value: number; impressions: number; clicks: number; conversions: number;
  }> = {};
  for (const row of statsCur ?? []) {
    const id = row.campaign_id;
    if (!id) continue;
    if (!campaignStats[id]) campaignStats[id] = { name: row.campaign_name ?? id, spend: 0, value: 0, impressions: 0, clicks: 0, conversions: 0 };
    campaignStats[id].spend       += Number(row.spend);
    campaignStats[id].value       += Number(row.conversion_value);
    campaignStats[id].impressions += row.impressions ?? 0;
    campaignStats[id].clicks      += row.clicks ?? 0;
    campaignStats[id].conversions += row.conversions ?? 0;
  }

  const campaignStatusMap: Record<string, string> = {};
  for (const c of campaigns ?? []) {
    campaignStatusMap[c.campaign_id ?? ""] = c.effective_status;
  }

  const topCampaigns = Object.entries(campaignStats)
    .map(([id, c]) => ({
      id, ...c,
      roas:   c.spend > 0 ? c.value / c.spend : 0,
      ctr:    c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      status: campaignStatusMap[id] ?? "UNKNOWN",
    }))
    .sort((a, b) => b.spend - a.spend);

  // ── Per-account aggregation ───────────────────────────────────────────────
  const accountMap = Object.fromEntries((accounts ?? []).map((a) => [a.id, a]));
  const accountStats: Record<string, { name: string; spend: number; value: number; currency: string }> = {};
  for (const row of statsCur ?? []) {
    const aid = row.meta_account_id;
    if (!aid) continue;
    const acc = accountMap[aid];
    if (!accountStats[aid]) accountStats[aid] = { name: acc?.name ?? aid, spend: 0, value: 0, currency: acc?.currency ?? primaryCurrency };
    accountStats[aid].spend += Number(row.spend);
    accountStats[aid].value += Number(row.conversion_value);
  }
  const accountBreakdown = Object.values(accountStats).sort((a, b) => b.spend - a.spend);

  const activeCnt = (campaigns ?? []).filter((c) => c.effective_status === "ACTIVE").length;
  const pausedCnt = (campaigns ?? []).filter((c) => c.effective_status === "PAUSED").length;
  const totalCnt  = (campaigns ?? []).length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label:  `Spend · ${periodLabel}`,
            value:  fmtMoney(spendCur, primaryCurrency),
            sub:    pctLabel(spendCur, spendPrev),
            pctVal: pct(spendCur, spendPrev),
            good:   null as boolean | null,
          },
          {
            label:  `ROAS · ${periodLabel}`,
            value:  `${roasCur.toFixed(2)}×`,
            sub:    pctLabel(roasCur, roasPrev) ?? (roasPrev > 0 ? `prev ${roasPrev.toFixed(2)}×` : "No prior data"),
            pctVal: pct(roasCur, roasPrev),
            good:   true as boolean | null,
            accent: roasCur >= 2 ? "green" : roasCur >= 1 ? "amber" : "red",
          },
          {
            label:  `Impressions · ${periodLabel}`,
            value:  fmtK(imprCur),
            sub:    `${ctrCur.toFixed(2)}% CTR · ${fmtK(clicksCur)} clicks`,
            pctVal: null,
            good:   null as boolean | null,
          },
          {
            label:  `Conversions · ${periodLabel}`,
            value:  convCur,
            sub:    cpaCur > 0 ? `${fmtMoney(cpaCur, primaryCurrency)} cost/result` : "—",
            pctVal: pct(convCur, convPrev),
            good:   true as boolean | null,
          },
        ].map((card) => {
          const bg =
            card.accent === "green" ? "bg-green-50 border-green-200" :
            card.accent === "amber" ? "bg-amber-50 border-amber-200" :
            card.accent === "red"   ? "bg-red-50 border-red-200" :
            "bg-white border-gray-200";
          const vc =
            card.accent === "green" ? "text-green-700" :
            card.accent === "amber" ? "text-amber-700" :
            card.accent === "red"   ? "text-red-700" :
            "text-gray-900";
          const subColor = card.pctVal != null && card.good != null
            ? (card.good ? (card.pctVal >= 0 ? "text-green-600" : "text-red-500") : "text-gray-400")
            : "text-gray-400";
          return (
            <div key={card.label} className={`rounded-xl border p-5 ${bg}`}>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{card.label}</p>
              <p className={`text-3xl font-bold tracking-tight ${vc}`}>{card.value}</p>
              {card.sub && <p className={`text-xs mt-1.5 ${subColor}`}>{card.sub}</p>}
            </div>
          );
        })}
      </div>

      {/* ── Campaign status strip ───────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active", value: activeCnt, color: "text-green-600 bg-green-50 border-green-200" },
          { label: "Paused", value: pausedCnt, color: "text-amber-600 bg-amber-50 border-amber-200" },
          { label: "Total",  value: totalCnt,  color: "text-gray-700 bg-white border-gray-200" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 text-center ${s.color}`}>
            <p className="text-3xl font-bold">{s.value}</p>
            <p className="text-xs font-medium mt-1">{s.label} campaigns</p>
          </div>
        ))}
      </div>

      {/* ── Campaign performance table ──────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Campaigns · {periodLabel}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Sorted by spend</p>
          </div>
          <Link href="/ad-ops/campaigns" className="text-xs text-gray-400 hover:text-gray-700">All campaigns →</Link>
        </div>
        {topCampaigns.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">
            No campaign data for this period.
            {preset === "today" && " Ad data syncs daily — try 7 days to see recent performance."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["Campaign", "Status", "Spend", "ROAS", "Impressions", "Conversions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topCampaigns.slice(0, 12).map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusBadge(c.status)}`}>
                        {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 whitespace-nowrap">
                      {fmtMoney(c.spend, primaryCurrency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${roasColor(c.roas)}`}>
                        {c.roas.toFixed(2)}×
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{fmtK(c.impressions)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.conversions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Account breakdown ───────────────────────────────────────────── */}
      {accountBreakdown.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Spend by account · {periodLabel}</h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            {accountBreakdown.map((acc) => {
              const pctW = (acc.spend / Math.max(1, spendCur)) * 100;
              const roas = acc.spend > 0 ? acc.value / acc.spend : 0;
              return (
                <div key={acc.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{acc.name}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">{fmtMoney(acc.spend, acc.currency)}</span>
                      <span className={`px-1.5 py-0.5 rounded-full font-medium ${roasColor(roas)}`}>
                        {roas.toFixed(2)}×
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-700 rounded-full" style={{ width: `${pctW}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
