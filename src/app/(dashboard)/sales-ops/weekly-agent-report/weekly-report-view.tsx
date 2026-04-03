"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";

type Agent = { id: string; first_name: string; last_name: string };

type DailyRow = {
  date: string;
  dayStatus: "SCORED" | "LEAVE" | "NO DATA" | "QA CAPPED";
  volPts: number | null;
  qaPts: number | null;
  finalFps: number | null;
  confirmedRegular: number;
  followUps: number;
  qaTier: string | null;
  onLeave: boolean;
  bufferApproved: boolean;
};

type WeekReport = {
  agent_id: string;
  from: string;
  to: string;
  daily: DailyRow[];
  avg_fps: number;
  scored_days: number;
  week_cr: number;
  total_follow_ups: number;
  qa_summary: Record<string, number>;
  qa_count: number;
};

const STATUS_STYLES: Record<string, string> = {
  "SCORED":    "bg-green-50 text-green-700",
  "LEAVE":     "bg-gray-100 text-gray-400",
  "NO DATA":   "bg-gray-50 text-gray-400",
  "QA CAPPED": "bg-red-50 text-red-500",
};

const QA_TIER_STYLES: Record<string, string> = {
  "Tier 3": "bg-green-50 text-green-700",
  "Tier 2": "bg-gray-100 text-gray-600",
  "Tier 1": "bg-amber-50 text-amber-600",
  "Fail":   "bg-red-50 text-red-500",
};

function getMondayOfWeek(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

function formatWeekRange(monday: Date): string {
  const sunday = endOfWeek(monday, { weekStartsOn: 1 });
  return `${format(monday, "d MMM")} – ${format(sunday, "d MMM yyyy")}`;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function WeeklyReportView({ agents }: { agents: Agent[] }) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [report, setReport] = useState<WeekReport | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedAgent = agents.find((a) => a.id === agentId);

  const fetchReport = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    const from = toDateStr(weekStart);
    const to = toDateStr(endOfWeek(weekStart, { weekStartsOn: 1 }));
    const res = await fetch(
      `/api/sales/weekly-report?agent_id=${agentId}&from=${from}&to=${to}`
    );
    if (res.ok) setReport(await res.json());
    else setReport(null);
    setLoading(false);
  }, [agentId, weekStart]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const fpsColor = (finalFps: number | null) => {
    if (finalFps === null) return "text-gray-400";
    if (finalFps >= 60) return "text-green-600 font-semibold";
    if (finalFps >= 40) return "text-amber-600";
    return "text-red-500";
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Weekly Agent Report</h1>
        <p className="text-sm text-gray-500 mt-1">Day-by-day breakdown for any agent and week</p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-48"
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.first_name} {a.last_name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
          >
            ‹
          </button>
          <span className="px-3 py-2 text-sm font-medium text-gray-700 min-w-48 text-center">
            {formatWeekRange(weekStart)}
          </span>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
          >
            ›
          </button>
        </div>

        <button
          onClick={() => setWeekStart(getMondayOfWeek(new Date()))}
          className="text-xs text-gray-400 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-lg"
        >
          This week
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : !report ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">No data for this week.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Week CR</p>
              <p className="text-2xl font-bold text-gray-900">{report.week_cr}</p>
              <p className="text-xs text-gray-400 mt-1">confirmed regular</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Avg FPS</p>
              <p className={`text-2xl font-bold ${fpsColor(report.avg_fps)}`}>
                {report.avg_fps > 0 ? report.avg_fps.toFixed(1) : "—"}
              </p>
              <p className="text-xs text-gray-400 mt-1">{report.scored_days} scored days</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Follow-ups</p>
              <p className="text-2xl font-bold text-gray-900">{report.total_follow_ups.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">total for week</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">QA Results</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {Object.entries(report.qa_summary).length === 0 ? (
                  <p className="text-sm text-gray-400">No QA this week</p>
                ) : Object.entries(report.qa_summary).map(([tier, count]) => (
                  <span key={tier} className={`text-xs px-2 py-0.5 rounded-full ${QA_TIER_STYLES[tier] ?? "bg-gray-100 text-gray-500"}`}>
                    {tier}: {count}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Daily breakdown table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                {selectedAgent ? `${selectedAgent.first_name} ${selectedAgent.last_name}` : ""} — Daily Breakdown
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="px-4 py-3 text-left font-medium">Day</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Follow-ups</th>
                    <th className="px-4 py-3 text-right font-medium">CR</th>
                    <th className="px-4 py-3 text-center font-medium">QA Tier</th>
                    <th className="px-4 py-3 text-right font-medium">Vol Pts</th>
                    <th className="px-4 py-3 text-right font-medium">QA Pts</th>
                    <th className="px-4 py-3 text-right font-medium">FPS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {report.daily.map((row) => {
                    const isWeekend = ["Saturday", "Sunday"].includes(
                      format(parseISO(row.date), "EEEE")
                    );
                    return (
                      <tr
                        key={row.date}
                        className={isWeekend ? "bg-gray-50/50" : "hover:bg-gray-50"}
                      >
                        <td className="px-4 py-3 text-gray-700">
                          <span className="font-medium">{format(parseISO(row.date), "EEE")}</span>
                          <span className="text-gray-400 ml-2 text-xs">{format(parseISO(row.date), "d MMM")}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[row.dayStatus] ?? ""}`}>
                            {row.dayStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {row.followUps > 0 ? row.followUps.toLocaleString() : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-800">
                          {row.confirmedRegular > 0 ? row.confirmedRegular : <span className="text-gray-300 font-normal">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.qaTier ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${QA_TIER_STYLES[row.qaTier] ?? "bg-gray-100 text-gray-500"}`}>
                              {row.qaTier}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {row.volPts !== null ? row.volPts : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {row.qaPts !== null && row.qaPts > 0 ? `+${row.qaPts}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className={`px-4 py-3 text-right ${fpsColor(row.finalFps)}`}>
                          {row.finalFps !== null ? row.finalFps.toFixed(1) : <span className="text-gray-300 font-normal">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {report.scored_days > 0 && (
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={7} className="px-4 py-3 text-xs font-medium text-gray-500">
                        Week average
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${fpsColor(report.avg_fps > 0 ? report.avg_fps : null)}`}>
                        {report.avg_fps > 0 ? report.avg_fps.toFixed(1) : "—"}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
