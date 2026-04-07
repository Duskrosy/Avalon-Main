"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

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
};

type Props = {
  users: User[];
  deactivatedUsers: User[];
  departments: Department[];
  roles: Role[];
  currentUserId: string;
  isOps: boolean;
};

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  department_id: "",
  role_id: "",
  phone: "",
  birthday: "",
};

export function AccountsView({
  users: initial,
  deactivatedUsers: initialDeactivated,
  departments,
  roles,
  currentUserId,
  isOps,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab]   = useState<"active" | "deactivated">("active");
  const [users, setUsers]           = useState(initial);
  const [deactivated, setDeactivated] = useState(initialDeactivated);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState<Partial<typeof EMPTY_FORM & { department_id: string; role_id: string }>>({});
  const [error, setError]           = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);

  // ── Create ────────────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) { setError(data.error); return; }

    setShowCreate(false);
    setForm(EMPTY_FORM);
    router.refresh();
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  async function handleEdit(userId: string) {
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) { setError(data.error); return; }

    setEditingId(null);
    setEditForm({});
    router.refresh();
  }

  // ── Deactivate (soft) ─────────────────────────────────────────────────────

  async function handleDeactivate(userId: string, name: string) {
    if (!confirm(`Deactivate ${name}?\n\nThey will lose access to Avalon immediately. You can reactivate them later from the Deactivated tab.`)) return;

    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    const data = await res.json();

    if (!res.ok) { alert(data.error); return; }

    // Move from active list to deactivated list (optimistic)
    const moved = users.find((u) => u.id === userId);
    if (moved) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setDeactivated((prev) => [{ ...moved, status: "inactive", deleted_at: new Date().toISOString() }, ...prev]);
    }
  }

  // ── Reactivate ────────────────────────────────────────────────────────────

  async function handleReactivate(userId: string, name: string) {
    if (!confirm(`Reactivate ${name}?\n\nThey will regain access to Avalon.`)) return;

    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    const data = await res.json();

    if (!res.ok) { alert(data.error); return; }

    // Move from deactivated list back to active (optimistic)
    const moved = deactivated.find((u) => u.id === userId);
    if (moved) {
      setDeactivated((prev) => prev.filter((u) => u.id !== userId));
      setUsers((prev) => [...prev, { ...moved, status: "active", deleted_at: null }].sort((a, b) => a.first_name.localeCompare(b.first_name)));
    }
  }

  // ── Permanent delete ──────────────────────────────────────────────────────

  async function handlePermanentDelete(userId: string, name: string) {
    if (!confirm(`Permanently delete ${name}?\n\nThis will remove them from the database entirely and cannot be undone.`)) return;
    if (!confirm(`Are you sure? This is irreversible.`)) return;

    const res = await fetch(`/api/users/${userId}?permanent=true`, { method: "DELETE" });
    const data = await res.json();

    if (!res.ok) { alert(data.error); return; }

    setDeactivated((prev) => prev.filter((u) => u.id !== userId));
  }

  const availableRoles = isOps ? roles : roles.filter((r) => r.tier > 1);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">User Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeTab === "active"
              ? `${users.length} active user${users.length !== 1 ? "s" : ""}`
              : `${deactivated.length} deactivated user${deactivated.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {activeTab === "active" && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            + New user
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5 gap-0">
        {[
          { key: "active",      label: "Active",      count: users.length },
          { key: "deactivated", label: "Deactivated", count: deactivated.length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as "active" | "deactivated")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.key
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300",
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full font-medium",
                activeTab === tab.key
                  ? tab.key === "deactivated" ? "bg-gray-200 text-gray-600" : "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500",
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Create modal ─────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create User</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">First name</label>
                  <input
                    required
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Last name</label>
                  <input
                    required
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
                  <select
                    required
                    value={form.department_id}
                    onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  >
                    <option value="">Select…</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                  <select
                    required
                    value={form.role_id}
                    onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  >
                    <option value="">Select…</option>
                    {availableRoles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone (optional)</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Birthday (optional)</label>
                  <input
                    type="date"
                    value={form.birthday}
                    onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); setError(null); }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? "Creating…" : "Create user"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Active users table ────────────────────────────────────────────── */}
      {activeTab === "active" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  {editingId === user.id ? (
                    <>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <input
                            value={editForm.first_name ?? user.first_name}
                            onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                          <input
                            value={editForm.last_name ?? user.last_name}
                            onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-500">{user.email}</td>
                      <td className="px-4 py-2">
                        <select
                          value={editForm.department_id ?? user.department?.id ?? ""}
                          onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                        >
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={editForm.role_id ?? user.role?.id ?? ""}
                          onChange={(e) => setEditForm({ ...editForm, role_id: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                        >
                          {availableRoles.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => handleEdit(user.id)}
                            disabled={saving}
                            className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditForm({}); }}
                            className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-medium shrink-0">
                            {user.first_name[0]}{user.last_name[0]}
                          </div>
                          <span className="font-medium text-gray-900">
                            {user.first_name} {user.last_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{user.email}</td>
                      <td className="px-4 py-3 text-gray-600">{user.department?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          user.role?.tier <= 1 ? "bg-purple-100 text-purple-700" :
                          user.role?.tier === 2 ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-600",
                        )}>
                          {user.role?.name ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => {
                              setEditingId(user.id);
                              setEditForm({
                                first_name:    user.first_name,
                                last_name:     user.last_name,
                                department_id: user.department?.id ?? "",
                                role_id:       user.role?.id ?? "",
                              });
                            }}
                            className="text-xs text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100"
                          >
                            Edit
                          </button>
                          {isOps && user.id !== currentUserId && (
                            <button
                              onClick={() => handleDeactivate(user.id, `${user.first_name} ${user.last_name}`)}
                              className="text-xs text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-50"
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                    No active users
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Deactivated users table ───────────────────────────────────────── */}
      {activeTab === "deactivated" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {deactivated.length > 0 && (
            <div className="px-4 py-3 border-b border-gray-100 bg-amber-50 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <p className="text-xs text-amber-700">
                Deactivated accounts have no access to Avalon. Use <strong>Reactivate</strong> to restore access, or <strong>Delete</strong> to permanently remove.
              </p>
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Deactivated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deactivated.map((user) => (
                <tr key={user.id} className="opacity-60 bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-medium shrink-0">
                        {user.first_name[0]}{user.last_name[0]}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600 line-through decoration-gray-400">
                          {user.first_name} {user.last_name}
                        </span>
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500 font-medium">
                          inactive
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{user.email}</td>
                  <td className="px-4 py-3 text-gray-400">{user.department?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">
                      {user.role?.name ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {user.deleted_at
                      ? format(parseISO(user.deleted_at), "d MMM yyyy")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {isOps && (
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => handleReactivate(user.id, `${user.first_name} ${user.last_name}`)}
                          className="text-xs text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-50 border border-green-200 font-medium"
                        >
                          Reactivate
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(user.id, `${user.first_name} ${user.last_name}`)}
                          className="text-xs text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 border border-red-200"
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
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                    No deactivated users
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
