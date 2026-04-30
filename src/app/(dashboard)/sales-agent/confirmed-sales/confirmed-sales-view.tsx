"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  Plus,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { CreateOrderDrawer } from "./create-order-drawer";
import { SyncStatusBadge } from "./shared/sync-status-badge";
import { OrderActionsMenu } from "./shared/order-actions-menu";
import { RevertOrCancelDialog } from "./shared/revert-to-draft-dialog";
import { SyncErrorModal } from "./shared/sync-error-modal";
import { CompleteOrderModal } from "./shared/complete-order-modal";
import { BundleSplitModal } from "./shared/bundle-split-modal";
import { OpenAdjustmentModal } from "./shared/open-adjustment-modal";
import { ExpandedOrderRow } from "./shared/expanded-order-row";

type Order = {
  id: string;
  avalon_order_number: string | null;
  shopify_order_id: string | null;
  shopify_order_name: string | null;
  shopify_order_number: number | null;
  customer_id: string;
  created_by_user_id: string | null;
  created_by_name: string | null;
  status: string;
  sync_status: string;
  sync_error: string | null;
  lifecycle_stage: string;
  lifecycle_method: string | null;
  final_total_amount: number;
  mode_of_payment: string | null;
  person_in_charge_label: string | null;
  route_type: string;
  completion_status: string;
  // Completion fields (filled when an order is marked complete; null otherwise).
  net_value_amount?: number | null;
  is_abandoned_cart?: boolean | null;
  ad_campaign_source?: string | null;
  alex_ai_assist?: boolean | null;
  delivery_status?: string | null;
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

const STATUS_CHIPS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "syncing", label: "Syncing" },
  { value: "synced", label: "Synced" },
  { value: "failed", label: "Failed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export function ConfirmedSalesView({ currentUserId, canManage }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [range, setRange] = useState("today");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  // Server-side query string the API sees; debounced from `query` so the
  // agent typing a customer name doesn't fire 5 requests in 200ms.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [syncErrorOrder, setSyncErrorOrder] = useState<Order | null>(null);
  const [completingOrder, setCompletingOrder] = useState<Order | null>(null);
  const [splittingOrder, setSplittingOrder] = useState<Order | null>(null);
  const [adjustingOrder, setAdjustingOrder] = useState<Order | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<{
    order: Order;
    mode: "revert" | "cancel";
  } | null>(null);

  // Debounce the search input by 250ms.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope, range });
      if (statusFilter) params.set("status", statusFilter);
      if (debouncedQuery.length >= 2) params.set("q", debouncedQuery);
      const res = await fetch(`/api/sales/orders?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setOrders(json.orders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [scope, range, statusFilter, debouncedQuery]);

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
          onClick={() => {
            setEditingOrderId(null);
            setDrawerOpen(true);
          }}
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
        <div className="relative ml-2 flex-1 min-w-[180px] max-w-[320px]">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order # / customer / phone"
            className="w-full pl-7 pr-7 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`px-2 py-1 border rounded text-xs ${
            statusFilter
              ? "border-blue-300 bg-blue-50 text-blue-900"
              : "border-gray-200 text-gray-700"
          }`}
          aria-label="Filter by status"
        >
          {STATUS_CHIPS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value ? `Status: ${c.label}` : "All statuses"}
            </option>
          ))}
        </select>
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
              <th className="px-2 py-2 w-6"></th>
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
                <td colSpan={9} className="px-3 py-8 text-center text-xs text-gray-400">
                  No orders in this range. Click <strong>Create Order</strong> to start.
                </td>
              </tr>
            )}
            {orders.map((o) => {
              const isExpanded = expandedOrderId === o.id;
              const onRowClick = () => {
                setExpandedOrderId(isExpanded ? null : o.id);
              };
              return (
              <React.Fragment key={o.id}>
              <tr
                onClick={onRowClick}
                className="hover:bg-gray-50 cursor-pointer"
                title="Click to expand"
              >
                <td className="px-2 py-2 text-gray-400 align-middle">
                  {isExpanded ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {o.shopify_order_name ? (
                    <span>{o.shopify_order_name}</span>
                  ) : o.status === "draft" ? (
                    <span className="text-gray-400">— draft —</span>
                  ) : o.avalon_order_number ? (
                    <span title="Pending Shopify number">
                      {o.avalon_order_number}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                  {o.route_type === "tnvs" && (
                    <span className="ml-2 inline-flex items-center text-[10px] uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      Lalamove
                    </span>
                  )}
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  {o.customer ? (
                    <Link
                      href={`/sales-agent/customers/${o.customer.id}`}
                      className="hover:underline decoration-gray-300 underline-offset-2"
                    >
                      <div>{o.customer.full_name}</div>
                      <div className="text-xs text-gray-500">
                        {o.customer.phone ?? o.customer.email ?? ""}
                      </div>
                    </Link>
                  ) : (
                    <div>—</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  ₱{o.final_total_amount.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-xs">{o.mode_of_payment ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{o.person_in_charge_label ?? "—"}</td>
                <td className="px-3 py-2">
                  <SyncStatusBadge
                    lifecycleStage={o.lifecycle_stage}
                    lifecycleMethod={o.lifecycle_method}
                    syncStatus={o.sync_status}
                    syncError={o.sync_error}
                  />
                  {o.completion_status === "incomplete" &&
                    o.status === "confirmed" &&
                    o.sync_status === "synced" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompletingOrder(o);
                        }}
                        className="ml-1 inline-flex items-center text-amber-600 hover:text-amber-800"
                        title="Mark complete — capture net value + delivery outcome"
                      >
                        <AlertTriangle size={10} />
                      </button>
                    )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {format(parseISO(o.created_at), "MMM d, HH:mm")}
                </td>
                <td
                  className="px-3 py-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <OrderActionsMenu
                    status={o.status}
                    syncStatus={o.sync_status}
                    onRetrySync={() => void onRetrySync(o.id)}
                    onRevert={() => setActionDialog({ order: o, mode: "revert" })}
                    onCancel={() => setActionDialog({ order: o, mode: "cancel" })}
                    onComplete={() => setCompletingOrder(o)}
                    onSplitBundle={() => setSplittingOrder(o)}
                    onOpenAdjustment={() => setAdjustingOrder(o)}
                  />
                </td>
              </tr>
              {isExpanded && (
                <tr key={`${o.id}-detail`}>
                  <td colSpan={9} className="p-0">
                    <ExpandedOrderRow
                      orderId={o.id}
                      onComplete={() => setCompletingOrder(o)}
                      onEdit={() => {
                        if (o.status === "draft") {
                          setEditingOrderId(o.id);
                          setDrawerOpen(true);
                        } else {
                          // For non-draft orders, edit means revert-to-draft
                          // first (Phase 2 in-place edit window can replace
                          // this once the 15-min timer is wired).
                          setActionDialog({ order: o, mode: "revert" });
                        }
                      }}
                      onDelete={() =>
                        setActionDialog({ order: o, mode: "cancel" })
                      }
                      onAdjust={() => setAdjustingOrder(o)}
                    />
                  </td>
                </tr>
              )}
              </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <CreateOrderDrawer
        open={drawerOpen}
        editingOrderId={editingOrderId}
        onClose={() => {
          setDrawerOpen(false);
          setEditingOrderId(null);
        }}
        onConfirmed={() => {
          setEditingOrderId(null);
          void fetchOrders();
        }}
      />

      <SyncErrorModal
        open={!!syncErrorOrder}
        order={syncErrorOrder}
        onClose={() => setSyncErrorOrder(null)}
        onRetried={() => void fetchOrders()}
      />

      <CompleteOrderModal
        open={!!completingOrder}
        order={completingOrder}
        onClose={() => setCompletingOrder(null)}
        onCompleted={() => void fetchOrders()}
      />

      {splittingOrder && (
        <BundleSplitModal
          open={true}
          orderId={splittingOrder.id}
          orderLabel={
            splittingOrder.shopify_order_name ??
            splittingOrder.avalon_order_number ??
            splittingOrder.id.slice(0, 8)
          }
          syncStatus={splittingOrder.sync_status}
          onClose={() => setSplittingOrder(null)}
          onApplied={() => void fetchOrders()}
        />
      )}

      {adjustingOrder && (
        <OpenAdjustmentModal
          open={true}
          orderId={adjustingOrder.id}
          orderLabel={
            adjustingOrder.shopify_order_name ??
            adjustingOrder.avalon_order_number ??
            adjustingOrder.id.slice(0, 8)
          }
          onClose={() => setAdjustingOrder(null)}
          onCreated={() => void fetchOrders()}
        />
      )}

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
