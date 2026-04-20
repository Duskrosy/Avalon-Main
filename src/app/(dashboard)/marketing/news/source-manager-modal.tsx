"use client";

import { useState, useEffect, useCallback, Fragment } from "react";

type Source = {
  id: string;
  name: string;
  url: string;
  category: string;
  is_active: boolean;
  created_at: string;
  feed_type: "rss" | "atom" | "unknown" | null;
  last_fetched_at: string | null;
  last_fetch_status: "ok" | "error" | "never" | null;
  last_fetch_error: string | null;
  last_item_count: number | null;
};

type TestResult = {
  ok: boolean;
  feed_type?: "rss" | "atom" | "unknown";
  title?: string | null;
  description?: string | null;
  total_count?: number;
  sample_items?: { title: string; link: string; published_at: string | null }[];
  error?: string;
};

const CATEGORIES = [
  { value: "shoes",    label: "Shoes" },
  { value: "height",   label: "Height Enhancement" },
  { value: "viral_ph", label: "Viral PH" },
  { value: "general",  label: "General" },
];

type AddForm = { name: string; url: string; category: string };
const EMPTY_ADD: AddForm = { name: "", url: "", category: "general" };

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function HealthBadge({ status, error }: { status: string | null; error: string | null }) {
  if (status === "ok") {
    return <span className="inline-block rounded-full bg-[var(--color-success-light)] text-[var(--color-success)] px-2 py-0.5 text-[10px] font-medium">OK</span>;
  }
  if (status === "error") {
    return (
      <span
        title={error ?? "Error"}
        className="inline-block rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-medium cursor-help"
      >
        Error
      </span>
    );
  }
  return <span className="inline-block rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] px-2 py-0.5 text-[10px] font-medium">Never</span>;
}

function FeedTypeBadge({ type }: { type: string | null }) {
  if (!type || type === "unknown") return <span className="text-[10px] text-[var(--color-text-tertiary)]">—</span>;
  return (
    <span className="inline-block rounded bg-[var(--color-accent-light)] text-[var(--color-accent)] px-1.5 py-0.5 text-[10px] uppercase font-medium">
      {type}
    </span>
  );
}

export function SourceManagerModal({
  open,
  onClose,
  onChanged,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  canEdit: boolean;
}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD);
  const [addTestResult, setAddTestResult] = useState<TestResult | null>(null);
  const [addTesting, setAddTesting] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; url: string; category: string }>({ name: "", url: "", category: "general" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [rowAction, setRowAction] = useState<string | null>(null);
  const [rowTest, setRowTest] = useState<Record<string, TestResult | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/smm/news/sources");
    if (res.ok) setSources(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  async function handleTest() {
    if (!addForm.url.trim()) return;
    setAddTesting(true);
    setAddTestResult(null);
    setAddError(null);
    try {
      const res = await fetch("/api/smm/news/sources/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: addForm.url.trim() }),
      });
      const data = await res.json();
      setAddTestResult(data);
    } catch {
      setAddTestResult({ ok: false, error: "Network error" });
    }
    setAddTesting(false);
  }

  async function handleSave() {
    if (!addForm.name.trim() || !addForm.url.trim() || !addTestResult?.ok) return;
    setAddSaving(true);
    setAddError(null);
    const res = await fetch("/api/smm/news/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    setAddSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAddError((data as { error?: string }).error ?? "Save failed");
      return;
    }
    setAddForm(EMPTY_ADD);
    setAddTestResult(null);
    await load();
    onChanged();
  }

  function startEdit(s: Source) {
    setEditId(s.id);
    setEditForm({ name: s.name, url: s.url, category: s.category });
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editId) return;
    setEditSaving(true);
    setEditError(null);
    const res = await fetch("/api/smm/news/sources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, ...editForm }),
    });
    setEditSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg =
        typeof (data as { error?: unknown }).error === "string"
          ? (data as { error: string }).error
          : "Save failed";
      setEditError(msg);
      return;
    }
    setEditId(null);
    await load();
    onChanged();
  }

  async function handleToggleActive(s: Source) {
    setRowAction(s.id);
    await fetch("/api/smm/news/sources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, is_active: !s.is_active }),
    });
    setRowAction(null);
    await load();
    onChanged();
  }

  async function handleDelete(s: Source) {
    if (!confirm(`Delete "${s.name}"? All items from this source will be removed.`)) return;
    setRowAction(s.id);
    await fetch("/api/smm/news/sources", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id }),
    });
    setRowAction(null);
    await load();
    onChanged();
  }

  async function handleTestNow(s: Source) {
    setRowAction(s.id);
    const res = await fetch("/api/smm/news/sources/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: s.url }),
    });
    const data = await res.json().catch(() => ({ ok: false, error: "Network error" }));
    setRowTest((prev) => ({ ...prev, [s.id]: data }));
    setRowAction(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--color-bg-primary)] rounded-2xl shadow-2xl w-full max-w-4xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border-secondary)] px-5 py-3">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Manage News Sources</h2>
          <button onClick={onClose} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]" aria-label="Close">✕</button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {canEdit && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] p-4 bg-[var(--color-bg-secondary)]/40">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Add new source</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Source name"
                  className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)]"
                />
                <input
                  type="url"
                  value={addForm.url}
                  onChange={(e) => { setAddForm((f) => ({ ...f, url: e.target.value })); setAddTestResult(null); }}
                  placeholder="https://example.com/feed"
                  className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)]"
                />
                <select
                  value={addForm.category}
                  onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
                  className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)]"
                >
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={addTesting || !addForm.url.trim()}
                  className="text-sm px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  {addTesting ? "Testing…" : "Test feed"}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={addSaving || !addTestResult?.ok || !addForm.name.trim()}
                  className="text-sm px-4 py-1.5 rounded-lg bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] disabled:opacity-50"
                >
                  {addSaving ? "Saving…" : "Save"}
                </button>
                {!addTestResult?.ok && <span className="text-xs text-[var(--color-text-tertiary)]">Test must pass before saving.</span>}
              </div>

              {addTestResult && (
                <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${addTestResult.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
                  {addTestResult.ok ? (
                    <div>
                      <div className="font-medium mb-1">
                        ✓ {addTestResult.feed_type?.toUpperCase()} · {addTestResult.total_count} items
                        {addTestResult.title ? ` · ${addTestResult.title}` : ""}
                      </div>
                      {(addTestResult.sample_items ?? []).length > 0 && (
                        <ul className="list-disc list-inside space-y-0.5">
                          {(addTestResult.sample_items ?? []).map((item, i) => (
                            <li key={i} className="truncate">{item.title}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <div>✗ {addTestResult.error}</div>
                  )}
                </div>
              )}

              {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">All sources</h3>
            {loading ? (
              <p className="text-xs text-[var(--color-text-tertiary)] py-8 text-center">Loading…</p>
            ) : sources.length === 0 ? (
              <p className="text-xs text-[var(--color-text-tertiary)] py-8 text-center">No sources yet.</p>
            ) : (
              <div className="border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
                <table className="min-w-full text-xs">
                  <thead className="bg-[var(--color-bg-secondary)] text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Health</th>
                      <th className="px-3 py-2 text-left">Last fetch</th>
                      <th className="px-3 py-2 text-left">Items</th>
                      <th className="px-3 py-2 text-left">Active</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-secondary)]">
                    {sources.map((s) => (
                      <Fragment key={s.id}>
                        <tr className="hover:bg-[var(--color-surface-hover)]">
                          <td className="px-3 py-2 text-[var(--color-text-primary)] max-w-[200px]">
                            <div className="font-medium truncate">{s.name}</div>
                            <div className="text-[10px] text-[var(--color-text-tertiary)] truncate">{s.url}</div>
                          </td>
                          <td className="px-3 py-2 text-[var(--color-text-secondary)] capitalize">{s.category.replace("_", " ")}</td>
                          <td className="px-3 py-2"><FeedTypeBadge type={s.feed_type} /></td>
                          <td className="px-3 py-2"><HealthBadge status={s.last_fetch_status} error={s.last_fetch_error} /></td>
                          <td className="px-3 py-2 text-[var(--color-text-tertiary)]">{relTime(s.last_fetched_at)}</td>
                          <td className="px-3 py-2 text-[var(--color-text-secondary)]">{s.last_item_count ?? 0}</td>
                          <td className="px-3 py-2">
                            {canEdit ? (
                              <button
                                onClick={() => handleToggleActive(s)}
                                disabled={rowAction === s.id}
                                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                  s.is_active
                                    ? "bg-[var(--color-success-light)] text-[var(--color-success)]"
                                    : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]"
                                } disabled:opacity-50`}
                              >
                                {s.is_active ? "Active" : "Paused"}
                              </button>
                            ) : (
                              <span className="text-[10px] text-[var(--color-text-tertiary)]">{s.is_active ? "Active" : "Paused"}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap space-x-2">
                            <button
                              onClick={() => handleTestNow(s)}
                              disabled={rowAction === s.id}
                              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline underline-offset-2"
                            >
                              Test
                            </button>
                            {canEdit && (
                              <>
                                <button onClick={() => startEdit(s)} className="text-[var(--color-accent)] hover:underline">Edit</button>
                                <button onClick={() => handleDelete(s)} disabled={rowAction === s.id} className="text-red-600 hover:underline">Delete</button>
                              </>
                            )}
                          </td>
                        </tr>
                        {editId === s.id && (
                          <tr className="bg-[var(--color-bg-secondary)]/60">
                            <td colSpan={8} className="px-3 py-3">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <input
                                  type="text"
                                  value={editForm.name}
                                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                                  className="border border-[var(--color-border-primary)] rounded px-2 py-1 text-xs bg-[var(--color-bg-primary)]"
                                />
                                <input
                                  type="url"
                                  value={editForm.url}
                                  onChange={(e) => setEditForm((f) => ({ ...f, url: e.target.value }))}
                                  className="border border-[var(--color-border-primary)] rounded px-2 py-1 text-xs bg-[var(--color-bg-primary)]"
                                />
                                <select
                                  value={editForm.category}
                                  onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                                  className="border border-[var(--color-border-primary)] rounded px-2 py-1 text-xs bg-[var(--color-bg-primary)]"
                                >
                                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                              </div>
                              {editError && <p className="text-xs text-red-600 mt-2">{editError}</p>}
                              <div className="mt-2 flex justify-end gap-2">
                                <button onClick={() => setEditId(null)} className="text-xs px-3 py-1 rounded border border-[var(--color-border-primary)] text-[var(--color-text-secondary)]">Cancel</button>
                                <button
                                  onClick={handleEditSave}
                                  disabled={editSaving}
                                  className="text-xs px-3 py-1 rounded bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] disabled:opacity-50"
                                >
                                  {editSaving ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                        {rowTest[s.id] && (
                          <tr className="bg-[var(--color-bg-secondary)]/40">
                            <td colSpan={8} className="px-3 py-2 text-xs">
                              {rowTest[s.id]!.ok ? (
                                <span className="text-green-700">✓ {rowTest[s.id]!.feed_type?.toUpperCase()} · {rowTest[s.id]!.total_count} items</span>
                              ) : (
                                <span className="text-red-700">✗ {rowTest[s.id]!.error}</span>
                              )}
                              <button
                                onClick={() => setRowTest((prev) => ({ ...prev, [s.id]: null }))}
                                className="ml-3 text-[var(--color-text-tertiary)] hover:underline"
                              >
                                dismiss
                              </button>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
