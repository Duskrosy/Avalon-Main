"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { format, subDays } from "date-fns";

export type DatePreset = "today" | "yesterday" | "7d" | "30d";

export function getPresetDates(preset: DatePreset): { from: string; to: string } {
  const today = format(new Date(), "yyyy-MM-dd");
  switch (preset) {
    case "today":     return { from: today, to: today };
    case "yesterday": {
      const y = format(subDays(new Date(), 1), "yyyy-MM-dd");
      return { from: y, to: y };
    }
    case "7d":  return { from: format(subDays(new Date(), 6), "yyyy-MM-dd"), to: today };
    case "30d": return { from: format(subDays(new Date(), 29), "yyyy-MM-dd"), to: today };
  }
}

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today",     label: "Live" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d",        label: "7 days" },
  { key: "30d",       label: "30 days" },
];

export function DateRangeBar() {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const activePreset = (searchParams.get("preset") as DatePreset | null) ?? "today";
  const [refreshing, startRefresh] = useTransition();

  const setPreset = useCallback((preset: DatePreset) => {
    const { from, to } = getPresetDates(preset);
    const params = new URLSearchParams(searchParams.toString());
    params.set("preset", preset);
    params.set("from", from);
    params.set("to", to);
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  const handleRefresh = useCallback(() => {
    startRefresh(() => { router.refresh(); });
  }, [router]);

  return (
    <div className="flex items-center gap-2.5 pb-4">
      {activePreset === "today" && (
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
          <span className="text-xs text-[var(--color-success)] font-semibold">Live</span>
        </div>
      )}
      <div className="flex rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] overflow-hidden text-xs">
        {PRESETS.map((p, i) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 font-medium transition-colors ${
              i > 0 ? "border-l border-[var(--color-border-primary)]" : ""
            } ${
              activePreset === p.key
                ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {/* Refresh button */}
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        title="Refresh dashboard data"
        className="flex items-center justify-center w-7 h-7 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-primary)] transition-colors disabled:opacity-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
        >
          <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
