"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, AlertTriangle, RefreshCw } from "lucide-react";
import { CreateOrderDrawer } from "./create-order-drawer";
import { SyncStatusBadge } from "./shared/sync-status-badge";
import { OrderActionsMenu } from "./shared/order-actions-menu";
import { RevertOrCancelDialog } from "./shared/revert-to-draft-dialog";

type Order = {
  id: string;
  avalon_order_number: string | null;
  shopify_order_id: string | null;
  customer_id: string;
  created_by_user_id: string | null;
  created_by_name: string | null;
  status: string;
  sync_status: string;
  sync_error: string | null;
  final_total_amount: number;
  mode_of_payment: string | null;
  person_in_charge_label: string | null;
  route_type: string;
  completion_status: string;
  created_at: string;
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    phone: string | null;
    email: string | null;
  } | null;
};

type Props = {
  currentUserId: string;
  canManage: boolean;
};

const RANGES = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 Days" },
  { value: "14d", label: "14 Days" },
  { value: "30d", label: "30 Days" },
];

export function ConfirmedSalesView({ currentUserId, canManage }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [range, setRange] = useState("today");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState<{
    order: Order;
    mode: "revert" | "cancel";
  } | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope, range });
      const res = await fetch(`/api/sales/orders?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setOrders(json.orders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [scope, range]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  // Poll for orders that are syncing — they should resolve within 5 minutes via reconciler.
  useEffect(() => {
    const hasSyncing = orders.some((o) => o.sync_status === "syncing");
    if (!hasSyncing) return;
    const t = setInterval(() => void fetchOrders(), 3000);
    return () => clearInterval(t);
  }, [orders, fetchOrders]);

  const onRetrySync = async (orderId: string) => {
    await fetch(`/api/sales/orders/${orderId}/sync-retry`, { method: "POST" });
    void fetchOrders();
  };

  const onAction = async (orderId: string, mode: "revert" | "cancel", reason: string, isSynced: boolean) => {
    const url =
      mode === "revert"
        ? `/api/sales/orders/${orderId}/revert-to-draft`
        : `/api/sales/orders/${orderId}/cancel`;
    const body = isSynced
      ? mode === "revert"
        ? { confirm_revert: true, reason }
        : { confirm_cancel: true, reason }
      : { reason };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? "Action failed");
    }
    void fetchOrders();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Confirmed Sales</h1>
          <p className="text-xs text-gray-500">
            Avalon-native order workflow. Drafts stay local until confirmed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          <Plus size={14} /> Create Order
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        {canManage && (
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "mine" | "all")}
            className="px-2 py-1 border border-gray-200 rounded text-xs"
          >
            <option value="mine">My Sales</option>
            <option value="all">All Sales</option>
          </select>
        )}
        <div className="flex gap-1 text-xs">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              className={`px-2 py-1 rounded ${
                range === r.value
                  ? "bg-gray-900 text-white"
                  : "border border-gray-200 hover:bg-gray-50 text-gray-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void fetchOrders()}
          className="ml-auto p-1.5 text-gray-400 hover:text-gray-700"
          aria-label="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Order</th>
              <th className="px-3 py-2 text-left">Customer</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left">MOP</th>
              <th className="px-3 py-2 text-left">PIC</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-xs text-gray-400">
                  No orders in this range. Click <strong>Create Order</strong> to start.
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">
                  {o.avalon_order_number ?? <span className="text-gray-400">— draft —</span>}
                  {o.route_type === "tnvs" && (
                    <span className="ml-2 inline-flex items-center text-[10px] uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      Lalamove
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div>{o.customer?.full_name ?? "—"}</div>
                  <div className="text-xs text-gray-500">{o.customer?.phone ?? ""}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  ₱{o.final_total_amount.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-xs">{o.mode_of_payment ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{o.person_in_charge_label ?? "—"}</td>
                <td className="px-3 py-2">
                  <SyncStatusBadge status={o.status} syncStatus={o.sync_status} />
                  {o.completion_status === "incomplete" && o.status !== "draft" && (
                    <span
                      className="ml-1 inline-flex items-center text-amber-600"
                      title="Some attribution fields are missing"
                    >
                      <AlertTriangle size={10} />
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {format(parseISO(o.created_at), "MMM d, HH:mm")}
                </td>
                <td className="px-3 py-2">
                  <OrderActionsMenu
                    status={o.status}
                    syncStatus={o.sync_status}
                    onRetrySync={() => void onRetrySync(o.id)}
                    onRevert={() => setActionDialog({ order: o, mode: "revert" })}
                    onCancel={() => setActionDialog({ order: o, mode: "cancel" })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateOrderDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onConfirmed={() => void fetchOrders()}
      />

      {actionDialog && (
        <RevertOrCancelDialog
          open={true}
          isSynced={actionDialog.order.sync_status === "synced"}
          shopifyOrderId={actionDialog.order.shopify_order_id}
          avalonOrderNumber={actionDialog.order.avalon_order_number}
          mode={actionDialog.mode}
          onConfirm={async (reason) => {
            await onAction(
              actionDialog.order.id,
              actionDialog.mode,
              reason,
              actionDialog.order.sync_status === "synced",
            );
          }}
          onClose={() => setActionDialog(null)}
        />
      )}

      {/* Suppress unused-var warning for currentUserId; reserved for client-side scope filtering refinements. */}
      <span className="hidden" aria-hidden="true" data-user={currentUserId} />
    </div>
  );
}
