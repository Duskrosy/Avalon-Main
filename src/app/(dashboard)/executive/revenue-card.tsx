"use client";

import { useState } from "react";

type ChannelRevenue = {
  all: number;
  store: number;
  conversion: number; // Shopify
  messenger: number;
};

const CHANNELS = [
  { key: "all", label: "All" },
  { key: "store", label: "Store" },
  { key: "conversion", label: "Conversion" },
  { key: "messenger", label: "Messenger" },
] as const;

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `₱${(n / 1_000).toFixed(1)}K`;
  return `₱${n.toFixed(0)}`;
}

export function RevenueCard({ revenue, yesterdayRevenue }: { revenue: ChannelRevenue; yesterdayRevenue: ChannelRevenue }) {
  const [channel, setChannel] = useState<keyof ChannelRevenue>("all");

  const current = revenue[channel];
  const previous = yesterdayRevenue[channel];
  const change = previous > 0 ? ((current - previous) / previous) * 100 : null;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-5 h-full">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide">Revenue Day</p>
      </div>
      <p className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">{fmtMoney(current)}</p>
      {change !== null && (
        <p className={`text-xs mt-1 font-medium ${change >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
          {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}% vs yesterday
        </p>
      )}
      <div className="flex gap-1 mt-3">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            onClick={() => setChannel(c.key as keyof ChannelRevenue)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              channel === c.key
                ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
