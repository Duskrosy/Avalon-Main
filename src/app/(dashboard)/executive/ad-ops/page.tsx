import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";

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
  green:  { bg: "bg-[var(--color-success-light)]",  text: "text-[var(--color-success)]",  border: "border-green-400", dot: "bg-[var(--color-success-light)]0"  },
  amber:  { bg: "bg-[var(--color-warning-light)]",  text: "text-[var(--color-warning-text)]",  border: "border-amber-400", dot: "bg-[var(--color-warning-light)]0"  },
  red:    { bg: "bg-[var(--color-error-light)]",    text: "text-[var(--color-error)]",    border: "border-red-400",   dot: "bg-[var(--color-error-light)]0"    },
  noData: { bg: "bg-[var(--color-bg-secondary)]",   text: "text-[var(--color-text-tertiary)]",   border: "border-[var(--color-border-primary)]",  dot: "bg-[var(--color-border-primary)]"   },
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

  // Group by category
  const grouped: Record<string, KpiWithValue[]> = {};
  for (const kpi of kpis) {
    if (!grouped[kpi.category]) grouped[kpi.category] = [];
    grouped[kpi.category].push(kpi);
  }

  // Overall health summary
  const summary = { green: 0, amber: 0, red: 0, noData: 0 };
  for (const kpi of kpis) {
    summary[kpi.status]++;
  }
  const totalKpis = kpis.length;

  return (
    <div className="space-y-6">

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
              className="bg-[var(--color-success-light)]0 transition-all"
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
              className="bg-[var(--color-error-light)]0 transition-all"
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
            { label: "Green", count: summary.green, color: "bg-[var(--color-success-light)]0" },
            { label: "Amber", count: summary.amber, color: "bg-amber-400" },
            { label: "Red", count: summary.red, color: "bg-[var(--color-error-light)]0" },
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

      {/* ── North Star (Hero Section) ──────────────────────────────────── */}
      {grouped["North Star"] && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide mb-3">
            {TIER_LABELS["North Star"]}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {grouped["North Star"].map((kpi) => {
              const styles = RAG_STYLES[kpi.status];
              return (
                <div
                  key={kpi.id}
                  className={`bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] border-l-4 ${styles.border} p-6`}
                >
                  <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide mb-2">
                    {kpi.name}
                  </p>
                  <p className={`text-4xl font-bold tracking-tight ${styles.text}`}>
                    {kpi.unit === "number" && kpi.name === "Overall RoAS"
                      ? (kpi.value != null ? `${kpi.value.toFixed(2)}x` : "—")
                      : fmtKpi(kpi.value, kpi.unit)}
                  </p>
                  {kpi.hint && (
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-2 leading-relaxed">{kpi.hint}</p>
                  )}
                  {kpi.period_date && (
                    <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1.5">
                      Latest: {kpi.period_date}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Supporting (Medium Cards) ──────────────────────────────────── */}
      {grouped["Supporting"] && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide mb-3">
            {TIER_LABELS["Supporting"]}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {grouped["Supporting"].map((kpi) => {
              const styles = RAG_STYLES[kpi.status];
              return (
                <div
                  key={kpi.id}
                  className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] p-5"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${styles.dot}`} />
                    <p className="text-xs text-[var(--color-text-secondary)] font-medium">{kpi.name}</p>
                  </div>
                  <p className={`text-2xl font-bold tracking-tight ${styles.text}`}>
                    {fmtKpi(kpi.value, kpi.unit)}
                  </p>
                  {kpi.hint && (
                    <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1.5 line-clamp-2">{kpi.hint}</p>
                  )}
                  {kpi.period_date && (
                    <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
                      Latest: {kpi.period_date}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Efficiency (Compact Grid) ──────────────────────────────────── */}
      {grouped["Efficiency"] && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide mb-3">
            {TIER_LABELS["Efficiency"]}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {grouped["Efficiency"].map((kpi) => {
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
                    {fmtKpi(kpi.value, kpi.unit)}
                  </p>
                  <p className="text-[9px] text-[var(--color-text-tertiary)] mt-1 uppercase tracking-wide">
                    Early warning
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Budget (Progress-Style) ────────────────────────────────────── */}
      {grouped["Budget"] && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide mb-3">
            {TIER_LABELS["Budget"]}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {grouped["Budget"].map((kpi) => {
              const styles = RAG_STYLES[kpi.status];
              // For percent-based KPIs, use the value directly as progress
              // For currency or number, compute relative to green threshold
              let progressPct = 0;
              if (kpi.value != null) {
                if (kpi.unit === "percent") {
                  progressPct = Math.min(kpi.value, 120);
                } else if (kpi.threshold_green > 0) {
                  progressPct = Math.min((kpi.value / kpi.threshold_green) * 100, 120);
                }
              }
              return (
                <div
                  key={kpi.id}
                  className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] p-5"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-[var(--color-text-secondary)] font-medium">{kpi.name}</p>
                    <div className={`w-2.5 h-2.5 rounded-full ${styles.dot}`} />
                  </div>
                  <p className={`text-2xl font-bold tracking-tight mb-3 ${styles.text}`}>
                    {fmtKpi(kpi.value, kpi.unit)}
                  </p>
                  {/* Progress bar */}
                  <div className="h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        kpi.status === "green"
                          ? "bg-[var(--color-success-light)]0"
                          : kpi.status === "amber"
                          ? "bg-amber-400"
                          : kpi.status === "red"
                          ? "bg-[var(--color-error-light)]0"
                          : "bg-[var(--color-border-primary)]"
                      }`}
                      style={{ width: `${Math.min(progressPct, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">
                      Target: {fmtKpi(kpi.threshold_green, kpi.unit)}
                    </span>
                    {kpi.period_date && (
                      <span className="text-[10px] text-[var(--color-text-tertiary)]">{kpi.period_date}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Remaining tiers (safety net for unknown categories) ─────────── */}
      {Object.entries(grouped)
        .filter(([cat]) => !TIER_ORDER.includes(cat))
        .map(([cat, items]) => (
          <div key={cat}>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide mb-3">
              {cat}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((kpi) => {
                const styles = RAG_STYLES[kpi.status];
                return (
                  <div key={kpi.id} className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-2 h-2 rounded-full ${styles.dot}`} />
                      <p className="text-xs text-[var(--color-text-secondary)] font-medium">{kpi.name}</p>
                    </div>
                    <p className={`text-lg font-bold ${styles.text}`}>
                      {fmtKpi(kpi.value, kpi.unit)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
