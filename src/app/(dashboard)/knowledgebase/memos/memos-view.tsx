"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";

type Dept = { id: string; name: string; slug: string };
type Memo = {
  id: string;
  title: string;
  content: string;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
  department: Dept | null;
  created_by_profile: { first_name: string; last_name: string } | null;
  memo_signatures: { user_id: string }[];
};

type Props = {
  memos: Memo[];
  departments: Dept[];
  currentUserId: string;
  canManage: boolean;
};

export function MemosView({ memos: initial, departments, currentUserId, canManage }: Props) {
  const [memos, setMemos] = useState<Memo[]>(initial);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [signedFilter, setSignedFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", content: "", department_id: "" });
  const [file, setFile] = useState<File | null>(null);

  const filtered = memos.filter((m) => {
    const matchSearch = [m.title, m.content]
      .some((s) => s?.toLowerCase().includes(search.toLowerCase()));
    const matchDept = deptFilter === "all"
      ? true
      : deptFilter === "global"
      ? m.department === null
      : m.department?.id === deptFilter;
    const isSigned = m.memo_signatures.some((s) => s.user_id === currentUserId);
    const matchSigned = signedFilter === "all"
      ? true
      : signedFilter === "signed"
      ? isSigned
      : !isSigned;
    return matchSearch && matchDept && matchSigned;
  });

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const fd = new FormData();
    fd.append("title", form.title);
    fd.append("content", form.content);
    if (form.department_id) fd.append("department_id", form.department_id);
    if (file) fd.append("file", file);

    const res = await fetch("/api/memos", { method: "POST", body: fd });
    if (res.ok) {
      const refreshed = await fetch("/api/memos");
      setMemos(await refreshed.json());
      setShowCreate(false);
      setForm({ title: "", content: "", department_id: "" });
      setFile(null);
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error || "Failed to create memo. Please try again.");
    }
    setCreating(false);
  }, [form, file]);

  const unsignedCount = memos.filter((m) => !m.memo_signatures.some((s) => s.user_id === currentUserId)).length;
  const hasFilters = search || deptFilter !== "all" || signedFilter !== "all";

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Memos</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {memos.length} memo{memos.length !== 1 ? "s" : ""}
            {unsignedCount > 0 && (
              <span className="text-[var(--color-warning)] ml-2">{unsignedCount} unsigned</span>
            )}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-[var(--color-text-primary)] text-white text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
          >
            + New Memo
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

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search memos..."
          aria-label="Search memos"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <select
          value={signedFilter}
          aria-label="Filter by signature status"
          onChange={(e) => setSignedFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="all">All memos</option>
          <option value="unsigned">Unsigned</option>
          <option value="signed">Signed</option>
        </select>
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
            onClick={() => { setSearch(""); setDeptFilter("all"); setSignedFilter("all"); }}
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
              <p className="text-sm text-[var(--color-text-secondary)] mb-2">No memos match your filters.</p>
              <button
                onClick={() => { setSearch(""); setDeptFilter("all"); setSignedFilter("all"); }}
                className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">No memos posted yet.</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">Create a memo to share important notices with your team.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((memo) => {
            const signed = memo.memo_signatures.some((s) => s.user_id === currentUserId);
            const sigCount = memo.memo_signatures.length;
            return (
              <Link
                key={memo.id}
                href={`/knowledgebase/memos/${memo.id}`}
                className="block bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4 hover:border-[var(--color-border-primary)] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">{memo.title}</h3>
                    <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2">{memo.content}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1.5">
                      {signed ? (
                        <span className="text-xs bg-[var(--color-success-light)] text-[var(--color-success)] px-2 py-0.5 rounded-full">
                          Signed
                        </span>
                      ) : (
                        <span className="text-xs bg-[var(--color-warning-light)] text-[var(--color-warning)] px-2 py-0.5 rounded-full">
                          Unsigned
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{sigCount} signature{sigCount !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                {memo.attachment_name && (
                  <div className="mt-2">
                    <span className="text-[10px] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-2 py-0.5 rounded inline-flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                      {memo.attachment_name}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2 text-xs text-[var(--color-text-tertiary)]">
                  {memo.department ? (
                    <span>{memo.department.name}</span>
                  ) : (
                    <span className="text-[var(--color-accent)]">Global</span>
                  )}
                  <span>·</span>
                  <span>{format(new Date(memo.created_at), "d MMM yyyy")}</span>
                  {memo.created_by_profile && (
                    <>
                      <span>·</span>
                      <span>{memo.created_by_profile.first_name} {memo.created_by_profile.last_name}</span>
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">New Memo</h2>

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
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Content *</label>
                <textarea
                  required
                  rows={6}
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Attachment (optional)</label>
                <input
                  type="file"
                  aria-label="Upload attachment"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > 50 * 1024 * 1024) {
                      setError("Attachment must be under 50MB.");
                      e.target.value = "";
                      return;
                    }
                    setFile(f);
                  }}
                  className="w-full text-sm text-[var(--color-text-secondary)]"
                />
                <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">PDF, DOC, XLS, PPT, TXT, CSV. Max 50MB.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Department</label>
                <select
                  value={form.department_id}
                  onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                >
                  <option value="">Global (all staff)</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
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
                  className="flex-1 bg-[var(--color-text-primary)] text-white text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  {creating ? "Posting..." : "Post Memo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
