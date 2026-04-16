"use client";

import { useState } from "react";
import { format } from "date-fns";

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₱${(n / 1_000).toFixed(1)}K`;
  return `₱${n.toFixed(0)}`;
}

interface SalesTabViewProps {
  // Chat data
  todayTotal: number;
  weekTotal: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  revGrowth: number;
  salesCountThis: number;
  salesCountLast: number;
  qaAvg: number | null;
  qaCount: number;
  dailyTotals: { date: string; label: string; total: number }[];
  agentRanking: { name: string; pairs: number; days: number }[];
  confirmedSales: { confirmed_date: string; agent_id: string; sale_type: string | null; quantity: number | null; net_value: string }[];
  consistencyRows: { agent_id: string; consistent_days: number; total_days: number; name: string }[];
  today: string;
  maxDayTotal: number;
  maxAgentPairs: number;
  // Shopify data
  shopifyRevenueThisMonth: number;
  shopifyRevenueLastMonth: number;
  shopifyOrderCount: number;
}

export default function SalesTabView(props: SalesTabViewProps) {
  const {
    todayTotal, weekTotal, revenueThisMonth, revenueLastMonth, revGrowth,
    salesCountThis, salesCountLast, qaAvg, qaCount, dailyTotals, agentRanking,
    confirmedSales, consistencyRows, today, maxDayTotal, maxAgentPairs,
    shopifyRevenueThisMonth, shopifyRevenueLastMonth, shopifyOrderCount,
  } = props;

  const [activeTab, setActiveTab] = useState<"chat" | "shopify" | "marketplace" | "store" | "overall">("chat");

  const tabs = ["chat", "shopify", "marketplace", "store", "overall"] as const;
  const tabLabels: Record<typeof tabs[number], string> = {
    chat: "Chat",
    shopify: "Shopify",
    marketplace: "Marketplace",
    store: "Store",
    overall: "Overall",
  };

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)] flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
              activeTab === tab
                ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {/* ── Chat tab ──────────────────────────────────────────────────────── */}
      {activeTab === "chat" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Pairs sold today",
                value: todayTotal,
                sub: `${weekTotal} this week`,
                accent: todayTotal >= 40 ? "text-[var(--color-success)] bg-[var(--color-success-light)] border-green-200" :
                        todayTotal >= 25 ? "text-[var(--color-warning-text)] bg-[var(--color-warning-light)] border-[var(--color-border-primary)]" :
                        "text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]",
              },
              {
                label: "Revenue this month",
                value: fmtMoney(revenueThisMonth),
                sub: `${revGrowth >= 0 ? "+" : ""}${revGrowth.toFixed(1)}% vs last month`,
                accent: revGrowth >= 0 ? "text-[var(--color-success)] bg-[var(--color-success-light)] border-green-200" : "text-[var(--color-error)] bg-[var(--color-error-light)] border-red-200",
              },
              {
                label: "Orders this month",
                value: salesCountThis,
                sub: `vs ${salesCountLast} last month`,
                accent: "text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]",
              },
              {
                label: "QA avg score (7d)",
                value: qaAvg !== null ? `${qaAvg.toFixed(1)}` : "—",
                sub: `from ${qaCount} evaluations`,
                accent: qaAvg !== null && qaAvg >= 80 ? "text-[var(--color-success)] bg-[var(--color-success-light)] border-green-200" :
                        qaAvg !== null && qaAvg >= 60 ? "text-[var(--color-warning-text)] bg-[var(--color-warning-light)] border-[var(--color-border-primary)]" :
                        "text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]",
              },
            ].map((card) => (
              <div key={card.label} className={`rounded-[var(--radius-lg)] border p-5 ${card.accent.includes("bg-") ? card.accent.split(" ").filter(c => c.startsWith("bg-") || c.startsWith("border-") || c.startsWith("text-")).join(" ") : "bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]"}`}>
                <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide mb-1">{card.label}</p>
                <p className={`text-3xl font-bold tracking-tight ${card.accent.split(" ").find(c => c.startsWith("text-")) ?? "text-[var(--color-text-primary)]"}`}>
                  {card.value}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* 7-day bar chart */}
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Daily pairs sold · last 7 days</h2>
            <div className="flex items-end gap-2 h-32">
              {dailyTotals.map((day) => {
                const heightPct = (day.total / maxDayTotal) * 100;
                const isToday = day.date === today;
                const color = day.total >= 40 ? "bg-[var(--color-success)]" : day.total >= 25 ? "bg-amber-400" : day.total === 0 ? "bg-[var(--color-border-primary)]" : "bg-red-400";
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="text-xs font-bold text-[var(--color-text-primary)]">{day.total > 0 ? day.total : ""}</span>
                    <div className="w-full flex items-end h-20 relative">
                      <div
                        className={`w-full rounded-t-md transition-all ${color} ${isToday ? "ring-2 ring-gray-900 ring-offset-1" : ""}`}
                        style={{ height: `${Math.max(4, heightPct)}%` }}
                      />
                    </div>
                    <span className={`text-[10px] ${isToday ? "text-[var(--color-text-primary)] font-semibold" : "text-[var(--color-text-tertiary)]"}`}>
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent leaderboard */}
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Agent performance · last 7 days</h2>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Confirmed regular pairs (excl. abandoned)</p>
            </div>
            {agentRanking.length === 0 ? (
              <p className="px-5 py-8 text-sm text-[var(--color-text-tertiary)] text-center">No data available.</p>
            ) : (
              <div className="px-5 py-4 space-y-3">
                {agentRanking.map((agent, i) => {
                  const pct = (agent.pairs / maxAgentPairs) * 100;
                  const dailyAvg = agent.days > 0 ? (agent.pairs / agent.days).toFixed(1) : "—";
                  const color = agent.pairs >= 40 ? "bg-[var(--color-success)]" : agent.pairs >= 25 ? "bg-amber-400" : "bg-red-400";
                  const badge = agent.pairs >= 40 ? "bg-[var(--color-success-light)] text-[var(--color-success)]" : agent.pairs >= 25 ? "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]" : "bg-[var(--color-error-light)] text-[var(--color-error)]";
                  return (
                    <div key={agent.name} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--color-text-tertiary)] w-4 text-right font-medium">#{i + 1}</span>
                          <span className="text-sm font-medium text-[var(--color-text-primary)]">{agent.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                          <span>{dailyAvg}/day avg</span>
                          <span className={`px-1.5 py-0.5 rounded-full font-semibold ${badge}`}>
                            {agent.pairs} pairs
                          </span>
                        </div>
                      </div>
                      <div className="ml-6 h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent confirmed sales */}
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--color-border-secondary)] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Recent confirmed orders · this month</h2>
              <span className="text-xs text-[var(--color-text-tertiary)]">{salesCountThis} total</span>
            </div>
            {confirmedSales.length === 0 ? (
              <p className="px-5 py-8 text-sm text-[var(--color-text-tertiary)] text-center">No confirmed sales this month.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
                      {["Date", "Agent", "Type", "Qty", "Net Value"].map((h) => (
                        <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-secondary)]">
                    {confirmedSales.slice(0, 10).map((s) => (
                      <tr key={s.confirmed_date + s.agent_id + s.net_value} className="hover:bg-[var(--color-surface-hover)]">
                        <td className="px-5 py-3 text-xs text-[var(--color-text-secondary)]">{format(new Date(s.confirmed_date + "T00:00:00"), "d MMM")}</td>
                        <td className="px-5 py-3 text-xs text-[var(--color-text-secondary)]">{s.agent_id.slice(0, 8)}</td>
                        <td className="px-5 py-3 text-xs text-[var(--color-text-secondary)]">{s.sale_type ?? "—"}</td>
                        <td className="px-5 py-3 text-sm font-medium text-[var(--color-text-primary)]">{s.quantity}</td>
                        <td className="px-5 py-3 text-sm font-semibold text-[var(--color-text-primary)]">{fmtMoney(Number(s.net_value))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Consistency */}
          {consistencyRows.length > 0 && (
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Consistency · this month</h2>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Consecutive days hitting target</p>
              </div>
              <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {consistencyRows.slice(0, 8).map((r) => {
                  const pct = r.total_days > 0 ? Math.round((r.consistent_days / r.total_days) * 100) : 0;
                  const accent = pct >= 80 ? "border-green-200 bg-[var(--color-success-light)]" : pct >= 60 ? "border-[var(--color-border-primary)] bg-[var(--color-warning-light)]" : "border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]";
                  const valColor = pct >= 80 ? "text-[var(--color-success)]" : pct >= 60 ? "text-[var(--color-warning-text)]" : "text-[var(--color-text-primary)]";
                  return (
                    <div key={r.agent_id} className={`rounded-[var(--radius-lg)] border p-3 ${accent}`}>
                      <p className="text-xs text-[var(--color-text-secondary)] truncate mb-1">{r.name}</p>
                      <p className={`text-2xl font-bold ${valColor}`}>{pct}%</p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{r.consistent_days}/{r.total_days} days</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Shopify tab ───────────────────────────────────────────────────── */}
      {activeTab === "shopify" && (
        <>
          {shopifyOrderCount === 0 ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-[var(--color-text-tertiary)]">No Shopify orders this month</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {(() => {
                const shopifyRevGrowth = shopifyRevenueLastMonth > 0
                  ? ((shopifyRevenueThisMonth - shopifyRevenueLastMonth) / shopifyRevenueLastMonth) * 100
                  : 0;
                const avgOrderValue = shopifyOrderCount > 0 ? shopifyRevenueThisMonth / shopifyOrderCount : 0;
                return [
                  {
                    label: "Revenue this month",
                    value: fmtMoney(shopifyRevenueThisMonth),
                    sub: shopifyRevenueLastMonth > 0
                      ? `${shopifyRevGrowth >= 0 ? "+" : ""}${shopifyRevGrowth.toFixed(1)}% vs last month`
                      : "No data last month",
                    accent: shopifyRevGrowth >= 0
                      ? "text-[var(--color-success)] bg-[var(--color-success-light)] border-green-200"
                      : "text-[var(--color-error)] bg-[var(--color-error-light)] border-red-200",
                  },
                  {
                    label: "Orders this month",
                    value: shopifyOrderCount,
                    sub: shopifyRevenueLastMonth > 0 ? `vs last month` : "—",
                    accent: "text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]",
                  },
                  {
                    label: "Avg order value",
                    value: fmtMoney(avgOrderValue),
                    sub: `across ${shopifyOrderCount} orders`,
                    accent: "text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]",
                  },
                ].map((card) => (
                  <div key={card.label} className={`rounded-[var(--radius-lg)] border p-5 ${card.accent.split(" ").filter(c => c.startsWith("bg-") || c.startsWith("border-")).join(" ")}`}>
                    <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide mb-1">{card.label}</p>
                    <p className={`text-3xl font-bold tracking-tight ${card.accent.split(" ").find(c => c.startsWith("text-")) ?? "text-[var(--color-text-primary)]"}`}>
                      {card.value}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5">{card.sub}</p>
                  </div>
                ));
              })()}
            </div>
          )}
        </>
      )}

      {/* ── Marketplace tab ───────────────────────────────────────────────── */}
      {activeTab === "marketplace" && (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-[var(--color-text-tertiary)]">Marketplace data coming soon</p>
        </div>
      )}

      {/* ── Store tab ─────────────────────────────────────────────────────── */}
      {activeTab === "store" && (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-[var(--color-text-tertiary)]">Store data coming soon</p>
        </div>
      )}

      {/* ── Overall tab ───────────────────────────────────────────────────── */}
      {activeTab === "overall" && (
        <div className="space-y-4">
          {/* Combined metric cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-5">
              <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide mb-1">Total revenue this month</p>
              <p className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
                {fmtMoney(revenueThisMonth + shopifyRevenueThisMonth)}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5">Chat + Shopify combined</p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-5">
              <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide mb-1">Total orders this month</p>
              <p className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
                {salesCountThis + shopifyOrderCount}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5">Chat + Shopify combined</p>
            </div>
          </div>

          {/* Channel breakdown table */}
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Channel breakdown · this month</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
                  {["Channel", "Revenue", "Orders"].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-secondary)]">
                <tr className="hover:bg-[var(--color-surface-hover)]">
                  <td className="px-5 py-3 text-sm font-medium text-[var(--color-text-primary)]">Chat</td>
                  <td className="px-5 py-3 text-sm font-semibold text-[var(--color-text-primary)]">{fmtMoney(revenueThisMonth)}</td>
                  <td className="px-5 py-3 text-sm text-[var(--color-text-secondary)]">{salesCountThis} orders</td>
                </tr>
                <tr className="hover:bg-[var(--color-surface-hover)]">
                  <td className="px-5 py-3 text-sm font-medium text-[var(--color-text-primary)]">Shopify</td>
                  <td className="px-5 py-3 text-sm font-semibold text-[var(--color-text-primary)]">{fmtMoney(shopifyRevenueThisMonth)}</td>
                  <td className="px-5 py-3 text-sm text-[var(--color-text-secondary)]">{shopifyOrderCount} orders</td>
                </tr>
                <tr className="bg-[var(--color-bg-secondary)]">
                  <td className="px-5 py-3 text-sm font-semibold text-[var(--color-text-primary)]">Total</td>
                  <td className="px-5 py-3 text-sm font-bold text-[var(--color-text-primary)]">{fmtMoney(revenueThisMonth + shopifyRevenueThisMonth)}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-[var(--color-text-secondary)]">{salesCountThis + shopifyOrderCount} orders</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
