"use client";

import { useState, useEffect } from "react";

type UserProgress = {
  user_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  department: { id: string; name: string; slug: string } | null;
  completed: number;
  viewed: number;
  total: number;
  pct: number;
  last_activity: string | null;
};

type DeptSummary = {
  id: string;
  name: string;
  total_users: number;
  avg_pct: number;
};

const PAGE_SIZE = 25;

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-[var(--color-success-light)]0" : pct >= 50 ? "bg-amber-400" : pct > 0 ? "bg-red-400" : "bg-[var(--color-border-primary)]";
  return (
    <div className="h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden w-24">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function InitialsAvatar({ first, last }: { first: string; last: string }) {
  return (
    <div className="w-8 h-8 rounded-full bg-[var(--color-border-primary)] flex items-center justify-center text-xs font-medium text-[var(--color-text-secondary)] shrink-0">
      {first[0]}{last[0]}
    </div>
  );
}

export function TeamProgress({ isOps, departments }: { isOps: boolean; departments: { id: string; name: string }[] }) {
  const [users, setUsers] = useState<UserProgress[]>([]);
  const [deptSummaries, setDeptSummaries] = useState<DeptSummary[]>([]);
  const [totalMaterials, setTotalMaterials] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "pct" | "activity">("pct");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (deptFilter !== "all") params.set("department_id", deptFilter);

    fetch(`/api/learning/progress?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load progress");
        const data = await res.json();
        setUsers(data.users);
        setDeptSummaries(data.departments);
        setTotalMaterials(data.total_materials);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [deptFilter]);

  useEffect(() => { setPage(1); }, [search, deptFilter, sortBy]);

  const filtered = users
    .filter((u) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return `${u.first_name} ${u.last_name}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === "pct") return b.pct - a.pct;
      if (sortBy === "activity") {
        if (!a.last_activity && !b.last_activity) return 0;
        if (!a.last_activity) return 1;
        if (!b.last_activity) return -1;
        return b.last_activity.localeCompare(a.last_activity);
      }
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) return <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading team progress...</div>;
  if (error) return <div className="text-center py-16 text-[var(--color-error)] text-sm">{error}</div>;

  return (
    <div className="space-y-6">
      {/* Department summary cards */}
      {deptSummaries.length > 1 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {deptSummaries.map((d) => (
            <button
              key={d.id}
              onClick={() => setDeptFilter(d.id === deptFilter ? "all" : d.id)}
              className={`text-left p-3 rounded-[var(--radius-lg)] border transition-colors ${
                d.id === deptFilter
                  ? "border-gray-900 bg-[var(--color-bg-secondary)]"
                  : "border-[var(--color-border-primary)] hover:border-[var(--color-border-primary)]"
              }`}
            >
              <p className="text-xs text-[var(--color-text-secondary)] truncate">{d.name}</p>
              <p className={`text-lg font-bold ${d.avg_pct >= 80 ? "text-[var(--color-success)]" : d.avg_pct >= 50 ? "text-[var(--color-warning)]" : "text-[var(--color-text-primary)]"}`}>
                {d.avg_pct}%
              </p>
              <p className="text-[10px] text-[var(--color-text-tertiary)]">{d.total_users} member{d.total_users !== 1 ? "s" : ""}</p>
            </button>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by name..."
          aria-label="Search team members"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        {isOps && (
          <select
            value={deptFilter}
            aria-label="Filter by department"
            onChange={(e) => setDeptFilter(e.target.value)}
            className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
        <select
          value={sortBy}
          aria-label="Sort by"
          onChange={(e) => setSortBy(e.target.value as "name" | "pct" | "activity")}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="pct">Sort by progress</option>
          <option value="name">Sort by name</option>
          <option value="activity">Sort by last activity</option>
        </select>
      </div>

      {/* Summary line */}
      <p className="text-xs text-[var(--color-text-tertiary)]">
        {filtered.length} team member{filtered.length !== 1 ? "s" : ""} · {totalMaterials} material{totalMaterials !== 1 ? "s" : ""}
      </p>

      {/* User table */}
      {filtered.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">No team members found.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <table className="min-w-full divide-y divide-[var(--color-border-secondary)] text-sm">
            <thead className="bg-[var(--color-bg-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Team member</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Department</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-[var(--color-text-secondary)] uppercase">Viewed</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-[var(--color-text-secondary)] uppercase">Completed</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Progress</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map((u) => (
                <tr key={u.user_id} className="hover:bg-[var(--color-surface-hover)]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <InitialsAvatar first={u.first_name} last={u.last_name} />
                      <span className="font-medium text-[var(--color-text-primary)]">{u.first_name} {u.last_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)] text-xs">{u.department?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-[var(--color-text-primary)]">{u.viewed}/{u.total}</td>
                  <td className="px-4 py-3 text-center text-[var(--color-text-primary)]">{u.completed}/{u.total}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar pct={u.pct} />
                      <span className={`text-xs font-medium ${
                        u.pct >= 80 ? "text-[var(--color-success)]" : u.pct >= 50 ? "text-[var(--color-warning)]" : u.pct > 0 ? "text-[var(--color-error)]" : "text-[var(--color-text-tertiary)]"
                      }`}>{u.pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-[var(--color-text-tertiary)]">
                    {u.last_activity
                      ? new Date(u.last_activity).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                      : "No activity"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
