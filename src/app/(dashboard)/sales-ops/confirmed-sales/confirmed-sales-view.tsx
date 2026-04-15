"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import type { ConfirmedSale } from "@/lib/sales/types";

type Agent = { id: string; first_name: string; last_name: string; email: string };

type Props = {
  agents: Agent[];
  currentUserId: string;
  canManage: boolean;
  initialRows?: ConfirmedSale[];
};

const CURRENT_MONTH = format(new Date(), "yyyy-MM");

function agentName(a: Agent) {
  return `${a.first_name} ${a.last_name}`;
}

type ShopifyLookup = {
  status: "idle" | "loading" | "found" | "not_found" | "error";
  source?: "db" | "shopify_live";
};

export function ConfirmedSalesView({ agents, currentUserId, canManage, initialRows }: Props) {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [rows, setRows] = useState<ConfirmedSale[]>(initialRows ?? []);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState<ConfirmedSale | null>(null);
  const [saving, setSaving] = useState(false);
  const [shopifyLookup, setShopifyLookup] = useState<ShopifyLookup>({ status: "idle" });
  const [form, setForm] = useState({
    confirmed_date: format(new Date(), "yyyy-MM-dd"),
    agent_id: currentUserId,
    order_id: "",
    sale_type: "",
    design: "",
    quantity: "1",
    net_value: "",
    discount_offered: "",
    abandoned_cart: false,
    ads_source: "",
    payment_mode: "",
    notes: "",
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month });
    if (selectedAgent !== "all") params.set("agent_id", selectedAgent);
    const res = await fetch(`/api/sales/confirmed-sales?${params}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [month, selectedAgent]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // ── Shopify order auto-fill ───────────────────────────────────────────────
  useEffect(() => {
    if (!showModal || editRow) {
      // Only auto-fill for new sales; reset state when modal closes
      setShopifyLookup({ status: "idle" });
      return;
    }
    const cleaned = form.order_id.replace(/[^0-9]/g, "").trim();
    if (!cleaned || cleaned.length < 3) {
      setShopifyLookup({ status: "idle" });
      return;
    }
    const timer = setTimeout(async () => {
      setShopifyLookup({ status: "loading" });
      try {
        const res = await fetch(`/api/sales/shopify-order?order_number=${cleaned}`);
        if (!res.ok) { setShopifyLookup({ status: "error" }); return; }
        const data = await res.json();
        if (!data.found || !data.order) {
          setShopifyLookup({ status: "not_found" });
          return;
        }
        setForm((f) => ({
          ...f,
          quantity:     String(data.order.quantity  ?? f.quantity),
          net_value:    String(data.order.net_value  ?? f.net_value),
          design:       data.order.design            ?? f.design,
          payment_mode: data.order.payment_mode      ?? f.payment_mode,
        }));
        setShopifyLookup({ status: "found", source: data.source });
      } catch {
        setShopifyLookup({ status: "error" });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [form.order_id, showModal, editRow]);

  function openCreate() {
    setEditRow(null);
    setShopifyLookup({ status: "idle" });
    setForm({
      confirmed_date: format(new Date(), "yyyy-MM-dd"),
      agent_id: currentUserId,
      order_id: "",
      sale_type: "",
      design: "",
      quantity: "1",
      net_value: "",
      discount_offered: "",
      abandoned_cart: false,
      ads_source: "",
      payment_mode: "",
      notes: "",
    });
    setShowModal(true);
  }

  function openEdit(row: ConfirmedSale) {
    setEditRow(row);
    setForm({
      confirmed_date: row.confirmed_date,
      agent_id: row.agent_id,
      order_id: row.order_id,
      sale_type: row.sale_type ?? "",
      design: row.design ?? "",
      quantity: String(row.quantity),
      net_value: String(row.net_value),
      discount_offered: row.discount_offered ?? "",
      abandoned_cart: row.abandoned_cart,
      ads_source: row.ads_source ?? "",
      payment_mode: row.payment_mode ?? "",
      notes: row.notes ?? "",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      confirmed_date: form.confirmed_date,
      agent_id: form.agent_id,
      order_id: form.order_id,
      sale_type: form.sale_type || null,
      design: form.design || null,
      quantity: parseInt(form.quantity) || 1,
      net_value: parseFloat(form.net_value) || 0,
      discount_offered: form.discount_offered || null,
      abandoned_cart: form.abandoned_cart,
      ads_source: form.ads_source || null,
      payment_mode: form.payment_mode || null,
      notes: form.notes || null,
    };

    const url = editRow ? `/api/sales/confirmed-sales?id=${editRow.id}` : "/api/sales/confirmed-sales";
    const method = editRow ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      await fetchRows();
      setShowModal(false);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this sale?")) return;
    await fetch(`/api/sales/confirmed-sales?id=${id}`, { method: "DELETE" });
    await fetchRows();
  }

  const totalNetValue = rows.reduce((s, r) => s + r.net_value, 0);
  const abandonedCount = rows.filter((r) => r.abandoned_cart).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Confirmed Sales</h1>
          <p className="text-sm text-gray-500 mt-1">
            {rows.length} sales · ₱{totalNetValue.toLocaleString()} net · {abandonedCount} abandoned carts
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-[#3A5635] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#2e4429] transition-colors"
        >
          + Add Sale
        </button>
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
        />
        {canManage && (
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
          >
            <option value="all">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{agentName(a)}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">No sales recorded for this period.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Design / Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Value</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flags</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{format(parseISO(row.confirmed_date), "EEE d MMM")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.order_id}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.design && <span className="font-medium">{row.design}</span>}
                    {row.sale_type && <span className="text-gray-400 ml-1">· {row.sale_type}</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{row.quantity}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">₱{row.net_value.toLocaleString()}</td>
                  <td className="px-4 py-3 flex gap-1 flex-wrap">
                    {row.abandoned_cart && (
                      <span className="text-xs bg-[#F4E2D0] text-[#D57B0E] px-2 py-0.5 rounded-full">Abandoned</span>
                    )}
                    {row.ads_source && (
                      <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">Ad</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(row)} className="text-xs text-gray-400 hover:text-gray-700 mr-3">Edit</button>
                      <button onClick={() => handleDelete(row.id)} className="text-xs text-gray-300 hover:text-red-400">Del</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editRow ? "Edit Sale" : "Add Sale"}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
                  <input
                    required
                    type="date"
                    value={form.confirmed_date}
                    onChange={(e) => setForm((f) => ({ ...f, confirmed_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
                {canManage && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Agent *</label>
                    <select
                      value={form.agent_id}
                      onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                    >
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{agentName(a)}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Order ID *</label>
                <input
                  required
                  type="text"
                  value={form.order_id}
                  onChange={(e) => setForm((f) => ({ ...f, order_id: e.target.value }))}
                  placeholder="e.g. 1234"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                />
                {/* Shopify auto-fill indicator — create mode only */}
                {!editRow && (
                  <div className="mt-1 h-4">
                    {shopifyLookup.status === "loading" && (
                      <span className="text-[11px] text-gray-400">Looking up Shopify order…</span>
                    )}
                    {shopifyLookup.status === "found" && (
                      <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                        ✓ Filled from Shopify
                        {shopifyLookup.source === "shopify_live" && (
                          <span className="text-gray-400">(live)</span>
                        )}
                      </span>
                    )}
                    {shopifyLookup.status === "not_found" && (
                      <span className="text-[11px] text-amber-500">⚠ Order not found in Shopify</span>
                    )}
                    {shopifyLookup.status === "error" && (
                      <span className="text-[11px] text-red-400">Shopify lookup unavailable</span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Design</label>
                  <input
                    type="text"
                    value={form.design}
                    onChange={(e) => setForm((f) => ({ ...f, design: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Sale Type</label>
                  <input
                    type="text"
                    value={form.sale_type}
                    onChange={(e) => setForm((f) => ({ ...f, sale_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Qty</label>
                  <input
                    type="number"
                    min={1}
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Net Value (₱)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.net_value}
                    onChange={(e) => setForm((f) => ({ ...f, net_value: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Payment Mode</label>
                  <input
                    type="text"
                    value={form.payment_mode}
                    onChange={(e) => setForm((f) => ({ ...f, payment_mode: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Discount Offered</label>
                  <input
                    type="text"
                    value={form.discount_offered}
                    onChange={(e) => setForm((f) => ({ ...f, discount_offered: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ads Source</label>
                  <input
                    type="text"
                    value={form.ads_source}
                    onChange={(e) => setForm((f) => ({ ...f, ads_source: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.abandoned_cart}
                  onChange={(e) => setForm((f) => ({ ...f, abandoned_cart: e.target.checked }))}
                  className="rounded"
                />
                Abandoned cart
              </label>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
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
                  className="flex-1 bg-[#3A5635] text-white text-sm py-2 rounded-lg hover:bg-[#2e4429] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
