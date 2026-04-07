"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
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

  const setPreset = useCallback((preset: DatePreset) => {
    const { from, to } = getPresetDates(preset);
    const params = new URLSearchParams(searchParams.toString());
    params.set("preset", preset);
    params.set("from", from);
    params.set("to", to);
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  return (
    <div className="flex items-center gap-2.5 pb-4">
      {activePreset === "today" && (
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-600 font-semibold">Live</span>
        </div>
      )}
      <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden text-xs">
        {PRESETS.map((p, i) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 font-medium transition-colors ${
              i > 0 ? "border-l border-gray-200" : ""
            } ${
              activePreset === p.key
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
