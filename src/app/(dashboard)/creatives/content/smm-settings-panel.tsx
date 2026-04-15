"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

const VALID_PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"] as const;
type SmmPlatform = (typeof VALID_PLATFORMS)[number];

type SmmGroupPlatform = {
  id: string;
  platform: string;
  page_id: string | null;
  page_name: string | null;
  handle: string | null;
  is_active: boolean;
  token_expires_at: string | null;
};

type SmmGroup = {
  id: string;
  name: string;
  weekly_target: number;
  is_active: boolean;
  sort_order: number;
  smm_group_platforms: SmmGroupPlatform[];
};

export function SmmSettingsPanel({ onClose }: { onClose: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [groups, setGroups] = useState<SmmGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupTarget, setNewGroupTarget] = useState(25);
  const [creating, setCreating] = useState(false);
  const [editPlatform, setEditPlatform] = useState<{ groupId: string; platform: SmmPlatform } | null>(null);
  const [platformForm, setPlatformForm] = useState({ page_id: "", page_name: "", handle: "" });
  const [connectingTikTok, setConnectingTikTok] = useState<string | null>(null); // groupId being connected

  // TikTok OAuth callback status from URL params
  const tiktokStatus = searchParams.get("tiktok");
  const tiktokName   = searchParams.get("name");
  const tiktokReason = searchParams.get("reason");

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/smm/groups");
      if (res.ok) setGroups(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  // Reload groups after successful TikTok connection so the card shows "Connected"
  useEffect(() => {
    if (tiktokStatus === "connected") loadGroups();
  }, [tiktokStatus, loadGroups]);

  // Clear TikTok status params from URL without navigating away
  function dismissTikTokBanner() {
    const url = new URL(window.location.href);
    url.searchParams.delete("tiktok");
    url.searchParams.delete("name");
    url.searchParams.delete("reason");
    router.replace(url.pathname + url.search);
  }

  async function createGroup() {
    if (!newGroupName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/smm/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim(), weekly_target: newGroupTarget }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const g = await res.json();
      setGroups((prev) => [...prev, { ...g, smm_group_platforms: [] }]);
      setNewGroupName("");
      setNewGroupTarget(25);
      setShowNewGroup(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create group");
    } finally {
      setCreating(false);
    }
  }

  async function updateGroupTarget(id: string, weekly_target: number) {
    await fetch("/api/smm/groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, weekly_target }),
    });
    setGroups((prev) => prev.map((g) => g.id === id ? { ...g, weekly_target } : g));
  }

  async function deleteGroup(id: string) {
    if (!confirm("Delete this SMM group? All platforms and posts inside will also be deleted.")) return;
    const res = await fetch("/api/smm/groups", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setGroups((prev) => prev.filter((g) => g.id !== id));
  }

  async function togglePlatform(groupId: string, platform: SmmPlatform) {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const existing = group.smm_group_platforms.find((p) => p.platform === platform);

    if (platform === "tiktok") {
      // TikTok uses OAuth — don't use the edit form; use connectTikTok instead
      if (existing) {
        await fetch("/api/smm/platforms", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: existing.id, is_active: !existing.is_active }),
        });
        await loadGroups();
      } else {
        await connectTikTok(groupId, null);
      }
      return;
    }

    if (existing) {
      const res = await fetch("/api/smm/platforms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: existing.id, is_active: !existing.is_active }),
      });
      if (res.ok) {
        const updated = await res.json();
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? { ...g, smm_group_platforms: g.smm_group_platforms.map((p) => p.id === updated.id ? updated : p) }
              : g
          )
        );
      }
    } else {
      setEditPlatform({ groupId, platform });
      setPlatformForm({ page_id: "", page_name: "", handle: "" });
    }
  }

  // Start TikTok OAuth flow.
  // If no platform row yet: create a stub row first, then redirect.
  // If a row exists: redirect immediately with the existing id.
  async function connectTikTok(groupId: string, existingId: string | null) {
    setConnectingTikTok(groupId);
    try {
      let platformId = existingId;
      if (!platformId) {
        const res = await fetch("/api/smm/platforms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ group_id: groupId, platform: "tiktok" }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create TikTok platform");
        const created = await res.json();
        platformId = created.id;
      }
      window.location.href = `/api/tiktok/connect?platform_id=${platformId}`;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start TikTok OAuth");
      setConnectingTikTok(null);
    }
  }

  async function savePlatform() {
    if (!editPlatform) return;
    const { groupId, platform } = editPlatform;
    const group = groups.find((g) => g.id === groupId);
    const existing = group?.smm_group_platforms.find((p) => p.platform === platform);
    const body = { ...platformForm };

    if (existing) {
      const res = await fetch("/api/smm/platforms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: existing.id, ...body }),
      });
      if (res.ok) {
        const updated = await res.json();
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? { ...g, smm_group_platforms: g.smm_group_platforms.map((p) => p.id === updated.id ? updated : p) }
              : g
          )
        );
      }
    } else {
      const res = await fetch("/api/smm/platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId, platform, ...body }),
      });
      if (res.ok) {
        const created = await res.json();
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? { ...g, smm_group_platforms: [...g.smm_group_platforms, created] }
              : g
          )
        );
      }
    }
    setEditPlatform(null);
  }

  function isTikTokConnected(p: SmmGroupPlatform): boolean {
    // Connected = has a token_expires_at set (populated by OAuth callback)
    return !!p.token_expires_at;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] flex items-center gap-1"
        >
          ← Back
        </button>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Manage Groups & Platforms</h2>
        <button
          onClick={() => setShowNewGroup(true)}
          className="ml-auto text-sm px-4 py-2 bg-[var(--color-text-primary)] text-white rounded-lg hover:bg-[var(--color-text-secondary)]"
        >
          + New Group
        </button>
      </div>

      {/* TikTok OAuth callback banner */}
      {tiktokStatus === "connected" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-[var(--radius-lg)] px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-emerald-700">
            ✅ TikTok connected{tiktokName ? ` as @${tiktokName}` : ""}
          </span>
          <button onClick={dismissTikTokBanner} className="text-xs text-emerald-500 hover:text-emerald-700">Dismiss</button>
        </div>
      )}
      {tiktokStatus === "error" && (
        <div className="bg-[var(--color-error-light)] border border-red-200 rounded-[var(--radius-lg)] px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-[var(--color-error)]">
            TikTok connection failed{tiktokReason ? `: ${tiktokReason}` : ""}
          </span>
          <button onClick={dismissTikTokBanner} className="text-xs text-red-400 hover:text-[var(--color-error)]">Dismiss</button>
        </div>
      )}

      {error && (
        <div className="bg-[var(--color-error-light)] border border-red-200 rounded-[var(--radius-lg)] px-4 py-3 text-sm text-[var(--color-error)]">{error}</div>
      )}

      {/* New group form */}
      {showNewGroup && (
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4 space-y-3">
          <div className="flex gap-3">
            <input
              autoFocus
              type="text"
              placeholder="Group name, e.g. Local, International"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createGroup()}
              className="flex-1 border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            <button
              onClick={createGroup}
              disabled={creating}
              className="text-sm px-3 py-2 bg-[var(--color-text-primary)] text-white rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button onClick={() => setShowNewGroup(false)} className="text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">
              Cancel
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-text-secondary)] w-32">Weekly post target</label>
            <input
              type="number"
              min="1"
              max="200"
              value={newGroupTarget}
              onChange={(e) => setNewGroupTarget(Number(e.target.value))}
              className="w-20 border border-[var(--color-border-primary)] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-[var(--color-text-tertiary)] py-8 text-center">Loading…</p>}

      {!loading && groups.length === 0 && !showNewGroup && (
        <div className="bg-[var(--color-bg-primary)] border border-dashed border-[var(--color-border-primary)] rounded-2xl p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No SMM groups yet. Create one to get started.</p>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.id} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h3 className="font-semibold text-[var(--color-text-primary)]">{group.name}</h3>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[var(--color-text-tertiary)]">Weekly target:</span>
                <input
                  type="number"
                  min="1"
                  max="200"
                  defaultValue={group.weekly_target}
                  onBlur={(e) => {
                    const val = Number(e.target.value);
                    if (val !== group.weekly_target && val > 0) updateGroupTarget(group.id, val);
                  }}
                  className="w-14 border border-[var(--color-border-primary)] rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
                <span className="text-xs text-[var(--color-text-tertiary)]">posts</span>
              </div>
            </div>
            <button
              onClick={() => deleteGroup(group.id)}
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors"
            >
              Delete
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {VALID_PLATFORMS.map((platform) => {
              const existing = group.smm_group_platforms.find((p) => p.platform === platform);
              const isActive = existing?.is_active ?? false;
              const isTikTok = platform === "tiktok";
              const tikTokConnected = isTikTok && existing ? isTikTokConnected(existing) : false;

              return (
                <div
                  key={platform}
                  className={`border rounded-[var(--radius-lg)] p-3 transition-colors ${
                    isActive ? "border-gray-900 bg-[var(--color-bg-secondary)]" : "border-[var(--color-border-primary)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-[var(--color-text-primary)] capitalize">
                      {platform === "tiktok" ? "TikTok" : platform}
                    </span>
                    <button
                      onClick={() => togglePlatform(group.id, platform)}
                      className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                        isActive ? "bg-[var(--color-text-primary)] text-white" : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border-primary)]"
                      }`}
                    >
                      {isActive ? "Active" : "Enable"}
                    </button>
                  </div>

                  {isTikTok ? (
                    // TikTok: OAuth-managed connection
                    <div className="space-y-1.5">
                      {tikTokConnected && existing ? (
                        <p className="text-xs text-emerald-600 font-medium">
                          ✅ @{existing.handle ?? existing.page_name ?? "connected"}
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          {existing ? "Token expired or not connected" : "Not connected"}
                        </p>
                      )}
                      <button
                        onClick={() => connectTikTok(group.id, existing?.id ?? null)}
                        disabled={connectingTikTok === group.id}
                        className="text-xs px-2.5 py-1 rounded-lg bg-black text-white hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
                      >
                        {connectingTikTok === group.id
                          ? "Connecting…"
                          : tikTokConnected
                          ? "Reconnect"
                          : "Connect TikTok"}
                      </button>
                    </div>
                  ) : existing ? (
                    <div className="text-xs text-[var(--color-text-tertiary)] space-y-0.5">
                      {existing.page_name && <p className="truncate">{existing.page_name}</p>}
                      {existing.page_id && <p className="font-mono text-[10px] text-[var(--color-text-tertiary)] truncate">{existing.page_id}</p>}
                      {existing.handle && <p>@{existing.handle}</p>}
                      <button
                        onClick={() => {
                          setEditPlatform({ groupId: group.id, platform });
                          setPlatformForm({
                            page_id: existing.page_id ?? "",
                            page_name: existing.page_name ?? "",
                            handle: existing.handle ?? "",
                          });
                        }}
                        className="text-[var(--color-accent)] hover:text-[var(--color-accent)] mt-0.5 block"
                      >
                        Edit details
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--color-text-tertiary)]">Not configured</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Platform edit modal (non-TikTok platforms) */}
      {editPlatform && editPlatform.platform !== "tiktok" && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-4 capitalize">
              {editPlatform.platform} — Page Details
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Page / Channel Name</label>
                <input
                  autoFocus
                  type="text"
                  value={platformForm.page_name}
                  onChange={(e) => setPlatformForm((f) => ({ ...f, page_name: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  placeholder="e.g. Avalon Heights PH"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Page ID / Channel ID</label>
                <input
                  type="text"
                  value={platformForm.page_id}
                  onChange={(e) => setPlatformForm((f) => ({ ...f, page_id: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  placeholder="Numeric page or channel ID"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Handle / Username</label>
                <input
                  type="text"
                  value={platformForm.handle}
                  onChange={(e) => setPlatformForm((f) => ({ ...f, handle: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  placeholder="@handle"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setEditPlatform(null)}
                className="flex-1 border border-[var(--color-border-primary)] text-sm py-2 rounded-lg hover:bg-[var(--color-surface-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={savePlatform}
                className="flex-1 bg-[var(--color-text-primary)] text-white text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
