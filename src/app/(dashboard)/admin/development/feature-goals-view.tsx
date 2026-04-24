"use client";

import { useState, useEffect } from "react";
import { SlowActionSpinner } from "@/components/ui/delayed-loader";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { CenterSpinner } from "@/components/ui/center-spinner";

type FeatureGoal = {
  id: string;
  title: string;
  description: string | null;
  status: "planned" | "in_progress" | "done";
  progress: number;
  milestone: string | null;
  sort_order: number;
  created_at: string;
  feature_goal_tickets: { id: string; feedback_id: string }[];
};

const STATUS_LABELS: Record<string, string> = {
  planned:     "Planned",
  in_progress: "In Progress",
  done:        "Done",
};

const STATUS_COLORS: Record<string, string> = {
  planned:     "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  in_progress: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  done:        "bg-[var(--color-success-light)] text-green-800",
};

type FormState = {
  title:       string;
  description: string;
  status:      "planned" | "in_progress" | "done";
  progress:    number;
  milestone:   string;
  sort_order:  number;
};

const EMPTY_FORM: FormState = {
  title:       "",
  description: "",
  status:      "planned",
  progress:    0,
  milestone:   "",
  sort_order:  0,
};

export function FeatureGoalsView() {
  const [goals, setGoals]           = useState<FeatureGoal[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState<FeatureGoal | null>(null);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);

  useEffect(() => { fetchGoals(); }, []);

  async function fetchGoals() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/feature-goals");
      if (!res.ok) throw new Error("Failed to load feature goals");
      const data = await res.json();
      setGoals(data.goals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(goal: FeatureGoal) {
    setEditing(goal);
    setForm({
      title:       goal.title,
      description: goal.description ?? "",
      status:      goal.status,
      progress:    goal.progress,
      milestone:   goal.milestone ?? "",
      sort_order:  goal.sort_order,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        description: form.description || undefined,
        milestone:   form.milestone   || undefined,
      };
      const url    = editing ? `/api/feature-goals/${editing.id}` : "/api/feature-goals";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      setShowForm(false);
      setEditing(null);
      await fetchGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this feature goal? This will also unlink all Pulse tickets.")) return;
    try {
      const res = await fetch(`/api/feature-goals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await fetchGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  // Group goals by milestone (null milestone last, labelled "No Milestone")
  const grouped = goals.reduce<Record<string, FeatureGoal[]>>((acc, g) => {
    const key = g.milestone ?? "__none__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});
  const milestoneKeys = [
    ...Object.keys(grouped).filter(k => k !== "__none__").sort(),
    ...(grouped["__none__"] ? ["__none__"] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Feature Goals</h2>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
        >
          + New Goal
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <CenterSpinner />
      ) : goals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-secondary)]">
          No feature goals yet. Create one to start tracking progress.
        </div>
      ) : (
        <div className="space-y-8">
          {milestoneKeys.map(key => (
            <div key={key}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">
                {key === "__none__" ? "No Milestone" : key}
              </h3>
              <div className="space-y-3">
                {grouped[key].map(goal => (
                  <div
                    key={goal.id}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[goal.status]}`}>
                            {STATUS_LABELS[goal.status]}
                          </span>
                          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                            {goal.title}
                          </span>
                        </div>
                        {goal.description && (
                          <p className="text-xs text-[var(--color-text-secondary)] mb-2 line-clamp-2">
                            {goal.description}
                          </p>
                        )}
                        {/* Progress bar */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                              style={{ width: `${goal.progress}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-[var(--color-text-secondary)] w-8 text-right">
                            {goal.progress}%
                          </span>
                        </div>
                        {goal.feature_goal_tickets.length > 0 && (
                          <p className="text-xs text-[var(--color-text-secondary)] mt-1.5">
                            {goal.feature_goal_tickets.length} linked Pulse ticket{goal.feature_goal_tickets.length !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEdit(goal)}
                          className="px-2 py-1 text-xs rounded hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(goal.id)}
                          className="px-2 py-1 text-xs rounded hover:bg-red-50 text-red-500 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Form — inline slide-in */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="w-full max-w-lg mx-4 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border)] shadow-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              {editing ? "Edit Feature Goal" : "New Feature Goal"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  placeholder="e.g. Shift Swap Request System"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-none"
                  placeholder="What problem does this solve?"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as FormState["status"] }))}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  >
                    <option value="planned">Planned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    Progress ({form.progress}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={form.progress}
                    onChange={e => setForm(f => ({ ...f, progress: Number(e.target.value) }))}
                    className="w-full mt-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Milestone</label>
                  <input
                    type="text"
                    value={form.milestone}
                    onChange={e => setForm(f => ({ ...f, milestone: e.target.value }))}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                    placeholder="e.g. Q2 2026"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowForm(false); setEditing(null); }}
                className="px-4 py-2 text-sm rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center gap-2"
              >
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Goal"}
                <SlowActionSpinner loading={saving} afterMs={3000}>
                  <ButtonSpinner size={14} />
                </SlowActionSpinner>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
