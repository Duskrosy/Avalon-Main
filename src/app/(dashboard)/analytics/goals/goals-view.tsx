"use client";

import { useState, useCallback } from "react";
import { format, parseISO, differenceInDays, isPast } from "date-fns";

type Dept = { id: string; name: string; slug: string };
type Goal = {
  id: string;
  title: string;
  description: string | null;
  target_value: number;
  current_value: number;
  unit: string;
  deadline: string;
  status: "active" | "achieved" | "cancelled";
  department: Dept | null;
  created_by_profile: { first_name: string; last_name: string } | null;
};

type Props = {
  goals: Goal[];
  departments: Dept[];
  currentDeptId: string | null;
  canManage: boolean;
  isOps: boolean;
};

function progressPct(current: number, target: number): number {
  if (target === 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

function deadlineLabel(deadline: string): { label: string; urgent: boolean } {
  const d = parseISO(deadline);
  if (isPast(d)) return { label: "Overdue", urgent: true };
  const days = differenceInDays(d, new Date());
  if (days === 0) return { label: "Today", urgent: true };
  if (days <= 7) return { label: `${days}d left`, urgent: true };
  if (days <= 30) return { label: `${days}d left`, urgent: false };
  return { label: format(d, "d MMM yyyy"), urgent: false };
}

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
  const { label: dlLabel, urgent: dlUrgent } = deadlineLabel(goal.deadline);
  const [editingValue, setEditingValue] = useState(false);
  const [newValue, setNewValue] = useState(String(goal.current_value));

  const barColor =
    goal.status === "achieved" ? "bg-green-500"
    : pct >= 80 ? "bg-green-400"
    : pct >= 50 ? "bg-amber-400"
    : "bg-red-400";

  return (
    <div className={`bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3 ${
      goal.status === "achieved" ? "opacity-75" : ""
    }`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="text-sm font-semibold text-gray-900">{goal.title}</h3>
            {goal.status === "achieved" && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Achieved</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
            {goal.department && <span>{goal.department.name}</span>}
            <span>·</span>
            <span className={dlUrgent && goal.status === "active" ? "text-red-500 font-medium" : ""}>
              {dlLabel}
            </span>
          </div>
        </div>
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
          <span className="text-sm font-semibold text-gray-700">{pct}%</span>
        </div>

        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} rounded-full transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

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

export function GoalsView({ goals: initial, departments, currentDeptId, canManage, isOps }: Props) {
  const [goals, setGoals] = useState<Goal[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    target_value: "",
    current_value: "0",
    unit: "%",
    deadline: "",
    department_id: currentDeptId ?? "",
  });

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
      }),
    });
    if (res.ok) {
      const { id } = await res.json();
      const dept = departments.find((d) => d.id === form.department_id) ?? null;
      const newGoal: Goal = {
        id,
        title: form.title,
        description: form.description || null,
        target_value: parseFloat(form.target_value),
        current_value: parseFloat(form.current_value),
        unit: form.unit,
        deadline: form.deadline,
        status: "active",
        department: dept,
        created_by_profile: null,
      };
      setGoals((gs) => [...gs, newGoal].sort((a, b) => a.deadline.localeCompare(b.deadline)));
      setShowCreate(false);
      setForm({ title: "", description: "", target_value: "", current_value: "0", unit: "%", deadline: "", department_id: currentDeptId ?? "" });
    }
    setCreating(false);
  }, [form, departments, currentDeptId]);

  const active   = goals.filter((g) => g.status === "active");
  const achieved = goals.filter((g) => g.status === "achieved");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Goals & Deadlines</h1>
          <p className="text-sm text-gray-500 mt-1">
            {active.length} active · {achieved.length} achieved
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            + New Goal
          </button>
        )}
      </div>

      {/* Active goals */}
      {active.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center mb-6">
          <p className="text-sm text-gray-400">No active goals. Set a target to get started.</p>
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
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
                    placeholder="%, pairs, ₱"
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
                    onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {isOps && <option value="">Global</option>}
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
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
