"use client";

import { useState, useCallback, useMemo } from "react";
import { format, parseISO, differenceInDays, isPast, addDays } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────
type Dept = { id: string; name: string; slug: string };
type KpiDefRef = {
  id: string;
  name: string;
  unit: string;
  threshold_green: number;
  threshold_amber: number;
  direction: string;
};
type KpiDefOption = { id: string; name: string; department_id: string; unit: string; category: string };

type Goal = {
  id: string;
  title: string;
  description: string | null;
  target_value: number;
  current_value: number;
  unit: string;
  deadline: string;
  status: "active" | "achieved" | "cancelled";
  kpi_definition_id: string | null;
  deadline_green_days: number;
  deadline_amber_days: number;
  department: Dept | null;
  created_by_profile: { first_name: string; last_name: string } | null;
  kpi_definition: KpiDefRef | null;
};

type Props = {
  goals: Goal[];
  departments: Dept[];
  kpiDefinitions: KpiDefOption[];
  currentDeptId: string | null;
  canManage: boolean;
  isOps: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function progressPct(current: number, target: number): number {
  if (target === 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

function deadlineRag(
  deadline: string,
  greenDays: number,
  amberDays: number
): "green" | "amber" | "red" {
  const d = parseISO(deadline);
  if (isPast(d)) return "red";
  const days = differenceInDays(d, new Date());
  if (days >= greenDays) return "green";
  if (days >= amberDays) return "amber";
  return "red";
}

function deadlineLabel(deadline: string): string {
  const d = parseISO(deadline);
  if (isPast(d)) return "Overdue";
  const days = differenceInDays(d, new Date());
  if (days === 0) return "Today";
  if (days <= 30) return `${days}d left`;
  return format(d, "d MMM yyyy");
}

const RAG_BADGE = {
  green: "bg-green-100 text-green-700 border-green-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  red: "bg-red-100 text-red-700 border-red-200",
};

const RAG_BAR = {
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

const RAG_BORDER = {
  green: "border-green-200",
  amber: "border-amber-200",
  red: "border-red-200",
};

const DATE_RANGES = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "All", days: 0 },
] as const;

// ─── Goal Card ────────────────────────────────────────────────────────────────
function GoalCard({
  goal,
  canManage,
  onUpdate,
  onMarkAchieved,
  onDelete,
}: {
  goal: Goal;
  canManage: boolean;
  onUpdate: (id: string, value: number) => void;
  onMarkAchieved: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const pct = progressPct(goal.current_value, goal.target_value);
  const dlRag = deadlineRag(goal.deadline, goal.deadline_green_days, goal.deadline_amber_days);
  const dlLabel = deadlineLabel(goal.deadline);
  const [editingValue, setEditingValue] = useState(false);
  const [newValue, setNewValue] = useState(String(goal.current_value));

  const progressRag =
    goal.status === "achieved" ? "green"
    : pct >= 80 ? "green"
    : pct >= 50 ? "amber"
    : "red";

  return (
    <div className={`bg-white border ${RAG_BORDER[dlRag]} rounded-xl p-5 flex flex-col gap-3 ${
      goal.status === "achieved" ? "opacity-75" : ""
    }`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-sm font-semibold text-gray-900">{goal.title}</h3>
            {goal.status === "achieved" && (
              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Achieved</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-wrap">
            {goal.department && <span>{goal.department.name}</span>}
            {goal.kpi_definition && (
              <>
                <span>·</span>
                <span className="text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded text-[10px] font-medium">
                  KPI: {goal.kpi_definition.name}
                </span>
              </>
            )}
          </div>
        </div>
        {/* Deadline RAG badge */}
        {goal.status === "active" && (
          <span className={`shrink-0 text-[10px] px-2 py-1 rounded-full font-medium border ${RAG_BADGE[dlRag]}`}>
            {dlLabel}
          </span>
        )}
      </div>

      {goal.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{goal.description}</p>
      )}

      {/* Progress */}
      <div>
        <div className="flex items-end justify-between mb-1.5">
          <div className="flex items-baseline gap-1">
            {editingValue ? (
              <input
                autoFocus
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onBlur={() => {
                  const v = parseFloat(newValue);
                  if (!isNaN(v) && v !== goal.current_value) onUpdate(goal.id, v);
                  setEditingValue(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = parseFloat(newValue);
                    if (!isNaN(v)) onUpdate(goal.id, v);
                    setEditingValue(false);
                  }
                  if (e.key === "Escape") setEditingValue(false);
                }}
                className="w-20 border border-gray-200 rounded px-2 py-0.5 text-base font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            ) : (
              <button
                onClick={() => canManage && goal.status === "active" && setEditingValue(true)}
                className={`text-base font-bold text-gray-900 ${canManage && goal.status === "active" ? "hover:text-blue-600 cursor-pointer" : "cursor-default"}`}
                title={canManage ? "Click to update" : undefined}
              >
                {goal.current_value.toLocaleString()}
              </button>
            )}
            <span className="text-xs text-gray-400">/ {goal.target_value.toLocaleString()} {goal.unit}</span>
          </div>
          <span className={`text-sm font-semibold ${
            progressRag === "green" ? "text-green-600" : progressRag === "amber" ? "text-amber-600" : "text-red-600"
          }`}>{pct}%</span>
        </div>

        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${RAG_BAR[progressRag]} rounded-full transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* RAG thresholds indicator */}
      {goal.status === "active" && (
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span>Deadline: {format(parseISO(goal.deadline), "d MMM yyyy")}</span>
          <span>·</span>
          <span className="text-green-600">{goal.deadline_green_days}d+ = green</span>
          <span className="text-amber-600">{goal.deadline_amber_days}d+ = amber</span>
        </div>
      )}

      {/* Actions */}
      {canManage && goal.status === "active" && (
        <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
          {pct >= 100 && (
            <button
              onClick={() => onMarkAchieved(goal.id)}
              className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100"
            >
              Mark achieved
            </button>
          )}
          <button
            onClick={() => onDelete(goal.id)}
            className="ml-auto text-xs text-gray-300 hover:text-red-400"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────
function SummaryCards({ goals }: { goals: Goal[] }) {
  const active = goals.filter((g) => g.status === "active");
  const achieved = goals.filter((g) => g.status === "achieved");
  const overdue = active.filter((g) => isPast(parseISO(g.deadline)));
  const onTrack = active.filter((g) => {
    const pct = progressPct(g.current_value, g.target_value);
    return pct >= 50 && !isPast(parseISO(g.deadline));
  });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs text-gray-500 mb-1">Active</p>
        <p className="text-2xl font-bold text-gray-900">{active.length}</p>
      </div>
      <div className="bg-white border border-green-200 rounded-xl p-4">
        <p className="text-xs text-green-600 mb-1">On Track</p>
        <p className="text-2xl font-bold text-green-600">{onTrack.length}</p>
      </div>
      <div className="bg-white border border-red-200 rounded-xl p-4">
        <p className="text-xs text-red-600 mb-1">Overdue</p>
        <p className="text-2xl font-bold text-red-600">{overdue.length}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs text-gray-500 mb-1">Achieved</p>
        <p className="text-2xl font-bold text-gray-900">{achieved.length}</p>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────
export function GoalsView({ goals: initial, departments, kpiDefinitions, currentDeptId, canManage, isOps }: Props) {
  const [goals, setGoals] = useState<Goal[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dateRange, setDateRange] = useState<number>(0); // 0 = all
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [form, setForm] = useState({
    title: "",
    description: "",
    target_value: "",
    current_value: "0",
    unit: "%",
    deadline: "",
    department_id: currentDeptId ?? "",
    kpi_definition_id: "",
    deadline_green_days: "14",
    deadline_amber_days: "7",
  });

  // Filter KPI definitions by selected department in the create form
  const filteredKpiDefs = useMemo(() => {
    if (!form.department_id) return kpiDefinitions;
    return kpiDefinitions.filter((k) => k.department_id === form.department_id);
  }, [kpiDefinitions, form.department_id]);

  const handleUpdate = useCallback(async (id: string, value: number) => {
    setGoals((gs) => gs.map((g) => g.id === id ? { ...g, current_value: value } : g));
    await fetch(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_value: value }),
    });
  }, []);

  const handleMarkAchieved = useCallback(async (id: string) => {
    setGoals((gs) => gs.map((g) => g.id === id ? { ...g, status: "achieved" } : g));
    await fetch(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "achieved" }),
    });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Cancel this goal?")) return;
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
    setGoals((gs) => gs.filter((g) => g.id !== id));
  }, []);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        target_value: parseFloat(form.target_value),
        current_value: parseFloat(form.current_value),
        unit: form.unit,
        deadline: form.deadline,
        department_id: form.department_id || null,
        kpi_definition_id: form.kpi_definition_id || null,
        deadline_green_days: parseInt(form.deadline_green_days) || 14,
        deadline_amber_days: parseInt(form.deadline_amber_days) || 7,
      }),
    });
    if (res.ok) {
      const { id } = await res.json();
      const dept = departments.find((d) => d.id === form.department_id) ?? null;
      const kpiDef = kpiDefinitions.find((k) => k.id === form.kpi_definition_id) ?? null;
      const newGoal: Goal = {
        id,
        title: form.title,
        description: form.description || null,
        target_value: parseFloat(form.target_value),
        current_value: parseFloat(form.current_value),
        unit: form.unit,
        deadline: form.deadline,
        status: "active",
        kpi_definition_id: form.kpi_definition_id || null,
        deadline_green_days: parseInt(form.deadline_green_days) || 14,
        deadline_amber_days: parseInt(form.deadline_amber_days) || 7,
        department: dept,
        created_by_profile: null,
        kpi_definition: kpiDef ? {
          id: kpiDef.id,
          name: kpiDef.name,
          unit: kpiDef.unit,
          threshold_green: 0,
          threshold_amber: 0,
          direction: "higher_better",
        } : null,
      };
      setGoals((gs) => [...gs, newGoal].sort((a, b) => a.deadline.localeCompare(b.deadline)));
      setShowCreate(false);
      setForm({ title: "", description: "", target_value: "", current_value: "0", unit: "%", deadline: "", department_id: currentDeptId ?? "", kpi_definition_id: "", deadline_green_days: "14", deadline_amber_days: "7" });
    }
    setCreating(false);
  }, [form, departments, kpiDefinitions, currentDeptId]);

  // Filtered goals
  const filtered = useMemo(() => {
    let result = goals;
    if (dateRange > 0) {
      const cutoff = addDays(new Date(), dateRange);
      result = result.filter((g) => {
        const d = parseISO(g.deadline);
        return isPast(d) || d <= cutoff;
      });
    }
    if (deptFilter !== "all") {
      result = result.filter((g) => g.department?.id === deptFilter);
    }
    return result;
  }, [goals, dateRange, deptFilter]);

  const active = filtered.filter((g) => g.status === "active");
  const achieved = filtered.filter((g) => g.status === "achieved");

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Goals & Deadlines</h1>
          <p className="text-sm text-gray-500 mt-1">Set targets, track progress, and manage deadlines with RAG indicators</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Date range filter */}
          <div className="flex gap-1">
            {DATE_RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setDateRange(r.days)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  dateRange === r.days
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Department filter */}
          {isOps && departments.length > 0 && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="all">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}

          {canManage && (
            <button
              onClick={() => setShowCreate(true)}
              className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              + New Goal
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <SummaryCards goals={filtered} />

      {/* Active goals */}
      {active.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center mb-6">
          <p className="text-sm text-gray-400">
            {dateRange > 0
              ? `No goals with deadlines within ${dateRange} days.`
              : "No active goals. Set a target to get started."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {active.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              canManage={canManage}
              onUpdate={handleUpdate}
              onMarkAchieved={handleMarkAchieved}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Achieved goals */}
      {achieved.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Achieved</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {achieved.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                canManage={false}
                onUpdate={() => {}}
                onMarkAchieved={() => {}}
                onDelete={() => {}}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Goal</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Reach 1,500 pairs sold by Q2"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              {/* Link to KPI */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Link to KPI (optional)</label>
                <select
                  value={form.kpi_definition_id}
                  onChange={(e) => {
                    const kpi = kpiDefinitions.find((k) => k.id === e.target.value);
                    setForm((f) => ({
                      ...f,
                      kpi_definition_id: e.target.value,
                      unit: kpi?.unit === "percent" ? "%" : kpi?.unit === "currency_php" ? "PHP" : kpi?.unit ?? f.unit,
                    }));
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">No linked KPI</option>
                  {filteredKpiDefs.map((k) => (
                    <option key={k.id} value={k.id}>{k.name} ({k.category})</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">Linking shows this goal on the KPI dashboard</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Target *</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    value={form.target_value}
                    onChange={(e) => setForm((f) => ({ ...f, target_value: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Current</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.current_value}
                    onChange={(e) => setForm((f) => ({ ...f, current_value: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="%, pairs, PHP"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Deadline *</label>
                  <input
                    required
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                  <select
                    value={form.department_id}
                    onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value, kpi_definition_id: "" }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {isOps && <option value="">Global</option>}
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Deadline RAG thresholds */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-700 mb-3">Deadline RAG Thresholds</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-1.5 text-[10px] text-green-600 font-medium mb-1">
                      <span className="w-2 h-2 rounded-full bg-green-500" /> Green if days remaining
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">&ge;</span>
                      <input
                        type="number"
                        min="1"
                        value={form.deadline_green_days}
                        onChange={(e) => setForm((f) => ({ ...f, deadline_green_days: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <span className="text-xs text-gray-400">days</span>
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-[10px] text-amber-600 font-medium mb-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400" /> Amber if days remaining
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">&ge;</span>
                      <input
                        type="number"
                        min="1"
                        value={form.deadline_amber_days}
                        onChange={(e) => setForm((f) => ({ ...f, deadline_amber_days: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <span className="text-xs text-gray-400">days</span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">Red when fewer days remain than the amber threshold</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-gray-900 text-white text-sm py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Goal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
