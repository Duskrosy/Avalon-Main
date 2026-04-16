import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import KpiTabView from "./kpi-tab-view";

// ─── RAG helpers ──────────────────────────────────────────────────────────────

type RagStatus = "green" | "amber" | "red" | "noData";

function rag(value: number | null, green: number, amber: number, direction: string): RagStatus {
  if (value == null) return "noData";
  if (direction === "higher_better") {
    if (value >= green) return "green";
    if (value >= amber) return "amber";
    return "red";
  } else {
    if (value <= green) return "green";
    if (value <= amber) return "amber";
    return "red";
  }
}

const RAG_STYLES: Record<RagStatus, { bg: string; text: string; border: string; dot: string }> = {
  green:  { bg: "bg-[var(--color-success-light)]",  text: "text-[var(--color-success)]",      border: "border-green-400", dot: "bg-[var(--color-success)]"  },
  amber:  { bg: "bg-[var(--color-warning-light)]",  text: "text-[var(--color-warning-text)]", border: "border-amber-400", dot: "bg-amber-400"               },
  red:    { bg: "bg-[var(--color-error-light)]",    text: "text-[var(--color-error)]",        border: "border-red-400",   dot: "bg-[var(--color-error)]"    },
  noData: { bg: "bg-[var(--color-bg-secondary)]",   text: "text-[var(--color-text-tertiary)]", border: "border-[var(--color-border-primary)]", dot: "bg-[var(--color-border-primary)]" },
};

function fmtKpi(value: number | null, unit: string): string {
  if (value == null) return "—";
  switch (unit) {
    case "percent":
      return `${value.toFixed(1)}%`;
    case "currency_php":
      if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(2)}M`;
      if (value >= 1_000) return `₱${(value / 1_000).toFixed(1)}K`;
      return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "days":
      return `${value}d`;
    case "weeks":
      return `${value}w`;
    case "seconds":
      return `${value.toFixed(1)}s`;
    default:
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
      return value.toLocaleString();
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface KpiDef {
  id: string;
  name: string;
  category: string;
  unit: string;
  direction: string;
  frequency: string;
  threshold_green: number;
  threshold_amber: number;
  hint: string | null;
  sort_order: number;
}

interface KpiWithValue extends KpiDef {
  value: number | null;
  period_date: string | null;
  status: RagStatus;
}

const TIER_ORDER = ["North Star", "Supporting", "Efficiency", "Budget"];
const TIER_LABELS: Record<string, string> = {
  "North Star": "North Star",
  "Supporting": "Supporting KPIs",
  "Efficiency": "Efficiency (Early Warning)",
  "Budget": "Budget (Spend Discipline)",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ExecutiveAdOpsKpiPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Get marketing department ID
  const { data: mktDept } = await admin
    .from("departments")
    .select("id")
    .eq("slug", "marketing")
    .single();

  if (!mktDept) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--color-text-tertiary)] text-sm">
        Marketing department not found
      </div>
    );
  }

  const [{ data: defs }, { data: entries }] = await Promise.all([
    admin
      .from("kpi_definitions")
      .select("*")
      .eq("department_id", mktDept.id)
      .eq("is_active", true)
      .order("sort_order"),
    admin
      .from("kpi_entries")
      .select("kpi_definition_id, value_numeric, period_date")
      .is("profile_id", null)
      .order("period_date", { ascending: false })
      .limit(500),
  ]);

  // Build latest value map: kpi_definition_id → latest entry
  const latestMap: Record<string, { value: number; period_date: string }> = {};
  for (const entry of entries ?? []) {
    if (!latestMap[entry.kpi_definition_id]) {
      latestMap[entry.kpi_definition_id] = {
        value: Number(entry.value_numeric),
        period_date: entry.period_date,
      };
    }
  }

  // Attach values and compute RAG
  const kpis: KpiWithValue[] = (defs ?? []).map((def: KpiDef) => {
    const latest = latestMap[def.id];
    const value = latest?.value ?? null;
    const status = rag(value, def.threshold_green, def.threshold_amber, def.direction);
    return {
      ...def,
      value,
      period_date: latest?.period_date ?? null,
      status,
    };
  });

  // Split KPIs: priority 3 (CPLV, ROAS, CPM) pinned at top; rest go to tab view
  const priorityKpis = kpis.filter((kpi) => {
    const lower = kpi.name.toLowerCase();
    return lower.includes("cplv") || lower.includes("roas") || lower.includes("cpm");
  });
  const remainingKpis = kpis.filter((kpi) => {
    const lower = kpi.name.toLowerCase();
    return !lower.includes("cplv") && !lower.includes("roas") && !lower.includes("cpm");
  });

  // Overall health summary (counts all KPIs including priority 3)
  const summary = { green: 0, amber: 0, red: 0, noData: 0 };
  for (const kpi of kpis) {
    summary[kpi.status]++;
  }
  const totalKpis = kpis.length;

  return (
    <div className="space-y-6">

      {/* ── Priority Metrics Row ───────────────────────────────────────── */}
      {priorityKpis.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">
            Priority Metrics
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {priorityKpis.map((kpi) => {
              const styles = RAG_STYLES[kpi.status];
              return (
                <div
                  key={kpi.id}
                  className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] p-4"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] text-[var(--color-text-secondary)] font-medium uppercase tracking-wide truncate">
                      {kpi.name}
                    </p>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${styles.dot}`} />
                  </div>
                  <p className={`text-lg font-bold tracking-tight ${styles.text}`}>
                    {kpi.unit === "number" && kpi.name.toLowerCase().includes("roas")
                      ? (kpi.value != null ? `${kpi.value.toFixed(2)}x` : "—")
                      : fmtKpi(kpi.value, kpi.unit)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Overall Health Summary ──────────────────────────────────────── */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">KPI Health Overview</h2>
          <span className="text-xs text-[var(--color-text-tertiary)]">{totalKpis} metrics tracked</span>
        </div>
        {/* RAG bar */}
        <div className="flex h-3 rounded-full overflow-hidden bg-[var(--color-bg-tertiary)]">
          {summary.green > 0 && (
            <div
              className="bg-[var(--color-success)] transition-all"
              style={{ width: `${(summary.green / totalKpis) * 100}%` }}
            />
          )}
          {summary.amber > 0 && (
            <div
              className="bg-amber-400 transition-all"
              style={{ width: `${(summary.amber / totalKpis) * 100}%` }}
            />
          )}
          {summary.red > 0 && (
            <div
              className="bg-[var(--color-error)] transition-all"
              style={{ width: `${(summary.red / totalKpis) * 100}%` }}
            />
          )}
          {summary.noData > 0 && (
            <div
              className="bg-[var(--color-border-primary)] transition-all"
              style={{ width: `${(summary.noData / totalKpis) * 100}%` }}
            />
          )}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3">
          {[
            { label: "Green", count: summary.green, color: "bg-[var(--color-success)]" },
            { label: "Amber", count: summary.amber, color: "bg-amber-400" },
            { label: "Red", count: summary.red, color: "bg-[var(--color-error)]" },
            { label: "No data", count: summary.noData, color: "bg-[var(--color-border-primary)]" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
              <span className="text-xs text-[var(--color-text-secondary)]">
                {item.label} <span className="font-semibold text-[var(--color-text-primary)]">{item.count}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Conversion / Messenger Tab View ────────────────────────────── */}
      <KpiTabView kpis={remainingKpis} />

    </div>
  );
}
