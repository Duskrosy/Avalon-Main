"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format, parseISO } from "date-fns";
import { PeoplePicker } from "@/components/ui/people-picker";

type LocalAttachment = { file: File; preview?: string };

const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain", "text/csv",
];
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

type Assignee = { id: string; first_name: string; last_name: string; avatar_url?: string | null };

type Request = {
  id: string;
  title: string;
  brief: string | null;
  status: string;
  target_date: string | null;
  notes: string | null;
  created_at: string;
  requester: { id: string; first_name: string; last_name: string } | null;
  assignee: Assignee | null;       // lead assignee hint
  assignees: Assignee[];            // full multi-assignee list from junction table
  kanban_card?: { id: string; col: { name: string } | null } | null;
};

type RemoteAttachment = {
  id: string;
  path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  url: string | null;
};

type Member = { id: string; first_name: string; last_name: string; avatar_url?: string | null };

type Props = {
  members: Member[];         // creatives dept members for assignee dropdown
  currentUserId: string;
  canManage: boolean;        // manager+ can assign and delete
  isCreativesDept?: boolean; // true when user belongs to creatives dept
  isOps?: boolean;           // true when user is OPS tier
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
  submitted:   [{ label: "Accept → In Progress", next: "in_progress", style: "bg-amber-400 text-white hover:bg-amber-600" }],
  in_progress: [{ label: "Send for Review", next: "review", style: "bg-purple-600 text-white hover:bg-purple-700" }],
  review:      [
    { label: "Mark Approved", next: "approved",    style: "bg-[var(--color-success)] text-white hover:bg-green-700" },
    { label: "Needs Revision", next: "in_progress", style: "bg-[var(--color-warning-light)] text-[var(--color-warning-text)] hover:bg-amber-200" },
  ],
};

// Fulfillment can deny while the request is still open.
const DENIABLE_STATUSES = new Set(["submitted", "in_progress", "review"]);

// Requester can edit/delete only before fulfillment starts.
const REQUESTER_EDITABLE = new Set(["draft", "submitted", "cancelled", "rejected"]);

function nextTransition(status: string) {
  const list = FULFILLMENT_TRANSITIONS[status] ?? [];
  return list[0] ?? null;
}

export function CreativesRequestsView({ members, currentUserId, canManage, isCreativesDept = false, isOps = false }: Props) {
  const isFulfillmentView = isCreativesDept || isOps;

  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("submitted");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [assigningInModal, setAssigningInModal] = useState(false);
  const [attachmentsByRequest, setAttachmentsByRequest] = useState<Record<string, RemoteAttachment[]>>({});
  const [editing, setEditing] = useState<Request | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Submit form state (non-creatives only)
  const [formTitle, setFormTitle] = useState("");
  const [formBrief, setFormBrief] = useState("");
  const [formTargetDate, setFormTargetDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [localAttachments, setLocalAttachments] = useState<LocalAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function revokeLocalPreviews(list: LocalAttachment[]) {
    for (const a of list) if (a.preview) URL.revokeObjectURL(a.preview);
  }

  function addFiles(files: File[]) {
    setAttachError(null);
    const space = MAX_FILES - localAttachments.length;
    if (space <= 0) {
      setAttachError(`Maximum ${MAX_FILES} files.`);
      return;
    }
    const next: LocalAttachment[] = [];
    for (const f of files.slice(0, space)) {
      if (!ALLOWED_MIME.includes(f.type)) {
        setAttachError(`Unsupported file type: ${f.type || "unknown"}`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setAttachError(`File too large: ${f.name} (max 10 MB)`);
        continue;
      }
      const preview = f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined;
      next.push({ file: f, preview });
    }
    if (next.length > 0) setLocalAttachments((prev) => [...prev, ...next]);
  }

  function removeLocalAttachment(index: number) {
    setLocalAttachments((prev) => {
      const target = prev[index];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function uploadLocalAttachments(requestId: string, files: LocalAttachment[]): Promise<boolean> {
    if (files.length === 0) return true;
    const fd = new FormData();
    for (const a of files) fd.append("files", a.file);
    const res = await fetch(`/api/ad-ops/requests/${requestId}/attachments`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAttachError(typeof data.error === "string" ? data.error : "Attachment upload failed");
      return false;
    }
    return true;
  }

  async function removeRemoteAttachment(requestId: string, attachmentId: string) {
    const res = await fetch(`/api/ad-ops/requests/${requestId}/attachments?attachment_id=${attachmentId}`, { method: "DELETE" });
    if (res.ok) {
      setAttachmentsByRequest((prev) => ({
        ...prev,
        [requestId]: (prev[requestId] ?? []).filter((a) => a.id !== attachmentId),
      }));
    }
  }

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/ad-ops/requests?${params}`);
    if (res.ok) {
      const all: Request[] = await res.json();

      if (isFulfillmentView) {
        const memberIds = new Set(members.map((m) => m.id));
        const assigneesOf = (r: Request) => (r.assignees ?? []);
        const filtered = canManage
          ? all.filter((r) => assigneesOf(r).length === 0 || assigneesOf(r).some((a) => memberIds.has(a.id)))
          : all.filter((r) => assigneesOf(r).some((a) => a.id === currentUserId));
        setRequests(filtered);
      } else {
        setRequests(all.filter((r) => r.requester?.id === currentUserId));
      }
    }
    setLoading(false);
  }, [statusFilter, members, canManage, currentUserId, isFulfillmentView]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  async function loadAttachments(requestId: string) {
    if (attachmentsByRequest[requestId]) return;
    const res = await fetch(`/api/ad-ops/requests/${requestId}/attachments`);
    if (res.ok) {
      const data = await res.json();
      setAttachmentsByRequest((prev) => ({ ...prev, [requestId]: data.attachments ?? [] }));
    }
  }

  // Preload attachment previews for every visible request (so the row thumbnail renders)
  useEffect(() => {
    const missing = requests.map((r) => r.id).filter((id) => !(id in attachmentsByRequest));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      await Promise.all(missing.map(async (id) => {
        const res = await fetch(`/api/ad-ops/requests/${id}/attachments`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setAttachmentsByRequest((prev) => ({ ...prev, [id]: data.attachments ?? [] }));
      }));
    })();
    return () => { cancelled = true; };
  }, [requests, attachmentsByRequest]);

  async function updateStatus(id: string, status: string) {
    const snapshot = requests;
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    const res = await fetch(`/api/ad-ops/requests?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setRequests(snapshot);
      alert("Could not update status. Please try again.");
      return;
    }
    await fetchRequests();
  }

  async function reassign(id: string, assigneeIds: string[]) {
    const snapshot = requests;
    const nextAssignees = assigneeIds
      .map((uid) => members.find((m) => m.id === uid))
      .filter((m): m is Member => Boolean(m))
      .map((m) => ({
        id: m.id,
        first_name: m.first_name,
        last_name: m.last_name,
        avatar_url: m.avatar_url ?? null,
      }));
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, assignees: nextAssignees, assignee: nextAssignees[0] ?? null }
          : r,
      ),
    );
    const res = await fetch(`/api/ad-ops/requests?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee_ids: assigneeIds }),
    });
    if (!res.ok) {
      setRequests(snapshot);
      alert("Could not reassign. Please try again.");
      return;
    }
    await fetchRequests();
  }

  async function denyRequest(id: string) {
    if (!confirm("Deny this request? The requester will see it as rejected.")) return;
    setActionLoading(id);
    await updateStatus(id, "rejected");
    setActionLoading(null);
    setDetailId(null);
  }

  async function deleteRequest(id: string) {
    if (!confirm("Delete this request permanently? This cannot be undone.")) return;
    setActionLoading(id);
    const res = await fetch(`/api/ad-ops/requests?id=${id}`, { method: "DELETE" });
    setActionLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(typeof data.error === "string" ? data.error : "Failed to delete request.");
      return;
    }
    setDetailId(null);
    setEditing(null);
    await fetchRequests();
  }

  async function saveEdit(id: string, patch: { title: string; brief: string | null; target_date: string | null }) {
    const res = await fetch(`/api/ad-ops/requests?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(typeof data.error === "string" ? data.error : "Failed to save edit.");
      return;
    }
    setEditing(null);
    await fetchRequests();
  }

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    const res = await fetch("/api/ad-ops/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formTitle.trim(),
        brief: formBrief.trim() || null,
        target_date: formTargetDate || null,
      }),
    });

    if (res.ok) {
      const created = await res.json().catch(() => null);
      if (created?.id && localAttachments.length > 0) {
        const ok = await uploadLocalAttachments(created.id, localAttachments);
        if (!ok) { setSubmitting(false); return; }
      }
      revokeLocalPreviews(localAttachments);
      setLocalAttachments([]);
      setAttachError(null);
      setFormTitle("");
      setFormBrief("");
      setFormTargetDate("");
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
      await fetchRequests();
    } else {
      const json = await res.json().catch(() => ({}));
      setSubmitError(json.error ?? "Failed to submit request.");
    }
    setSubmitting(false);
  }

  const STATUS_FILTERS = [
    { value: "submitted",   label: "Submitted" },
    { value: "in_progress", label: "In Progress" },
    { value: "review",      label: "In Review" },
    { value: "approved",    label: "Approved" },
    { value: "",            label: "All" },
  ];

  const detailRequest = detailId ? requests.find((r) => r.id === detailId) ?? null : null;

  function openDetail(id: string) {
    setDetailId(id);
    setAssigningInModal(false);
    loadAttachments(id);
  }

  function closeDetail() {
    setDetailId(null);
    setAssigningInModal(false);
  }

  return (
    <div>
      {/* Page heading */}
      <div className="mb-6">
        {isFulfillmentView ? (
          <>
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Submitted Creative Requests</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              Fulfillment queue — creative requests assigned to your team
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Request for Creatives</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              Submit a request to the creatives team and track its progress
            </p>
          </>
        )}
      </div>

      {/* Submit form — non-creatives only */}
      {!isFulfillmentView && (
        <form
          onSubmit={handleSubmitRequest}
          className="mb-8 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5 space-y-4"
        >
          <p className="text-sm font-medium text-[var(--color-text-primary)]">New Request</p>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Title <span className="text-[var(--color-error)]">*</span>
            </label>
            <input
              type="text"
              required
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g. Banner ads for Q3 campaign"
              className="w-full text-sm px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Brief / Description
            </label>
            <textarea
              rows={3}
              value={formBrief}
              onChange={(e) => setFormBrief(e.target.value)}
              placeholder="Describe what you need, formats, dimensions, any references…"
              className="w-full text-sm px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Target Date
            </label>
            <input
              type="date"
              value={formTargetDate}
              onChange={(e) => setFormTargetDate(e.target.value)}
              className="text-sm px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                Attachments <span className="text-[var(--color-text-tertiary)]">
                  ({localAttachments.length}/{MAX_FILES}) · max 10 MB each
                </span>
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={localAttachments.length >= MAX_FILES}
                className="text-[11px] text-[var(--color-accent)] hover:underline disabled:text-[var(--color-text-tertiary)] disabled:no-underline disabled:cursor-not-allowed"
              >
                + Attach file
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_MIME.join(",")}
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                addFiles(files);
                e.target.value = "";
              }}
            />
            {localAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {localAttachments.map((la, i) => (
                  <LocalAttachmentChip key={i} la={la} onRemove={() => removeLocalAttachment(i)} />
                ))}
              </div>
            )}
            {attachError && <p className="text-xs text-[var(--color-error)] mt-1">{attachError}</p>}
          </div>

          {submitError && (
            <p className="text-xs text-[var(--color-error)]">{submitError}</p>
          )}
          {submitSuccess && (
            <p className="text-xs text-[var(--color-success)]">Request submitted successfully.</p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !formTitle.trim()}
              className="text-sm px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </form>
      )}

      {!isFulfillmentView && (
        <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">Your Requests</p>
      )}

      <div className="flex items-center gap-1 mb-5 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              statusFilter === f.value
                ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] border-[var(--color-text-primary)]"
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
              : isFulfillmentView
                ? "No requests assigned to the Creatives team."
                : "You haven't submitted any requests yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => {
            const attachments = attachmentsByRequest[r.id] ?? [];
            const firstImage = attachments.find((a) => a.mime_type?.startsWith("image/"));
            const transition = nextTransition(r.status);
            return (
              <div
                key={r.id}
                className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden hover:bg-[var(--color-surface-hover)] cursor-pointer"
                onClick={() => openDetail(r.id)}
              >
                <div className="px-4 py-3 flex items-center gap-3">
                  {/* Thumbnail (or placeholder) */}
                  {firstImage?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={firstImage.url}
                      alt=""
                      className="w-12 h-12 rounded-md object-cover border border-[var(--color-border-primary)] shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-md bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] shrink-0 flex items-center justify-center text-[10px] text-[var(--color-text-tertiary)]">
                      {attachments.length > 0 ? `${attachments.length}📎` : "—"}
                    </div>
                  )}

                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLES[r.status] ?? ""}`}>
                    {r.status.replace("_", " ")}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--color-text-primary)] truncate">{r.title}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 truncate">
                      {isFulfillmentView && (
                        <>
                          From: {r.requester ? `${r.requester.first_name} ${r.requester.last_name}` : "Unknown"}
                          {r.assignees && r.assignees.length > 0
                            ? ` · Assigned to ${r.assignees.map((a) => `${a.first_name} ${a.last_name}`).join(", ")}`
                            : " · Unassigned"}
                        </>
                      )}
                      {r.target_date ? `${isFulfillmentView ? " · " : ""}due ${format(parseISO(r.target_date), "d MMM")}` : ""}
                    </p>
                    {!isFulfillmentView && r.kanban_card?.col?.name && (
                      <span className="inline-flex mt-1 text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">
                        Stage: {r.kanban_card.col.name}
                      </span>
                    )}
                  </div>

                  {/* Edge actions — fulfillment only, visible on the row */}
                  {isFulfillmentView && (
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {transition && (
                        <button
                          onClick={() => updateStatus(r.id, transition.next)}
                          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${transition.style}`}
                        >
                          Move Next
                        </button>
                      )}
                      {DENIABLE_STATUSES.has(r.status) && canManage && (
                        <button
                          onClick={() => denyRequest(r.id)}
                          disabled={actionLoading === r.id}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-colors disabled:opacity-50"
                        >
                          Deny
                        </button>
                      )}
                      {canManage && (
                        <button
                          onClick={() => openDetail(r.id)}
                          className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg"
                        >
                          {(r.assignees ?? []).length > 0 ? "Reassign" : "Assign"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Edge actions — requester view */}
                  {!isFulfillmentView && REQUESTER_EDITABLE.has(r.status) && (
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEditing(r)}
                        className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteRequest(r.id)}
                        disabled={actionLoading === r.id}
                        className="text-xs border border-red-200 text-[var(--color-error)] hover:bg-[var(--color-error-light)] px-3 py-1.5 rounded-lg disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}

                  <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">
                    {format(parseISO(r.created_at), "d MMM")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {detailRequest && (
        <RequestDetailModal
          request={detailRequest}
          attachments={attachmentsByRequest[detailRequest.id] ?? []}
          members={members}
          canManage={canManage}
          isFulfillmentView={isFulfillmentView}
          assigning={assigningInModal}
          onStartAssign={() => setAssigningInModal(true)}
          onStopAssign={() => setAssigningInModal(false)}
          onUpdateStatus={(status) => updateStatus(detailRequest.id, status)}
          onDeny={() => denyRequest(detailRequest.id)}
          onReassign={(ids) => reassign(detailRequest.id, ids)}
          onClose={closeDetail}
        />
      )}

      {/* Edit modal — requester view */}
      {editing && (
        <EditRequestModal
          request={editing}
          remoteAttachments={attachmentsByRequest[editing.id] ?? []}
          onSave={(patch) => saveEdit(editing.id, patch)}
          onDelete={() => deleteRequest(editing.id)}
          onUploadAttachments={(files) => uploadLocalAttachments(editing.id, files)}
          onRemoveRemoteAttachment={(attachmentId) => removeRemoteAttachment(editing.id, attachmentId)}
          onReloadAttachments={async () => {
            const res = await fetch(`/api/ad-ops/requests/${editing.id}/attachments`);
            if (res.ok) {
              const data = await res.json();
              setAttachmentsByRequest((prev) => ({ ...prev, [editing.id]: data.attachments ?? [] }));
            }
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RequestDetailModal({
  request: r,
  attachments,
  members,
  canManage,
  isFulfillmentView,
  assigning,
  onStartAssign,
  onStopAssign,
  onUpdateStatus,
  onDeny,
  onReassign,
  onClose,
}: {
  request: Request;
  attachments: RemoteAttachment[];
  members: Member[];
  canManage: boolean;
  isFulfillmentView: boolean;
  assigning: boolean;
  onStartAssign: () => void;
  onStopAssign: () => void;
  onUpdateStatus: (status: string) => void;
  onDeny: () => void;
  onReassign: (ids: string[]) => void;
  onClose: () => void;
}) {
  const transitions = FULFILLMENT_TRANSITIONS[r.status] ?? [];
  const moveNext = transitions[0] ?? null;
  const imageAttachments = attachments.filter((a) => a.mime_type?.startsWith("image/"));
  const fileAttachments = attachments.filter((a) => !a.mime_type?.startsWith("image/"));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-[var(--color-bg-primary)] rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[var(--color-bg-primary)] border-b border-[var(--color-border-secondary)] px-6 py-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status] ?? ""}`}>
                {r.status.replace("_", " ")}
              </span>
              <span className="text-[11px] text-[var(--color-text-tertiary)]">
                Created {format(parseISO(r.created_at), "d MMM yyyy")}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] truncate">{r.title}</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              From: {r.requester ? `${r.requester.first_name} ${r.requester.last_name}` : "Unknown"}
              {r.target_date ? ` · due ${format(parseISO(r.target_date), "d MMM yyyy")}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {r.brief && (
            <div>
              <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Brief</p>
              <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">{r.brief}</p>
            </div>
          )}

          {r.notes && (
            <div>
              <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Notes</p>
              <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">{r.notes}</p>
            </div>
          )}

          {imageAttachments.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                Images ({imageAttachments.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {imageAttachments.map((a) => (
                  a.url ? (
                    <a
                      key={a.id}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block aspect-square rounded-md border border-[var(--color-border-primary)] overflow-hidden hover:ring-2 hover:ring-[var(--color-accent)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.url} alt={a.file_name ?? ""} className="h-full w-full object-cover" />
                    </a>
                  ) : (
                    <div key={a.id} className="aspect-square rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)] flex items-center justify-center text-[10px] text-[var(--color-text-tertiary)]">
                      image
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {fileAttachments.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">Files</p>
              <div className="flex flex-wrap gap-2">
                {fileAttachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-surface-hover)] max-w-[260px]"
                  >
                    <span className="truncate">{a.file_name ?? a.path.split("/").pop()}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {isFulfillmentView && (
            <div className="pt-4 border-t border-[var(--color-border-secondary)] space-y-3">
              <p className="text-xs font-medium text-[var(--color-text-secondary)]">Actions</p>

              <div className="flex flex-wrap items-center gap-2">
                {transitions.map((t) => (
                  <button
                    key={t.next}
                    onClick={() => onUpdateStatus(t.next)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${t.style}`}
                  >
                    {t === moveNext ? `Move Next — ${t.label}` : t.label}
                  </button>
                ))}
                {DENIABLE_STATUSES.has(r.status) && (
                  <button
                    onClick={onDeny}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-colors"
                  >
                    Deny
                  </button>
                )}
                {transitions.length === 0 && !DENIABLE_STATUSES.has(r.status) && (
                  <p className="text-xs text-[var(--color-text-tertiary)] italic">No transitions available from this status.</p>
                )}
              </div>

              {canManage && (
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Assignees</p>
                  {assigning ? (
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <PeoplePicker
                          value={(r.assignees ?? []).map((a) => a.id)}
                          onChange={(ids) => { onReassign(ids); }}
                          allUsers={members}
                          placeholder="Add assignees…"
                        />
                      </div>
                      <button
                        onClick={onStopAssign}
                        className="text-xs text-[var(--color-text-tertiary)] px-2 py-2 hover:text-[var(--color-text-primary)]"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-[var(--color-text-primary)]">
                        {(r.assignees ?? []).length > 0
                          ? (r.assignees ?? []).map((a) => `${a.first_name} ${a.last_name}`).join(", ")
                          : <span className="text-[var(--color-text-tertiary)]">Unassigned</span>}
                      </span>
                      <button
                        onClick={onStartAssign}
                        className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg"
                      >
                        {(r.assignees ?? []).length > 0 ? "Edit assignees" : "Assign"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditRequestModal({
  request: r,
  remoteAttachments,
  onSave,
  onDelete,
  onUploadAttachments,
  onRemoveRemoteAttachment,
  onReloadAttachments,
  onClose,
}: {
  request: Request;
  remoteAttachments: RemoteAttachment[];
  onSave: (patch: { title: string; brief: string | null; target_date: string | null }) => Promise<void> | void;
  onDelete: () => void;
  onUploadAttachments: (files: LocalAttachment[]) => Promise<boolean>;
  onRemoveRemoteAttachment: (attachmentId: string) => Promise<void>;
  onReloadAttachments: () => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(r.title);
  const [brief, setBrief] = useState(r.brief ?? "");
  const [targetDate, setTargetDate] = useState(r.target_date ?? "");
  const [saving, setSaving] = useState(false);
  const [localAttachments, setLocalAttachments] = useState<LocalAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: File[]) {
    setAttachError(null);
    const totalExisting = remoteAttachments.length + localAttachments.length;
    const space = MAX_FILES - totalExisting;
    if (space <= 0) {
      setAttachError(`Maximum ${MAX_FILES} files.`);
      return;
    }
    const next: LocalAttachment[] = [];
    for (const f of files.slice(0, space)) {
      if (!ALLOWED_MIME.includes(f.type)) {
        setAttachError(`Unsupported file type: ${f.type || "unknown"}`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setAttachError(`File too large: ${f.name} (max 10 MB)`);
        continue;
      }
      const preview = f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined;
      next.push({ file: f, preview });
    }
    if (next.length > 0) setLocalAttachments((prev) => [...prev, ...next]);
  }

  function removeLocal(index: number) {
    setLocalAttachments((prev) => {
      const target = prev[index];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    if (localAttachments.length > 0) {
      const ok = await onUploadAttachments(localAttachments);
      if (!ok) { setSaving(false); return; }
      for (const a of localAttachments) if (a.preview) URL.revokeObjectURL(a.preview);
      setLocalAttachments([]);
      await onReloadAttachments();
    }
    await onSave({
      title: title.trim(),
      brief: brief.trim() || null,
      target_date: targetDate || null,
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-[var(--color-bg-primary)] rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Edit Request</h2>

        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Brief</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Target Date</label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Attachments <span className="text-[var(--color-text-tertiary)]">
                ({remoteAttachments.length + localAttachments.length}/{MAX_FILES}) · max 10 MB each
              </span>
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={remoteAttachments.length + localAttachments.length >= MAX_FILES}
              className="text-[11px] text-[var(--color-accent)] hover:underline disabled:text-[var(--color-text-tertiary)] disabled:no-underline disabled:cursor-not-allowed"
            >
              + Attach file
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_MIME.join(",")}
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              addFiles(files);
              e.target.value = "";
            }}
          />
          {(remoteAttachments.length + localAttachments.length) > 0 && (
            <div className="flex flex-wrap gap-2">
              {remoteAttachments.map((a) => (
                <AttachmentChip key={a.id} a={a} onRemove={() => onRemoveRemoteAttachment(a.id)} />
              ))}
              {localAttachments.map((la, i) => (
                <LocalAttachmentChip key={i} la={la} onRemove={() => removeLocal(i)} />
              ))}
            </div>
          )}
          {attachError && <p className="text-xs text-[var(--color-error)] mt-1">{attachError}</p>}
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onDelete}
            className="text-sm px-4 py-2 rounded-lg border border-red-200 text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-colors"
          >
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={saving || !title.trim()}
              onClick={handleSave}
              className="text-sm px-4 py-2 rounded-lg bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] hover:bg-[var(--color-text-secondary)] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttachmentChip({ a, onRemove }: { a: RemoteAttachment; onRemove?: () => void }) {
  const isImage = a.mime_type?.startsWith("image/");
  const label = a.file_name ?? a.path.split("/").pop() ?? "file";
  return (
    <div className="relative group">
      {isImage && a.url ? (
        <a
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="block w-20 h-20 rounded border border-[var(--color-border-primary)] overflow-hidden hover:ring-2 hover:ring-[var(--color-accent)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.url} alt={label} className="h-full w-full object-cover" />
        </a>
      ) : (
        <a
          href={a.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-surface-hover)] max-w-[200px]"
        >
          <span className="truncate">{label}</span>
        </a>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-1 -right-1 rounded-full bg-black/70 text-white w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </div>
  );
}

function LocalAttachmentChip({ la, onRemove }: { la: LocalAttachment; onRemove: () => void }) {
  const isImage = la.file.type.startsWith("image/");
  return (
    <div className="relative group">
      {isImage && la.preview ? (
        <div className="w-20 h-20 rounded border border-[var(--color-border-primary)] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={la.preview} alt={la.file.name} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] max-w-[200px]">
          <span className="truncate">{la.file.name}</span>
        </div>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute -top-1 -right-1 rounded-full bg-black/70 text-white w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Remove"
      >
        ×
      </button>
    </div>
  );
}
