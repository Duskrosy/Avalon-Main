"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { useToast, Toast } from "@/components/ui/toast";
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

type SyncRunFull = SyncRun & {
  id: string;
  sync_date: string | null;
};

type Props = {
  lastSync: SyncRun | null;
  recentRuns: SyncRunFull[];
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
  if (!status) return <span className="text-xs text-[var(--color-text-tertiary)]">—</span>;
  const color =
    status === "paid"       ? "bg-[var(--color-success-light)] text-[var(--color-success)]" :
    status === "refunded"   ? "bg-[var(--color-error-light)] text-[var(--color-error)]" :
    status === "fulfilled"  ? "bg-[var(--color-accent-light)] text-[var(--color-accent)]" :
    "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]";
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
  recentRuns,
  unmatchedOrders,
  unverifiedSales,
  mismatches,
  shopifyDomain,
}: Props) {
  const router = useRouter();
  const { toast, setToast } = useToast();
  const [tab, setTab]       = useState<"unmatched" | "unverified" | "mismatches">("unmatched");
  const [syncing, setSyncing] = useState(false);

  // Backfill panel state
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillFrom, setBackfillFrom] = useState(weekAgo);
  const [backfillTo, setBackfillTo] = useState(today);
  const [backfilling, setBackfilling] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const runBackfill = useCallback(async () => {
    setBackfilling(true);
    try {
      const res = await fetch("/api/sales/shopify-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: backfillFrom, to: backfillTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ message: data.error ?? "Backfill failed", type: "error" });
      } else {
        setToast({ message: `Backfilled ${data.synced ?? 0} orders (${backfillFrom} → ${backfillTo})`, type: "success" });
        setBackfillOpen(false);
        router.refresh();
      }
    } finally {
      setBackfilling(false);
    }
  }, [backfillFrom, backfillTo, router, setToast]);

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
      // Refetch stats after sync
      await fetchStats(statsPreset);
      setToast({ message: "Shopify data synced", type: "success" });
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }, [fetchStats, statsPreset, setToast, router]);

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
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Shopify</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Sales analytics · reconciliation · audit</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-sm px-3 py-2 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            {showHistory ? "Hide history" : "Sync history"}
          </button>
          <button
            onClick={() => setBackfillOpen((v) => !v)}
            className="text-sm px-3 py-2 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            Backfill…
          </button>
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
      </div>

      {/* ── Backfill panel ──────────────────────────────────────────────── */}
      {backfillOpen && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">Backfill range (PH time):</span>
          <label className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1">
            From
            <input
              type="date"
              value={backfillFrom}
              max={backfillTo}
              onChange={(e) => setBackfillFrom(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]"
            />
          </label>
          <label className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1">
            To
            <input
              type="date"
              value={backfillTo}
              min={backfillFrom}
              max={today}
              onChange={(e) => setBackfillTo(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]"
            />
          </label>
          <button
            onClick={runBackfill}
            disabled={backfilling || !backfillFrom || !backfillTo}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] hover:bg-[var(--color-text-secondary)] transition-colors disabled:opacity-50"
          >
            {backfilling ? "Backfilling…" : "Run backfill"}
          </button>
          <span className="text-[11px] text-[var(--color-text-tertiary)] ml-auto">
            Pulls Shopify orders created in this range. Idempotent — safe to re-run.
          </span>
        </div>
      )}

      {/* ── Sync history ────────────────────────────────────────────────── */}
      {showHistory && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] overflow-hidden">
          <div className="px-4 py-2 border-b border-[var(--color-border-secondary)] text-xs font-medium text-[var(--color-text-secondary)]">
            Recent sync runs ({recentRuns.length})
          </div>
          {recentRuns.length === 0 ? (
            <div className="px-4 py-3 text-xs text-[var(--color-text-tertiary)]">No runs recorded yet.</div>
          ) : (
            <div className="divide-y divide-[var(--color-border-secondary)]">
              {recentRuns.map((r) => (
                <div key={r.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                  <span className={`px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    r.status === "success" ? "bg-[var(--color-success-light)] text-[var(--color-success)]" :
                    r.status === "failed"  ? "bg-[var(--color-error-light)] text-[var(--color-error)]" :
                    "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]"
                  }`}>{r.status}</span>
                  <span className="text-[var(--color-text-secondary)] shrink-0 w-16">
                    {r.triggered_by}
                  </span>
                  <span className="text-[var(--color-text-tertiary)] shrink-0 w-44">
                    {format(parseISO(r.started_at), "d MMM yyyy · HH:mm")}
                  </span>
                  <span className="text-[var(--color-text-secondary)] shrink-0 w-24">
                    {r.orders_synced ?? 0} orders
                  </span>
                  <span className="text-[var(--color-error)] truncate flex-1" title={r.error_log ?? ""}>
                    {r.error_log ?? ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sync status ─────────────────────────────────────────────────── */}
      {lastSync && (
        <div className={`rounded-[var(--radius-lg)] border px-4 py-3 flex items-center gap-3 text-sm ${
          lastSync.status === "success" ? "bg-[var(--color-success-light)] border-green-200" :
          lastSync.status === "failed"  ? "bg-[var(--color-error-light)] border-red-200" :
          "bg-[var(--color-warning-light)] border-[var(--color-border-primary)]"
        }`}>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            lastSync.status === "success" ? "bg-[var(--color-success-light)] text-[var(--color-success)]" :
            lastSync.status === "failed"  ? "bg-[var(--color-error-light)] text-[var(--color-error)]" :
            "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]"
          }`}>{lastSync.status}</span>
          <span className="text-[var(--color-text-secondary)]">
            Last sync: {format(parseISO(lastSync.started_at), "d MMM yyyy · HH:mm")}
            {lastSync.orders_synced !== null && (
              <span className="text-[var(--color-text-tertiary)] ml-2">· {lastSync.orders_synced} orders pulled</span>
            )}
          </span>
          {lastSync.error_log && (
            <span className="text-[var(--color-error)] text-xs ml-auto truncate max-w-xs">{lastSync.error_log}</span>
          )}
        </div>
      )}
      {!lastSync && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-warning-light)] px-4 py-3 text-sm text-[var(--color-warning-text)]">
          No sync has run yet. Click <strong>Sync Now</strong> to pull your Shopify orders.
        </div>
      )}

      {/* ── Analytics ───────────────────────────────────────────────────── */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
        {/* Header row */}
        <div className="px-5 py-4 border-b border-[var(--color-border-secondary)] flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Sales Analytics</h2>
            {statsData?.last_synced && (
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                Data as of {format(parseISO(statsData.last_synced), "d MMM · HH:mm")}
                {statsData.has_live_data && (
                  <span className="ml-1.5 text-[var(--color-success)] font-medium">
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
                <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
                <span className="text-xs text-[var(--color-success)] font-semibold">Live</span>
              </div>
            )}
            <div className="flex rounded-lg border border-[var(--color-border-primary)] overflow-hidden text-xs">
              {(["today", "yesterday", "7d", "30d"] as StatsPreset[]).map((p, i) => (
                <button
                  key={p}
                  onClick={() => setStatsPreset(p)}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    i > 0 ? "border-l border-[var(--color-border-primary)]" : ""
                  } ${
                    statsPreset === p
                      ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                      : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                  }`}
                >
                  {PRESET_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--color-bg-tertiary)]">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-[var(--color-bg-primary)] px-5 py-4">
                <div className="h-2.5 bg-[var(--color-bg-tertiary)] rounded animate-pulse w-20 mb-2.5" />
                <div className="h-7 bg-[var(--color-bg-tertiary)] rounded animate-pulse w-28" />
              </div>
            ))
          ) : statsData ? (
            <>
              <div className="bg-[var(--color-bg-primary)] px-5 py-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1.5 font-medium">Revenue</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                  {statsData.total_sales > 0 ? fmtMoney(statsData.total_sales) : "—"}
                </p>
                {statsData.sales_change_pct !== null && (
                  <p className={`text-xs mt-1 font-medium ${statsData.sales_change_pct >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
                    {statsData.sales_change_pct >= 0 ? "+" : ""}{statsData.sales_change_pct.toFixed(1)}% vs prev
                  </p>
                )}
              </div>
              <div className="bg-[var(--color-bg-primary)] px-5 py-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1.5 font-medium">Orders</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{statsData.order_count}</p>
                {statsData.orders_change_pct !== null && (
                  <p className={`text-xs mt-1 font-medium ${statsData.orders_change_pct >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
                    {statsData.orders_change_pct >= 0 ? "+" : ""}{statsData.orders_change_pct.toFixed(1)}% vs prev
                  </p>
                )}
              </div>
              <div className="bg-[var(--color-bg-primary)] px-5 py-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1.5 font-medium">Avg Order Value</p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                  {statsData.order_count > 0 ? fmtMoney(statsData.avg_order_value) : "—"}
                </p>
              </div>
              <div className="bg-[var(--color-bg-primary)] px-5 py-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1.5 font-medium">Prev Period</p>
                <p className="text-lg font-semibold text-[var(--color-text-primary)]">
                  {statsData.prev_sales > 0 ? fmtMoney(statsData.prev_sales) : "—"}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{statsData.prev_count} orders</p>
              </div>
            </>
          ) : (
            <div className="col-span-4 bg-[var(--color-bg-primary)] px-5 py-8 text-center text-sm text-[var(--color-text-tertiary)]">
              No data. Run a sync first.
            </div>
          )}
        </div>

        {/* Revenue chart */}
        {!statsLoading && statsData && statsData.daily.length > 1 && (
          <div className="px-5 pt-4 pb-5">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">Daily Revenue</p>
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
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Reconciliation · last 90 days</h2>
        <div className="grid grid-cols-3 gap-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-[var(--radius-lg)] border p-4 text-left transition-colors ${
                tab === t.key
                  ? "border-[#3A5635] bg-[#3A5635]/5"
                  : "border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-surface-hover)]"
              }`}
            >
              <p className={`text-2xl font-bold ${t.count > 0 ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)]"}`}>
                {t.count}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab 1: Unmatched Shopify orders ─────────────────────────────── */}
      {tab === "unmatched" && (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Unmatched Shopify orders</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Shopify orders in the last 90 days with no matching confirmed sale logged
            </p>
          </div>
          {unmatchedOrders.length === 0 ? (
            <p className="px-5 py-10 text-sm text-[var(--color-text-tertiary)] text-center">
              All recent Shopify orders are logged ✓
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
                    {["Order #", "Date", "Customer", "Items", "Total", "Payment", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-secondary)]">
                  {unmatchedOrders.map((o) => (
                    <tr key={o.shopify_order_id} className="hover:bg-[var(--color-surface-hover)]">
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-[var(--color-text-primary)]">
                        {o.order_number_display}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                        {format(parseISO(o.created_at_shopify), "d MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--color-text-primary)]">
                        {o.customer_name ?? <span className="text-[var(--color-text-tertiary)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)] max-w-[140px] truncate">
                        {o.first_line_item_name ?? "—"}
                        {o.total_quantity > 1 && <span className="text-[var(--color-text-tertiary)] ml-1">×{o.total_quantity}</span>}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)]">
                        {fmtMoney(Number(o.total_price))}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">{o.financial_status ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={o.fulfillment_status} />
                      </td>
                      <td className="px-4 py-3">
                        {shopifyDomain && (
                          <a
                            href={`https://${shopifyDomain}/admin/orders/${o.shopify_order_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] whitespace-nowrap"
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
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Unverified confirmed sales</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Sales logged by agents with a numeric order ID that doesn&apos;t match any Shopify order
            </p>
          </div>
          {unverifiedSales.length === 0 ? (
            <p className="px-5 py-10 text-sm text-[var(--color-text-tertiary)] text-center">
              All confirmed sales with numeric order IDs are verified ✓
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
                    {["Date", "Agent", "Order ID", "Net Value"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">{h}</th>
                    ))}
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-secondary)]">
                  {unverifiedSales.map((cs) => (
                    <tr key={cs.id} className="hover:bg-[var(--color-surface-hover)]">
                      <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                        {format(parseISO(cs.confirmed_date), "d MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--color-text-primary)]">{agentName(cs)}</td>
                      <td className="px-4 py-3 font-mono text-sm text-[var(--color-text-primary)]">{cs.order_id}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)]">
                        {fmtMoney(Number(cs.net_value))}
                      </td>
                      <td className="px-4 py-3">
                        {shopifyDomain && (
                          <a
                            href={`https://${shopifyDomain}/admin/orders?query=${cs.order_id.replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] whitespace-nowrap"
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
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Value mismatches</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Order found in both systems but confirmed value differs from Shopify total by more than ₱1
            </p>
          </div>
          {mismatches.length === 0 ? (
            <p className="px-5 py-10 text-sm text-[var(--color-text-tertiary)] text-center">
              No value mismatches found ✓
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
                    {["Order #", "Date", "Agent", "Confirmed ₱", "Shopify ₱", "Diff"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-secondary)]">
                  {mismatches.map((cs) => {
                    const absDiff = Math.abs(cs.diff);
                    const diffColor = absDiff > 100 ? "text-[var(--color-error)] font-semibold" : "text-[var(--color-warning)] font-semibold";
                    const diffBg    = absDiff > 100 ? "bg-[var(--color-error-light)]" : "bg-[var(--color-warning-light)]";
                    return (
                      <tr key={cs.id} className={`hover:bg-[var(--color-surface-hover)] ${diffBg}`}>
                        <td className="px-4 py-3 font-mono text-sm font-semibold text-[var(--color-text-primary)]">
                          {cs.shopify_order_display}
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                          {format(parseISO(cs.confirmed_date), "d MMM yyyy")}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--color-text-primary)]">{agentName(cs)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)]">
                          {fmtMoney(Number(cs.net_value))}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">{fmtMoney(cs.shopify_price)}</td>
                        <td className={`px-4 py-3 text-sm ${diffColor}`}>
                          {cs.diff >= 0 ? "+" : ""}{fmtMoney(cs.diff)}
                        </td>
                        <td className="px-4 py-3">
                          {shopifyDomain && (
                            <a
                              href={`https://${shopifyDomain}/admin/orders?query=${cs.order_id.replace(/[^0-9]/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] whitespace-nowrap"
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
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
