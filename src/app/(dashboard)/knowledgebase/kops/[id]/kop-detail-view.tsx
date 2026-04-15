"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { useToast, Toast } from "@/components/ui/toast";

type Version = {
  id: string;
  version_number: number;
  file_url: string;
  file_type: string | null;
  change_notes: string | null;
  created_at: string;
  signed_url: string | null;
  uploaded_by_profile: { first_name: string; last_name: string } | null;
};

type Kop = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  current_version: number;
  created_at: string;
  department: { id: string; name: string } | null;
  created_by_profile: { first_name: string; last_name: string } | null;
};

type StaffMember = { id: string; first_name: string; last_name: string; department: { name: string } | null };
type Assignment = { id: string; user_id: string; assigned_at: string; notes: string | null; user: { first_name: string; last_name: string; email: string } | null };

type Props = {
  kop: Kop;
  versions: Version[];
  currentVersion: Version | null;
  canManage: boolean;
  canDelete: boolean;
  staff?: StaffMember[];
};

// ─── Assignment Panel ─────────────────────────────────────────────────────────
function AssignmentPanel({ kopId, staff, canManage }: { kopId: string; staff: StaffMember[]; canManage: boolean }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [search, setSearch] = useState("");

  const fetchAssignments = useCallback(async () => {
    const res = await fetch(`/api/kops/assignments?kop_id=${kopId}`);
    if (res.ok) setAssignments(await res.json());
    setLoading(false);
  }, [kopId]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const assignedIds = new Set(assignments.map((a) => a.user_id));
  const unassigned = staff.filter((s) => !assignedIds.has(s.id));
  const filteredStaff = unassigned.filter((s) =>
    `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleAssign = async () => {
    if (selected.size === 0) return;
    setAssigning(true);
    const res = await fetch("/api/kops/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kop_id: kopId, user_ids: [...selected], notes: notes || undefined }),
    });
    if (res.ok) {
      await fetchAssignments();
      setShowAssign(false);
      setSelected(new Set());
      setNotes("");
      setSearch("");
    }
    setAssigning(false);
  };

  const handleRemove = async (id: string) => {
    const res = await fetch(`/api/kops/assignments?id=${id}`, { method: "DELETE" });
    if (res.ok) setAssignments((a) => a.filter((x) => x.id !== id));
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
          Assigned to ({assignments.length})
        </h3>
        {canManage && (
          <button
            onClick={() => setShowAssign(!showAssign)}
            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] px-2.5 py-1 rounded-lg"
          >
            {showAssign ? "Cancel" : "+ Assign"}
          </button>
        )}
      </div>

      {/* Assign modal inline */}
      {showAssign && (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-3 mb-3 space-y-2">
          <input
            type="text"
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
          <div className="max-h-40 overflow-y-auto space-y-1">
            {filteredStaff.length === 0 ? (
              <p className="text-xs text-[var(--color-text-tertiary)] py-2 text-center">
                {unassigned.length === 0 ? "Everyone is assigned" : "No matches"}
              </p>
            ) : (
              filteredStaff.slice(0, 20).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-xs py-1 cursor-pointer hover:bg-[var(--color-bg-primary)] rounded px-1">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      e.target.checked ? next.add(s.id) : next.delete(s.id);
                      setSelected(next);
                    }}
                    className="rounded border-[var(--color-border-primary)]"
                  />
                  <span className="text-[var(--color-text-primary)]">{s.first_name} {s.last_name}</span>
                  {s.department && <span className="text-[var(--color-text-tertiary)] ml-auto">{s.department.name}</span>}
                </label>
              ))
            )}
          </div>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
          <button
            onClick={handleAssign}
            disabled={selected.size === 0 || assigning}
            className="w-full bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-xs py-1.5 rounded-lg disabled:opacity-50"
          >
            {assigning ? "Assigning..." : `Assign ${selected.size} user${selected.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {/* Assignment list */}
      {loading ? (
        <p className="text-xs text-[var(--color-text-tertiary)] py-2">Loading...</p>
      ) : assignments.length === 0 ? (
        <p className="text-xs text-[var(--color-text-tertiary)] py-2">No one assigned yet.</p>
      ) : (
        <div className="space-y-1.5">
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border-secondary)]">
              <div>
                <p className="text-xs font-medium text-[var(--color-text-primary)]">
                  {a.user ? `${a.user.first_name} ${a.user.last_name}` : "Unknown"}
                </p>
                <p className="text-[10px] text-[var(--color-text-tertiary)]">
                  {format(new Date(a.assigned_at), "d MMM")}
                  {a.notes && ` · ${a.notes}`}
                </p>
              </div>
              {canManage && (
                <button
                  onClick={() => handleRemove(a.id)}
                  className="text-xs text-red-400 hover:text-[var(--color-error)]"
                  aria-label={`Remove assignment for ${a.user?.first_name}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FileViewer({ version }: { version: Version }) {
  const url = version.signed_url;
  const ext = (version.file_type ?? "").toLowerCase();

  if (!url) return <p className="text-sm text-[var(--color-text-tertiary)] p-8 text-center">File unavailable.</p>;

  if (ext === "pdf") {
    return (
      <iframe
        src={url}
        className="w-full h-[70vh] rounded-lg border border-[var(--color-border-primary)]"
        title="KOP Document"
      />
    );
  }

  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(ext)) {
    const googleUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    return (
      <iframe
        src={googleUrl}
        className="w-full h-[70vh] rounded-lg border border-[var(--color-border-primary)]"
        title="KOP Document"
      />
    );
  }

  if (["mp4", "mov", "webm"].includes(ext)) {
    return (
      <video controls className="w-full rounded-lg border border-[var(--color-border-primary)] max-h-[70vh]">
        <source src={url} />
      </video>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <p className="text-sm text-[var(--color-text-secondary)]">Preview not available for this file type.</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)]"
      >
        Download file
      </a>
    </div>
  );
}

export function KopDetailView({ kop, versions: initialVersions, currentVersion, canManage, canDelete, staff = [] }: Props) {
  const router = useRouter();
  const { toast, setToast } = useToast();
  const [versions, setVersions] = useState<Version[]>(initialVersions);
  const [activeVersion, setActiveVersion] = useState<Version | null>(currentVersion);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadNotes, setUploadNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleNewVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setError("File must be under 100MB.");
      return;
    }
    setUploading(true);
    setError(null);

    const fd = new FormData();
    fd.append("file", file);
    if (uploadNotes) fd.append("change_notes", uploadNotes);

    const res = await fetch(`/api/kops/${kop.id}/versions`, { method: "POST", body: fd });
    if (res.ok) {
      const newVersion = await res.json().catch(() => null);
      if (newVersion) {
        setVersions((prev) => [newVersion, ...prev]);
        setActiveVersion(newVersion);
      }
      setShowUpload(false);
      setUploadNotes("");
      setToast({ message: "New version uploaded", type: "success" });
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error || "Failed to upload version. Please try again.");
    }
    setUploading(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${kop.title}" and all versions? This cannot be undone.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/kops/${kop.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/knowledgebase/kops");
    } else {
      setError("Failed to delete KOP.");
      setDeleting(false);
    }
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/knowledgebase/kops" className="text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">
          ← KOP Library
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">{kop.title}</h1>
            <span className="text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-2 py-0.5 rounded-full">
              v{kop.current_version}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-[var(--color-text-tertiary)]">
            {kop.department ? (
              <span>{kop.department.name}</span>
            ) : (
              <span className="text-[var(--color-accent)]">Global</span>
            )}
            {kop.category && <span>· {kop.category}</span>}
            {kop.created_by_profile && (
              <span>· {kop.created_by_profile.first_name} {kop.created_by_profile.last_name}</span>
            )}
            <span>· {format(new Date(kop.created_at), "d MMM yyyy")}</span>
          </div>
          {kop.description && (
            <p className="text-sm text-[var(--color-text-secondary)] mt-2">{kop.description}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {canManage && (
            <button
              onClick={() => setShowUpload(true)}
              className="bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)]"
            >
              New version
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="border border-red-200 text-[var(--color-error)] text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-error-light)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          )}
        </div>
      </div>

      {/* Error toast */}
      {error && !showUpload && (
        <div className="mb-4 px-4 py-3 rounded-[var(--radius-lg)] bg-[var(--color-error-light)] border border-red-200 text-sm text-[var(--color-error)] flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-[var(--color-error)] ml-2">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Version sidebar */}
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">Versions</h3>
          {versions.map((v) => (
            <button
              key={v.id}
              onClick={() => setActiveVersion(v)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                activeVersion?.id === v.id
                  ? "border-[var(--color-text-primary)] bg-[var(--color-bg-secondary)]"
                  : "border-[var(--color-border-primary)] hover:border-[var(--color-border-primary)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">v{v.version_number}</span>
                {v.version_number === kop.current_version && (
                  <span className="text-xs bg-[var(--color-success-light)] text-[var(--color-success)] px-1.5 py-0.5 rounded-full">Current</span>
                )}
              </div>
              {v.change_notes && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">{v.change_notes}</p>
              )}
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                {format(new Date(v.created_at), "d MMM yyyy")}
              </p>
            </button>
          ))}

          {/* Assignments */}
          {canManage && <AssignmentPanel kopId={kop.id} staff={staff} canManage={canManage} />}
        </div>

        {/* Viewer */}
        <div className="lg:col-span-3">
          {activeVersion ? (
            <FileViewer version={activeVersion} />
          ) : (
            <p className="text-sm text-[var(--color-text-tertiary)] p-8 text-center">Select a version to preview.</p>
          )}
        </div>
      </div>

      {/* New version modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Upload New Version</h2>

            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-[var(--color-error-light)] border border-red-200 text-xs text-[var(--color-error)]">
                {error}
              </div>
            )}

            <form onSubmit={handleNewVersion} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">File *</label>
                <input
                  required
                  ref={fileRef}
                  type="file"
                  aria-label="Upload new version file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.mp4,.mov"
                  className="w-full text-sm text-[var(--color-text-secondary)]"
                />
                <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Max 100MB</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Change notes</label>
                <input
                  type="text"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="What changed?"
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-primary)] text-sm py-2 rounded-lg hover:bg-[var(--color-surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
