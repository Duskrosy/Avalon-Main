"use client";

interface DeltaBadgeProps {
  current: number | null;
  previous: number | null;
  /** Set true for cost metrics where a decrease is good (e.g. CPLV, CPM). */
  invertColor?: boolean;
  className?: string;
}

export function DeltaBadge({ current, previous, invertColor = false, className = "" }: DeltaBadgeProps) {
  if (current === null || previous === null || previous === 0) {
    return <span className={`text-xs text-[var(--color-text-tertiary)] ${className}`}>—</span>;
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const isUp = pct > 0;
  // For cost metrics: up (more spend) is bad → invert the color logic
  const isGood = invertColor ? !isUp : isUp;
  const color = isGood ? "text-[var(--color-success)]" : "text-[var(--color-error)]";
  const arrow = isUp ? "▲" : "▼";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color} ${className}`}>
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
