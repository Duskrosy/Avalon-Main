"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type Snapshot = {
  snapshot_date: string;
  follower_count: number | null;
  post_count: number | null;
  avg_engagement_rate: number | null;
  posting_frequency_week: number | null;
  notes: string | null;
  data_source: string;
};

type Account = {
  id: string;
  competitor_id: string;
  platform: string;
  handle: string | null;
  external_id: string | null;
  is_active: boolean;
  last_scraped_at: string | null;
  latest_snapshot: Snapshot | null;
};

type Competitor = {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  accounts: Account[];
};

type Props = {
  canManage: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"] as const;
type Platform = (typeof PLATFORMS)[number];

const PLATFORM_META: Record<Platform, { label: string; color: string; textColor: string }> = {
  facebook:  { label: "Facebook",  color: "#1877F2", textColor: "#ffffff" },
  instagram: { label: "Instagram", color: "#E1306C", textColor: "#ffffff" },
  tiktok:    { label: "TikTok",    color: "#010101", textColor: "#ffffff" },
  youtube:   { label: "YouTube",   color: "#FF0000", textColor: "#ffffff" },
};

type AddFormPlatforms = Record<Platform, { checked: boolean; handle: string }>;

const EMPTY_ADD_FORM = {
  name: "",
  notes: "",
  platforms: {
    facebook:  { checked: false, handle: "" },
    instagram: { checked: false, handle: "" },
    tiktok:    { checked: false, handle: "" },
    youtube:   { checked: false, handle: "" },
  } as AddFormPlatforms,
};

type FillForm = {
  snapshot_date: string;
  follower_count: string;
  post_count: string;
  avg_engagement_rate: string;
  posting_frequency_week: string;
  notes: string;
};

const emptyFillForm = (): FillForm => ({
  snapshot_date: new Date().toISOString().split("T")[0],
  follower_count: "",
  post_count: "",
  avg_engagement_rate: "",
  posting_frequency_week: "",
  notes: "",
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function PlatformBadge({ platform }: { platform: Platform }) {
  const meta = PLATFORM_META[platform];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: meta.color, color: meta.textColor }}
    >
      {meta.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CompetitorsView({ canManage }: Props) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm]           = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving]       = useState(false);
  const [fillModal, setFillModal]       = useState<{ account: Account; competitor: Competitor } | null>(null);
  const [fillForm, setFillForm]         = useState<FillForm>(emptyFillForm());
  const [fillSaving, setFillSaving]     = useState(false);
  const [deletingId, setDeletingId]     = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchCompetitors = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/smm/competitors");
    if (res.ok) {
      const data: Competitor[] = await res.json();
      setCompetitors(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCompetitors(); }, [fetchCompetitors]);

  // ── Add competitor ─────────────────────────────────────────────────────────

  async function handleAddCompetitor() {
    if (!addForm.name.trim()) return;
    setAddSaving(true);
    try {
      // 1. Create competitor
      const res = await fetch("/api/smm/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:  addForm.name.trim(),
          notes: addForm.notes.trim() || null,
        }),
      });
      if (!res.ok) { setAddSaving(false); return; }
      const created = await res.json();

      // 2. Create accounts for each checked platform
      const platformEntries = PLATFORMS.filter((p) => addForm.platforms[p].checked);
      await Promise.all(
        platformEntries.map((p) =>
          fetch("/api/smm/competitors", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type:          "account",
              competitor_id: created.id,
              platform:      p,
              handle:        addForm.platforms[p].handle.trim() || null,
            }),
          })
        )
      );

      setShowAddModal(false);
      setAddForm(EMPTY_ADD_FORM);
      await fetchCompetitors();
    } finally {
      setAddSaving(false);
    }
  }

  // ── Manual fill (snapshot) ─────────────────────────────────────────────────

  function openFillModal(account: Account, competitor: Competitor) {
    const snap = account.latest_snapshot;
    setFillForm({
      snapshot_date:          new Date().toISOString().split("T")[0],
      follower_count:         snap?.follower_count?.toString() ?? "",
      post_count:             snap?.post_count?.toString() ?? "",
      avg_engagement_rate:    snap?.avg_engagement_rate?.toString() ?? "",
      posting_frequency_week: snap?.posting_frequency_week?.toString() ?? "",
      notes:                  "",
    });
    setFillModal({ account, competitor });
  }

  async function handleSaveFill() {
    if (!fillModal) return;
    setFillSaving(true);
    try {
      await fetch("/api/smm/competitors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type:                   "snapshot",
          account_id:             fillModal.account.id,
          snapshot_date:          fillForm.snapshot_date,
          follower_count:         fillForm.follower_count         !== "" ? Number(fillForm.follower_count)         : null,
          post_count:             fillForm.post_count             !== "" ? Number(fillForm.post_count)             : null,
          avg_engagement_rate:    fillForm.avg_engagement_rate    !== "" ? Number(fillForm.avg_engagement_rate)    : null,
          posting_frequency_week: fillForm.posting_frequency_week !== "" ? Number(fillForm.posting_frequency_week) : null,
          notes:                  fillForm.notes.trim() || null,
        }),
      });
      setFillModal(null);
      await fetchCompetitors();
    } finally {
      setFillSaving(false);
    }
  }

  // ── Add platform account (inline) ──────────────────────────────────────────

  async function handleAddPlatformAccount(competitorId: string, platform: Platform) {
    await fetch("/api/smm/competitors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type:          "account",
        competitor_id: competitorId,
        platform,
      }),
    });
    await fetchCompetitors();
  }

  // ── Delete competitor ──────────────────────────────────────────────────────

  async function handleDelete(competitorId: string) {
    if (!confirm("Delete this competitor and all their data? This cannot be undone.")) return;
    setDeletingId(competitorId);
    try {
      await fetch("/api/smm/competitors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "competitor", id: competitorId }),
      });
      await fetchCompetitors();
    } finally {
      setDeletingId(null);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Competitor Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track competitor social media metrics across platforms.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => { setAddForm(EMPTY_ADD_FORM); setShowAddModal(true); }}
            className="shrink-0 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            + Add Competitor
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : competitors.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-2xl mb-3">🔍</p>
          <p className="text-sm font-medium text-gray-700">No competitors tracked yet</p>
          {canManage && (
            <p className="text-xs text-gray-400 mt-1">
              Click &ldquo;+ Add Competitor&rdquo; to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {competitors.map((comp) => (
            <CompetitorCard
              key={comp.id}
              competitor={comp}
              canManage={canManage}
              deleting={deletingId === comp.id}
              onDelete={() => handleDelete(comp.id)}
              onFill={(acc) => openFillModal(acc, comp)}
              onAddPlatform={(platform) => handleAddPlatformAccount(comp.id, platform)}
            />
          ))}
        </div>
      )}

      {/* Add Competitor Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => { setShowAddModal(false); setAddForm(EMPTY_ADD_FORM); }}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900">Add Competitor</h2>

            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Competitor Brand"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={addForm.notes}
                onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes…"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
            </div>

            {/* Platform checkboxes */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Platforms to track</p>
              <div className="space-y-3">
                {PLATFORMS.map((p) => (
                  <div key={p}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addForm.platforms[p].checked}
                        onChange={(e) =>
                          setAddForm((f) => ({
                            ...f,
                            platforms: {
                              ...f.platforms,
                              [p]: { ...f.platforms[p], checked: e.target.checked },
                            },
                          }))
                        }
                        className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                      />
                      <PlatformBadge platform={p} />
                    </label>
                    {addForm.platforms[p].checked && (
                      <input
                        type="text"
                        value={addForm.platforms[p].handle}
                        onChange={(e) =>
                          setAddForm((f) => ({
                            ...f,
                            platforms: {
                              ...f.platforms,
                              [p]: { ...f.platforms[p], handle: e.target.value },
                            },
                          }))
                        }
                        placeholder={`@handle or URL`}
                        className="mt-1.5 ml-6 w-[calc(100%-1.5rem)] border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => { setShowAddModal(false); setAddForm(EMPTY_ADD_FORM); }}
                className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={addSaving || !addForm.name.trim()}
                onClick={handleAddCompetitor}
                className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {addSaving ? "Adding…" : "Add Competitor"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Fill Modal */}
      {fillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setFillModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Update Metrics</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {fillModal.competitor.name} ·{" "}
                <PlatformBadge platform={fillModal.account.platform as Platform} />
                {fillModal.account.handle ? ` · ${fillModal.account.handle}` : ""}
              </p>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input
                type="date"
                value={fillForm.snapshot_date}
                onChange={(e) => setFillForm((f) => ({ ...f, snapshot_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {/* Follower count */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Follower Count</label>
              <input
                type="number"
                min="0"
                value={fillForm.follower_count}
                onChange={(e) => setFillForm((f) => ({ ...f, follower_count: e.target.value }))}
                placeholder="e.g. 125000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {/* Post count */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Total Posts</label>
              <input
                type="number"
                min="0"
                value={fillForm.post_count}
                onChange={(e) => setFillForm((f) => ({ ...f, post_count: e.target.value }))}
                placeholder="e.g. 840"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {/* 2-column row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Avg Engagement Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fillForm.avg_engagement_rate}
                  onChange={(e) => setFillForm((f) => ({ ...f, avg_engagement_rate: e.target.value }))}
                  placeholder="e.g. 3.25"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Posts / Week
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={fillForm.posting_frequency_week}
                  onChange={(e) => setFillForm((f) => ({ ...f, posting_frequency_week: e.target.value }))}
                  placeholder="e.g. 4.5"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={fillForm.notes}
                onChange={(e) => setFillForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any observations…"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setFillModal(null)}
                className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={fillSaving}
                onClick={handleSaveFill}
                className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {fillSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Competitor card ──────────────────────────────────────────────────────────

type CardProps = {
  competitor: Competitor;
  canManage: boolean;
  deleting: boolean;
  onDelete: () => void;
  onFill: (account: Account) => void;
  onAddPlatform: (platform: Platform) => void;
};

function CompetitorCard({
  competitor,
  canManage,
  deleting,
  onDelete,
  onFill,
  onAddPlatform,
}: CardProps) {
  const accountsByPlatform: Partial<Record<Platform, Account>> = {};
  for (const acc of competitor.accounts) {
    accountsByPlatform[acc.platform as Platform] = acc;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-gray-100">
        <div>
          <h2 className="font-semibold text-gray-900">{competitor.name}</h2>
          {competitor.notes && (
            <p className="text-xs text-gray-500 mt-0.5">{competitor.notes}</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            Added {format(parseISO(competitor.created_at), "d MMM yyyy")}
          </p>
        </div>
        {canManage && (
          <button
            disabled={deleting}
            onClick={onDelete}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>

      {/* Platform grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
        {PLATFORMS.map((platform) => {
          const acc = accountsByPlatform[platform];

          if (!acc) {
            return (
              <div key={platform} className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <PlatformBadge platform={platform} />
                  <span className="text-xs text-gray-400">Not tracked</span>
                </div>
                {canManage && (
                  <button
                    onClick={() => onAddPlatform(platform)}
                    className="mt-auto text-xs px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors w-fit"
                  >
                    + Add platform
                  </button>
                )}
              </div>
            );
          }

          const snap = acc.latest_snapshot;

          return (
            <div key={platform} className="p-4 flex flex-col gap-2">
              {/* Platform badge + handle */}
              <div className="flex items-center gap-2 flex-wrap">
                <PlatformBadge platform={platform} />
                {acc.handle && (
                  <span className="text-xs text-gray-500 truncate max-w-[120px]">{acc.handle}</span>
                )}
                {!acc.is_active && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Inactive</span>
                )}
              </div>

              {/* Metrics */}
              {snap ? (
                <div className="space-y-1.5">
                  <div>
                    <p className="text-2xl font-bold text-gray-900 leading-none">
                      {formatNumber(snap.follower_count)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">followers</p>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                    {snap.post_count != null && (
                      <span>
                        <span className="font-medium">{snap.post_count.toLocaleString()}</span>{" "}
                        posts
                      </span>
                    )}
                    {snap.avg_engagement_rate != null && (
                      <span>
                        <span className="font-medium">{Number(snap.avg_engagement_rate).toFixed(2)}%</span>{" "}
                        eng.
                      </span>
                    )}
                    {snap.posting_frequency_week != null && (
                      <span>
                        <span className="font-medium">{Number(snap.posting_frequency_week).toFixed(1)}×</span>{" "}
                        /wk
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    Updated {format(parseISO(snap.snapshot_date), "d MMM yyyy")}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No data yet</p>
              )}

              {/* Update button */}
              {canManage && (
                <button
                  onClick={() => onFill(acc)}
                  className="mt-auto text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors w-fit"
                >
                  Update
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
