"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { BarChart3, RefreshCw, TrendingUp, Users } from "lucide-react";

// Sales reports. Two scopes (mine / all — manager-gated), seven date ranges,
// five totals, daily orders bar chart, by-agent leaderboard (manager view),
// and by-campaign attribution. Driven by /api/sales/reports.

type Totals = {
  orders: number;
  confirmed: number;
  completed: number;
  abandoned: number;
  cancelled: number;
  gross: number;
  net: number;
  avg_order_value: number;
  conversion_rate: number;
  abandon_rate: number;
};

type ByDay = { day: string; orders: number; gross: number; net: number };
type ByAgent = {
  user_id: string;
  name: string;
  orders: number;
  completed: number;
  gross: number;
  net: number;
};
type ByCampaign = { name: string; orders: number; gross: number; net: number };

type Bundle = {
  range: { from: string; to: string };
  scope: "mine" | "all";
  totals: Totals;
  by_day: ByDay[];
  by_agent?: ByAgent[];
  by_campaign: ByCampaign[];
};

const RANGES = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 Days" },
  { value: "14d", label: "14 Days" },
  { value: "30d", label: "30 Days" },
  { value: "mtd", label: "Month to date" },
];

export function ReportsView({ canManage }: { canManage: boolean }) {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [range, setRange] = useState("7d");
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range, scope });
      const res = await fetch(`/api/sales/reports?${params.toString()}`);
      if (!res.ok) return;
      setData((await res.json()) as Bundle);
    } finally {
      setLoading(false);
    }
  }, [range, scope]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const peakDay = useMemo(() => {
    if (!data) return 0;
    return data.by_day.reduce((max, d) => Math.max(max, d.orders), 0);
  }, [data]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BarChart3 size={18} className="text-gray-500" />
            Reports
          </h1>
          <p className="text-xs text-gray-500">
            Sales performance — orders, GMV, conversion, abandon rate.
            Completion attribution drives the numbers.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        {canManage && (
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "mine" | "all")}
            className="px-2 py-1 border border-gray-200 rounded text-xs"
          >
            <option value="mine">My Sales</option>
            <option value="all">All Sales</option>
          </select>
        )}
        <div className="flex gap-1 text-xs">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              className={`px-2 py-1 rounded ${
                range === r.value
                  ? "bg-gray-900 text-white"
                  : "border border-gray-200 hover:bg-gray-50 text-gray-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void fetchReport()}
          className="ml-auto p-1.5 text-gray-400 hover:text-gray-700"
          aria-label="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {!data ? (
        <div className="text-sm text-gray-500 text-center py-12">
          {loading ? "Loading…" : "No data."}
        </div>
      ) : (
        <>
          {/* Totals strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <Stat
              label="Orders"
              value={data.totals.orders.toString()}
              hint={`${data.totals.completed} completed`}
            />
            <Stat
              label="Gross sold"
              value={`₱${data.totals.gross.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}`}
              hint={`AOV ₱${data.totals.avg_order_value.toLocaleString(
                undefined,
                { maximumFractionDigits: 0 },
              )}`}
            />
            <Stat
              label="Net collected"
              value={`₱${data.totals.net.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}`}
              hint={
                data.totals.gross > 0
                  ? `${Math.round(
                      (data.totals.net / data.totals.gross) * 100,
                    )}% of gross`
                  : undefined
              }
            />
            <Stat
              label="Conversion"
              value={`${Math.round(data.totals.conversion_rate * 100)}%`}
              hint={`of ${data.totals.confirmed} confirmed`}
            />
            <Stat
              label="Abandon rate"
              value={`${Math.round(data.totals.abandon_rate * 100)}%`}
              hint={`${data.totals.abandoned} abandoned`}
              tone={data.totals.abandon_rate > 0.2 ? "warning" : undefined}
            />
          </div>

          {/* Daily chart */}
          <div className="border border-gray-200 rounded-md p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium flex items-center gap-1.5">
                <TrendingUp size={10} />
                Orders by day
              </div>
              <div className="text-[10px] text-gray-400">
                {format(parseISO(data.range.from), "MMM d")} →{" "}
                {format(parseISO(data.range.to), "MMM d")}
              </div>
            </div>
            {data.by_day.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-6">
                No orders in this range.
              </div>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {data.by_day.map((d) => {
                  const heightPct =
                    peakDay > 0 ? (d.orders / peakDay) * 100 : 0;
                  return (
                    <div
                      key={d.day}
                      className="flex-1 flex flex-col items-center gap-1 group"
                      title={`${d.day}: ${d.orders} orders, ₱${d.gross.toLocaleString()}`}
                    >
                      <div className="w-full bg-blue-100 group-hover:bg-blue-200 rounded-sm relative flex-1 flex items-end">
                        <div
                          className="w-full bg-blue-500 group-hover:bg-blue-600 rounded-sm transition-colors"
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      <div className="text-[9px] text-gray-500 truncate w-full text-center">
                        {format(parseISO(d.day + "T00:00:00"), "M/d")}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By agent — manager only */}
            {data.by_agent && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2 pb-1 border-b border-gray-200 flex items-center gap-1.5">
                  <Users size={10} />
                  Agents leaderboard
                </div>
                {data.by_agent.length === 0 ? (
                  <div className="text-xs text-gray-400 py-6 text-center">
                    No agents with orders in this range.
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Agent</th>
                          <th className="px-3 py-2 text-right">Orders</th>
                          <th className="px-3 py-2 text-right">Gross</th>
                          <th className="px-3 py-2 text-right">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.by_agent.map((a) => (
                          <tr key={a.user_id}>
                            <td className="px-3 py-2">
                              <div className="font-medium">{a.name}</div>
                              <div className="text-[10px] text-gray-500">
                                {a.completed} completed
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {a.orders}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              ₱{a.gross.toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                              })}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                              ₱{a.net.toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* By campaign */}
            <div className={data.by_agent ? "" : "lg:col-span-2"}>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2 pb-1 border-b border-gray-200">
                Top campaigns
              </div>
              {data.by_campaign.length === 0 ? (
                <div className="text-xs text-gray-400 py-6 text-center">
                  No campaign attribution captured yet. Fill the Ad
                  Campaign field on the Complete Order modal to start.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Campaign</th>
                        <th className="px-3 py-2 text-right">Orders</th>
                        <th className="px-3 py-2 text-right">Gross</th>
                        <th className="px-3 py-2 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.by_campaign.slice(0, 12).map((c) => (
                        <tr key={c.name}>
                          <td className="px-3 py-2 truncate max-w-[260px]">
                            {c.name}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {c.orders}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            ₱{c.gross.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                            ₱{c.net.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
}) {
  const palette =
    tone === "warning"
      ? "border-amber-300 bg-amber-50/50"
      : "border-gray-200 bg-white";
  return (
    <div className={`border rounded-md px-3 py-2.5 ${palette}`}>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-0.5">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}
