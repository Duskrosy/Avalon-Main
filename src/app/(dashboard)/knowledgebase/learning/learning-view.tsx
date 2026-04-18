"use client";

import { useState, useCallback, useEffect, useRef } from "react";

type Dept = { id: string; name: string; slug: string };
type Material = {
  id: string;
  title: string;
  description: string | null;
  material_type: "video" | "pdf" | "presentation" | "document" | "link";
  file_url: string | null;
  external_link: string | null;
  signed_url: string | null;
  sort_order: number;
  created_at: string;
  completed: boolean;
  viewed: boolean;
  viewed_at: string | null;
  view_duration_s: number;
  department: Dept | null;
  created_by_profile: { first_name: string; last_name: string } | null;
};

type Props = {
  materials: Material[];
  departments: Dept[];
  canManage: boolean;
  isOps?: boolean;
  userDeptId?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  pdf: "PDF", video: "Video", presentation: "Presentation", document: "Document", link: "Link",
};

function TypeIcon({ type, className = "w-5 h-5" }: { type: string; className?: string }) {
  const stroke = "currentColor";
  const props = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className };

  switch (type) {
    case "pdf":
      return (
        <svg {...props} className={`${className} text-[var(--color-error)]`}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M9 15v-2h2a1.5 1.5 0 0 1 0 3H9zm0 0v2" />
        </svg>
      );
    case "video":
      return (
        <svg {...props} className={`${className} text-violet-500`}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <polygon points="10 9 15 12 10 15" fill="currentColor" stroke="none" />
        </svg>
      );
    case "presentation":
      return (
        <svg {...props} className={`${className} text-orange-500`}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="12" y1="17" x2="12" y2="21" />
          <line x1="8" y1="21" x2="16" y2="21" />
        </svg>
      );
    case "document":
      return (
        <svg {...props} className={`${className} text-[var(--color-accent)]`}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="12" y2="17" />
        </svg>
      );
    case "link":
      return (
        <svg {...props} className={`${className} text-emerald-500`}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    default:
      return (
        <svg {...props} className={`${className} text-[var(--color-text-tertiary)]`}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
  }
}

const PAGE_SIZE = 20;

// ─── YouTube URL conversion helper ───────────────────────────────────────────
function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
  } catch {
    // not a valid URL — return as-is
  }
  return url;
}

// ─── Material Viewer with view tracking ──────────────────────────────────────
function MaterialViewer({
  material,
  onClose,
  onViewed,
}: {
  material: Material;
  onClose: () => void;
  onViewed: (id: string) => void;
}) {
  const url = material.signed_url ?? material.external_link;
  const viewTracked = useRef(false);
  const startTime = useRef(Date.now());
  const modalRef = useRef<HTMLDivElement>(null);

  // Track view on open
  useEffect(() => {
    if (viewTracked.current || !url) return;
    viewTracked.current = true;
    fetch("/api/learning/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ material_id: material.id }),
    }).then(() => onViewed(material.id)).catch(() => {});
  }, [material.id, url, onViewed]);

  // Track duration on close
  useEffect(() => {
    return () => {
      const duration = Math.round((Date.now() - startTime.current) / 1000);
      if (duration > 3) {
        fetch("/api/learning/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ material_id: material.id, duration_s: duration }),
        }).catch(() => {});
      }
    };
  }, [material.id]);

  // Escape key + focus trap
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    modalRef.current?.focus();
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={modalRef}
      tabIndex={-1}
      className="fixed inset-0 bg-black/80 flex flex-col z-50"
      onClick={onClose}
      role="dialog"
      aria-label={`Viewing: ${material.title}`}
    >
      <div
        className="flex items-center justify-between px-4 py-3 bg-[var(--color-bg-primary)] border-b border-[var(--color-border-primary)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{material.title}</h2>
          {material.department && (
            <p className="text-xs text-[var(--color-text-tertiary)]">{material.department.name}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close viewer"
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-sm px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] hover:bg-[var(--color-surface-hover)]"
        >
          Close
        </button>
      </div>
      <div className="flex-1 overflow-hidden bg-[var(--color-bg-tertiary)]" onClick={(e) => e.stopPropagation()}>
        {!url ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-white text-sm">File unavailable. The link may have expired — try refreshing the page.</p>
          </div>
        ) : material.material_type === "video" ? (
          <div className="flex items-center justify-center h-full p-4">
            <video controls className="max-h-full max-w-full rounded-lg" autoPlay>
              <source src={url} />
            </video>
          </div>
        ) : material.material_type === "link" ? (
          <iframe src={toEmbedUrl(url)} className="w-full h-full border-0" title={material.title} />
        ) : ["presentation", "document"].includes(material.material_type) ? (
          <iframe
            src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
            className="w-full h-full border-0"
            title={material.title}
          />
        ) : (
          <iframe src={url} className="w-full h-full border-0" title={material.title} />
        )}
      </div>
    </div>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────────
export function LearningView({ materials: initial, departments, canManage, isOps = true, userDeptId = null }: Props) {
  const [materials, setMaterials] = useState<Material[]>(initial);
  const [search, setSearch] = useState("");
  // Non-OPS users are locked to their department (or "all" if no dept set)
  const [deptFilter, setDeptFilter] = useState(userDeptId ?? "all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Material | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    title: "", description: "", material_type: "pdf",
    department_id: "", external_link: "", sort_order: "0",
  });
  const [file, setFile] = useState<File | null>(null);

  const filtered = materials.filter((m) => {
    const matchSearch = [m.title, m.description]
      .some((s) => s?.toLowerCase().includes(search.toLowerCase()));
    const matchDept = deptFilter === "all"
      ? true : deptFilter === "global"
      ? m.department === null : m.department?.id === deptFilter;
    const matchType = typeFilter === "all" || m.material_type === typeFilter;
    const matchStatus = statusFilter === "all"
      ? true : statusFilter === "completed"
      ? m.completed : statusFilter === "viewed"
      ? m.viewed && !m.completed : !m.viewed;
    return matchSearch && matchDept && matchType && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, deptFilter, typeFilter, statusFilter]);

  // Keep deptFilter in sync if userDeptId changes (shouldn't happen but guards against it)
  useEffect(() => { setDeptFilter(userDeptId ?? "all"); }, [userDeptId]);

  const handleViewed = useCallback((materialId: string) => {
    setMaterials((ms) => ms.map((m) =>
      m.id === materialId ? { ...m, viewed: true, viewed_at: new Date().toISOString() } : m
    ));
  }, []);

  const toggleComplete = useCallback(async (material: Material) => {
    const next = !material.completed;

    if (next && !material.viewed) {
      setError("You must view this material before marking it complete. Click 'View' first.");
      setTimeout(() => setError(null), 4000);
      return;
    }

    setMaterials((ms) => ms.map((m) => m.id === material.id ? { ...m, completed: next } : m));
    const res = await fetch("/api/learning/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ material_id: material.id, completed: next }),
    });
    if (!res.ok) {
      setMaterials((ms) => ms.map((m) => m.id === material.id ? { ...m, completed: !next } : m));
      const data = await res.json().catch(() => null);
      setError(data?.error || "Failed to update completion status. Please try again.");
      setTimeout(() => setError(null), 4000);
    }
  }, []);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const fd = new FormData();
    fd.append("title", form.title);
    if (form.description) fd.append("description", form.description);
    fd.append("material_type", form.material_type);
    if (form.department_id) fd.append("department_id", form.department_id);
    if (form.external_link) fd.append("external_link", form.external_link);
    fd.append("sort_order", form.sort_order);
    if (file) fd.append("file", file);

    const res = await fetch("/api/learning", { method: "POST", body: fd });
    if (res.ok) {
      const refreshed = await fetch("/api/learning");
      setMaterials(await refreshed.json());
      setShowCreate(false);
      setForm({ title: "", description: "", material_type: "pdf", department_id: "", external_link: "", sort_order: "0" });
      setFile(null);
      setError(null);
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error || "Failed to create material. Please try again.");
    }
    setCreating(false);
  }, [form, file]);

  const handleDelete = useCallback(async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    const res = await fetch(`/api/learning/${id}`, { method: "DELETE" });
    if (res.ok) setMaterials((ms) => ms.filter((m) => m.id !== id));
  }, []);

  const completedCount = materials.filter((m) => m.completed).length;
  const viewedCount = materials.filter((m) => m.viewed).length;
  const progress = materials.length > 0 ? Math.round((completedCount / materials.length) * 100) : 0;
  const defaultDept = userDeptId ?? "all";
  const hasFilters = search || deptFilter !== defaultDept || typeFilter !== "all" || statusFilter !== "all";

  return (
    <div>
      {selected && (
        <MaterialViewer
          material={selected}
          onClose={() => setSelected(null)}
          onViewed={handleViewed}
        />
      )}

      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Learning Materials</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {completedCount}/{materials.length} completed
            {materials.length > 0 && (
              <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">({progress}%)</span>
            )}
            <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">{viewedCount} viewed</span>
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
          >
            + Add Material
          </button>
        )}
      </div>

      {/* Overall progress bar */}
      {materials.length > 0 && (
        <div className="h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-[var(--color-success)] rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search materials..."
          aria-label="Search materials"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <select
          value={statusFilter}
          aria-label="Filter by status"
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="all">All statuses</option>
          <option value="not_viewed">Not viewed</option>
          <option value="viewed">Viewed (incomplete)</option>
          <option value="completed">Completed</option>
        </select>
        <select
          value={typeFilter}
          aria-label="Filter by type"
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="all">All types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {isOps && (
          <select
            value={deptFilter}
            aria-label="Filter by department"
            onChange={(e) => setDeptFilter(e.target.value)}
            className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="all">All departments</option>
            <option value="global">Global</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Error toast */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-[var(--radius-lg)] bg-[var(--color-error-light)] border border-red-200 text-sm text-[var(--color-error)] flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-[var(--color-error)] ml-2">×</button>
        </div>
      )}

      {/* Result count when filtering */}
      {hasFilters && (
        <div className="flex items-center gap-2 mb-4">
          <p className="text-xs text-[var(--color-text-tertiary)]">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</p>
          <button
            onClick={() => { setSearch(""); setDeptFilter(defaultDept); setTypeFilter("all"); setStatusFilter("all"); }}
            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] px-2 py-0.5 rounded"
          >
            Clear
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          {hasFilters ? (
            <>
              <p className="text-sm text-[var(--color-text-secondary)] mb-2">No materials match your filters.</p>
              <button
                onClick={() => { setSearch(""); setDeptFilter(defaultDept); setTypeFilter("all"); setStatusFilter("all"); }}
                className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">No learning materials yet.</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">Add training videos, PDFs, or links for your team.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {paginated.map((m) => (
            <div
              key={m.id}
              className={`bg-[var(--color-bg-primary)] border rounded-[var(--radius-lg)] p-4 flex items-center gap-4 transition-colors ${
                m.completed ? "border-green-200 bg-[var(--color-success-light)]/30"
                : m.viewed ? "border-[var(--color-border-primary)]"
                : "border-[var(--color-border-primary)]"
              }`}
            >
              <div className="shrink-0 w-10 h-10 rounded-lg bg-[var(--color-bg-secondary)] flex items-center justify-center">
                <TypeIcon type={m.material_type} className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-medium text-[var(--color-text-primary)] truncate">{m.title}</h3>
                  <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">{TYPE_LABELS[m.material_type]}</span>
                  {/* View/completion status badges */}
                  {m.completed ? (
                    <span className="text-[10px] bg-[var(--color-success-light)] text-[var(--color-success)] px-1.5 py-0.5 rounded font-medium">Completed</span>
                  ) : m.viewed ? (
                    <span className="text-[10px] bg-[var(--color-accent-light)] text-[var(--color-accent)] px-1.5 py-0.5 rounded font-medium">Viewed</span>
                  ) : (
                    <span className="text-[10px] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded font-medium">Not viewed</span>
                  )}
                </div>
                {m.description && (
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-1">{m.description}</p>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  {m.department && (
                    <p className="text-xs text-[var(--color-text-tertiary)]">{m.department.name}</p>
                  )}
                  {m.view_duration_s > 0 && (
                    <p className="text-[10px] text-[var(--color-text-tertiary)]">
                      {m.view_duration_s >= 60
                        ? `${Math.round(m.view_duration_s / 60)}m viewed`
                        : `${m.view_duration_s}s viewed`}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setSelected(m)}
                  disabled={!m.signed_url && !m.external_link}
                  className="text-xs bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border-primary)] text-[var(--color-text-primary)] px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  View
                </button>
                <button
                  onClick={() => toggleComplete(m)}
                  title={!m.viewed && !m.completed ? "View the material first" : undefined}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                    m.completed
                      ? "bg-[var(--color-success-light)] text-[var(--color-success)] hover:bg-green-200"
                      : m.viewed
                      ? "border border-[var(--color-border-primary)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                      : "border border-[var(--color-border-primary)] text-[var(--color-text-tertiary)] cursor-not-allowed"
                  }`}
                >
                  {m.completed ? "✓ Done" : "Mark done"}
                </button>
                {canManage && (
                  <button
                    onClick={() => handleDelete(m.id, m.title)}
                    aria-label={`Delete ${m.title}`}
                    className="text-xs text-red-400 hover:text-[var(--color-error)] p-1.5"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Add Learning Material</h2>

            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-[var(--color-error-light)] border border-red-200 text-xs text-[var(--color-error)]">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Title *</label>
                <input
                  required
                  type="text"
                  maxLength={2000}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Description</label>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Type *</label>
                  <select
                    required
                    value={form.material_type}
                    onChange={(e) => setForm((f) => ({ ...f, material_type: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    <option value="pdf">PDF</option>
                    <option value="video">Video</option>
                    <option value="presentation">Presentation</option>
                    <option value="document">Document</option>
                    <option value="link">Link</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Department</label>
                  <select
                    value={form.department_id}
                    onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    <option value="">Global</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">
                  {form.material_type === "link" ? "URL *" : "File"}
                </label>
                {form.material_type === "link" ? (
                  <input
                    required
                    type="url"
                    placeholder="https://..."
                    value={form.external_link}
                    onChange={(e) => setForm((f) => ({ ...f, external_link: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                ) : (
                  <>
                    <label className="flex items-center gap-3 cursor-pointer border border-dashed border-[var(--color-border-primary)] rounded-lg px-4 py-3 hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-hover)] transition-colors">
                      <svg className="w-5 h-5 text-[var(--color-text-tertiary)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {file ? file.name : "Choose file to upload"}
                      </span>
                      <input
                        type="file"
                        aria-label="Upload file"
                        accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.mov,.webm"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          if (f && f.size > 100 * 1024 * 1024) {
                            setError("File must be under 100MB.");
                            e.target.value = "";
                            return;
                          }
                          setFile(f);
                        }}
                      />
                    </label>
                    <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Max 100MB · PDF, DOC, PPT, Video</p>
                  </>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Sort order</label>
                <input
                  type="number"
                  min="0"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setError(null); }}
                  className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-primary)] text-sm py-2 rounded-lg hover:bg-[var(--color-surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  {creating ? "Uploading..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
