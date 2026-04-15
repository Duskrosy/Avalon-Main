"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast, Toast } from "@/components/ui/toast";

type Department = { id: string; name: string; slug: string };
type Role = { id: string; name: string; slug: string; tier: number };
type User = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  birthday: string | null;
  department: Department;
  role: Role;
  status: string;
  created_at: string;
  deleted_at?: string | null;
  must_change_password?: boolean;
  require_mfa?: boolean;
  allow_password_change?: boolean;
};

type Props = {
  users: User[];
  deactivatedUsers: User[];
  departments: Department[];
  roles: Role[];
  currentUserId: string;
  currentUserTier: number;
  isOps: boolean;
};

// ─── Security checkbox row ────────────────────────────────────────────────────

function SecurityCheck({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={cn("flex items-start gap-3 cursor-pointer", disabled && "opacity-50 cursor-not-allowed")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-gray-900"
      />
      <div>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{label}</p>
        {description && <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

// ─── User modal (create or edit) ─────────────────────────────────────────────

function UserModal({
  mode,
  user,
  departments,
  roles,
  currentUserTier,
  isOps,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  user?: User;
  departments: Department[];
  roles: Role[];
  currentUserTier: number;
  isOps: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Roles the current user may assign (cannot assign strictly higher privilege)
  const assignableRoles = roles.filter((r) => {
    if (r.tier < currentUserTier) return false; // higher privilege — blocked
    if (!isOps && r.tier <= 1) return false;    // non-OPS can't assign OPS roles
    return true;
  });

  const [form, setForm] = useState({
    first_name:    user?.first_name    ?? "",
    last_name:     user?.last_name     ?? "",
    email:         user?.email         ?? "",
    password:      "",
    department_id: user?.department?.id ?? "",
    role_id:       user?.role?.id      ?? "",
    phone:         user?.phone         ?? "",
    birthday:      user?.birthday      ?? "",
    // Security flags — defaults for new users
    must_change_password:  user?.must_change_password  ?? true,
    require_mfa:           user?.require_mfa           ?? true,
    allow_password_change: user?.allow_password_change ?? true,
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // If selected role is OPS+ (tier <= 1), require_mfa must stay on
  const selectedRole   = roles.find((r) => r.id === form.role_id);
  const mfaForced      = selectedRole ? selectedRole.tier <= 1 : false;

  function setField<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      // If switching to OPS role, force require_mfa
      if (k === "role_id") {
        const r = roles.find((r) => r.id === v);
        if (r && r.tier <= 1) next.require_mfa = true;
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    let res: Response;
    if (mode === "create") {
      res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      // OPS can change email/password; non-OPS strip them
      const editBody: Record<string, unknown> = { ...form };
      delete editBody.password;
      if (!isOps) delete editBody.email;
      if (isOps && form.password.trim().length >= 8) {
        editBody.password = form.password;
      }
      if (!editBody.password) delete editBody.password;
      res = await fetch(`/api/users/${user!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editBody),
      });
    }

    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error); return; }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--color-bg-primary)] rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[var(--color-border-secondary)]">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {mode === "create" ? "Create User" : `Edit ${user!.first_name} ${user!.last_name}`}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-active)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">First name</label>
              <input
                required
                value={form.first_name}
                onChange={(e) => setField("first_name", e.target.value)}
                className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Last name</label>
              <input
                required
                value={form.last_name}
                onChange={(e) => setField("last_name", e.target.value)}
                className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>

          {/* Email (create always, edit for OPS only) */}
          {(mode === "create" || isOps) && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Email</label>
              <input
                type="email"
                required={mode === "create"}
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              {mode === "edit" && (
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Changing this will update their login email.</p>
              )}
            </div>
          )}

          {/* Password (create always, edit for OPS only) */}
          {(mode === "create" || isOps) && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                {mode === "create" ? "Password" : "New password"}
                {mode === "edit" && <span className="text-[var(--color-text-tertiary)] font-normal"> (leave blank to keep current)</span>}
              </label>
              <PasswordInput
                required={mode === "create"}
                minLength={mode === "create" ? 8 : undefined}
                value={form.password}
                onChange={(e) => setField("password", e.target.value)}
                placeholder={mode === "edit" ? "Leave blank to keep current" : undefined}
              />
            </div>
          )}

          {/* Dept + Role */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Department</label>
              <select
                required
                value={form.department_id}
                onChange={(e) => setField("department_id", e.target.value)}
                className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-[var(--color-bg-primary)]"
              >
                <option value="">Select…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Role</label>
              <select
                required
                value={form.role_id}
                onChange={(e) => setField("role_id", e.target.value)}
                className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-[var(--color-bg-primary)]"
              >
                <option value="">Select…</option>
                {assignableRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          {/* Phone + Birthday */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Phone <span className="text-[var(--color-text-tertiary)] font-normal">(optional)</span></label>
              <input
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Birthday <span className="text-[var(--color-text-tertiary)] font-normal">(optional)</span></label>
              <input
                type="date"
                value={form.birthday}
                onChange={(e) => setField("birthday", e.target.value)}
                className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>

          {/* Security flags */}
          <div className="border-t border-[var(--color-border-secondary)] pt-4 space-y-3">
            <p className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Account Security</p>
            <SecurityCheck
              label="Ask to change password on next login"
              description="Employee must set a new password when they first sign in."
              checked={form.must_change_password}
              onChange={(v) => setField("must_change_password", v)}
            />
            <SecurityCheck
              label="Require MFA"
              description={mfaForced ? "Required for OPS-level roles — cannot be disabled." : "Employee must set up two-factor authentication."}
              checked={form.require_mfa}
              disabled={mfaForced}
              onChange={(v) => setField("require_mfa", v)}
            />
            <SecurityCheck
              label="Allow changing of password"
              description="If unchecked, the employee cannot change their own password."
              checked={form.allow_password_change}
              onChange={(v) => setField("allow_password_change", v)}
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] px-3 py-2 rounded-[var(--radius-md)]">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-primary)] py-2 rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-surface-hover)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] py-2 rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
            >
              {saving ? (mode === "create" ? "Creating…" : "Saving…") : (mode === "create" ? "Create user" : "Save changes")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function AccountsView({
  users: initial,
  deactivatedUsers: initialDeactivated,
  departments,
  roles,
  currentUserId,
  currentUserTier,
  isOps,
}: Props) {
  const { toast, setToast } = useToast();
  const [activeTab,    setActiveTab]    = useState<"active" | "deactivated">("active");
  const [users,        setUsers]        = useState(initial);
  const [deactivated,  setDeactivated]  = useState(initialDeactivated);
  const [showCreate,   setShowCreate]   = useState(false);
  const [editingUser,  setEditingUser]  = useState<User | null>(null);

  function canEdit(user: User): boolean {
    if (user.id === currentUserId) return false; // can't edit yourself here
    const targetTier = user.role?.tier ?? 99;
    return targetTier >= currentUserTier; // cannot edit users with strictly higher privilege
  }

  // ── Force sign out ────────────────────────────────────────────────────────

  async function handleForceSignOut(userId: string, name: string) {
    if (!confirm(`Force sign out ${name}?\n\nThis will end all their active sessions immediately. They will need to sign in again.`)) return;

    const res  = await fetch(`/api/users/${userId}/signout`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setToast({ message: data.error, type: "error" }); return; }
    setToast({ message: `${name} has been signed out of all devices.`, type: "success" });
  }

  // ── Deactivate ────────────────────────────────────────────────────────────

  async function handleDeactivate(userId: string, name: string) {
    if (!confirm(`Deactivate ${name}?\n\nThey will lose access to Avalon immediately. You can reactivate them later from the Deactivated tab.`)) return;

    const res  = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setToast({ message: data.error, type: "error" }); return; }

    const moved = users.find((u) => u.id === userId);
    if (moved) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setDeactivated((prev) => [{ ...moved, status: "inactive", deleted_at: new Date().toISOString() }, ...prev]);
    }
    setToast({ message: `${name} has been deactivated.`, type: "success" });
  }

  // ── Reactivate ────────────────────────────────────────────────────────────

  async function handleReactivate(userId: string, name: string) {
    if (!confirm(`Reactivate ${name}?\n\nThey will regain access to Avalon.`)) return;

    const res  = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    const data = await res.json();
    if (!res.ok) { setToast({ message: data.error, type: "error" }); return; }

    const moved = deactivated.find((u) => u.id === userId);
    if (moved) {
      setDeactivated((prev) => prev.filter((u) => u.id !== userId));
      setUsers((prev) => [...prev, { ...moved, status: "active", deleted_at: null }].sort((a, b) => a.first_name.localeCompare(b.first_name)));
    }
  }

  // ── Permanent delete ──────────────────────────────────────────────────────

  async function handlePermanentDelete(userId: string, name: string) {
    if (!confirm(`Permanently delete ${name}?\n\nThis will remove them from the database entirely and cannot be undone.`)) return;
    if (!confirm("Are you sure? This is irreversible.")) return;

    const res  = await fetch(`/api/users/${userId}?permanent=true`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setToast({ message: data.error, type: "error" }); return; }
    setDeactivated((prev) => prev.filter((u) => u.id !== userId));
    setToast({ message: `${name} has been permanently deleted.`, type: "success" });
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">User Accounts</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {activeTab === "active"
              ? `${users.length} active user${users.length !== 1 ? "s" : ""}`
              : `${deactivated.length} deactivated user${deactivated.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {activeTab === "active" && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] px-4 py-2 rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--color-text-secondary)] transition-colors"
          >
            + New user
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border-primary)] mb-5 gap-0">
        {([
          { key: "active",      label: "Active",      count: users.length },
          { key: "deactivated", label: "Deactivated", count: deactivated.length },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.key
                ? "border-[var(--color-text-primary)] text-[var(--color-text-primary)]"
                : "border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-primary)]",
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full font-medium",
                activeTab === tab.key
                  ? tab.key === "deactivated" ? "bg-[var(--color-border-primary)] text-[var(--color-text-secondary)]" : "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                  : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Modals */}
      {showCreate && (
        <UserModal
          mode="create"
          departments={departments}
          roles={roles}
          currentUserTier={currentUserTier}
          isOps={isOps}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            fetch("/api/users").then(r => r.json()).then(data => {
              if (data.users) setUsers(data.users);
            });
            setToast({ message: "User saved", type: "success" });
          }}
        />
      )}
      {editingUser && (
        <UserModal
          mode="edit"
          user={editingUser}
          departments={departments}
          roles={roles}
          currentUserTier={currentUserTier}
          isOps={isOps}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            fetch("/api/users").then(r => r.json()).then(data => {
              if (data.users) setUsers(data.users);
            });
            setToast({ message: "User saved", type: "success" });
          }}
        />
      )}

      {/* ── Active users table ────────────────────────────────────────────── */}
      {activeTab === "active" && (
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">Department</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">Role</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-secondary)]">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-[var(--color-surface-hover)]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar
                        url={(user as Record<string, unknown>).avatar_url as string | null ?? null}
                        initials={`${user.first_name[0]}${user.last_name[0]}`.toUpperCase()}
                        size="xs"
                      />
                      <div>
                        <span className="font-medium text-[var(--color-text-primary)]">
                          {user.first_name} {user.last_name}
                        </span>
                        {user.must_change_password && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-warning-light)] text-[var(--color-warning-text)] font-medium">
                            pw change
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">{user.email}</td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">{user.department?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                      user.role?.tier <= 1 ? "bg-purple-100 text-purple-700" :
                      user.role?.tier === 2 ? "bg-[var(--color-accent-light)] text-[var(--color-accent)]" :
                      "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
                    )}>
                      {user.role?.name ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      {canEdit(user) && (
                        <button
                          onClick={() => setEditingUser(user)}
                          className="text-xs text-[var(--color-text-secondary)] px-3 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-active)]"
                        >
                          Edit
                        </button>
                      )}
                      {user.id !== currentUserId && canEdit(user) && (
                        <button
                          onClick={() => handleForceSignOut(user.id, `${user.first_name} ${user.last_name}`)}
                          className="text-xs text-[var(--color-accent)] px-3 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-accent-light)]"
                        >
                          Sign out
                        </button>
                      )}
                      {isOps && user.id !== currentUserId && canEdit(user) && (
                        <button
                          onClick={() => handleDeactivate(user.id, `${user.first_name} ${user.last_name}`)}
                          className="text-xs text-[var(--color-warning)] px-3 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-warning-light)]"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--color-text-tertiary)]">No active users</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Deactivated users table ───────────────────────────────────────── */}
      {activeTab === "deactivated" && (
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] overflow-hidden">
          {deactivated.length > 0 && (
            <div className="px-4 py-3 border-b border-[var(--color-border-secondary)] bg-[var(--color-warning-light)] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <p className="text-xs text-[var(--color-warning-text)]">
                Deactivated accounts have no access to Avalon. Use <strong>Reactivate</strong> to restore access, or <strong>Delete</strong> to permanently remove.
              </p>
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">Department</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">Deactivated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-secondary)]">
              {deactivated.map((user) => (
                <tr key={user.id} className="opacity-60 bg-[var(--color-bg-secondary)]/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar
                        url={(user as Record<string, unknown>).avatar_url as string | null ?? null}
                        initials={`${user.first_name[0]}${user.last_name[0]}`.toUpperCase()}
                        size="xs"
                      />
                      <div>
                        <span className="font-medium text-[var(--color-text-secondary)] line-through decoration-gray-400">
                          {user.first_name} {user.last_name}
                        </span>
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-border-primary)] text-[var(--color-text-secondary)] font-medium">
                          inactive
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-tertiary)]">{user.email}</td>
                  <td className="px-4 py-3 text-[var(--color-text-tertiary)]">{user.department?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]">
                      {user.role?.name ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-tertiary)]">
                    {user.deleted_at ? format(parseISO(user.deleted_at), "d MMM yyyy") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {isOps && (
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => handleReactivate(user.id, `${user.first_name} ${user.last_name}`)}
                          className="text-xs text-[var(--color-success)] px-3 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-success-light)] border border-green-200 font-medium"
                        >
                          Reactivate
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(user.id, `${user.first_name} ${user.last_name}`)}
                          className="text-xs text-[var(--color-error)] px-3 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-error-light)] border border-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {deactivated.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--color-text-tertiary)]">No deactivated users</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
