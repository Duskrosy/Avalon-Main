"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO, isAfter, startOfDay, subDays } from "date-fns";
import { useToast, Toast } from "@/components/ui/toast";

/* ─── Types ────────────────────────────────────────────────── */

type Profile = { id: string; first_name: string; last_name: string };
type OrderRef = { id: string; order_number: string; customer_name: string | null };

type Issue = {
  id: string;
  order_id: string;
  issue_type: string;
  status: string;
  description: string | null;
  notes_after_call: string | null;
  agent_remarks: string | null;
  summary: string | null;
  resolution: string | null;
  follow_up_owner: string | null;
  follow_up_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  order: OrderRef | null;
  follow_up_owner_profile: Profile | null;
  created_by_profile: Profile | null;
};

type Props = {
  initialIssues: Issue[];
  orders: OrderRef[];
  profiles: Profile[];
  currentUserId: string;
};

/* ─── Constants ────────────────────────────────────────────── */

const ISSUE_TYPES = [
  "wrong_size",
  "wrong_item",
  "defective",
  "long_delivery",
  "unresponsive_customer",
  "changed_mind",
  "no_budget",
  "redelivery",
  "courier_issue",
  "other",
] as const;

const ISSUE_STATUSES = ["open", "in_progress", "resolved", "cancelled", "escalated"] as const;

const STATUS_BADGE: Record<string, string> = {
  open:        "bg-red-50 text-red-700",
  in_progress: "bg-amber-50 text-amber-600",
  resolved:    "bg-green-50 text-green-700",
  cancelled:   "bg-gray-100 text-gray-400",
  escalated:   "bg-purple-50 text-purple-700",
};

const ISSUE_TYPE_BADGE: Record<string, string> = {
  wrong_size:            "bg-blue-50 text-blue-700",
  wrong_item:            "bg-indigo-50 text-indigo-700",
  defective:             "bg-red-50 text-red-600",
  long_delivery:         "bg-amber-50 text-amber-700",
  unresponsive_customer: "bg-gray-100 text-gray-600",
  changed_mind:          "bg-cyan-50 text-cyan-700",
  no_budget:             "bg-orange-50 text-orange-600",
  redelivery:            "bg-teal-50 text-teal-700",
  courier_issue:         "bg-pink-50 text-pink-700",
  other:                 "bg-gray-50 text-gray-500",
};

function profileName(p: Profile | null) {
  if (!p) return "\u2014";
  return `${p.first_name} ${p.last_name}`;
}

function formatType(t: string) {
  return t
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatStatus(s: string) {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ─── Component ────────────────────────────────────────────── */

export function IssuesView({ initialIssues, orders, profiles, currentUserId }: Props) {
  const { toast, setToast } = useToast();
  const [issues, setIssues] = useState<Issue[]>(initialIssues);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create form
  const [form, setForm] = useState({
    order_id: "",
    issue_type: "wrong_size" as string,
    description: "",
    notes_after_call: "",
    agent_remarks: "",
    summary: "",
    follow_up_owner: "",
    follow_up_date: "",
  });

  /* ─── Fetch ──────────────────────────────────────────────── */

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("issue_type", typeFilter);

    const res = await fetch(`/api/operations/issues?${params}`);
    if (res.ok) {
      const json = await res.json();
      setIssues(json.data ?? []);
    }
    setLoading(false);
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    if (statusFilter || typeFilter) {
      const timer = setTimeout(fetchIssues, 300);
      return () => clearTimeout(timer);
    } else {
      setIssues(initialIssues);
    }
  }, [statusFilter, typeFilter, fetchIssues, initialIssues]);

  // Client-side search filtering on order number
  const filtered = search
    ? issues.filter((i) =>
        i.order?.order_number?.toLowerCase().includes(search.toLowerCase()) ||
        i.order?.customer_name?.toLowerCase().includes(search.toLowerCase())
      )
    : issues;

  /* ─── Inline Status Update ──────────────────────────────── */

  async function updateStatus(issueId: string, status: string) {
    setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status } : i));
    await fetch("/api/operations/issues", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: issueId, status }),
    });
    setToast({ message: `Status updated to ${formatStatus(status)}`, type: "success" });
    fetchIssues();
  }

  /* ─── Create ─────────────────────────────────────────────── */

  function openCreate() {
    setForm({
      order_id: "",
      issue_type: "wrong_size",
      description: "",
      notes_after_call: "",
      agent_remarks: "",
      summary: "",
      follow_up_owner: "",
      follow_up_date: "",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      order_id: form.order_id,
      issue_type: form.issue_type,
      description: form.description || null,
      notes_after_call: form.notes_after_call || null,
      agent_remarks: form.agent_remarks || null,
      summary: form.summary || null,
      follow_up_owner: form.follow_up_owner || null,
      follow_up_date: form.follow_up_date || null,
    };

    const res = await fetch("/api/operations/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setShowModal(false);
      setToast({ message: "Issue created", type: "success" });
      fetchIssues();
    }
    setSaving(false);
  }

  /* ─── Delete ─────────────────────────────────────────────── */

  async function handleDelete(id: string) {
    if (!confirm("Delete this issue?")) return;
    setIssues(prev => prev.filter(i => i.id !== id));
    await fetch(`/api/operations/issues?id=${id}`, { method: "DELETE" });
    setToast({ message: "Issue deleted", type: "success" });
    fetchIssues();
  }

  /* ─── Summary Stats ──────────────────────────────────────── */

  const today = startOfDay(new Date());
  const weekAgo = subDays(today, 7);

  const openIssues = issues.filter((i) => i.status === "open").length;
  const inProgress = issues.filter((i) => i.status === "in_progress").length;
  const needingFollowUp = issues.filter((i) => {
    if (!i.follow_up_date) return false;
    if (i.status === "resolved" || i.status === "cancelled") return false;
    try {
      return !isAfter(parseISO(i.follow_up_date), today);
    } catch {
      return false;
    }
  }).length;
  const resolvedThisWeek = issues.filter((i) => {
    if (i.status !== "resolved") return false;
    try {
      return isAfter(parseISO(i.updated_at), weekAgo);
    } catch {
      return false;
    }
  }).length;

  /* ─── Render ─────────────────────────────────────────────── */

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Issues / Recovery</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} issues loaded</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          + New Issue
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Open Issues" value={openIssues} accent={openIssues > 0 ? "red" : undefined} />
        <SummaryCard label="In Progress" value={inProgress} accent={inProgress > 0 ? "amber" : undefined} />
        <SummaryCard label="Needing Follow-up" value={needingFollowUp} accent={needingFollowUp > 0 ? "red" : undefined} />
        <SummaryCard label="Resolved This Week" value={resolvedThisWeek} accent={resolvedThisWeek > 0 ? "green" : undefined} />
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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Status</option>
          {ISSUE_STATUSES.map((s) => (
            <option key={s} value={s}>{formatStatus(s)}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Types</option>
          {ISSUE_TYPES.map((t) => (
            <option key={t} value={t}>{formatType(t)}</option>
          ))}
        </select>
        {(search || statusFilter || typeFilter) && (
          <button
            onClick={() => { setSearch(""); setStatusFilter(""); setTypeFilter(""); }}
            className="text-xs text-gray-400 hover:text-gray-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">No issues found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Follow-up</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {filtered.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  isExpanded={expandedId === issue.id}
                  onToggle={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
                  onStatusChange={(s) => updateStatus(issue.id, s)}
                  onDelete={() => handleDelete(issue.id)}
                  onFieldUpdated={() => { setToast({ message: "Field updated", type: "success" }); fetchIssues(); }}
                  profiles={profiles}
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Issue</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Order *</label>
                <select
                  required
                  value={form.order_id}
                  onChange={(e) => setForm((f) => ({ ...f, order_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Select an order...</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number}{o.customer_name ? ` — ${o.customer_name}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Issue Type *</label>
                <select
                  required
                  value={form.issue_type}
                  onChange={(e) => setForm((f) => ({ ...f, issue_type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {ISSUE_TYPES.map((t) => (
                    <option key={t} value={t}>{formatType(t)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the issue..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes After Call</label>
                <textarea
                  rows={2}
                  value={form.notes_after_call}
                  onChange={(e) => setForm((f) => ({ ...f, notes_after_call: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Agent Remarks</label>
                <textarea
                  rows={2}
                  value={form.agent_remarks}
                  onChange={(e) => setForm((f) => ({ ...f, agent_remarks: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Summary</label>
                <input
                  type="text"
                  value={form.summary}
                  onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Follow-up Owner</label>
                  <select
                    value={form.follow_up_owner}
                    onChange={(e) => setForm((f) => ({ ...f, follow_up_owner: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Unassigned</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>{profileName(p)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Follow-up Date</label>
                  <input
                    type="date"
                    value={form.follow_up_date}
                    onChange={(e) => setForm((f) => ({ ...f, follow_up_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
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
                  {saving ? "Saving..." : "Create Issue"}
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

/* ─── Issue Row ────────────────────────────────────────────── */

function IssueRow({
  issue,
  isExpanded,
  onToggle,
  onStatusChange,
  onDelete,
  onFieldUpdated,
  profiles,
}: {
  issue: Issue;
  isExpanded: boolean;
  onToggle: () => void;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
  onFieldUpdated: () => void;
  profiles: Profile[];
}) {
  /* ─── Inline field update ───────────────────────────────── */
  async function updateField(field: string, value: string | null) {
    await fetch("/api/operations/issues", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: issue.id, [field]: value }),
    });
    onFieldUpdated();
  }

  const followUpOverdue =
    issue.follow_up_date &&
    issue.status !== "resolved" &&
    issue.status !== "cancelled" &&
    (() => {
      try {
        return !isAfter(parseISO(issue.follow_up_date), startOfDay(new Date()));
      } catch {
        return false;
      }
    })();

  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
          {issue.order?.order_number ?? "\u2014"}
        </td>
        <td className="px-4 py-3 text-gray-700">
          {issue.order?.customer_name || <span className="text-gray-300">{"\u2014"}</span>}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ISSUE_TYPE_BADGE[issue.issue_type] ?? "bg-gray-100 text-gray-500"}`}>
            {formatType(issue.issue_type)}
          </span>
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <select
            value={issue.status}
            onChange={(e) => onStatusChange(e.target.value)}
            className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:ring-2 focus:ring-gray-900 ${STATUS_BADGE[issue.status] ?? "bg-gray-100 text-gray-500"}`}
          >
            {ISSUE_STATUSES.map((s) => (
              <option key={s} value={s}>{formatStatus(s)}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate">
          {issue.description || "\u2014"}
        </td>
        <td className="px-4 py-3 text-xs">
          {issue.follow_up_date ? (
            <span className={followUpOverdue ? "text-red-500 font-medium" : "text-gray-600"}>
              {format(parseISO(issue.follow_up_date), "d MMM yyyy")}
            </span>
          ) : (
            <span className="text-gray-300">{"\u2014"}</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-gray-600">
          {profileName(issue.follow_up_owner_profile)}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400">
          {format(parseISO(issue.created_at), "d MMM yyyy")}
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

      {/* Expanded Detail */}
      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-gray-50 px-6 py-4 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left column */}
              <div className="space-y-3">
                <DetailField label="Description" value={issue.description} />
                <DetailField label="Notes After Call" value={issue.notes_after_call} />
                <DetailField label="Agent Remarks" value={issue.agent_remarks} />
              </div>

              {/* Right column */}
              <div className="space-y-3">
                <DetailField label="Summary" value={issue.summary} />
                <DetailField label="Resolution" value={issue.resolution} />

                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase mb-1">Follow-up Owner</p>
                  <select
                    value={issue.follow_up_owner ?? ""}
                    onChange={(e) => updateField("follow_up_owner", e.target.value || null)}
                    onClick={(e) => e.stopPropagation()}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-full focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Unassigned</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>{profileName(p)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase mb-1">Follow-up Date</p>
                  <input
                    type="date"
                    value={issue.follow_up_date ?? ""}
                    onChange={(e) => updateField("follow_up_date", e.target.value || null)}
                    onClick={(e) => e.stopPropagation()}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-full focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>

                <div className="flex items-center gap-4 pt-1">
                  <p className="text-[10px] text-gray-400">
                    Created by {profileName(issue.created_by_profile)} on {format(parseISO(issue.created_at), "d MMM yyyy, h:mm a")}
                  </p>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Detail Field ─────────────────────────────────────────── */

function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-400 uppercase mb-0.5">{label}</p>
      <p className="text-xs text-gray-700 whitespace-pre-wrap">
        {value || <span className="text-gray-300">{"\u2014"}</span>}
      </p>
    </div>
  );
}
