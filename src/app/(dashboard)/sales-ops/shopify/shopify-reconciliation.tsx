"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";

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

// ─── Component ────────────────────────────────────────────────────────────────

export function ShopifyReconciliation({
  lastSync,
  unmatchedOrders,
  unverifiedSales,
  mismatches,
  shopifyDomain,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"unmatched" | "unverified" | "mismatches">("unmatched");
  const [syncing, setSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/sales/shopify-sync", { method: "POST" });
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }, [router]);

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
          <h1 className="text-2xl font-semibold text-gray-900">Shopify Reconciliation</h1>
          <p className="text-sm text-gray-500 mt-1">Last 90 days · match confirmed sales against Shopify orders</p>
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

      {/* ── Sync status bar ─────────────────────────────────────────────── */}
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
          }`}>
            {lastSync.status}
          </span>
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

      {/* ── Summary cards ───────────────────────────────────────────────── */}
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
            <p className={`text-2xl font-bold ${
              t.count > 0 ? "text-gray-900" : "text-gray-400"
            }`}>{t.count}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t.label}</p>
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────── */}

      {/* Tab 1: Unmatched Shopify orders */}
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
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {o.financial_status ?? "—"}
                      </td>
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

      {/* Tab 2: Unverified confirmed sales */}
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

      {/* Tab 3: Value mismatches */}
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
                    const diffColor =
                      absDiff > 100 ? "text-red-600 font-semibold" :
                      "text-amber-600 font-semibold";
                    const diffBg =
                      absDiff > 100 ? "bg-red-50" : "bg-amber-50";
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
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {fmtMoney(cs.shopify_price)}
                        </td>
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
