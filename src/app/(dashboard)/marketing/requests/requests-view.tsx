"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format, parseISO } from "date-fns";

type LocalAttachment = { file: File; preview?: string };
type RemoteAttachment = {
  id: string;
  path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  url: string | null;
};

const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain", "text/csv",
];
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

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
  const [localAttachments, setLocalAttachments] = useState<LocalAttachment[]>([]);
  const [remoteAttachments, setRemoteAttachments] = useState<RemoteAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachmentsByRequest, setAttachmentsByRequest] = useState<Record<string, RemoteAttachment[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function revokeLocalPreviews(list: LocalAttachment[]) {
    for (const a of list) if (a.preview) URL.revokeObjectURL(a.preview);
  }

  function openCreate() {
    revokeLocalPreviews(localAttachments);
    setForm(EMPTY_FORM);
    setLocalAttachments([]);
    setRemoteAttachments([]);
    setAttachError(null);
    setModal({ open: true, mode: "create" });
  }

  async function openEdit(r: Request) {
    revokeLocalPreviews(localAttachments);
    setForm({
      title:       r.title,
      brief:       r.brief ?? "",
      notes:       r.notes ?? "",
      target_date: r.target_date ?? "",
    });
    setLocalAttachments([]);
    setAttachError(null);
    setModal({ open: true, mode: "edit", request: r });
    const res = await fetch(`/api/ad-ops/requests/${r.id}/attachments`);
    if (res.ok) {
      const data = await res.json();
      setRemoteAttachments(data.attachments ?? []);
    } else {
      setRemoteAttachments([]);
    }
  }

  function closeModal() {
    revokeLocalPreviews(localAttachments);
    setModal({ open: false, mode: "create" });
    setForm(EMPTY_FORM);
    setLocalAttachments([]);
    setRemoteAttachments([]);
    setAttachError(null);
  }

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

  function removeLocalAttachment(index: number) {
    setLocalAttachments((prev) => {
      const target = prev[index];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function removeRemoteAttachment(requestId: string, attachmentId: string) {
    const res = await fetch(`/api/ad-ops/requests/${requestId}/attachments?attachment_id=${attachmentId}`, { method: "DELETE" });
    if (res.ok) {
      setRemoteAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      setAttachmentsByRequest((prev) => ({
        ...prev,
        [requestId]: (prev[requestId] ?? []).filter((a) => a.id !== attachmentId),
      }));
    }
  }

  async function uploadLocalAttachments(requestId: string): Promise<boolean> {
    if (localAttachments.length === 0) return true;
    const form = new FormData();
    for (const a of localAttachments) form.append("files", a.file);
    const res = await fetch(`/api/ad-ops/requests/${requestId}/attachments`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAttachError(typeof data.error === "string" ? data.error : "Attachment upload failed");
      return false;
    }
    return true;
  }

  async function loadRequestAttachments(requestId: string) {
    if (attachmentsByRequest[requestId]) return;
    const res = await fetch(`/api/ad-ops/requests/${requestId}/attachments`);
    if (res.ok) {
      const data = await res.json();
      setAttachmentsByRequest((prev) => ({ ...prev, [requestId]: data.attachments ?? [] }));
    }
  }

  async function handleSaveDraft() {
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
      const ok = await uploadLocalAttachments(targetId);
      if (!ok) { setSaving(false); return; }
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
      const ok = await uploadLocalAttachments(targetId);
      if (!ok) { setSaving(false); return; }
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
          className="shrink-0 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
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
                ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] border-[var(--color-text-primary)]"
                : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)] hover:border-[var(--color-border-primary)]"
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
                  onClick={() => {
                    const next = isExpanded ? null : r.id;
                    setExpanded(next);
                    if (next) loadRequestAttachments(next);
                  }}
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

                    {(attachmentsByRequest[r.id] ?? []).length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Attachments</p>
                        <div className="flex flex-wrap gap-2">
                          {(attachmentsByRequest[r.id] ?? []).map((a) => (
                            <AttachmentChip key={a.id} a={a} />
                          ))}
                        </div>
                      </div>
                    )}

                    {isDraft && (
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <button
                          disabled={actionLoading === r.id}
                          onClick={(e) => { e.stopPropagation(); submitRequest(r.id); }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] hover:bg-[var(--color-text-secondary)] transition-colors disabled:opacity-50"
                        >
                          Submit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-primary)] transition-colors"
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

            {/* Attachments */}
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
                    <AttachmentChip
                      key={a.id}
                      a={a}
                      onRemove={modal.request ? () => removeRemoteAttachment(modal.request!.id, a.id) : undefined}
                    />
                  ))}
                  {localAttachments.map((la, i) => (
                    <LocalAttachmentChip key={i} la={la} onRemove={() => removeLocalAttachment(i)} />
                  ))}
                </div>
              )}
              {attachError && <p className="text-xs text-[var(--color-error)] mt-1">{attachError}</p>}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={closeModal}
                className="text-sm px-4 py-2 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-primary)] transition-colors"
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
                className="text-sm px-4 py-2 rounded-lg bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] hover:bg-[var(--color-text-secondary)] transition-colors disabled:opacity-50"
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
