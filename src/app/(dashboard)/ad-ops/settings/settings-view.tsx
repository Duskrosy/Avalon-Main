"use client";

import { useState, useCallback } from "react";
import { useToast, Toast } from "@/components/ui/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type Group = {
  id: string;
  name: string;
  currency: string;
  is_active: boolean;
  sort_order: number;
};

type MetaAccount = {
  id: string;
  account_id: string;
  name: string;
  label: string | null;
  currency: string;
  is_active: boolean;
  group_id: string | null;
};

type Props = {
  initialGroups: Group[];
  initialAccounts: MetaAccount[];
};

const CURRENCIES = [
  "USD","PHP","AUD","GBP","EUR","SGD","CAD","HKD","NZD","MYR","IDR","THB","JPY","KRW",
];

// ─── Small helpers ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin w-3.5 h-3.5 text-[var(--color-text-tertiary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdOpsSettings({ initialGroups, initialAccounts }: Props) {
  const { toast, setToast } = useToast();
  const [groups,   setGroups]   = useState<Group[]>(initialGroups);
  const [accounts, setAccounts] = useState<MetaAccount[]>(initialAccounts);

  // Global busy tracker per entity id
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  function isBusy(id: string) { return !!busy[id]; }
  function startBusy(id: string) { setBusy((b) => ({ ...b, [id]: true })); }
  function endBusy(id: string)   { setBusy((b) => { const n = { ...b }; delete n[id]; return n; }); }

  async function api(method: string, url: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
  }

  // ── Group CRUD ────────────────────────────────────────────────────────────

  // New group modal state
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupCurrency, setNewGroupCurrency] = useState("PHP");
  const [creatingGroup, setCreatingGroup] = useState(false);

  async function createGroup() {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    setError(null);
    try {
      const g = await api("POST", "/api/ad-ops/account-groups", {
        name: newGroupName.trim(),
        currency: newGroupCurrency,
      });
      setGroups((prev) => [...prev, g].sort((a, b) => a.name.localeCompare(b.name)));
      setNewGroupName("");
      setNewGroupCurrency("PHP");
      setShowNewGroup(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create group");
    } finally {
      setCreatingGroup(false);
    }
  }

  async function updateGroup(id: string, patch: Partial<Group>) {
    startBusy(id);
    setError(null);
    try {
      const g = await api("PATCH", "/api/ad-ops/account-groups", { id, ...patch });
      setGroups((prev) => prev.map((x) => x.id === id ? { ...x, ...g } : x));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update group");
    } finally {
      endBusy(id);
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm("Delete this account group? The Meta ad accounts inside will be unlinked but not deleted.")) return;
    startBusy(id);
    setError(null);
    try {
      await api("DELETE", "/api/ad-ops/account-groups", { id });
      setGroups((prev) => prev.filter((g) => g.id !== id));
      setAccounts((prev) => prev.map((a) => a.group_id === id ? { ...a, group_id: null } : a));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete group");
    } finally {
      endBusy(id);
    }
  }

  // ── Meta account CRUD ─────────────────────────────────────────────────────

  // Per-group "add account" form state
  const [addingTo, setAddingTo]           = useState<string | null>(null); // group id or "ungrouped"
  const [newAccountId, setNewAccountId]   = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);

  function openAddAccount(groupId: string | null) {
    setAddingTo(groupId ?? "ungrouped");
    setNewAccountId("");
    setNewAccountName("");
    setNewAccountLabel("");
  }

  async function addAccount(groupId: string | null) {
    if (!newAccountId.trim() || !newAccountName.trim()) return;
    setAddingAccount(true);
    setError(null);
    try {
      const a = await api("POST", "/api/ad-ops/meta-accounts", {
        account_id: newAccountId.trim(),
        name: newAccountName.trim(),
        label: newAccountLabel.trim() || null,
        currency: groups.find((g) => g.id === groupId)?.currency ?? "USD",
        group_id: groupId ?? null,
      });
      setAccounts((prev) => [...prev, a].sort((x, y) => x.name.localeCompare(y.name)));
      setAddingTo(null);
      setToast({ message: "Ad account added", type: "success" });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add account");
    } finally {
      setAddingAccount(false);
    }
  }

  async function removeAccount(id: string) {
    if (!confirm("Remove this Meta ad account? Historical sync data will be kept.")) return;
    startBusy(id);
    setError(null);
    try {
      await api("DELETE", "/api/ad-ops/meta-accounts", { id });
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove account");
    } finally {
      endBusy(id);
    }
  }

  async function moveAccount(id: string, groupId: string | null) {
    startBusy(id);
    setError(null);
    try {
      await api("PATCH", "/api/ad-ops/meta-accounts", { id, group_id: groupId });
      setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, group_id: groupId } : a));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to move account");
    } finally {
      endBusy(id);
    }
  }

  async function toggleAccount(id: string, is_active: boolean) {
    startBusy(id);
    setError(null);
    try {
      await api("PATCH", "/api/ad-ops/meta-accounts", { id, is_active });
      setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, is_active } : a));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update account");
    } finally {
      endBusy(id);
    }
  }

  // ── Inline group editing ──────────────────────────────────────────────────
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName]   = useState("");

  function startEditGroup(g: Group) {
    setEditingGroupId(g.id);
    setEditGroupName(g.name);
  }

  async function saveGroupName(id: string) {
    if (!editGroupName.trim()) return;
    await updateGroup(id, { name: editGroupName.trim() });
    setEditingGroupId(null);
  }

  // ── Render helper: add-account form ──────────────────────────────────────
  const AddAccountForm = useCallback(({ groupId }: { groupId: string | null }) => {
    const key = groupId ?? "ungrouped";
    if (addingTo !== key) return null;
    return (
      <div className="mt-3 bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-4 border border-[var(--color-border-primary)]">
        <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-3">Add Meta Ad Account</p>
        <div className="space-y-2">
          <input
            autoFocus
            type="text"
            placeholder="Meta account ID (e.g. 123456789)"
            value={newAccountId}
            onChange={(e) => setNewAccountId(e.target.value)}
            className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
          <input
            type="text"
            placeholder="Name shown in Avalon (e.g. Local Main)"
            value={newAccountName}
            onChange={(e) => setNewAccountName(e.target.value)}
            className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
          <input
            type="text"
            placeholder="Label / note (optional)"
            value={newAccountLabel}
            onChange={(e) => setNewAccountLabel(e.target.value)}
            className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setAddingTo(null)}
            className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] text-sm py-2 rounded-lg hover:bg-[var(--color-surface-active)]"
          >
            Cancel
          </button>
          <button
            onClick={() => addAccount(groupId)}
            disabled={addingAccount || !newAccountId.trim() || !newAccountName.trim()}
            className="flex-1 bg-[var(--color-text-primary)] text-white text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {addingAccount ? <><Spinner /> Adding…</> : "Add Account"}
          </button>
        </div>
      </div>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addingTo, newAccountId, newAccountName, newAccountLabel, addingAccount]);

  // ── Render helper: account chip ────────────────────────────────────────────
  function AccountChip({ account }: { account: MetaAccount }) {
    const [showMove, setShowMove] = useState(false);
    return (
      <div className={`flex items-center gap-2 bg-[var(--color-bg-primary)] border rounded-[var(--radius-lg)] px-3 py-2.5 ${account.is_active ? "border-[var(--color-border-primary)]" : "border-[var(--color-border-secondary)] opacity-60"}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">{account.name}</span>
            {account.label && (
              <span className="text-xs text-[var(--color-text-tertiary)]">{account.label}</span>
            )}
            {!account.is_active && (
              <span className="text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] px-1.5 py-0.5 rounded-full">inactive</span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono mt-0.5">act_{account.account_id}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isBusy(account.id) ? (
            <Spinner />
          ) : (
            <>
              {/* Move to group */}
              <div className="relative">
                <button
                  onClick={() => setShowMove((s) => !s)}
                  title="Move to group"
                  className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] rounded"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </button>
                {showMove && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] z-10 py-1">
                    <p className="px-3 py-1.5 text-xs text-[var(--color-text-tertiary)] font-medium">Move to…</p>
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => { moveAccount(account.id, g.id); setShowMove(false); }}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-surface-hover)] ${account.group_id === g.id ? "text-[var(--color-text-tertiary)] cursor-default" : "text-[var(--color-text-primary)]"}`}
                        disabled={account.group_id === g.id}
                      >
                        {g.name}
                      </button>
                    ))}
                    {account.group_id !== null && (
                      <button
                        onClick={() => { moveAccount(account.id, null); setShowMove(false); }}
                        className="w-full text-left px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] border-t border-[var(--color-border-secondary)] mt-1 pt-2"
                      >
                        Ungroup
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Toggle active */}
              <button
                onClick={() => toggleAccount(account.id, !account.is_active)}
                title={account.is_active ? "Deactivate" : "Activate"}
                className={`p-1 rounded ${account.is_active ? "text-[var(--color-text-tertiary)] hover:text-amber-500" : "text-[var(--color-text-tertiary)] hover:text-[var(--color-success)]"}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {account.is_active
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />}
                </svg>
              </button>

              {/* Remove */}
              <button
                onClick={() => removeAccount(account.id)}
                title="Remove account"
                className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] rounded"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const ungroupedAccounts = accounts.filter((a) => !a.group_id);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Ad Ops Settings</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Manage account groups and Meta ad accounts</p>
        </div>
        <button
          onClick={() => setShowNewGroup(true)}
          className="bg-[var(--color-text-primary)] text-white text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
        >
          + New Group
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-[var(--color-error-light)] border border-red-200 rounded-[var(--radius-lg)] px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </div>
      )}

      {/* New group modal */}
      {showNewGroup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">New Account Group</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Group Name *</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g. Local, International, PCDLF"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createGroup()}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Default Currency</label>
                <select
                  value={newGroupCurrency}
                  onChange={(e) => setNewGroupCurrency(e.target.value)}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowNewGroup(false)}
                className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-primary)] text-sm py-2 rounded-lg hover:bg-[var(--color-surface-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={createGroup}
                disabled={creatingGroup || !newGroupName.trim()}
                className="flex-1 bg-[var(--color-text-primary)] text-white text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creatingGroup ? <><Spinner /> Creating…</> : "Create Group"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account groups */}
      <div className="space-y-4">
        {groups.length === 0 && (
          <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
            <p className="text-sm text-[var(--color-text-tertiary)]">No account groups yet</p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Create a group (e.g. Local, International) then add your Meta ad accounts to it</p>
          </div>
        )}

        {groups.map((group) => {
          const groupAccounts = accounts.filter((a) => a.group_id === group.id);
          return (
            <div key={group.id} className={`border rounded-2xl overflow-hidden ${group.is_active ? "border-[var(--color-border-primary)]" : "border-[var(--color-border-secondary)] opacity-70"}`}>
              {/* Group header */}
              <div className="bg-[var(--color-bg-primary)] px-5 py-4 flex items-center gap-3 flex-wrap">
                {/* Name (inline edit) */}
                {editingGroupId === group.id ? (
                  <input
                    autoFocus
                    value={editGroupName}
                    onChange={(e) => setEditGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveGroupName(group.id);
                      if (e.key === "Escape") setEditingGroupId(null);
                    }}
                    onBlur={() => saveGroupName(group.id)}
                    className="flex-1 text-base font-semibold text-[var(--color-text-primary)] border-b border-[var(--color-border-primary)] focus:outline-none focus:border-[var(--color-text-primary)] bg-transparent"
                  />
                ) : (
                  <button
                    onClick={() => startEditGroup(group)}
                    className="flex-1 text-left text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-text-secondary)] min-w-0 truncate"
                    title="Click to rename"
                  >
                    {group.name}
                  </button>
                )}

                {/* Currency selector */}
                <select
                  value={group.currency}
                  onChange={(e) => updateGroup(group.id, { currency: e.target.value })}
                  disabled={isBusy(group.id)}
                  className="border border-[var(--color-border-primary)] rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:opacity-50"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>

                {/* Active toggle */}
                <button
                  onClick={() => updateGroup(group.id, { is_active: !group.is_active })}
                  disabled={isBusy(group.id)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${group.is_active ? "bg-[var(--color-success-light)] text-[var(--color-success)] hover:bg-[var(--color-success-light)]" : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-border-primary)]"}`}
                >
                  {group.is_active ? "● Active" : "○ Inactive"}
                </button>

                {/* Delete group */}
                <button
                  onClick={() => deleteGroup(group.id)}
                  disabled={isBusy(group.id)}
                  title="Delete group"
                  className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Accounts in group */}
              <div className="px-5 pb-4 bg-[var(--color-bg-secondary)]/50 border-t border-[var(--color-border-secondary)]">
                <div className="pt-3 space-y-2">
                  {groupAccounts.length === 0 && addingTo !== group.id && (
                    <p className="text-xs text-[var(--color-text-tertiary)] py-2">No Meta ad accounts in this group yet</p>
                  )}
                  {groupAccounts.map((account) => (
                    <AccountChip key={account.id} account={account} />
                  ))}
                </div>

                <AddAccountForm groupId={group.id} />

                {addingTo !== group.id && (
                  <button
                    onClick={() => openAddAccount(group.id)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Meta ad account
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Ungrouped accounts */}
        {(ungroupedAccounts.length > 0 || addingTo === "ungrouped") && (
          <div className="border border-dashed border-[var(--color-border-primary)] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[var(--color-bg-primary)] flex items-center justify-between">
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">Ungrouped accounts</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">Assign to a group using the ⇄ button</p>
            </div>
            <div className="px-5 pb-4 bg-[var(--color-bg-secondary)]/50 border-t border-[var(--color-border-secondary)]">
              <div className="pt-3 space-y-2">
                {ungroupedAccounts.map((account) => (
                  <AccountChip key={account.id} account={account} />
                ))}
              </div>
              <AddAccountForm groupId={null} />
              {addingTo !== "ungrouped" && (
                <button
                  onClick={() => openAddAccount(null)}
                  className="mt-3 flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add ungrouped Meta ad account
                </button>
              )}
            </div>
          </div>
        )}

        {/* If no groups and no ungrouped accounts, show full empty state */}
        {groups.length === 0 && ungroupedAccounts.length === 0 && addingTo === "ungrouped" && (
          <div className="border border-dashed border-[var(--color-border-primary)] rounded-2xl px-5 pb-4 bg-[var(--color-bg-secondary)]/50">
            <AddAccountForm groupId={null} />
          </div>
        )}
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

// ─── (SMM Groups Panel moved to /creatives/content/smm-settings-panel.tsx) ───
