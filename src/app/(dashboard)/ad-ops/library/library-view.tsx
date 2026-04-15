"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";

type Asset = {
  id: string;
  asset_code: string;
  title: string;
  status: string;
  content_type: string | null;
  funnel_stage: string | null;
  ad_format: string | null;
  file_url: string | null;
  thumbnail_url: string | null;
  notes: string | null;
  created_at: string;
  creator: { first_name: string; last_name: string } | null;
  request: { title: string } | null;
};

type Props = {
  contentTypes: string[];
  funnelStages: string[];
  formats: string[];
  canManage: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  draft:          "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  pending_review: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  approved:       "bg-[var(--color-success-light)] text-[var(--color-success)]",
  needs_revision: "bg-[var(--color-error-light)] text-[var(--color-error)]",
  archived:       "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]",
};

const FUNNEL_COLORS: Record<string, string> = {
  TOF: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  MOF: "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]",
  BOF: "bg-[var(--color-success-light)] text-[var(--color-success)]",
};

const STATUSES = ["draft", "pending_review", "approved", "needs_revision", "archived"];

export function LibraryView({ contentTypes, funnelStages, formats, canManage }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [funnelFilter, setFunnelFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    content_type: "",
    funnel_stage: "",
    ad_format: "",
    file_url: "",
    thumbnail_url: "",
    notes: "",
    status: "draft",
  });

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (statusFilter) params.set("status", statusFilter);
    if (funnelFilter) params.set("funnel_stage", funnelFilter);
    if (typeFilter) params.set("content_type", typeFilter);
    if (search) params.set("search", search);
    const res = await fetch(`/api/ad-ops/assets?${params}`);
    if (res.ok) setAssets(await res.json());
    setLoading(false);
  }, [statusFilter, funnelFilter, typeFilter, search]);

  useEffect(() => {
    const t = setTimeout(() => { fetchAssets(); }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchAssets, search]);

  function openCreate() {
    setEditAsset(null);
    setForm({ title: "", content_type: "", funnel_stage: "", ad_format: "", file_url: "", thumbnail_url: "", notes: "", status: "draft" });
    setShowModal(true);
  }

  function openEdit(a: Asset) {
    setEditAsset(a);
    setForm({
      title: a.title,
      content_type: a.content_type ?? "",
      funnel_stage: a.funnel_stage ?? "",
      ad_format: a.ad_format ?? "",
      file_url: a.file_url ?? "",
      thumbnail_url: a.thumbnail_url ?? "",
      notes: a.notes ?? "",
      status: a.status,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: form.title,
      content_type: form.content_type || null,
      funnel_stage: form.funnel_stage || null,
      ad_format: form.ad_format || null,
      file_url: form.file_url || null,
      thumbnail_url: form.thumbnail_url || null,
      notes: form.notes || null,
      status: form.status,
    };
    const url = editAsset ? `/api/ad-ops/assets?id=${editAsset.id}` : "/api/ad-ops/assets";
    const method = editAsset ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await fetchAssets();
      setShowModal(false);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this asset?")) return;
    await fetch(`/api/ad-ops/assets?id=${id}`, { method: "DELETE" });
    await fetchAssets();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Asset Library</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{assets.length} assets</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
        >
          + New Asset
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          type="text"
          placeholder="Search assets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] w-48"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
        {funnelStages.length > 0 && (
          <select
            value={funnelFilter}
            onChange={(e) => setFunnelFilter(e.target.value)}
            className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="">All stages</option>
            {funnelStages.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        {contentTypes.length > 0 && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="">All types</option>
            {contentTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        {(statusFilter || funnelFilter || typeFilter || search) && (
          <button
            onClick={() => { setStatusFilter(""); setFunnelFilter(""); setTypeFilter(""); setSearch(""); }}
            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
      ) : assets.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No assets found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {assets.map((a) => (
            <div key={a.id} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden hover:border-[var(--color-border-primary)] transition-colors">
              {a.thumbnail_url ? (
                <div className="aspect-video bg-[var(--color-bg-tertiary)] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.thumbnail_url} alt={a.title} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-video bg-[var(--color-bg-tertiary)] flex items-center justify-center">
                  <span className="text-[var(--color-text-tertiary)] text-xs">No preview</span>
                </div>
              )}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="font-mono text-xs text-[var(--color-text-secondary)]">{a.asset_code}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[a.status] ?? ""}`}>
                    {a.status.replace("_", " ")}
                  </span>
                  {a.funnel_stage && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${FUNNEL_COLORS[a.funnel_stage] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"}`}>
                      {a.funnel_stage}
                    </span>
                  )}
                </div>
                <p className="font-medium text-[var(--color-text-primary)] text-sm truncate">{a.title}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-[var(--color-text-tertiary)] flex-wrap">
                  {a.content_type && <span>{a.content_type}</span>}
                  {a.ad_format && <><span>·</span><span>{a.ad_format}</span></>}
                  {a.creator && (
                    <><span>·</span><span>{a.creator.first_name} {a.creator.last_name}</span></>
                  )}
                </div>
                {a.request && (
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 truncate">From: {a.request.title}</p>
                )}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--color-border-secondary)]">
                  {a.file_url && (
                    <a
                      href={a.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    >
                      View file →
                    </a>
                  )}
                  <button onClick={() => openEdit(a)} className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] ml-auto">
                    Edit
                  </button>
                  {canManage && (
                    <button onClick={() => handleDelete(a.id)} className="text-xs text-[var(--color-text-tertiary)] hover:text-red-400">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">{editAsset ? "Edit Asset" : "New Asset"}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Title *</label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Summer UGC — testimonial v1"
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Content Type</label>
                  <select
                    value={form.content_type}
                    onChange={(e) => setForm((f) => ({ ...f, content_type: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    <option value="">None</option>
                    {contentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Funnel Stage</label>
                  <select
                    value={form.funnel_stage}
                    onChange={(e) => setForm((f) => ({ ...f, funnel_stage: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    <option value="">None</option>
                    {funnelStages.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Ad Format</label>
                  <select
                    value={form.ad_format}
                    onChange={(e) => setForm((f) => ({ ...f, ad_format: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    <option value="">None</option>
                    {formats.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">File URL</label>
                <input
                  type="url"
                  value={form.file_url}
                  onChange={(e) => setForm((f) => ({ ...f, file_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Thumbnail URL</label>
                <input
                  type="url"
                  value={form.thumbnail_url}
                  onChange={(e) => setForm((f) => ({ ...f, thumbnail_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-primary)] text-sm py-2 rounded-lg hover:bg-[var(--color-surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
