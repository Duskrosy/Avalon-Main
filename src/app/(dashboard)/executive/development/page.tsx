import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";

type FeatureGoal = {
  id: string;
  title: string;
  description: string | null;
  status: "planned" | "in_progress" | "done";
  progress: number;
  milestone: string | null;
  sort_order: number;
  feature_goal_tickets: { id: string }[];
};

const STATUS_LABELS: Record<string, string> = {
  planned:     "Planned",
  in_progress: "In Progress",
  done:        "Done",
};

const STATUS_COLORS: Record<string, string> = {
  planned:     "bg-slate-100 text-slate-600",
  in_progress: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  done:        "bg-[var(--color-success-light)] text-green-800",
};

export default async function ExecutiveDevelopmentPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const { data: goals, error } = await supabase
    .from("feature_goals")
    .select("*, feature_goal_tickets(id)")
    .order("milestone", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });

  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">
        Failed to load feature goals: {error.message}
      </div>
    );
  }

  // Group by milestone
  const grouped = (goals ?? []).reduce<Record<string, FeatureGoal[]>>((acc, g) => {
    const key = g.milestone ?? "__none__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});

  const milestoneKeys = [
    ...Object.keys(grouped).filter(k => k !== "__none__").sort(),
    ...(grouped["__none__"] ? ["__none__"] : []),
  ];

  const total     = (goals ?? []).length;
  const done      = (goals ?? []).filter(g => g.status === "done").length;
  const inProg    = (goals ?? []).filter(g => g.status === "in_progress").length;
  const avgProg   = total > 0
    ? Math.round((goals ?? []).reduce((sum, g) => sum + g.progress, 0) / total)
    : 0;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{total}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Total Goals</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-accent)]">{inProg}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">In Progress</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{done}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Done</p>
        </div>
      </div>

      {/* Overall progress bar */}
      {total > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">Overall Progress</span>
            <span className="text-xs font-semibold tabular-nums text-[var(--color-text-primary)]">{avgProg}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-all"
              style={{ width: `${avgProg}%` }}
            />
          </div>
        </div>
      )}

      {/* Milestones */}
      {total === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)] text-center py-12">
          No feature goals have been created yet.
        </p>
      ) : (
        <div className="space-y-8">
          {milestoneKeys.map(key => (
            <div key={key}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">
                {key === "__none__" ? "Other" : key}
              </h2>
              <div className="space-y-3">
                {grouped[key].map(goal => (
                  <div
                    key={goal.id}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[goal.status]}`}>
                            {STATUS_LABELS[goal.status]}
                          </span>
                          <span className="text-sm font-medium text-[var(--color-text-primary)]">
                            {goal.title}
                          </span>
                        </div>
                        {goal.description && (
                          <p className="text-xs text-[var(--color-text-secondary)] mb-2">
                            {goal.description}
                          </p>
                        )}
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
                      </div>
                      {goal.feature_goal_tickets.length > 0 && (
                        <div className="shrink-0 text-right">
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            {goal.feature_goal_tickets.length} ticket{goal.feature_goal_tickets.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
