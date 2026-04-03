"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";

type MetaAccount = { id: string; name: string; account_id: string };
type ApprovedAsset = { id: string; asset_code: string; title: string };
type Deployment = {
  id: string;
  status: string;
  campaign_name: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  budget_daily: number | null;
  budget_total: number | null;
  launched_at: string | null;
  paused_at: string | null;
  ended_at: string | null;
  notes: string | null;
  asset: { asset_code: string; title: string } | null;
  meta_account: { name: string; account_id: string } | null;
  launched_by_profile: { first_name: string; last_name: string } | null;
};

type Props = {
  metaAccounts: MetaAccount[];
  approvedAssets: ApprovedAsset[];
  canManage: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  draft:   "bg-gray-100 text-gray-500",
  active:  "bg-green-50 text-green-700",
  paused:  "bg-amber-50 text-amber-600",
  ended:   "bg-gray-100 text-gray-400",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-400",
  paused: "bg-amber-400",
  draft:  "bg-gray-300",
  ended:  "bg-gray-300",
};

const NEXT_STATUSES: Record<string, string[]> = {
  draft:  ["active"],
  active: ["paused", "ended"],
  paused: ["active", "ended"],
  ended:  [],
};

export function DeploymentsView({ metaAccounts, approvedAssets, canManage }: Props) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("active");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editDep, setEditDep] = useState<Deployment | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    asset_id: "",
    meta_account_id: "",
    campaign_name: "",
    meta_campaign_id: "",
    meta_adset_id: "",
    meta_ad_id: "",
    budget_daily: "",
    budget_total: "",
    notes: "",
    status: "draft",
  });

  const fetchDeployments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/ad-ops/deployments?${params}`);
    if (res.ok) setDeployments(await res.json());
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchDeployments(); }, [fetchDeployments]);

  function openCreate() {
    setEditDep(null);
    setForm({ asset_id: "", meta_account_id: "", campaign_name: "", meta_campaign_id: "", meta_adset_id: "", meta_ad_id: "", budget_daily: "", budget_total: "", notes: "", status: "draft" });
    setShowModal(true);
  }

  function openEdit(d: Deployment) {
    setEditDep(d);
    setForm({
      asset_id: "",
      meta_account_id: "",
      campaign_name: d.campaign_name ?? "",
      meta_campaign_id: d.meta_campaign_id ?? "",
      meta_adset_id: d.meta_adset_id ?? "",
      meta_ad_id: d.meta_ad_id ?? "",
      budget_daily: d.budget_daily?.toString() ?? "",
      budget_total: d.budget_total?.toString() ?? "",
      notes: d.notes ?? "",
      status: d.status,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      campaign_name: form.campaign_name || null,
      meta_campaign_id: form.meta_campaign_id || null,
      meta_adset_id: form.meta_adset_id || null,
      meta_ad_id: form.meta_ad_id || null,
      budget_daily: form.budget_daily ? parseFloat(form.budget_daily) : null,
      budget_total: form.budget_total ? parseFloat(form.budget_total) : null,
      notes: form.notes || null,
      status: form.status,
      ...(editDep ? {} : {
        asset_id: form.asset_id || null,
        meta_account_id: form.meta_account_id || null,
      }),
    };
    const url = editDep ? `/api/ad-ops/deployments?id=${editDep.id}` : "/api/ad-ops/deployments";
    const method = editDep ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await fetchDeployments();
      setShowModal(false);
    }
    setSaving(false);
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/ad-ops/deployments?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchDeployments();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this deployment?")) return;
    await fetch(`/api/ad-ops/deployments?id=${id}`, { method: "DELETE" });
    await fetchDeployments();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Deployments</h1>
          <p className="text-sm text-gray-500 mt-1">{deployments.length} deployments</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          + New Deployment
        </button>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {["", "active", "paused", "draft", "ended"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${statusFilter === s ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
          >
            {s === "" ? "All" : s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : deployments.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">No deployments found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {deployments.map((d) => (
            <div key={d.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="px-5 py-4 flex items-start gap-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpanded(expanded === d.id ? null : d.id)}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 mt-2 ${STATUS_DOT[d.status] ?? "bg-gray-300"}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">
                    {d.campaign_name ?? d.asset?.title ?? "Unnamed deployment"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {d.asset?.asset_code && <span className="font-mono">{d.asset.asset_code}</span>}
                    {d.meta_account && <span> · {d.meta_account.name}</span>}
                    {d.launched_at && <span> · launched {format(parseISO(d.launched_at), "d MMM")}</span>}
                  </p>
                </div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLES[d.status] ?? ""}`}>
                  {d.status}
                </span>
              </div>

              {expanded === d.id && (
                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {d.budget_daily != null && (
                      <div>
                        <p className="text-gray-400">Daily Budget</p>
                        <p className="font-medium text-gray-800">${d.budget_daily.toLocaleString()}</p>
                      </div>
                    )}
                    {d.budget_total != null && (
                      <div>
                        <p className="text-gray-400">Total Budget</p>
                        <p className="font-medium text-gray-800">${d.budget_total.toLocaleString()}</p>
                      </div>
                    )}
                    {d.meta_campaign_id && (
                      <div>
                        <p className="text-gray-400">Campaign ID</p>
                        <p className="font-mono text-gray-800">{d.meta_campaign_id}</p>
                      </div>
                    )}
                    {d.meta_ad_id && (
                      <div>
                        <p className="text-gray-400">Ad ID</p>
                        <p className="font-mono text-gray-800">{d.meta_ad_id}</p>
                      </div>
                    )}
                    {d.launched_by_profile && (
                      <div>
                        <p className="text-gray-400">Launched by</p>
                        <p className="text-gray-800">{d.launched_by_profile.first_name} {d.launched_by_profile.last_name}</p>
                      </div>
                    )}
                    {d.ended_at && (
                      <div>
                        <p className="text-gray-400">Ended</p>
                        <p className="text-gray-800">{format(parseISO(d.ended_at), "d MMM yyyy")}</p>
                      </div>
                    )}
                  </div>

                  {d.notes && <p className="text-sm text-gray-600">{d.notes}</p>}

                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {(NEXT_STATUSES[d.status] ?? []).map((nextStatus) => (
                      <button
                        key={nextStatus}
                        onClick={() => updateStatus(d.id, nextStatus)}
                        className="text-xs border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-700"
                      >
                        → {nextStatus}
                      </button>
                    ))}
                    <button
                      onClick={() => openEdit(d)}
                      className="text-xs text-gray-400 hover:text-gray-700 ml-auto"
                    >
                      Edit
                    </button>
                    {canManage && (
                      <button onClick={() => handleDelete(d.id)} className="text-xs text-gray-300 hover:text-red-400">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editDep ? "Edit Deployment" : "New Deployment"}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              {!editDep && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Asset</label>
                    <select
                      value={form.asset_id}
                      onChange={(e) => setForm((f) => ({ ...f, asset_id: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      <option value="">None</option>
                      {approvedAssets.map((a) => (
                        <option key={a.id} value={a.id}>[{a.asset_code}] {a.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Meta Account</label>
                    <select
                      value={form.meta_account_id}
                      onChange={(e) => setForm((f) => ({ ...f, meta_account_id: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      <option value="">None</option>
                      {metaAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={form.campaign_name}
                  onChange={(e) => setForm((f) => ({ ...f, campaign_name: e.target.value }))}
                  placeholder="e.g. Summer 2026 — TOF"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Campaign ID</label>
                  <input
                    type="text"
                    value={form.meta_campaign_id}
                    onChange={(e) => setForm((f) => ({ ...f, meta_campaign_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ad Set ID</label>
                  <input
                    type="text"
                    value={form.meta_adset_id}
                    onChange={(e) => setForm((f) => ({ ...f, meta_adset_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ad ID</label>
                  <input
                    type="text"
                    value={form.meta_ad_id}
                    onChange={(e) => setForm((f) => ({ ...f, meta_ad_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Daily Budget ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.budget_daily}
                    onChange={(e) => setForm((f) => ({ ...f, budget_daily: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Total Budget ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.budget_total}
                    onChange={(e) => setForm((f) => ({ ...f, budget_total: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {["draft", "active", "paused", "ended"].map((s) => (
                    <option key={s} value={s}>{s}</option>
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
