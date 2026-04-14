"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, isToday } from "date-fns";

/* ─── Types ────────────────────────────────────────────────── */

type Profile = { id: string; first_name: string; last_name: string };

type Order = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  financial_status: string;
  fulfillment_status: string;
  total_price: number;
  payment_method: string | null;
  channel: string | null;
  notes: string | null;
  assigned_to: string | null;
  assigned: Profile | null;
  item_count: number;
  created_at: string;
  updated_at: string;
};

type LineItem = {
  id: string;
  order_id: string;
  catalog_item_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  created_at: string;
  catalog: {
    id: string;
    sku: string;
    product_name: string;
    color: string | null;
    size: string | null;
  } | null;
};

type Props = {
  initialOrders: Order[];
  profiles: Profile[];
  currentUserId: string;
};

/* ─── Constants ────────────────────────────────────────────── */

const FINANCIAL_STATUSES = ["pending", "paid", "refunded", "voided"] as const;
const FULFILLMENT_STATUSES = ["unfulfilled", "partial", "fulfilled"] as const;
const CHANNELS = ["shopify", "instagram", "facebook", "tiktok", "walk_in", "other"] as const;
const PAYMENT_METHODS = ["cod", "gcash", "bank_transfer", "credit_card", "paypal", "other"] as const;

const FINANCIAL_BADGE: Record<string, string> = {
  paid:     "bg-green-50 text-green-700",
  pending:  "bg-amber-50 text-amber-600",
  refunded: "bg-red-50 text-red-500",
  voided:   "bg-gray-100 text-gray-400",
};

const FULFILLMENT_BADGE: Record<string, string> = {
  fulfilled:  "bg-green-50 text-green-700",
  partial:    "bg-amber-50 text-amber-600",
  unfulfilled: "bg-gray-100 text-gray-500",
};

function profileName(p: Profile | null) {
  if (!p) return "—";
  return `${p.first_name} ${p.last_name}`;
}

/* ─── Component ────────────────────────────────────────────── */

export function OrdersView({ initialOrders, profiles, currentUserId }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [financialFilter, setFinancialFilter] = useState("");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Expanded row for line items
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Create form
  const [form, setForm] = useState({
    order_number: "",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    financial_status: "pending",
    fulfillment_status: "unfulfilled",
    total_price: "",
    payment_method: "",
    channel: "",
    notes: "",
    assigned_to: "",
  });

  /* ─── Fetch ──────────────────────────────────────────────── */

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (financialFilter) params.set("financial_status", financialFilter);
    if (fulfillmentFilter) params.set("fulfillment_status", fulfillmentFilter);

    const res = await fetch(`/api/operations/orders?${params}`);
    if (res.ok) {
      const json = await res.json();
      setOrders(json.data ?? []);
    }
    setLoading(false);
  }, [search, financialFilter, fulfillmentFilter]);

  useEffect(() => {
    // Skip initial fetch since we have SSR data — only re-fetch when filters change
    if (search || financialFilter || fulfillmentFilter) {
      const timer = setTimeout(fetchOrders, 300);
      return () => clearTimeout(timer);
    } else {
      setOrders(initialOrders);
    }
  }, [search, financialFilter, fulfillmentFilter, fetchOrders, initialOrders]);

  /* ─── Line Items ─────────────────────────────────────────── */

  async function toggleExpand(orderId: string) {
    if (expandedId === orderId) {
      setExpandedId(null);
      setLineItems([]);
      return;
    }
    setExpandedId(orderId);
    setLoadingItems(true);
    const res = await fetch(`/api/operations/orders?items=true&order_id=${orderId}`);
    if (res.ok) {
      const json = await res.json();
      setLineItems(json.data ?? []);
    }
    setLoadingItems(false);
  }

  /* ─── Inline Status Update ──────────────────────────────── */

  async function updateFinancialStatus(orderId: string, status: string) {
    await fetch("/api/operations/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, financial_status: status }),
    });
    router.refresh();
    fetchOrders();
  }

  async function updateFulfillmentStatus(orderId: string, status: string) {
    await fetch("/api/operations/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, fulfillment_status: status }),
    });
    router.refresh();
    fetchOrders();
  }

  /* ─── Create ─────────────────────────────────────────────── */

  function openCreate() {
    setForm({
      order_number: "",
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      financial_status: "pending",
      fulfillment_status: "unfulfilled",
      total_price: "",
      payment_method: "",
      channel: "",
      notes: "",
      assigned_to: "",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      order_number: form.order_number,
      customer_name: form.customer_name || null,
      customer_email: form.customer_email || null,
      customer_phone: form.customer_phone || null,
      financial_status: form.financial_status,
      fulfillment_status: form.fulfillment_status,
      total_price: parseFloat(form.total_price) || 0,
      payment_method: form.payment_method || null,
      channel: form.channel || null,
      notes: form.notes || null,
      assigned_to: form.assigned_to || null,
    };

    const res = await fetch("/api/operations/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setShowModal(false);
      router.refresh();
      fetchOrders();
    }
    setSaving(false);
  }

  /* ─── Delete ─────────────────────────────────────────────── */

  async function handleDelete(id: string) {
    if (!confirm("Delete this order? This will also remove all line items.")) return;
    await fetch(`/api/operations/orders?id=${id}`, { method: "DELETE" });
    router.refresh();
    fetchOrders();
  }

  /* ─── Summary Stats ──────────────────────────────────────── */

  const totalOrders = orders.length;
  const pendingPayment = orders.filter((o) => o.financial_status === "pending").length;
  const unfulfilled = orders.filter((o) => o.fulfillment_status === "unfulfilled").length;
  const todaysOrders = orders.filter((o) => {
    try { return isToday(parseISO(o.created_at)); } catch { return false; }
  }).length;

  /* ─── Render ─────────────────────────────────────────────── */

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-1">{totalOrders} orders loaded</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          + New Order
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Total Orders" value={totalOrders} />
        <SummaryCard label="Pending Payment" value={pendingPayment} accent={pendingPayment > 0 ? "amber" : undefined} />
        <SummaryCard label="Unfulfilled" value={unfulfilled} accent={unfulfilled > 0 ? "red" : undefined} />
        <SummaryCard label="Today's Orders" value={todaysOrders} accent={todaysOrders > 0 ? "green" : undefined} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          type="text"
          placeholder="Search order # or customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-64"
        />
        <select
          value={financialFilter}
          onChange={(e) => setFinancialFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Payment</option>
          {FINANCIAL_STATUSES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={fulfillmentFilter}
          onChange={(e) => setFulfillmentFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Fulfillment</option>
          {FULFILLMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        {(search || financialFilter || fulfillmentFilter) && (
          <button
            onClick={() => { setSearch(""); setFinancialFilter(""); setFulfillmentFilter(""); }}
            className="text-xs text-gray-400 hover:text-gray-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">No orders found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fulfillment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {orders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  isExpanded={expandedId === order.id}
                  lineItems={expandedId === order.id ? lineItems : []}
                  loadingItems={expandedId === order.id && loadingItems}
                  onToggle={() => toggleExpand(order.id)}
                  onFinancialChange={(s) => updateFinancialStatus(order.id, s)}
                  onFulfillmentChange={(s) => updateFulfillmentStatus(order.id, s)}
                  onDelete={() => handleDelete(order.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Order</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Order Number *</label>
                <input
                  required
                  type="text"
                  value={form.order_number}
                  onChange={(e) => setForm((f) => ({ ...f, order_number: e.target.value }))}
                  placeholder="e.g. ORD-20260415-001"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={form.customer_name}
                    onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={form.customer_phone}
                    onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.customer_email}
                  onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Total Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.total_price}
                    onChange={(e) => setForm((f) => ({ ...f, total_price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Payment</label>
                  <select
                    value={form.financial_status}
                    onChange={(e) => setForm((f) => ({ ...f, financial_status: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {FINANCIAL_STATUSES.map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fulfillment</label>
                  <select
                    value={form.fulfillment_status}
                    onChange={(e) => setForm((f) => ({ ...f, fulfillment_status: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {FULFILLMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">—</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m.replace("_", " ").toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Channel</label>
                  <select
                    value={form.channel}
                    onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">—</option>
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>{c.replace("_", " ").charAt(0).toUpperCase() + c.replace("_", " ").slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Assigned To</label>
                <select
                  value={form.assigned_to}
                  onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Unassigned</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{profileName(p)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-gray-900 text-white text-sm py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Summary Card ─────────────────────────────────────────── */

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: "amber" | "red" | "green" }) {
  const accentColors = {
    amber: "text-amber-600",
    red: "text-red-500",
    green: "text-green-600",
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent ? accentColors[accent] : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}

/* ─── Order Row ────────────────────────────────────────────── */

function OrderRow({
  order,
  isExpanded,
  lineItems,
  loadingItems,
  onToggle,
  onFinancialChange,
  onFulfillmentChange,
  onDelete,
}: {
  order: Order;
  isExpanded: boolean;
  lineItems: LineItem[];
  loadingItems: boolean;
  onToggle: () => void;
  onFinancialChange: (status: string) => void;
  onFulfillmentChange: (status: string) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
          {order.order_number}
          {order.item_count > 0 && (
            <span className="ml-1.5 text-[10px] text-gray-400">({order.item_count} items)</span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-700">
          {order.customer_name || <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-3 text-right font-semibold text-gray-900">
          {Number(order.total_price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <select
            value={order.financial_status}
            onChange={(e) => onFinancialChange(e.target.value)}
            className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:ring-2 focus:ring-gray-900 ${FINANCIAL_BADGE[order.financial_status] ?? "bg-gray-100 text-gray-500"}`}
          >
            {FINANCIAL_STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <select
            value={order.fulfillment_status}
            onChange={(e) => onFulfillmentChange(e.target.value)}
            className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:ring-2 focus:ring-gray-900 ${FULFILLMENT_BADGE[order.fulfillment_status] ?? "bg-gray-100 text-gray-500"}`}
          >
            {FULFILLMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {order.channel ? order.channel.replace("_", " ") : "—"}
        </td>
        <td className="px-4 py-3 text-xs text-gray-600">
          {profileName(order.assigned)}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400">
          {format(parseISO(order.created_at), "d MMM yyyy")}
        </td>
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onDelete}
            className="text-xs text-gray-300 hover:text-red-400"
          >
            Del
          </button>
        </td>
      </tr>

      {/* Expanded Line Items */}
      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-gray-50 px-6 py-4 border-t border-gray-100">
            {loadingItems ? (
              <p className="text-xs text-gray-400">Loading items...</p>
            ) : lineItems.length === 0 ? (
              <p className="text-xs text-gray-400">No line items for this order.</p>
            ) : (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Line Items</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left pb-1 font-medium">Product</th>
                      <th className="text-left pb-1 font-medium">SKU</th>
                      <th className="text-right pb-1 font-medium">Qty</th>
                      <th className="text-right pb-1 font-medium">Unit Price</th>
                      <th className="text-right pb-1 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item) => (
                      <tr key={item.id} className="border-t border-gray-100">
                        <td className="py-1.5 text-gray-700">
                          {item.catalog?.product_name ?? item.product_name}
                          {item.catalog?.color && (
                            <span className="text-gray-400 ml-1">({item.catalog.color}{item.catalog.size ? `, ${item.catalog.size}` : ""})</span>
                          )}
                        </td>
                        <td className="py-1.5 font-mono text-gray-500">{item.sku ?? item.catalog?.sku ?? "—"}</td>
                        <td className="py-1.5 text-right text-gray-700">{item.quantity}</td>
                        <td className="py-1.5 text-right text-gray-700">{Number(item.unit_price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                        <td className="py-1.5 text-right font-medium text-gray-900">
                          {(item.quantity * Number(item.unit_price)).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {order.notes && (
              <p className="text-xs text-gray-500 mt-3 pt-2 border-t border-gray-100">
                <span className="font-medium">Notes:</span> {order.notes}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
