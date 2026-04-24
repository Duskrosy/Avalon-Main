"use client";

import { cn } from "@/lib/utils";

type ProgressBarProps = {
  value?: number;
  max?: number;
  indeterminate?: boolean;
  className?: string;
  label?: string;
};

/**
 * Linear progress bar. Pass `value` for determinate, or set `indeterminate`
 * for unknown-duration processes per the UX tier rules.
 */
export function ProgressBar({
  value,
  max = 100,
  indeterminate,
  className,
  label,
}: ProgressBarProps) {
  const pct =
    indeterminate || value === undefined
      ? undefined
      : Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]",
        indeterminate && "avalon-progress-indeterminate",
        className
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={indeterminate ? undefined : value}
      aria-label={label}
    >
      {!indeterminate && pct !== undefined && (
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}
