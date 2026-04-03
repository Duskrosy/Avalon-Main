"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Role = { id: string; name: string; slug: string; tier: number };
type User = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  department: { name: string } | null;
  role: Role;
};
type Override = {
  id: string;
  user_id: string;
  granted: boolean;
  permission: { action: string; resource: string };
};

type Props = {
  users: User[];
  roles: Role[];
  overrides: Override[];
  currentUserId: string;
};

export function PermissionsView({ users, roles, overrides, currentUserId }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const filtered = users.filter((u) =>
    `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  async function handleRoleChange(userId: string, roleId: string) {
    setSavingId(userId);

    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: roleId }),
    });

    setSavingId(null);

    if (!res.ok) {
      const data = await res.json();
      alert(data.error);
      return;
    }

    router.refresh();
  }

  function getOverridesFor(userId: string) {
    return overrides.filter((o) => o.user_id === userId);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Permissions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage role assignments and permission overrides for all users.
        </p>
      </div>

      <div className="mb-4">
        <input
          type="search"
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Overrides</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((user) => {
              const userOverrides = getOverridesFor(user.id);
              const isSelf = user.id === currentUserId;

              return (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">
                        {user.first_name} {user.last_name}
                        {isSelf && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                      </p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.department?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role?.id ?? ""}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      disabled={savingId === user.id || isSelf}
                      className={cn(
                        "border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    {savingId === user.id && (
                      <span className="ml-2 text-xs text-gray-400">Saving…</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {userOverrides.length === 0 ? (
                      <span className="text-xs text-gray-400">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {userOverrides.map((o) => (
                          <span
                            key={o.id}
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                              o.granted ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            )}
                          >
                            {o.granted ? "+" : "−"} {o.permission.action}:{o.permission.resource}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
