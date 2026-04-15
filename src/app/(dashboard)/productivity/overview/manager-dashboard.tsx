"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";

type WorkloadItem = {
  id: string;
  name: string;
  open: number;
  overdue: number;
  completedThisWeek: number;
};

type OverdueCard = {
  id: string;
  title: string;
  priority: string;
  due_date: string;
  assignee: string | null;
  column: string;
};

type Stats = {
  total: number;
  completed: number;
  overdue: number;
  completedThisWeek: number;
};

type Department = { id: string; name: string };

type Props = {
  currentDepartmentId: string | null;
  departments: Department[];
  isOps: boolean;
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  medium: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  high: "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]",
  urgent: "bg-[var(--color-error-light)] text-[var(--color-error)]",
};

export function ManagerDashboard({ currentDepartmentId, departments, isOps }: Props) {
  const [departmentId, setDepartmentId] = useState(currentDepartmentId ?? "");
  const [loading, setLoading] = useState(true);
  const [workload, setWorkload] = useState<WorkloadItem[]>([]);
  const [overdue, setOverdue] = useState<OverdueCard[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, completed: 0, overdue: 0, completedThisWeek: 0 });

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const params = departmentId ? `?department_id=${departmentId}` : "";
      const res = await fetch(`/api/productivity/overview${params}`);
      if (res.ok) {
        const data = await res.json();
        setWorkload(data.workload ?? []);
        setOverdue(data.overdue ?? []);
        setStats(data.stats ?? { total: 0, completed: 0, overdue: 0, completedThisWeek: 0 });
      }
      setLoading(false);
    }
    fetchData();
  }, [departmentId]);

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Productivity Overview</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Team workload and task status</p>
        </div>
        {isOps && departments.length > 0 && (
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="text-sm border border-[var(--color-border-primary)] rounded-lg px-3 py-2"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[var(--color-text-tertiary)]">Loading...</div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
              <p className="text-xs text-[var(--color-text-secondary)] mb-1">Total Tasks</p>
              <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{stats.total}</p>
            </div>
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
              <p className="text-xs text-[var(--color-text-secondary)] mb-1">Completed</p>
              <p className="text-2xl font-semibold text-[var(--color-success)]">{stats.completed}</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{completionRate}% completion rate</p>
            </div>
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
              <p className="text-xs text-[var(--color-text-secondary)] mb-1">Overdue</p>
              <p className="text-2xl font-semibold text-[var(--color-error)]">{stats.overdue}</p>
            </div>
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
              <p className="text-xs text-[var(--color-text-secondary)] mb-1">Completed This Week</p>
              <p className="text-2xl font-semibold text-[var(--color-accent)]">{stats.completedThisWeek}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Workload by assignee */}
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Workload by Assignee</h3>
              {workload.length === 0 ? (
                <p className="text-sm text-[var(--color-text-tertiary)] py-4 text-center">No assigned tasks</p>
              ) : (
                <div className="space-y-3">
                  {workload.map((person) => (
                    <div key={person.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-xs font-medium text-[var(--color-text-secondary)]">
                          {person.name.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--color-text-primary)]">{person.name}</p>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {person.open} open{person.completedThisWeek > 0 && `, ${person.completedThisWeek} done this week`}
                          </p>
                        </div>
                      </div>
                      {person.overdue > 0 && (
                        <span className="text-xs px-2 py-1 bg-[var(--color-error-light)] text-[var(--color-error)] rounded-full">
                          {person.overdue} overdue
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Overdue tasks */}
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
                Overdue Tasks
                {overdue.length > 0 && <span className="text-[var(--color-error)] ml-2">({overdue.length})</span>}
              </h3>
              {overdue.length === 0 ? (
                <p className="text-sm text-[var(--color-text-tertiary)] py-4 text-center">No overdue tasks</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {overdue.map((card) => (
                    <Link
                      key={card.id}
                      href="/productivity/kanban"
                      className="block p-3 bg-[var(--color-bg-secondary)] rounded-lg hover:bg-[var(--color-surface-active)] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{card.title}</p>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {card.assignee ?? "Unassigned"} · {card.column}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`text-xs px-2 py-0.5 rounded ${PRIORITY_COLORS[card.priority]}`}>
                            {card.priority}
                          </span>
                          <p className="text-xs text-[var(--color-error)] mt-1">
                            Due {format(new Date(card.due_date), "MMM d")}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick link */}
          <div className="mt-6 text-center">
            <Link
              href="/productivity/kanban"
              className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              Open Task Board →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
