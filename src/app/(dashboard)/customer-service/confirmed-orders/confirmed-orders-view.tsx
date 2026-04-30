"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Paperclip, Truck } from "lucide-react";

type ConfirmedOrder = {
  id: string;
  avalon_order_number: string | null;
  shopify_order_name: string | null;
  shopify_financial_status: string | null;
  shopify_fulfillment_status: string | null;
  mode_of_payment: string | null;
  payment_other_label: string | null;
  payment_receipt_path: string | null;
  delivery_method: "lwe" | "tnvs" | "other" | null;
  delivery_method_notes: string | null;
  final_total_amount: number;
  completed_at: string | null;
  created_by_name: string | null;
  customer: { id: string; full_name: string; phone: string | null } | null;
  cs_hold_reason: string | null;
  person_in_charge_label: string | null;
  status: string;
};

type Tab = "inbox" | "in_progress" | "done" | "all";

export function ConfirmedOrdersView({ currentUserId: _ }: { currentUserId: string }) {
  const [orders, setOrders] = useState<ConfirmedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("inbox");
  const [search, setSearch] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (search) params.set("q", search);
      const res = await fetch(`/api/customer-service/confirmed-orders?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setOrders(json.orders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const triage = async (
    orderId: string,
    action: "inventory" | "fulfillment" | "dispatch" | "hold",
  ) => {
    let body: Record<string, unknown> = { action };
    if (action === "hold") {
      const reason = window.prompt("Hold reason?", "Awaiting customer reply");
      if (!reason) return;
      body = { action, hold_reason: reason };
    }
    const res = await fetch(`/api/customer-service/orders/${orderId}/triage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) void fetchOrders();
    else alert((await res.json()).error ?? "Triage failed");
  };

  const previewReceipt = async (orderId: string) => {
    const res = await fetch(`/api/sales/orders/${orderId}/receipt-signed-url`);
    if (!res.ok) return;
    const j = await res.json();
    if (j.url) window.open(j.url, "_blank");
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Confirmed Orders</h1>
        <input
          type="search"
          placeholder="Search order # / name / phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-md w-72"
        />
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200">
        {(["inbox", "in_progress", "done", "all"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs border-b-2 -mb-px ${
              tab === t
                ? "border-blue-500 text-blue-700 font-medium"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {t === "in_progress" ? "In progress" : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">Order</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Customer</th>
              <th className="text-left px-3 py-2">MOP</th>
              <th className="text-left px-3 py-2">Delivery</th>
              <th className="text-right px-3 py-2">Total</th>
              <th className="text-left px-3 py-2">Agent</th>
              <th className="text-left px-3 py-2">Triage</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-gray-400">Loading…</td></tr>
            )}
            {!loading && orders.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-gray-400">No orders</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">{o.shopify_order_name ?? o.id.slice(0, 6)}</td>
                <td className="px-3 py-2">
                  <ShopifyBadges fin={o.shopify_financial_status} ful={o.shopify_fulfillment_status} />
                  {o.cs_hold_reason && (
                    <span className="ml-1 inline-block text-[10px] uppercase font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      ON HOLD — {o.cs_hold_reason}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div>{o.customer?.full_name ?? "—"}</div>
                  <div className="text-[11px] text-gray-500">{o.customer?.phone ?? ""}</div>
                </td>
                <td className="px-3 py-2">
                  <span>{o.mode_of_payment ?? "—"}</span>
                  {o.payment_other_label && (
                    <span className="text-[11px] text-gray-500"> ({o.payment_other_label})</span>
                  )}
                  {o.payment_receipt_path && (
                    <button
                      type="button"
                      onClick={() => void previewReceipt(o.id)}
                      className="ml-1.5 text-blue-600 hover:text-blue-800"
                      aria-label="Preview receipt"
                    >
                      <Paperclip size={12} />
                    </button>
                  )}
                </td>
                <td className="px-3 py-2" title={o.delivery_method_notes ?? ""}>
                  <span className="inline-flex items-center gap-1">
                    <Truck size={12} />
                    {o.delivery_method?.toUpperCase() ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  ₱{o.final_total_amount.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-xs">
                  <div>{o.created_by_name ?? "—"}</div>
                  <div className="text-gray-500">
                    {o.completed_at ? format(new Date(o.completed_at), "MMM d, h:mm a") : ""}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const v = e.target.value as "inventory" | "fulfillment" | "dispatch" | "hold" | "";
                      if (v) void triage(o.id, v);
                      e.target.value = "";
                    }}
                    className="text-xs border border-gray-200 rounded px-2 py-1"
                  >
                    <option value="">Triage…</option>
                    <option value="inventory">→ Inventory</option>
                    <option value="fulfillment">→ Fulfillment</option>
                    <option value="dispatch">→ Dispatch ({o.delivery_method?.toUpperCase() ?? "—"})</option>
                    <option value="hold">→ Hold</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShopifyBadges({ fin, ful }: { fin: string | null; ful: string | null }) {
  return (
    <div className="inline-flex items-center gap-1">
      {fin && (
        <span className="text-[10px] uppercase font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
          {fin === "pending" ? "Payment pending" : fin}
        </span>
      )}
      {(ful === null || ful === "unfulfilled" || ful === "partial") && (
        <span className="text-[10px] uppercase font-semibold text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-full px-2 py-0.5">
          {ful ?? "Unfulfilled"}
        </span>
      )}
    </div>
  );
}
