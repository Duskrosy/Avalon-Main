"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";

type Request = {
  id: string;
  title: string;
  brief: string | null;
  status: string;
  target_date: string | null;
  notes: string | null;
  created_at: string;
  requester: { id: string; first_name: string; last_name: string } | null;
  assignee: { id: string; first_name: string; last_name: string } | null;
};

type Props = {
  currentUserId: string;
  currentUserName: string;
};

const STATUS_STYLES: Record<string, string> = {
  draft:       "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  submitted:   "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  in_progress: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  review:      "bg-purple-50 text-purple-600",
  approved:    "bg-[var(--color-success-light)] text-[var(--color-success)]",
  rejected:    "bg-[var(--color-error-light)] text-[var(--color-error)]",
  cancelled:   "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]",
};

type ModalState = {
  open: boolean;
  mode: "create" | "edit";
  request?: Request;
};

type FormData = {
  title: string;
  brief: string;
  notes: string;
  target_date: string;
};

const EMPTY_FORM: FormData = { title: "", brief: "", notes: "", target_date: "" };

const STATUS_FILTERS = [
  { value: "all",         label: "All" },
  { value: "draft",       label: "Draft" },
  { value: "submitted",   label: "Submitted" },
  { value: "in_progress", label: "In Progress" },
  { value: "review",      label: "In Review" },
  { value: "approved",    label: "Approved" },
];

export function MarketingRequestsView({ currentUserId }: Props) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ open: false, mode: "create" });
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/ad-ops/requests?limit=200");
    if (res.ok) {
      const all: Request[] = await res.json();
      // Client-filter: only this user's requests
      setRequests(all.filter((r) => r.requester?.id === currentUserId));
    }
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Filtered view based on status tab
  const visibleRequests = requests.filter((r) => {
    if (statusFilter === "all") return true;
    return r.status === statusFilter;
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setModal({ open: true, mode: "create" });
  }

  function openEdit(r: Request) {
    setForm({
      title:       r.title,
      brief:       r.brief ?? "",
      notes:       r.notes ?? "",
      target_date: r.target_date ?? "",
    });
    setModal({ open: true, mode: "edit", request: r });
  }

  function closeModal() {
    setModal({ open: false, mode: "create" });
    setForm(EMPTY_FORM);
  }

  async function handleSaveDraft() {
    if (!form.title.trim()) return;
    setSaving(true);
    if (modal.mode === "create") {
      await fetch("/api/ad-ops/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       form.title.trim(),
          brief:       form.brief || null,
          notes:       form.notes || null,
          target_date: form.target_date || null,
        }),
      });
    } else if (modal.request) {
      await fetch(`/api/ad-ops/requests?id=${modal.request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       form.title.trim(),
          brief:       form.brief || null,
          notes:       form.notes || null,
          target_date: form.target_date || null,
        }),
      });
    }
    setSaving(false);
    closeModal();
    await fetchRequests();
  }

  async function handleSubmitNow() {
    if (!form.title.trim()) return;
    setSaving(true);
    let targetId: string | null = null;

    if (modal.mode === "create") {
      const res = await fetch("/api/ad-ops/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       form.title.trim(),
          brief:       form.brief || null,
          notes:       form.notes || null,
          target_date: form.target_date || null,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        targetId = created.id;
      }
    } else if (modal.request) {
      // Save edits first
      await fetch(`/api/ad-ops/requests?id=${modal.request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       form.title.trim(),
          brief:       form.brief || null,
          notes:       form.notes || null,
          target_date: form.target_date || null,
        }),
      });
      targetId = modal.request.id;
    }

    if (targetId) {
      await fetch(`/api/ad-ops/requests?id=${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "submitted" }),
      });
    }

    setSaving(false);
    closeModal();
    await fetchRequests();
  }

  async function submitRequest(id: string) {
    setActionLoading(id);
    await fetch(`/api/ad-ops/requests?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "submitted" }),
    });
    setActionLoading(null);
    await fetchRequests();
  }

  async function cancelRequest(id: string) {
    if (!confirm("Cancel this request?")) return;
    setActionLoading(id);
    await fetch(`/api/ad-ops/requests?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    setActionLoading(null);
    await fetchRequests();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Requests</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Submit and track your creative requests.</p>
        </div>
        <button
          onClick={openCreate}
          className="shrink-0 bg-[var(--color-text-primary)] text-white text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
        >
          New Request
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 mb-5 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              statusFilter === f.value
                ? "bg-[var(--color-text-primary)] text-white border-gray-900"
                : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)] hover:border-gray-400"
            }`}
          >
            {f.label}
          </button>
        ))}
        {!loading && (
          <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">
            {visibleRequests.length} request{visibleRequests.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading…</div>
      ) : visibleRequests.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">
            {requests.length === 0
              ? "No requests yet. Click New Request to get started."
              : `No ${statusFilter === "all" ? "" : statusFilter.replace("_", " ") + " "}requests.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleRequests.map((r) => {
            const isDraft = r.status === "draft";
            const isMuted = r.status === "cancelled" || r.status === "rejected";
            const isExpanded = expanded === r.id;

            return (
              <div key={r.id} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
                {/* Row header */}
                <div
                  className="px-5 py-4 flex items-start gap-3 cursor-pointer hover:bg-[var(--color-surface-hover)]"
                  onClick={() => setExpanded(isExpanded ? null : r.id)}
                >
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${STATUS_STYLES[r.status] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"}`}
                  >
                    {r.status.replace("_", " ")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${isMuted ? "text-[var(--color-text-tertiary)]" : "text-[var(--color-text-primary)]"}`}>
                      {r.title}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                      {r.assignee
                        ? `Assigned to ${r.assignee.first_name} ${r.assignee.last_name}`
                        : "Unassigned"}
                      {r.target_date ? ` · due ${format(parseISO(r.target_date), "d MMM")}` : ""}
                      {` · created ${format(parseISO(r.created_at), "d MMM yyyy")}`}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">
                    {format(parseISO(r.created_at), "d MMM")}
                  </span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-[var(--color-border-secondary)] px-5 py-4 bg-[var(--color-bg-secondary)] space-y-3">
                    {r.brief && (
                      <div>
                        <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Brief</p>
                        <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">{r.brief}</p>
                      </div>
                    )}
                    {r.notes && (
                      <div>
                        <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Notes</p>
                        <p className="text-sm text-[var(--color-text-secondary)]">{r.notes}</p>
                      </div>
                    )}

                    {isDraft && (
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <button
                          disabled={actionLoading === r.id}
                          onClick={(e) => { e.stopPropagation(); submitRequest(r.id); }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-text-primary)] text-white hover:bg-[var(--color-text-secondary)] transition-colors disabled:opacity-50"
                        >
                          Submit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:border-gray-400 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          disabled={actionLoading === r.id}
                          onClick={(e) => { e.stopPropagation(); cancelRequest(r.id); }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={closeModal} />
          <div className="relative bg-[var(--color-bg-primary)] rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {modal.mode === "create" ? "New Request" : "Edit Request"}
            </h2>

            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Q3 Campaign Banner"
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>

            {/* Brief */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Brief</label>
              <textarea
                value={form.brief}
                onChange={(e) => setForm((f) => ({ ...f, brief: e.target.value }))}
                placeholder="Describe what you need…"
                rows={4}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
              />
            </div>

            {/* Target date */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Target Date</label>
              <input
                type="date"
                value={form.target_date}
                onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional context…"
                rows={2}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={closeModal}
                className="text-sm px-4 py-2 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:border-gray-400 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={saving || !form.title.trim()}
                onClick={handleSaveDraft}
                className="text-sm px-4 py-2 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50"
              >
                Save as Draft
              </button>
              <button
                disabled={saving || !form.title.trim()}
                onClick={handleSubmitNow}
                className="text-sm px-4 py-2 rounded-lg bg-[var(--color-text-primary)] text-white hover:bg-[var(--color-text-secondary)] transition-colors disabled:opacity-50"
              >
                Submit Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
