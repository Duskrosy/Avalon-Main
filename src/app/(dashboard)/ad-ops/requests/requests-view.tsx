"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";

type Creative = { id: string; first_name: string; last_name: string };
type Request = {
  id: string;
  title: string;
  brief: string | null;
  status: string;
  target_date: string | null;
  notes: string | null;
  created_at: string;
  requester: { first_name: string; last_name: string } | null;
  assignee: { first_name: string; last_name: string } | null;
};

type Props = {
  creatives: Creative[];
  currentUserId: string;
  canManage: boolean;
};

const STATUSES = ["draft", "submitted", "in_progress", "review", "approved", "rejected", "cancelled"] as const;

const STATUS_STYLES: Record<string, string> = {
  draft:       "bg-gray-100 text-gray-500",
  submitted:   "bg-blue-50 text-blue-600",
  in_progress: "bg-amber-50 text-amber-600",
  review:      "bg-purple-50 text-purple-600",
  approved:    "bg-green-50 text-green-700",
  rejected:    "bg-red-50 text-red-500",
  cancelled:   "bg-gray-100 text-gray-400",
};

function creativeName(c: Creative) {
  return `${c.first_name} ${c.last_name}`;
}

export function RequestsView({ creatives, currentUserId, canManage }: Props) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState<Request | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    brief: "",
    assignee_id: "",
    target_date: "",
    notes: "",
  });

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/ad-ops/requests?${params}`);
    if (res.ok) setRequests(await res.json());
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  function openCreate() {
    setEditRow(null);
    setForm({ title: "", brief: "", assignee_id: "", target_date: "", notes: "" });
    setShowModal(true);
  }

  function openEdit(r: Request) {
    setEditRow(r);
    setForm({
      title: r.title,
      brief: r.brief ?? "",
      assignee_id: "",
      target_date: r.target_date ?? "",
      notes: r.notes ?? "",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      title: form.title,
      brief: form.brief || null,
      assignee_id: form.assignee_id || null,
      target_date: form.target_date || null,
      notes: form.notes || null,
    };

    const url = editRow ? `/api/ad-ops/requests?id=${editRow.id}` : "/api/ad-ops/requests";
    const method = editRow ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      await fetchRequests();
      setShowModal(false);
    }
    setSaving(false);
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/ad-ops/requests?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchRequests();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this request?")) return;
    await fetch(`/api/ad-ops/requests?id=${id}`, { method: "DELETE" });
    await fetchRequests();
  }

  const NEXT_STATUSES: Record<string, string[]> = {
    draft:       ["submitted", "cancelled"],
    submitted:   ["in_progress", "rejected"],
    in_progress: ["review", "rejected"],
    review:      ["approved", "needs_revision" /* => back to in_progress */],
    approved:    [],
    rejected:    ["submitted"],
    cancelled:   [],
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Requests & Briefs</h1>
          <p className="text-sm text-gray-500 mt-1">{requests.length} requests</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          + New Request
        </button>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setStatusFilter("")}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${!statusFilter ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
        >
          All
        </button>
        {["submitted", "in_progress", "review", "approved"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${statusFilter === s ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : requests.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">No requests found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="px-5 py-4 flex items-start gap-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${STATUS_STYLES[r.status] ?? ""}`}>
                  {r.status.replace("_", " ")}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{r.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {r.requester ? `${r.requester.first_name} ${r.requester.last_name}` : "—"}
                    {r.assignee ? ` → ${r.assignee.first_name} ${r.assignee.last_name}` : ""}
                    {r.target_date ? ` · due ${format(parseISO(r.target_date), "d MMM")}` : ""}
                  </p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{format(parseISO(r.created_at), "d MMM")}</span>
              </div>

              {expanded === r.id && (
                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 space-y-3">
                  {r.brief && <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.brief}</p>}
                  {r.notes && <p className="text-xs text-gray-500">{r.notes}</p>}

                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {/* Status transitions */}
                    {(NEXT_STATUSES[r.status] ?? []).map((nextStatus) => (
                      <button
                        key={nextStatus}
                        onClick={() => updateStatus(r.id, nextStatus)}
                        className="text-xs border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-700"
                      >
                        → {nextStatus.replace("_", " ")}
                      </button>
                    ))}
                    <button
                      onClick={() => openEdit(r)}
                      className="text-xs text-gray-400 hover:text-gray-700 ml-auto"
                    >
                      Edit
                    </button>
                    {canManage && (
                      <button onClick={() => handleDelete(r.id)} className="text-xs text-gray-300 hover:text-red-400">
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
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editRow ? "Edit Request" : "New Request"}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. UGC testimonial for summer campaign"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Brief</label>
                <textarea
                  rows={4}
                  value={form.brief}
                  onChange={(e) => setForm((f) => ({ ...f, brief: e.target.value }))}
                  placeholder="Describe what's needed, tone, references..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Assign to</label>
                  <select
                    value={form.assignee_id}
                    onChange={(e) => setForm((f) => ({ ...f, assignee_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Unassigned</option>
                    {creatives.map((c) => (
                      <option key={c.id} value={c.id}>{creativeName(c)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Target Date</label>
                  <input
                    type="date"
                    value={form.target_date}
                    onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
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
