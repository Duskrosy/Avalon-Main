"use client";

import { useState } from "react";
import {
  DemographicBar,
  GENDER_COLORS,
  AGE_COLORS,
  type BarSegment,
} from "@/components/ui/demographic-bar";

export type DemoDataRow = {
  gender:        string | null;
  age_group:     string | null;
  campaign_id:   string;
  campaign_name: string | null;
  adset_id:      string | null;
  adset_name:    string | null;
  ad_id:         string | null;
  ad_name:       string | null;
  spend:       number;
  conversions: number;
  messages:    number;
};

type SegmentSummary = {
  key: string; spend: number; conversions: number; messages: number; color: string;
};

function aggregateSegments(
  rows: DemoDataRow[],
  segKey: "gender" | "age_group",
  colorMap: Record<string, string>
): SegmentSummary[] {
  const map = new Map<string, SegmentSummary>();
  for (const row of rows) {
    const key = (row[segKey] ?? "unknown") as string;
    const ex = map.get(key) ?? {
      key, spend: 0, conversions: 0, messages: 0,
      color: colorMap[key] ?? "var(--color-border-primary)",
    };
    map.set(key, {
      ...ex,
      spend:       ex.spend       + row.spend,
      conversions: ex.conversions + row.conversions,
      messages:    ex.messages    + row.messages,
    });
  }
  return [...map.values()].sort((a, b) => b.spend - a.spend).slice(0, 5);
}

export function DemographicSpendCard({ data }: { data: DemoDataRow[] }) {
  const [mode,     setMode]     = useState<"gender" | "age">("gender");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const segKey   = mode === "gender" ? "gender" : "age_group";
  const colorMap = mode === "gender" ? GENDER_COLORS : AGE_COLORS;

  const modeRows = data.filter((r) =>
    mode === "gender" ? r.gender !== null : r.age_group !== null
  );

  const segments   = aggregateSegments(modeRows, segKey, colorMap);
  const totalSpend = segments.reduce((s, seg) => s + seg.spend, 0);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });

  const fmtMoney = (n: number) =>
    n >= 1_000_000 ? `₱${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000   ? `₱${(n / 1_000).toFixed(1)}K`
    : `₱${n.toFixed(0)}`;

  const cprLabel = (spend: number, conv: number, msg: number) => {
    const v = conv > 0 ? spend / conv : msg > 0 ? spend / msg : null;
    return v ? `CPR ₱${v.toFixed(0)}` : null;
  };

  if (segments.length === 0) return null;

  return (
    <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] p-5 shadow-[var(--shadow-sm)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Demographic Spend
        </h3>
        <div className="flex items-center gap-1 bg-[var(--color-bg-secondary)] rounded-lg p-0.5">
          {(["gender", "age"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-xs px-3 py-1 rounded-md transition-colors capitalize ${
                mode === m
                  ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {segments.map((seg) => {
          const pct    = totalSpend > 0 ? (seg.spend / totalSpend) * 100 : 0;
          const cpr    = cprLabel(seg.spend, seg.conversions, seg.messages);
          const isOpen = expanded.has(seg.key);

          // Campaign drill-down for this segment
          const drillRows = modeRows.filter(
            (r) => ((r as Record<string, unknown>)[segKey] ?? "unknown") === seg.key
          );
          const campaignMap = new Map<
            string,
            { name: string; spend: number; conv: number; msg: number }
          >();
          for (const r of drillRows) {
            const ex = campaignMap.get(r.campaign_id) ?? {
              name: r.campaign_name ?? r.campaign_id,
              spend: 0, conv: 0, msg: 0,
            };
            campaignMap.set(r.campaign_id, {
              ...ex,
              spend: ex.spend + r.spend,
              conv:  ex.conv  + r.conversions,
              msg:   ex.msg   + r.messages,
            });
          }
          const campaigns = [...campaignMap.values()]
            .sort((a, b) => b.spend - a.spend)
            .slice(0, 5);

          return (
            <div key={seg.key}>
              <button onClick={() => toggle(seg.key)} className="w-full text-left">
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-sm capitalize text-[var(--color-text-primary)] flex-1 font-medium">
                    {seg.key}
                  </span>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {fmtMoney(seg.spend)}
                  </span>
                  <span className="text-xs text-[var(--color-text-tertiary)] w-8 text-right">
                    {pct.toFixed(0)}%
                  </span>
                  {cpr && (
                    <span className="text-xs text-[var(--color-text-tertiary)] w-20 text-right">
                      {cpr}
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-tertiary)] ml-1">
                    {isOpen ? "▾" : "▸"}
                  </span>
                </div>
                {/* Proportional bar vs total */}
                <div className="h-2 rounded-full overflow-hidden bg-[var(--color-bg-tertiary)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: seg.color }}
                  />
                </div>
              </button>

              {isOpen && campaigns.length > 0 && (
                <div className="mt-2 pl-4 space-y-1.5 border-l-2 border-[var(--color-border-secondary)]">
                  {campaigns.map((c) => {
                    const cl = cprLabel(c.spend, c.conv, c.msg);
                    return (
                      <div key={c.name} className="flex items-center gap-2">
                        <span className="text-xs text-[var(--color-text-secondary)] truncate flex-1">
                          {c.name}
                        </span>
                        <span className="text-xs font-medium text-[var(--color-text-primary)] shrink-0">
                          {fmtMoney(c.spend)}
                        </span>
                        {cl && (
                          <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">
                            {cl}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
