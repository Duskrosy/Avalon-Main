"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

type Dept = { id: string; name: string; slug: string };
type Kop = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  current_version: number;
  created_at: string;
  updated_at: string;
  department: Dept | null;
  created_by_profile: { first_name: string; last_name: string } | null;
};

type Props = {
  kops: Kop[];
  departments: Dept[];
  canManage: boolean;
};

export function KopsView({ kops: initial, departments, canManage }: Props) {
  const [kops, setKops] = useState<Kop[]>(initial);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "", description: "", category: "", department_id: "", change_notes: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const filtered = kops.filter((k) => {
    const matchSearch = [k.title, k.description, k.category]
      .some((s) => s?.toLowerCase().includes(search.toLowerCase()));
    const matchDept = deptFilter === "all"
      ? true
      : deptFilter === "global"
      ? k.department === null
      : k.department?.id === deptFilter;
    return matchSearch && matchDept;
  });

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setCreating(true);
    setError(null);
    const fd = new FormData();
    fd.append("title", form.title);
    if (form.description) fd.append("description", form.description);
    if (form.category) fd.append("category", form.category);
    if (form.department_id) fd.append("department_id", form.department_id);
    if (form.change_notes) fd.append("change_notes", form.change_notes);
    fd.append("file", file);

    const res = await fetch("/api/kops", { method: "POST", body: fd });
    if (res.ok) {
      const refreshed = await fetch("/api/kops");
      setKops(await refreshed.json());
      setShowCreate(false);
      setForm({ title: "", description: "", category: "", department_id: "", change_notes: "" });
      setFile(null);
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error || "Failed to upload KOP. Please try again.");
    }
    setCreating(false);
  }, [form, file]);

  const KOP_CATEGORIES = ["BAU", "Tools", "Process", "Guidelines", "Installation", "Troubleshooting", "Reference"];
  const categories = [...new Set(kops.map((k) => k.category).filter(Boolean))] as string[];
  const hasFilters = search || deptFilter !== "all";

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">KOP Library</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{kops.length} procedure{kops.length !== 1 ? "s" : ""}</p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
          >
            + Upload KOP
          </button>
        )}
      </div>

      {/* Error toast */}
      {error && !showCreate && (
        <div className="mb-4 px-4 py-3 rounded-[var(--radius-lg)] bg-[var(--color-error-light)] border border-red-200 text-sm text-[var(--color-error)] flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-[var(--color-error)] ml-2">×</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search KOPs..."
          aria-label="Search KOPs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
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
      </div>

      {/* Result count when filtering */}
      {hasFilters && (
        <div className="flex items-center gap-2 mb-4">
          <p className="text-xs text-[var(--color-text-tertiary)]">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</p>
          <button
            onClick={() => { setSearch(""); setDeptFilter("all"); }}
            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] px-2 py-0.5 rounded"
          >
            Clear
          </button>
        </div>
      )}

      {/* KOP grid */}
      {filtered.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          {hasFilters ? (
            <>
              <p className="text-sm text-[var(--color-text-secondary)] mb-2">No KOPs match your search.</p>
              <button
                onClick={() => { setSearch(""); setDeptFilter("all"); }}
                className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">No procedures uploaded yet.</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">Upload your team's key operating procedures to keep everyone aligned.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((kop) => (
            <Link
              key={kop.id}
              href={`/knowledgebase/kops/${kop.id}`}
              className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4 hover:border-[var(--color-border-primary)] transition-colors group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-text-primary)] line-clamp-2">
                  {kop.title}
                </h3>
                <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">v{kop.current_version}</span>
              </div>
              {kop.description && (
                <p className="text-xs text-[var(--color-text-secondary)] mb-3 line-clamp-2">{kop.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {kop.department ? (
                  <span className="text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-2 py-0.5 rounded-full">
                    {kop.department.name}
                  </span>
                ) : (
                  <span className="text-xs bg-[var(--color-accent-light)] text-[var(--color-accent)] px-2 py-0.5 rounded-full">
                    Global
                  </span>
                )}
                {kop.category && (
                  <span className="text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-2 py-0.5 rounded-full">
                    {kop.category}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Upload KOP</h2>

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
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    <option value="">Select category</option>
                    {KOP_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
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
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">File *</label>
                <label className="flex items-center gap-3 cursor-pointer border border-dashed border-[var(--color-border-primary)] rounded-lg px-4 py-3 hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-hover)] transition-colors">
                  <svg className="w-5 h-5 text-[var(--color-text-tertiary)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {file ? file.name : "Choose file to upload"}
                  </span>
                  <input
                    required
                    type="file"
                    aria-label="Upload KOP file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > 100 * 1024 * 1024) {
                        setError("File must be under 100MB.");
                        e.target.value = "";
                        return;
                      }
                      setError(null);
                      setFile(f);
                    }}
                  />
                </label>
                <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Max 100MB · PDF, DOC, PPT, XLS</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Version notes</label>
                <input
                  type="text"
                  placeholder="e.g. Initial upload"
                  value={form.change_notes}
                  onChange={(e) => setForm((f) => ({ ...f, change_notes: e.target.value }))}
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
