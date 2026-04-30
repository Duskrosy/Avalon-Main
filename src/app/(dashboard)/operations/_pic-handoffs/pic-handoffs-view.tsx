"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Boxes, RefreshCw, Truck } from "lucide-react";

type Order = {
  id: string;
  avalon_order_number: string | null;
  shopify_order_id: string | null;
  shopify_order_name: string | null;
  shopify_order_number: number | null;
  status: string;
  sync_status: string;
  final_total_amount: number;
  mode_of_payment: string | null;
  person_in_charge_label: string | null;
  route_type: string;
  completion_status: string;
  notes: string | null;
  created_at: string;
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    phone: string | null;
  } | null;
};

type Props = {
  bucket: "inventory" | "fulfillment";
};

const COPY = {
  inventory: {
    title: "Inventory Handoffs",
    icon: Boxes,
    blurb:
      "Orders Sales has routed to Inventory. Driven by the order's Person-In-Charge label.",
  },
  fulfillment: {
    title: "Fulfillment Handoffs",
    icon: Truck,
    blurb:
      "Orders Sales has routed to Fulfillment. Driven by the order's Person-In-Charge label.",
  },
} as const;

export function PicHandoffsView({ bucket }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const C = COPY[bucket];
  const Icon = C.icon;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        pic_bucket: bucket,
        range: "30d",
        limit: "200",
      });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/sales/orders?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setOrders(json.orders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [bucket, statusFilter]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const counts = {
    confirmed: orders.filter((o) => o.status === "confirmed").length,
    completed: orders.filter((o) => o.status === "completed").length,
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            <Icon size={20} className="text-[var(--color-accent)]" />
            {C.title}
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {C.blurb}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchOrders()}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-[var(--color-border-primary)] rounded-lg hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            ["", "All open"],
            ["confirmed", `Confirmed (${counts.confirmed})`],
            ["completed", `Completed (${counts.completed})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key || "all"}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === key
                ? "bg-[var(--color-text-primary)] border-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                : "bg-[var(--color-bg-primary)] border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border border-[var(--color-border-primary)] rounded-lg bg-[var(--color-bg-primary)] overflow-x-auto">
        {loading && orders.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">
            Loading…
          </div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">
            No orders routed to {bucket}.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Order</th>
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-left font-medium">Notes</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-left font-medium">PIC</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-secondary)]">
              {orders.map((o) => {
                const orderLabel = o.shopify_order_name ?? o.id.slice(0, 8);
                return (
                  <tr
                    key={o.id}
                    className="hover:bg-[var(--color-bg-secondary)] transition-colors"
                  >
                    <td className="px-3 py-2 font-medium text-[var(--color-text-primary)]">
                      {orderLabel}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-primary)]">
                      <div>{o.customer?.full_name ?? "—"}</div>
                      <div className="text-[11px] text-[var(--color-text-tertiary)]">
                        {o.customer?.phone ?? ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                      {o.notes ? (
                        <span title={o.notes}>
                          {o.notes.length > 60
                            ? `${o.notes.slice(0, 60)}…`
                            : o.notes}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-primary)]">
                      ₱{o.final_total_amount.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                      {o.person_in_charge_label ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={o.status} sync={o.sync_status} />
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-tertiary)]">
                      {format(parseISO(o.created_at), "MMM d HH:mm")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status, sync }: { status: string; sync: string }) {
  if (status === "completed") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-success-light)] text-[var(--color-success)]">
        completed
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]">
        cancelled
      </span>
    );
  }
  if (sync === "failed") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-error-light)] text-[var(--color-error)]">
        sync failed
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-accent-light)] text-[var(--color-accent)]">
      {status} · {sync}
    </span>
  );
}
