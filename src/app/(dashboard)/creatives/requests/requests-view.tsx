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
  draft:       "bg-gray-100 text-gray-500",
  submitted:   "bg-blue-50 text-blue-600",
  in_progress: "bg-amber-50 text-amber-600",
  review:      "bg-purple-50 text-purple-600",
  approved:    "bg-green-50 text-green-700",
  rejected:    "bg-red-50 text-red-500",
  cancelled:   "bg-gray-100 text-gray-400",
};

// Transitions available from the fulfillment side
const FULFILLMENT_TRANSITIONS: Record<string, { label: string; next: string; style: string }[]> = {
  submitted:   [{ label: "Accept →  In Progress", next: "in_progress", style: "bg-amber-500 text-white hover:bg-amber-600" }],
  in_progress: [{ label: "Send for Review", next: "review", style: "bg-purple-600 text-white hover:bg-purple-700" }],
  review:      [
    { label: "Mark Approved", next: "approved",    style: "bg-green-600 text-white hover:bg-green-700" },
    { label: "Needs Revision", next: "in_progress", style: "bg-amber-100 text-amber-700 hover:bg-amber-200" },
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
        <h1 className="text-2xl font-semibold text-gray-900">Requests</h1>
        <p className="text-sm text-gray-500 mt-1">
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
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {f.label}
          </button>
        ))}
        {!loading && (
          <span className="ml-auto text-xs text-gray-400">
            {requests.length} request{requests.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">
            {statusFilter
              ? `No ${statusFilter.replace("_", " ")} requests.`
              : "No requests assigned to the Creatives team."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Row header */}
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
                    From: {r.requester ? `${r.requester.first_name} ${r.requester.last_name}` : "Unknown"}
                    {r.assignee
                      ? ` · Assigned to ${r.assignee.first_name} ${r.assignee.last_name}`
                      : " · Unassigned"}
                    {r.target_date ? ` · due ${format(parseISO(r.target_date), "d MMM")}` : ""}
                  </p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {format(parseISO(r.created_at), "d MMM")}
                </span>
              </div>

              {/* Expanded detail */}
              {expanded === r.id && (
                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 space-y-3">
                  {r.brief && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Brief</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.brief}</p>
                    </div>
                  )}
                  {r.notes && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
                      <p className="text-sm text-gray-600">{r.notes}</p>
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
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
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
                          className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg"
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
