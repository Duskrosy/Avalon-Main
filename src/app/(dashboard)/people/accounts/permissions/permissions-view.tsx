"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "@/lib/permissions/nav";
import type { NavGroup, NavItem } from "@/lib/permissions/nav";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Role = { id: string; name: string; slug: string; tier: number };
type Dept = { id: string; name: string; slug: string };
type User = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  department: Dept | null;
  role: Role;
};
type NavOverrideRow = { user_id: string; nav_slug: string; visible: boolean };

type Target =
  | { type: "user"; user: User }
  | { type: "role"; role: Role }
  | { type: "dept"; dept: Dept };

// pending value meanings:
// true  → Grant (force show)
// false → Deny (force hide)
// null  → Remove override (revert to inherit)
// undefined → no change yet
type PendingMap = Record<string, boolean | null>;

type Props = {
  users: User[];
  roles: Role[];
  departments: Dept[];
  allOverrides: NavOverrideRow[];
  currentUserId: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const TIER_LABELS: Record<number, string> = {
  0: "Super Admin",
  1: "OPS Admin",
  2: "Manager",
  3: "Contributor",
  4: "Viewer",
  5: "Auditor",
};

const TIER_COLORS: Record<number, string> = {
  0: "bg-purple-100 text-purple-700",
  1: "bg-blue-100 text-blue-700",
  2: "bg-green-100 text-green-700",
  3: "bg-gray-100 text-gray-600",
  4: "bg-yellow-100 text-yellow-700",
  5: "bg-orange-100 text-orange-700",
};

const GROUP_ICONS: Record<string, string> = {
  people: "👥",
  analytics: "📊",
  knowledgebase: "📚",
  productivity: "✅",
  scheduling: "📅",
  communications: "📢",
  "sales-ops": "💰",
  creatives: "🎨",
  marketing: "📣",
  "ad-ops": "🎬",
  admin: "🔧",
};

/** Compute which nav slugs are visible by default for a given tier + dept */
function defaultVisibleSlugs(tier: number, deptSlug: string): Set<string> {
  const ops = tier <= 1;
  const visible = new Set<string>();

  for (const group of NAV_GROUPS) {
    const groupTierBlocked = group.minTier !== undefined && tier > group.minTier;
    const groupDeptBlocked = group.departments && !ops && !group.departments.includes(deptSlug);
    if (groupTierBlocked || groupDeptBlocked) continue;

    for (const item of group.items) {
      const itemTierBlocked = item.minTier !== undefined && tier > item.minTier;
      const itemDeptBlocked = item.departments && !ops && !item.departments.includes(deptSlug);
      if (!itemTierBlocked && !itemDeptBlocked) {
        visible.add(item.slug);
      }
    }
  }

  return visible;
}

/** Build the display name for a target */
function targetLabel(target: Target): string {
  if (target.type === "user") return `${target.user.first_name} ${target.user.last_name}`;
  if (target.type === "role") return target.role.name;
  return target.dept.name;
}

/** Return all user IDs affected by a target */
function targetUserIds(target: Target, users: User[]): string[] {
  if (target.type === "user") return [target.user.id];
  if (target.type === "role") return users.filter((u) => u.role.id === target.role.id).map((u) => u.id);
  return users.filter((u) => u.department?.id === target.dept.id).map((u) => u.id);
}

/**
 * For a given target, compute the current saved override state:
 * Returns Record<nav_slug, boolean> — only slugs with actual overrides.
 * For group targets (role/dept), a slug is included only if ALL users in the group agree.
 */
function savedOverridesForTarget(
  target: Target,
  users: User[],
  allOverrides: NavOverrideRow[]
): Record<string, boolean> {
  const ids = targetUserIds(target, users);
  if (ids.length === 0) return {};

  if (target.type === "user") {
    const result: Record<string, boolean> = {};
    for (const row of allOverrides) {
      if (row.user_id === ids[0]) result[row.nav_slug] = row.visible;
    }
    return result;
  }

  // Group: collect per-slug votes
  const votes: Record<string, { grant: number; deny: number }> = {};
  for (const row of allOverrides) {
    if (!ids.includes(row.user_id)) continue;
    if (!votes[row.nav_slug]) votes[row.nav_slug] = { grant: 0, deny: 0 };
    if (row.visible) votes[row.nav_slug].grant++;
    else votes[row.nav_slug].deny++;
  }

  const result: Record<string, boolean> = {};
  for (const [slug, { grant, deny }] of Object.entries(votes)) {
    if (grant === ids.length) result[slug] = true;   // all grant
    if (deny === ids.length) result[slug] = false;    // all deny
    // mixed → not included (shows as Inherit)
  }
  return result;
}

/** Check if a target has any per-user mixed overrides (for info banner) */
function hasMixedOverrides(target: Target, users: User[], allOverrides: NavOverrideRow[]): boolean {
  if (target.type === "user") return false;
  const ids = targetUserIds(target, users);
  if (ids.length === 0) return false;

  const votes: Record<string, Set<string>> = {};
  for (const row of allOverrides) {
    if (!ids.includes(row.user_id)) continue;
    if (!votes[row.nav_slug]) votes[row.nav_slug] = new Set();
    votes[row.nav_slug].add(String(row.visible));
  }
  return Object.values(votes).some((v) => v.size > 1);
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Initials({ name }: { name: string }) {
  const parts = name.split(" ");
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (
    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
      {letters.toUpperCase()}
    </div>
  );
}

function TierBadge({ tier }: { tier: number }) {
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", TIER_COLORS[tier] ?? "bg-gray-100 text-gray-500")}>
      T{tier}
    </span>
  );
}

/** 3-segment toggle: Inherit | Grant | Deny */
function OverrideToggle({
  value,
  pending,
  onChange,
}: {
  value: boolean | undefined; // undefined = inherit (no saved override)
  pending: boolean | null | undefined; // undefined = not changed
  onChange: (v: boolean | null) => void;
}) {
  const effective = pending !== undefined ? pending : value !== undefined ? value : null;
  const hasPending = pending !== undefined;

  function btn(
    label: string,
    segValue: boolean | null,
    activeClass: string,
    icon: string
  ) {
    const active = effective === segValue;
    return (
      <button
        type="button"
        onClick={() => onChange(segValue)}
        className={cn(
          "px-2.5 py-1 text-xs font-medium transition-colors",
          active ? activeClass : "text-gray-400 hover:text-gray-600 hover:bg-gray-50",
          hasPending && "ring-1 ring-amber-400 ring-offset-0"
        )}
      >
        {icon} {label}
      </button>
    );
  }

  return (
    <div className={cn(
      "inline-flex rounded-lg border divide-x overflow-hidden",
      hasPending ? "border-amber-400 divide-amber-400" : "border-gray-200 divide-gray-200"
    )}>
      {btn("Inherit", null, "bg-gray-100 text-gray-700", "·")}
      {btn("Grant", true, "bg-green-50 text-green-700", "✓")}
      {btn("Deny", false, "bg-red-50 text-red-700", "✕")}
    </div>
  );
}

/** Collapsible nav group section in the right panel */
function PageGroupSection({
  group,
  defaultVisible,
  savedOverrides,
  pending,
  onToggle,
  defaultOpen,
}: {
  group: NavGroup;
  defaultVisible: Set<string>;
  savedOverrides: Record<string, boolean>;
  pending: PendingMap;
  onToggle: (slug: string, v: boolean | null) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <span>{GROUP_ICONS[group.slug] ?? "·"}</span>
          <span>{group.name}</span>
          <span className="text-xs text-gray-400 font-normal">
            {group.items.length} {group.items.length === 1 ? "page" : "pages"}
          </span>
        </div>
        <svg
          className={cn("w-4 h-4 text-gray-400 transition-transform", open && "rotate-180")}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="divide-y divide-gray-50">
          {group.items.map((item: NavItem) => {
            const isDefault = defaultVisible.has(item.slug);
            const savedVal = savedOverrides[item.slug]; // boolean or undefined
            const pendingVal = pending[item.slug]; // boolean | null | undefined
            return (
              <div key={item.slug} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    isDefault ? "bg-green-400" : "bg-gray-300"
                  )} title={isDefault ? "Visible by default" : "Hidden by default"} />
                  <div>
                    <p className="text-sm text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-400">
                      {isDefault ? "Visible by default" : "Hidden by default"}
                    </p>
                  </div>
                </div>
                <OverrideToggle
                  value={savedVal}
                  pending={pendingVal}
                  onChange={(v) => onToggle(item.slug, v)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function PermissionsView({ users, roles, departments, allOverrides, currentUserId }: Props) {
  const router = useRouter();

  // Left panel state
  const [activeTab, setActiveTab] = useState<"people" | "role" | "dept">("people");
  const [search, setSearch] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null);

  // Right panel state
  const [pending, setPending] = useState<PendingMap>({});
  const [saving, setSaving] = useState(false);

  // When a new target is selected, reset pending
  function selectTarget(target: Target) {
    setSelectedTarget(target);
    setPending({});
    setSearch("");
  }

  // Derived: saved overrides for the current target
  const savedOverrides = useMemo(() => {
    if (!selectedTarget) return {};
    return savedOverridesForTarget(selectedTarget, users, allOverrides);
  }, [selectedTarget, users, allOverrides]);

  // Derived: default visible slugs for this target (without any overrides)
  const defaultVisible = useMemo(() => {
    if (!selectedTarget) return new Set<string>();
    if (selectedTarget.type === "user") {
      return defaultVisibleSlugs(selectedTarget.user.role.tier, selectedTarget.user.department?.slug ?? "");
    }
    if (selectedTarget.type === "role") {
      // Show tier-based defaults using empty dept (dept-gated items show as hidden)
      return defaultVisibleSlugs(selectedTarget.role.tier, "");
    }
    // Dept: use contributor tier (3) as the representative baseline
    return defaultVisibleSlugs(3, selectedTarget.dept.slug);
  }, [selectedTarget]);

  // Derived: affected user IDs
  const targetIds = useMemo(() => {
    if (!selectedTarget) return [];
    return targetUserIds(selectedTarget, users);
  }, [selectedTarget, users]);

  const mixedOverrides = useMemo(() => {
    if (!selectedTarget) return false;
    return hasMixedOverrides(selectedTarget, users, allOverrides);
  }, [selectedTarget, users, allOverrides]);

  const hasPendingChanges = Object.keys(pending).length > 0;

  // Super admins (tier 0) are protected — their page access cannot be changed
  const isBlocked = useMemo(() => {
    if (!selectedTarget) return false;
    if (selectedTarget.type === "user") return selectedTarget.user.role.tier === 0;
    if (selectedTarget.type === "role") return selectedTarget.role.tier === 0;
    return false; // departments are never fully blocked
  }, [selectedTarget]);

  function handleToggle(slug: string, v: boolean | null) {
    setPending((prev) => {
      // If new value matches saved, remove from pending (no change needed)
      const saved = savedOverrides[slug];
      const savedEffective = saved !== undefined ? saved : null;
      if (v === savedEffective) {
        const { [slug]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [slug]: v };
    });
  }

  const handleSave = useCallback(async () => {
    if (!selectedTarget || !hasPendingChanges) return;
    setSaving(true);

    const changes = Object.entries(pending).map(([slug, visible]) => ({ slug, visible }));

    const res = await fetch("/api/permissions/nav", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: targetIds, changes }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      alert(`Error: ${data.error}`);
      return;
    }

    setPending({});
    router.refresh();
  }, [selectedTarget, hasPendingChanges, pending, targetIds, router]);

  // ── Left panel filtered lists ─────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(
      (u) => u.id !== currentUserId &&
        `${u.first_name} ${u.last_name} ${u.email} ${u.department?.name ?? ""}`.toLowerCase().includes(q)
    );
  }, [users, search, currentUserId]);

  // User counts per role / dept
  const userCountByRole = useMemo(() => {
    const map: Record<string, number> = {};
    for (const u of users) {
      if (u.id === currentUserId) continue;
      map[u.role.id] = (map[u.role.id] ?? 0) + 1;
    }
    return map;
  }, [users, currentUserId]);

  const userCountByDept = useMemo(() => {
    const map: Record<string, number> = {};
    for (const u of users) {
      if (u.id === currentUserId || !u.department) continue;
      map[u.department.id] = (map[u.department.id] ?? 0) + 1;
    }
    return map;
  }, [users, currentUserId]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Permissions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Grant or restrict access to specific pages for any person, role, or department.
        </p>
      </div>

      <div className="flex gap-5 items-start">

        {/* ── LEFT PANEL ── */}
        <div className="w-72 shrink-0 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col" style={{ height: "calc(100vh - 180px)" }}>

          {/* Tab bar */}
          <div className="flex border-b border-gray-100 shrink-0">
            {(["people", "role", "dept"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSearch(""); setSelectedTarget(null); setPending({}); }}
                className={cn(
                  "flex-1 py-2.5 text-xs font-medium transition-colors",
                  activeTab === tab
                    ? "text-gray-900 border-b-2 border-gray-900"
                    : "text-gray-400 hover:text-gray-700"
                )}
              >
                {tab === "people" ? "People" : tab === "role" ? "By Role" : "By Dept"}
              </button>
            ))}
          </div>

          {/* Search (people tab only) */}
          {activeTab === "people" && (
            <div className="px-3 py-2 border-b border-gray-100 shrink-0">
              <input
                type="search"
                placeholder="Search people…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">

            {/* People tab */}
            {activeTab === "people" && (
              <>
                {filteredUsers.length === 0 && (
                  <p className="px-4 py-6 text-sm text-gray-400 text-center">No users found</p>
                )}
                {filteredUsers.map((user) => {
                  const isSelected = selectedTarget?.type === "user" && selectedTarget.user.id === user.id;
                  return (
                    <button
                      key={user.id}
                      onClick={() => selectTarget({ type: "user", user })}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors",
                        isSelected && "bg-gray-50"
                      )}
                    >
                      <Initials name={`${user.first_name} ${user.last_name}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {user.first_name} {user.last_name}
                          </p>
                          <TierBadge tier={user.role.tier} />
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                          {user.department?.name ?? "No department"}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="w-1.5 h-6 rounded-full bg-gray-900 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {/* By Role tab */}
            {activeTab === "role" && roles.map((role) => {
              const count = userCountByRole[role.id] ?? 0;
              const isSelected = selectedTarget?.type === "role" && selectedTarget.role.id === role.id;
              return (
                <button
                  key={role.id}
                  onClick={() => selectTarget({ type: "role", role })}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors",
                    isSelected && "bg-gray-50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{role.name}</p>
                      <TierBadge tier={role.tier} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{count} {count === 1 ? "user" : "users"}</p>
                  </div>
                  {isSelected && <div className="w-1.5 h-6 rounded-full bg-gray-900 shrink-0" />}
                </button>
              );
            })}

            {/* By Dept tab */}
            {activeTab === "dept" && departments.map((dept) => {
              const count = userCountByDept[dept.id] ?? 0;
              const isSelected = selectedTarget?.type === "dept" && selectedTarget.dept.id === dept.id;
              return (
                <button
                  key={dept.id}
                  onClick={() => selectTarget({ type: "dept", dept })}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors",
                    isSelected && "bg-gray-50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{dept.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{count} {count === 1 ? "user" : "users"}</p>
                  </div>
                  {isSelected && <div className="w-1.5 h-6 rounded-full bg-gray-900 shrink-0" />}
                </button>
              );
            })}

          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 min-w-0">
          {!selectedTarget ? (
            <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center py-20 text-center">
              <div className="text-4xl mb-3">🔐</div>
              <p className="text-sm font-medium text-gray-700">Select a target</p>
              <p className="text-xs text-gray-400 mt-1">
                Choose a person, role, or department from the left panel
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">

              {/* Right panel header */}
              <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-0.5">
                    {selectedTarget.type === "user" ? "User" : selectedTarget.type === "role" ? "Role" : "Department"}
                  </p>
                  <h2 className="text-lg font-semibold text-gray-900">{targetLabel(selectedTarget)}</h2>
                  {selectedTarget.type === "user" && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {selectedTarget.user.email} · {selectedTarget.user.department?.name ?? "No dept"} · {TIER_LABELS[selectedTarget.user.role.tier] ?? selectedTarget.user.role.name}
                    </p>
                  )}
                  {selectedTarget.type !== "user" && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Applies to {targetIds.length} {targetIds.length === 1 ? "user" : "users"}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSave}
                  disabled={!hasPendingChanges || saving || isBlocked}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    hasPendingChanges && !saving && !isBlocked
                      ? "bg-gray-900 text-white hover:bg-gray-700"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  )}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>

              {/* Super admin blocker */}
              {isBlocked && (
                <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 mb-1">Protected — cannot be modified</p>
                  <p className="text-sm text-gray-500 max-w-xs">
                    Super Admin accounts have unrestricted access by design. Their page visibility cannot be overridden.
                  </p>
                </div>
              )}

              {/* Info banners */}
              {!isBlocked && selectedTarget.type !== "user" && mixedOverrides && (
                <div className="mx-5 mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <strong>Note:</strong> Some users in this group have individual overrides that differ. Saving will apply these changes to all {targetIds.length} users uniformly.
                </div>
              )}

              {!isBlocked && selectedTarget.type === "role" && (
                <div className="mx-5 mt-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  <strong>Tip:</strong> The &quot;default&quot; dots reflect tier-based access with no department applied. Department-restricted pages are shown as hidden by default for this role.
                </div>
              )}

              {/* Legend + nav groups (hidden when blocked) */}
              {!isBlocked && (
                <>
                  <div className="flex items-center gap-5 px-5 pt-4 pb-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <div className="w-2 h-2 rounded-full bg-green-400" />
                      Visible by default
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <div className="w-2 h-2 rounded-full bg-gray-300" />
                      Hidden by default
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="w-4 h-4 flex items-center justify-center rounded border border-amber-400 text-amber-500 font-bold text-[10px]">!</span>
                      Unsaved change
                    </div>
                  </div>

                  {/* Nav groups */}
                  <div className="px-5 pb-5 space-y-3">
                    {NAV_GROUPS.map((group, i) => (
                      <PageGroupSection
                        key={group.slug}
                        group={group}
                        defaultVisible={defaultVisible}
                        savedOverrides={savedOverrides}
                        pending={pending}
                        onToggle={handleToggle}
                        defaultOpen={i === 0}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
