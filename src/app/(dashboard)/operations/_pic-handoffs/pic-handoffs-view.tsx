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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Icon size={18} /> {C.title}
          </h1>
          <p className="text-xs text-gray-500 mt-1">{C.blurb}</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchOrders()}
          className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
            className={`text-xs px-3 py-1.5 rounded-full border ${
              statusFilter === key
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border border-gray-200 rounded-md bg-white overflow-x-auto">
        {loading && orders.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-400">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-400">
            No orders routed to {bucket}.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Order</th>
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-left font-medium">Items</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-left font-medium">PIC</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o) => {
                const orderLabel =
                  o.shopify_order_name ??
                  o.avalon_order_number ??
                  o.id.slice(0, 8);
                return (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {orderLabel}
                    </td>
                    <td className="px-3 py-2">
                      <div>{o.customer?.full_name ?? "—"}</div>
                      <div className="text-[11px] text-gray-500">
                        {o.customer?.phone ?? ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {o.notes ? (
                        <span title={o.notes}>{o.notes.slice(0, 60)}…</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      ₱{o.final_total_amount.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      {o.person_in_charge_label ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={o.status} sync={o.sync_status} />
                    </td>
                    <td className="px-3 py-2 text-gray-500">
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
      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700">
        completed
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">
        cancelled
      </span>
    );
  }
  if (sync === "failed") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700">
        sync failed
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700">
      {status} · {sync}
    </span>
  );
}
