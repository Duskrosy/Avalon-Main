// src/components/ui/demographic-bar.tsx
"use client";

export type BarSegment = {
  key:   string;
  label: string;
  spend: number;
  color: string; // CSS color value or var(--...) string
};

export const GENDER_COLORS: Record<string, string> = {
  male:    "var(--color-accent)",
  female:  "var(--color-info)",
  unknown: "var(--color-border-primary)",
};

export const AGE_COLORS: Record<string, string> = {
  "13-17": "#818cf8",
  "18-24": "var(--color-accent)",
  "25-34": "var(--color-info)",
  "35-44": "var(--color-success)",
  "45-54": "#f59e0b",
  "55-64": "var(--color-error)",
  "65+":   "var(--color-text-secondary)",
};

type Props = {
  segments:    BarSegment[];
  showLegend?: boolean;
  showSpend?:  boolean;
};

export function DemographicBar({
  segments,
  showLegend = true,
  showSpend  = true,
}: Props) {
  const total = segments.reduce((s, r) => s + r.spend, 0);
  if (total === 0) return null;

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-[var(--color-bg-tertiary)]">
        {segments.map((seg) => {
          const pct = (seg.spend / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={seg.key}
              style={{ width: `${pct}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ₱${seg.spend.toLocaleString()}`}
            />
          );
        })}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
          {segments
            .filter((r) => r.spend > 0)
            .map((seg) => (
              <div key={seg.key} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-[10px] text-[var(--color-text-secondary)] capitalize">
                  {seg.label}
                </span>
                {showSpend && (
                  <span className="text-[10px] font-semibold text-[var(--color-text-primary)]">
                    {seg.spend >= 1000
                      ? `₱${(seg.spend / 1000).toFixed(1)}K`
                      : `₱${seg.spend.toFixed(0)}`}
                  </span>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
