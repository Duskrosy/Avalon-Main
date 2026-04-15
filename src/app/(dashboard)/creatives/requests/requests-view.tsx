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
  requester: { first_name: string; last_name: string } | null;
  assignee: { id: string; first_name: string; last_name: string } | null;
};

type Member = { id: string; first_name: string; last_name: string };

type Props = {
  members: Member[];         // creatives dept members for assignee dropdown
  currentUserId: string;
  canManage: boolean;        // manager+ can assign and delete
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

// Transitions available from the fulfillment side
const FULFILLMENT_TRANSITIONS: Record<string, { label: string; next: string; style: string }[]> = {
  submitted:   [{ label: "Accept →  In Progress", next: "in_progress", style: "bg-[var(--color-warning-light)]0 text-white hover:bg-amber-600" }],
  in_progress: [{ label: "Send for Review", next: "review", style: "bg-purple-600 text-white hover:bg-purple-700" }],
  review:      [
    { label: "Mark Approved", next: "approved",    style: "bg-[var(--color-success)] text-white hover:bg-green-700" },
    { label: "Needs Revision", next: "in_progress", style: "bg-[var(--color-warning-light)] text-[var(--color-warning-text)] hover:bg-amber-200" },
  ],
};

export function CreativesRequestsView({ members, currentUserId, canManage }: Props) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("submitted");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null); // request id being reassigned

  // Load requests assigned to the creatives team member IDs
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/ad-ops/requests?${params}`);
    if (res.ok) {
      const all: Request[] = await res.json();
      // Client-side filter: only show requests assigned to a creatives member
      const memberIds = new Set(members.map((m) => m.id));
      // OPS / manager: show all; otherwise: show own
      const filtered = canManage
        ? all.filter((r) => !r.assignee || memberIds.has(r.assignee.id))
        : all.filter((r) => r.assignee?.id === currentUserId);
      setRequests(filtered);
    }
    setLoading(false);
  }, [statusFilter, members, canManage, currentUserId]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/ad-ops/requests?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchRequests();
  }

  async function reassign(id: string, assigneeId: string) {
    await fetch(`/api/ad-ops/requests?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee_id: assigneeId || null }),
    });
    setAssigning(null);
    await fetchRequests();
  }

  const STATUS_FILTERS = [
    { value: "submitted",   label: "Submitted" },
    { value: "in_progress", label: "In Progress" },
    { value: "review",      label: "In Review" },
    { value: "approved",    label: "Approved" },
    { value: "",            label: "All" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Requests</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Fulfillment queue — creative requests assigned to your team
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 mb-5 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              statusFilter === f.value
                ? "bg-[var(--color-text-primary)] text-white border-[var(--color-text-primary)]"
                : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)] hover:border-[var(--color-border-primary)]"
            }`}
          >
            {f.label}
          </button>
        ))}
        {!loading && (
          <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">
            {requests.length} request{requests.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">
            {statusFilter
              ? `No ${statusFilter.replace("_", " ")} requests.`
              : "No requests assigned to the Creatives team."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
              {/* Row header */}
              <div
                className="px-5 py-4 flex items-start gap-3 cursor-pointer hover:bg-[var(--color-surface-hover)]"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${STATUS_STYLES[r.status] ?? ""}`}>
                  {r.status.replace("_", " ")}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--color-text-primary)]">{r.title}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                    From: {r.requester ? `${r.requester.first_name} ${r.requester.last_name}` : "Unknown"}
                    {r.assignee
                      ? ` · Assigned to ${r.assignee.first_name} ${r.assignee.last_name}`
                      : " · Unassigned"}
                    {r.target_date ? ` · due ${format(parseISO(r.target_date), "d MMM")}` : ""}
                  </p>
                </div>
                <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">
                  {format(parseISO(r.created_at), "d MMM")}
                </span>
              </div>

              {/* Expanded detail */}
              {expanded === r.id && (
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

                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {/* Fulfillment actions */}
                    {(FULFILLMENT_TRANSITIONS[r.status] ?? []).map((t) => (
                      <button
                        key={t.next}
                        onClick={() => updateStatus(r.id, t.next)}
                        className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${t.style}`}
                      >
                        {t.label}
                      </button>
                    ))}

                    {/* Assign / reassign — managers only */}
                    {canManage && (
                      assigning === r.id ? (
                        <select
                          autoFocus
                          defaultValue={r.assignee?.id ?? ""}
                          onChange={(e) => reassign(r.id, e.target.value)}
                          onBlur={() => setAssigning(null)}
                          className="text-xs border border-[var(--color-border-primary)] rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                        >
                          <option value="">Unassigned</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.first_name} {m.last_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setAssigning(r.id); }}
                          className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg"
                        >
                          {r.assignee ? "Reassign" : "Assign"}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
