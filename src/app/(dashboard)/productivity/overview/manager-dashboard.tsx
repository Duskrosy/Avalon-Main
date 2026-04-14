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
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
  urgent: "bg-red-100 text-red-700",
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
          <h1 className="text-2xl font-semibold text-gray-900">Productivity Overview</h1>
          <p className="text-sm text-gray-500 mt-1">Team workload and task status</p>
        </div>
        {isOps && departments.length > 0 && (
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Total Tasks</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Completed</p>
              <p className="text-2xl font-semibold text-green-600">{stats.completed}</p>
              <p className="text-xs text-gray-400 mt-1">{completionRate}% completion rate</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Overdue</p>
              <p className="text-2xl font-semibold text-red-600">{stats.overdue}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Completed This Week</p>
              <p className="text-2xl font-semibold text-blue-600">{stats.completedThisWeek}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Workload by assignee */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Workload by Assignee</h3>
              {workload.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No assigned tasks</p>
              ) : (
                <div className="space-y-3">
                  {workload.map((person) => (
                    <div key={person.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
                          {person.name.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{person.name}</p>
                          <p className="text-xs text-gray-500">
                            {person.open} open{person.completedThisWeek > 0 && `, ${person.completedThisWeek} done this week`}
                          </p>
                        </div>
                      </div>
                      {person.overdue > 0 && (
                        <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full">
                          {person.overdue} overdue
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Overdue tasks */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Overdue Tasks
                {overdue.length > 0 && <span className="text-red-500 ml-2">({overdue.length})</span>}
              </h3>
              {overdue.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No overdue tasks</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {overdue.map((card) => (
                    <Link
                      key={card.id}
                      href="/productivity/kanban"
                      className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{card.title}</p>
                          <p className="text-xs text-gray-500">
                            {card.assignee ?? "Unassigned"} · {card.column}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`text-xs px-2 py-0.5 rounded ${PRIORITY_COLORS[card.priority]}`}>
                            {card.priority}
                          </span>
                          <p className="text-xs text-red-500 mt-1">
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
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Open Task Board →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
