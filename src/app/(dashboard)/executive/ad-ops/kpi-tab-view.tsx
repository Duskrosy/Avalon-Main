"use client";

import { useState } from "react";
import { RAG_STYLES, fmtKpi, KpiWithValue, TIER_ORDER, TIER_LABELS } from "./kpi-utils";

// ─── Component ────────────────────────────────────────────────────────────────

interface KpiTabViewProps {
  kpis: KpiWithValue[];
}

export default function KpiTabView({ kpis }: KpiTabViewProps) {
  const [activeTab, setActiveTab] = useState<"conversion" | "messenger">("conversion");

  const filtered = kpis.filter((kpi) => {
    const showMessenger = kpi.ad_type === "messenger" || kpi.ad_type === "both";
    const showConversion = kpi.ad_type === "conversion" || kpi.ad_type === "both";
    return activeTab === "messenger" ? showMessenger : showConversion;
  });

  // Group filtered KPIs by canonical group_label (falling back to legacy category),
  // carrying group_sort so the safety-net renders in framework order.
  const wiredRank: Record<string, number> = { wired: 0, to_be_wired: 1, standalone: 2 };
  const grouped: Record<string, { items: KpiWithValue[]; sort: number }> = {};
  for (const kpi of filtered) {
    const key = kpi.group_label ?? kpi.category ?? "Other";
    if (!grouped[key]) grouped[key] = { items: [], sort: kpi.group_sort ?? 9999 };
    grouped[key].items.push(kpi);
  }
  for (const g of Object.values(grouped)) {
    g.items.sort((a, b) => {
      const ra = wiredRank[a.data_source_status ?? "standalone"] ?? 2;
      const rb = wiredRank[b.data_source_status ?? "standalone"] ?? 2;
      if (ra !== rb) return ra - rb;
      if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      return a.name.localeCompare(b.name);
    });
  }

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)] w-fit">
        {(["conversion", "messenger"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab
                ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {tab === "conversion" ? "Conversion Ads" : "Messenger Ads"}
          </button>
        ))}
      </div>

      {/* ── North Star (Hero Section) ──────────────────────────────────── */}
      {(grouped["North Star"]?.items.length ?? 0) > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide mb-3">
            {TIER_LABELS["North Star"]}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {grouped["North Star"].items.map((kpi) => {
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
                    {kpi.unit === "number" && kpi.name.toLowerCase().includes("roas")
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
      {(grouped["Supporting"]?.items.length ?? 0) > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide mb-3">
            {TIER_LABELS["Supporting"]}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {grouped["Supporting"].items.map((kpi) => {
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
      {(grouped["Efficiency"]?.items.length ?? 0) > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide mb-3">
            {TIER_LABELS["Efficiency"]}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {grouped["Efficiency"].items.map((kpi) => {
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
      {(grouped["Budget"]?.items.length ?? 0) > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide mb-3">
            {TIER_LABELS["Budget"]}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {grouped["Budget"].items.map((kpi) => {
              const styles = RAG_STYLES[kpi.status];
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
                  <div className="h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        kpi.status === "green"
                          ? "bg-[var(--color-success)]"
                          : kpi.status === "amber"
                          ? "bg-amber-400"
                          : kpi.status === "red"
                          ? "bg-[var(--color-error)]"
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
        .sort(([, a], [, b]) => a.sort - b.sort)
        .map(([cat, bucket]) => bucket.items.length > 0 && (
          <div key={cat}>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide mb-3">
              {cat}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {bucket.items.map((kpi) => {
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
