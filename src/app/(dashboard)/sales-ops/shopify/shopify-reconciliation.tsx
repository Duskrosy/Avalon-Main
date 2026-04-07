"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type SyncRun = {
  status: string;
  triggered_by: string;
  orders_synced: number | null;
  started_at: string;
  completed_at: string | null;
  error_log: string | null;
};

type UnmatchedOrder = {
  shopify_order_id: string;
  order_number: number;
  order_number_display: string;
  created_at_shopify: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  total_price: number;
  first_line_item_name: string | null;
  total_quantity: number;
  customer_name: string | null;
};

type UnverifiedSale = {
  id: string;
  order_id: string;
  confirmed_date: string;
  net_value: number;
  agent_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profiles: any;
};

type Mismatch = UnverifiedSale & {
  shopify_price: number;
  shopify_order_display: string;
  diff: number;
};

type StatsPreset = "today" | "yesterday" | "7d" | "30d";

type StatsData = {
  total_sales: number;
  order_count: number;
  avg_order_value: number;
  prev_sales: number;
  prev_count: number;
  sales_change_pct: number | null;
  orders_change_pct: number | null;
  daily: { date: string; sales: number; orders: number }[];
  has_live_data: boolean;
  live_order_count: number;
  last_synced: string | null;
};

type Props = {
  lastSync: SyncRun | null;
  unmatchedOrders: UnmatchedOrder[];
  unverifiedSales: UnverifiedSale[];
  mismatches: Mismatch[];
  shopifyDomain: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return `₱${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function agentName(sale: UnverifiedSale) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = sale.profiles as any;
  return p ? `${p.first_name} ${p.last_name}` : sale.agent_id.slice(0, 8);
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-400">—</span>;
  const color =
    status === "paid"       ? "bg-green-50 text-green-700" :
    status === "refunded"   ? "bg-red-50 text-red-700" :
    status === "fulfilled"  ? "bg-blue-50 text-blue-700" :
    "bg-gray-100 text-gray-500";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${color}`}>
      {status}
    </span>
  );
}

function getStatsRange(preset: StatsPreset): { from: string; to: string } {
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  switch (preset) {
    case "today":     return { from: today, to: today };
    case "yesterday": return { from: yesterday, to: yesterday };
    case "7d":  return { from: new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10), to: today };
    case "30d": return { from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), to: today };
  }
}

const PRESET_LABELS: Record<StatsPreset, string> = {
  today: "Live", yesterday: "Yesterday", "7d": "7 days", "30d": "30 days",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ShopifyReconciliation({
  lastSync,
  unmatchedOrders,
  unverifiedSales,
  mismatches,
  shopifyDomain,
}: Props) {
  const router = useRouter();
  const [tab, setTab]       = useState<"unmatched" | "unverified" | "mismatches">("unmatched");
  const [syncing, setSyncing] = useState(false);

  // ── Analytics state ───────────────────────────────────────────────────────
  const [statsPreset, setStatsPreset] = useState<StatsPreset>("today");
  const [statsData, setStatsData]     = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchStats = useCallback(async (preset: StatsPreset) => {
    setStatsLoading(true);
    try {
      const { from, to } = getStatsRange(preset);
      const res = await fetch(`/api/sales/shopify-stats?from=${from}&to=${to}`);
      if (res.ok) {
        setStatsData(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(statsPreset); }, [fetchStats, statsPreset]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/sales/shopify-sync", { method: "POST" });
      router.refresh();
      // Refetch stats after sync
      await fetchStats(statsPreset);
    } finally {
      setSyncing(false);
    }
  }, [router, fetchStats, statsPreset]);

  const tabs = [
    { key: "unmatched",  label: "Unmatched Orders",    count: unmatchedOrders.length },
    { key: "unverified", label: "Unverified Sales",     count: unverifiedSales.length },
    { key: "mismatches", label: "Value Mismatches",     count: mismatches.length },
  ] as const;

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Shopify</h1>
          <p className="text-sm text-gray-500 mt-1">Sales analytics · reconciliation · audit</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 bg-[#3A5635] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#2e4429] disabled:opacity-50 transition-colors"
        >
          {syncing ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Syncing…
            </>
          ) : (
            "↻ Sync Now"
          )}
        </button>
      </div>

      {/* ── Sync status ─────────────────────────────────────────────────── */}
      {lastSync && (
        <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 text-sm ${
          lastSync.status === "success" ? "bg-green-50 border-green-200" :
          lastSync.status === "failed"  ? "bg-red-50 border-red-200" :
          "bg-amber-50 border-amber-200"
        }`}>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            lastSync.status === "success" ? "bg-green-100 text-green-700" :
            lastSync.status === "failed"  ? "bg-red-100 text-red-700" :
            "bg-amber-100 text-amber-700"
          }`}>{lastSync.status}</span>
          <span className="text-gray-600">
            Last sync: {format(parseISO(lastSync.started_at), "d MMM yyyy · HH:mm")}
            {lastSync.orders_synced !== null && (
              <span className="text-gray-400 ml-2">· {lastSync.orders_synced} orders pulled</span>
            )}
          </span>
          {lastSync.error_log && (
            <span className="text-red-500 text-xs ml-auto truncate max-w-xs">{lastSync.error_log}</span>
          )}
        </div>
      )}
      {!lastSync && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          No sync has run yet. Click <strong>Sync Now</strong> to pull your Shopify orders.
        </div>
      )}

      {/* ── Analytics ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Header row */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Sales Analytics</h2>
            {statsData?.last_synced && (
              <p className="text-xs text-gray-400 mt-0.5">
                Data as of {format(parseISO(statsData.last_synced), "d MMM · HH:mm")}
                {statsData.has_live_data && (
                  <span className="ml-1.5 text-green-600 font-medium">
                    + {statsData.live_order_count} live order{statsData.live_order_count !== 1 ? "s" : ""}
                  </span>
                )}
              </p>
            )}
          </div>
          {/* Date range picker */}
          <div className="flex items-center gap-2.5">
            {statsPreset === "today" && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-green-600 font-semibold">Live</span>
              </div>
            )}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {(["today", "yesterday", "7d", "30d"] as StatsPreset[]).map((p, i) => (
                <button
                  key={p}
                  onClick={() => setStatsPreset(p)}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    i > 0 ? "border-l border-gray-200" : ""
                  } ${
                    statsPreset === p
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {PRESET_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white px-5 py-4">
                <div className="h-2.5 bg-gray-100 rounded animate-pulse w-20 mb-2.5" />
                <div className="h-7 bg-gray-100 rounded animate-pulse w-28" />
              </div>
            ))
          ) : statsData ? (
            <>
              <div className="bg-white px-5 py-4">
                <p className="text-xs text-gray-500 mb-1.5 font-medium">Revenue</p>
                <p className="text-2xl font-bold text-gray-900">
                  {statsData.total_sales > 0 ? fmtMoney(statsData.total_sales) : "—"}
                </p>
                {statsData.sales_change_pct !== null && (
                  <p className={`text-xs mt-1 font-medium ${statsData.sales_change_pct >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {statsData.sales_change_pct >= 0 ? "+" : ""}{statsData.sales_change_pct.toFixed(1)}% vs prev
                  </p>
                )}
              </div>
              <div className="bg-white px-5 py-4">
                <p className="text-xs text-gray-500 mb-1.5 font-medium">Orders</p>
                <p className="text-2xl font-bold text-gray-900">{statsData.order_count}</p>
                {statsData.orders_change_pct !== null && (
                  <p className={`text-xs mt-1 font-medium ${statsData.orders_change_pct >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {statsData.orders_change_pct >= 0 ? "+" : ""}{statsData.orders_change_pct.toFixed(1)}% vs prev
                  </p>
                )}
              </div>
              <div className="bg-white px-5 py-4">
                <p className="text-xs text-gray-500 mb-1.5 font-medium">Avg Order Value</p>
                <p className="text-2xl font-bold text-gray-900">
                  {statsData.order_count > 0 ? fmtMoney(statsData.avg_order_value) : "—"}
                </p>
              </div>
              <div className="bg-white px-5 py-4">
                <p className="text-xs text-gray-500 mb-1.5 font-medium">Prev Period</p>
                <p className="text-lg font-semibold text-gray-700">
                  {statsData.prev_sales > 0 ? fmtMoney(statsData.prev_sales) : "—"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{statsData.prev_count} orders</p>
              </div>
            </>
          ) : (
            <div className="col-span-4 bg-white px-5 py-8 text-center text-sm text-gray-400">
              No data. Run a sync first.
            </div>
          )}
        </div>

        {/* Revenue chart */}
        {!statsLoading && statsData && statsData.daily.length > 1 && (
          <div className="px-5 pt-4 pb-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Daily Revenue</p>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={statsData.daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="shopifyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3A5635" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#3A5635" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickFormatter={(d) =>
                    new Date(d + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" })
                  }
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickFormatter={(v) => v >= 1000 ? `₱${(v / 1000).toFixed(0)}K` : `₱${v}`}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => [typeof v === "number" ? fmtMoney(v) : v, "Revenue"]}
                  labelFormatter={(d) =>
                    new Date(d + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })
                  }
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#3A5635"
                  strokeWidth={2}
                  fill="url(#shopifyGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#3A5635" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Reconciliation tabs ──────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Reconciliation · last 90 days</h2>
        <div className="grid grid-cols-3 gap-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                tab === t.key
                  ? "border-[#3A5635] bg-[#3A5635]/5"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <p className={`text-2xl font-bold ${t.count > 0 ? "text-gray-900" : "text-gray-400"}`}>
                {t.count}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{t.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab 1: Unmatched Shopify orders ─────────────────────────────── */}
      {tab === "unmatched" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Unmatched Shopify orders</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Shopify orders in the last 90 days with no matching confirmed sale logged
            </p>
          </div>
          {unmatchedOrders.length === 0 ? (
            <p className="px-5 py-10 text-sm text-gray-400 text-center">
              All recent Shopify orders are logged ✓
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {["Order #", "Date", "Customer", "Items", "Total", "Payment", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {unmatchedOrders.map((o) => (
                    <tr key={o.shopify_order_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-900">
                        {o.order_number_display}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {format(parseISO(o.created_at_shopify), "d MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {o.customer_name ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[140px] truncate">
                        {o.first_line_item_name ?? "—"}
                        {o.total_quantity > 1 && <span className="text-gray-400 ml-1">×{o.total_quantity}</span>}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                        {fmtMoney(Number(o.total_price))}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{o.financial_status ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={o.fulfillment_status} />
                      </td>
                      <td className="px-4 py-3">
                        {shopifyDomain && (
                          <a
                            href={`https://${shopifyDomain}/admin/orders/${o.shopify_order_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-gray-700 whitespace-nowrap"
                          >
                            View ↗
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Unverified confirmed sales ───────────────────────────── */}
      {tab === "unverified" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Unverified confirmed sales</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Sales logged by agents with a numeric order ID that doesn&apos;t match any Shopify order
            </p>
          </div>
          {unverifiedSales.length === 0 ? (
            <p className="px-5 py-10 text-sm text-gray-400 text-center">
              All confirmed sales with numeric order IDs are verified ✓
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {["Date", "Agent", "Order ID", "Net Value"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {unverifiedSales.map((cs) => (
                    <tr key={cs.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {format(parseISO(cs.confirmed_date), "d MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{agentName(cs)}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-900">{cs.order_id}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                        {fmtMoney(Number(cs.net_value))}
                      </td>
                      <td className="px-4 py-3">
                        {shopifyDomain && (
                          <a
                            href={`https://${shopifyDomain}/admin/orders?query=${cs.order_id.replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-gray-700 whitespace-nowrap"
                          >
                            Search Shopify ↗
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 3: Value mismatches ──────────────────────────────────────── */}
      {tab === "mismatches" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Value mismatches</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Order found in both systems but confirmed value differs from Shopify total by more than ₱1
            </p>
          </div>
          {mismatches.length === 0 ? (
            <p className="px-5 py-10 text-sm text-gray-400 text-center">
              No value mismatches found ✓
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {["Order #", "Date", "Agent", "Confirmed ₱", "Shopify ₱", "Diff"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {mismatches.map((cs) => {
                    const absDiff = Math.abs(cs.diff);
                    const diffColor = absDiff > 100 ? "text-red-600 font-semibold" : "text-amber-600 font-semibold";
                    const diffBg    = absDiff > 100 ? "bg-red-50" : "bg-amber-50";
                    return (
                      <tr key={cs.id} className={`hover:bg-gray-50 ${diffBg}`}>
                        <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-900">
                          {cs.shopify_order_display}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {format(parseISO(cs.confirmed_date), "d MMM yyyy")}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{agentName(cs)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                          {fmtMoney(Number(cs.net_value))}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{fmtMoney(cs.shopify_price)}</td>
                        <td className={`px-4 py-3 text-sm ${diffColor}`}>
                          {cs.diff >= 0 ? "+" : ""}{fmtMoney(cs.diff)}
                        </td>
                        <td className="px-4 py-3">
                          {shopifyDomain && (
                            <a
                              href={`https://${shopifyDomain}/admin/orders?query=${cs.order_id.replace(/[^0-9]/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-gray-400 hover:text-gray-700 whitespace-nowrap"
                            >
                              View ↗
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
