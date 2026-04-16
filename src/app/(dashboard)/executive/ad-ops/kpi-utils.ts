// ─── RAG Status Type ──────────────────────────────────────────────────────────

export type RagStatus = "green" | "amber" | "red" | "noData";

// ─── RAG Function ─────────────────────────────────────────────────────────────

export function rag(value: number | null, green: number, amber: number, direction: string): RagStatus {
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

// ─── RAG Styles ───────────────────────────────────────────────────────────────

export const RAG_STYLES: Record<RagStatus, { bg: string; text: string; border: string; dot: string }> = {
  green:  { bg: "bg-[var(--color-success-light)]",  text: "text-[var(--color-success)]",      border: "border-green-400", dot: "bg-[var(--color-success)]"  },
  amber:  { bg: "bg-[var(--color-warning-light)]",  text: "text-[var(--color-warning-text)]", border: "border-amber-400", dot: "bg-amber-400"               },
  red:    { bg: "bg-[var(--color-error-light)]",    text: "text-[var(--color-error)]",        border: "border-red-400",   dot: "bg-[var(--color-error)]"    },
  noData: { bg: "bg-[var(--color-bg-secondary)]",   text: "text-[var(--color-text-tertiary)]", border: "border-[var(--color-border-primary)]", dot: "bg-[var(--color-border-primary)]" },
};

// ─── KPI Formatter ────────────────────────────────────────────────────────────

export function fmtKpi(value: number | null, unit: string): string {
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

// ─── KPI Types ────────────────────────────────────────────────────────────────

export interface KpiDef {
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

export interface KpiWithValue extends KpiDef {
  value: number | null;
  period_date: string | null;
  status: RagStatus;
}

// ─── Tier Configuration ───────────────────────────────────────────────────────

export const TIER_ORDER = ["North Star", "Supporting", "Efficiency", "Budget"];
export const TIER_LABELS: Record<string, string> = {
  "North Star": "North Star",
  "Supporting": "Supporting KPIs",
  "Efficiency": "Efficiency (Early Warning)",
  "Budget": "Budget (Spend Discipline)",
};
