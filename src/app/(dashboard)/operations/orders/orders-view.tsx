"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO, isToday } from "date-fns";
import { useToast, Toast } from "@/components/ui/toast";

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
  paid:     "bg-[var(--color-success-light)] text-[var(--color-success)]",
  pending:  "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  refunded: "bg-[var(--color-error-light)] text-[var(--color-error)]",
  voided:   "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]",
};

const FULFILLMENT_BADGE: Record<string, string> = {
  fulfilled:  "bg-[var(--color-success-light)] text-[var(--color-success)]",
  partial:    "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  unfulfilled: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
};

function profileName(p: Profile | null) {
  if (!p) return "—";
  return `${p.first_name} ${p.last_name}`;
}

/* ─── Component ────────────────────────────────────────────── */

export function OrdersView({ initialOrders, profiles, currentUserId }: Props) {
  const { toast, setToast } = useToast();
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
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, financial_status: status } : o));
    const res = await fetch("/api/operations/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, financial_status: status }),
    });
    if (res.ok) {
      setToast({ message: "Payment status updated", type: "success" });
    } else {
      setToast({ message: "Failed to update payment status", type: "error" });
    }
    fetchOrders();
  }

  async function updateFulfillmentStatus(orderId: string, status: string) {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, fulfillment_status: status } : o));
    const res = await fetch("/api/operations/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, fulfillment_status: status }),
    });
    if (res.ok) {
      setToast({ message: "Fulfillment status updated", type: "success" });
    } else {
      setToast({ message: "Failed to update fulfillment status", type: "error" });
    }
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
      setToast({ message: "Order created", type: "success" });
      fetchOrders();
    } else {
      setToast({ message: "Failed to create order", type: "error" });
    }
    setSaving(false);
  }

  /* ─── Delete ─────────────────────────────────────────────── */

  async function handleDelete(id: string) {
    if (!confirm("Delete this order? This will also remove all line items.")) return;
    setOrders(prev => prev.filter(o => o.id !== id));
    const res = await fetch(`/api/operations/orders?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setToast({ message: "Order deleted", type: "success" });
    } else {
      setToast({ message: "Failed to delete order", type: "error" });
    }
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
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Orders</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{totalOrders} orders loaded</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-[var(--color-text-primary)] text-white text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
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
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] w-64"
        />
        <select
          value={financialFilter}
          onChange={(e) => setFinancialFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">All Payment</option>
          {FINANCIAL_STATUSES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={fulfillmentFilter}
          onChange={(e) => setFulfillmentFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">All Fulfillment</option>
          {FULFILLMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        {(search || financialFilter || fulfillmentFilter) && (
          <button
            onClick={() => { setSearch(""); setFinancialFilter(""); setFulfillmentFilter(""); }}
            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No orders found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
          <table className="min-w-full divide-y divide-[var(--color-border-secondary)] text-sm">
            <thead className="bg-[var(--color-bg-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Order #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Customer</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Fulfillment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Channel</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Assigned</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="bg-[var(--color-bg-primary)] divide-y divide-gray-50">
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

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">New Order</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Order Number *</label>
                <input
                  required
                  type="text"
                  value={form.order_number}
                  onChange={(e) => setForm((f) => ({ ...f, order_number: e.target.value }))}
                  placeholder="e.g. ORD-20260415-001"
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={form.customer_name}
                    onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Phone</label>
                  <input
                    type="text"
                    value={form.customer_phone}
                    onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Email</label>
                <input
                  type="email"
                  value={form.customer_email}
                  onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Total Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.total_price}
                    onChange={(e) => setForm((f) => ({ ...f, total_price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Payment</label>
                  <select
                    value={form.financial_status}
                    onChange={(e) => setForm((f) => ({ ...f, financial_status: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    {FINANCIAL_STATUSES.map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Fulfillment</label>
                  <select
                    value={form.fulfillment_status}
                    onChange={(e) => setForm((f) => ({ ...f, fulfillment_status: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    {FULFILLMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Payment Method</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    <option value="">—</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m.replace("_", " ").toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Channel</label>
                  <select
                    value={form.channel}
                    onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    <option value="">—</option>
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>{c.replace("_", " ").charAt(0).toUpperCase() + c.replace("_", " ").slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Assigned To</label>
                <select
                  value={form.assigned_to}
                  onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                >
                  <option value="">Unassigned</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{profileName(p)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-primary)] text-sm py-2 rounded-lg hover:bg-[var(--color-surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-[var(--color-text-primary)] text-white text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
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
    amber: "text-[var(--color-warning)]",
    red: "text-[var(--color-error)]",
    green: "text-[var(--color-success)]",
  };
  return (
    <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-4 py-3">
      <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent ? accentColors[accent] : "text-[var(--color-text-primary)]"}`}>
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
      <tr className="hover:bg-[var(--color-surface-hover)] cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3 font-mono text-xs font-medium text-[var(--color-text-primary)]">
          {order.order_number}
          {order.item_count > 0 && (
            <span className="ml-1.5 text-[10px] text-[var(--color-text-tertiary)]">({order.item_count} items)</span>
          )}
        </td>
        <td className="px-4 py-3 text-[var(--color-text-primary)]">
          {order.customer_name || <span className="text-[var(--color-text-tertiary)]">—</span>}
        </td>
        <td className="px-4 py-3 text-right font-semibold text-[var(--color-text-primary)]">
          {Number(order.total_price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <select
            value={order.financial_status}
            onChange={(e) => onFinancialChange(e.target.value)}
            className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:ring-2 focus:ring-[var(--color-accent)] ${FINANCIAL_BADGE[order.financial_status] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"}`}
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
            className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:ring-2 focus:ring-[var(--color-accent)] ${FULFILLMENT_BADGE[order.fulfillment_status] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"}`}
          >
            {FULFILLMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
          {order.channel ? order.channel.replace("_", " ") : "—"}
        </td>
        <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
          {profileName(order.assigned)}
        </td>
        <td className="px-4 py-3 text-xs text-[var(--color-text-tertiary)]">
          {format(parseISO(order.created_at), "d MMM yyyy")}
        </td>
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onDelete}
            className="text-xs text-[var(--color-text-tertiary)] hover:text-red-400"
          >
            Del
          </button>
        </td>
      </tr>

      {/* Expanded Line Items */}
      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-[var(--color-bg-secondary)] px-6 py-4 border-t border-[var(--color-border-secondary)]">
            {loadingItems ? (
              <p className="text-xs text-[var(--color-text-tertiary)]">Loading items...</p>
            ) : lineItems.length === 0 ? (
              <p className="text-xs text-[var(--color-text-tertiary)]">No line items for this order.</p>
            ) : (
              <div>
                <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase mb-2">Line Items</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--color-text-tertiary)]">
                      <th className="text-left pb-1 font-medium">Product</th>
                      <th className="text-left pb-1 font-medium">SKU</th>
                      <th className="text-right pb-1 font-medium">Qty</th>
                      <th className="text-right pb-1 font-medium">Unit Price</th>
                      <th className="text-right pb-1 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item) => (
                      <tr key={item.id} className="border-t border-[var(--color-border-secondary)]">
                        <td className="py-1.5 text-[var(--color-text-primary)]">
                          {item.catalog?.product_name ?? item.product_name}
                          {item.catalog?.color && (
                            <span className="text-[var(--color-text-tertiary)] ml-1">({item.catalog.color}{item.catalog.size ? `, ${item.catalog.size}` : ""})</span>
                          )}
                        </td>
                        <td className="py-1.5 font-mono text-[var(--color-text-secondary)]">{item.sku ?? item.catalog?.sku ?? "—"}</td>
                        <td className="py-1.5 text-right text-[var(--color-text-primary)]">{item.quantity}</td>
                        <td className="py-1.5 text-right text-[var(--color-text-primary)]">{Number(item.unit_price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                        <td className="py-1.5 text-right font-medium text-[var(--color-text-primary)]">
                          {(item.quantity * Number(item.unit_price)).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {order.notes && (
              <p className="text-xs text-[var(--color-text-secondary)] mt-3 pt-2 border-t border-[var(--color-border-secondary)]">
                <span className="font-medium">Notes:</span> {order.notes}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
