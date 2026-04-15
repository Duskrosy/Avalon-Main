"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import type { DailyFpsRow } from "@/lib/sales/types";
import { QA_TIER_STYLES } from "@/lib/sales/constants";

type Agent = { id: string; first_name: string; last_name: string; email: string };

type FpsResult = {
  agent_id: string;
  month: string;
  daily: DailyFpsRow[];
  avg_fps: number | null;
  scored_days: number;
  total_fps: number;
  mtd_confirmed_regular: number;
  gate_passed: boolean;
  gate_remaining: number;
  consistency_score: number;
  monthly_fps: number | null;
  bracket: string;
};

type Props = {
  agents: Agent[];
  currentUserId: string;
  canManage: boolean;
};

const CURRENT_MONTH = format(new Date(), "yyyy-MM");

function agentName(a: Agent) {
  return `${a.first_name} ${a.last_name}`;
}

function statusBadge(status: DailyFpsRow["dayStatus"]) {
  const map: Record<string, { label: string; cls: string }> = {
    SCORED: { label: "Scored", cls: "bg-[var(--color-success-light)] text-[var(--color-success)]" },
    "QA CAPPED": { label: "QA Cap", cls: "bg-[var(--color-error-light)] text-[var(--color-error)]" },
    LEAVE: { label: "Leave", cls: "bg-[var(--color-accent-light)] text-[var(--color-accent)]" },
    "NO DATA": { label: "No data", cls: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]" },
  };
  const s = map[status] ?? map["NO DATA"];
  return <span className={`text-xs px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

function bracketColor(bracket: string) {
  if (bracket === "Elite") return "text-[var(--color-success)]";
  if (bracket === "Strong") return "text-[var(--color-accent)]";
  if (bracket === "Pass") return "text-[#D57B0E]";
  return "text-[var(--color-error)]";
}

export function FpsDailyView({ agents, currentUserId, canManage }: Props) {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [selectedAgent, setSelectedAgent] = useState(currentUserId);
  const [result, setResult] = useState<FpsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchFps = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month, agent_id: selectedAgent });
    const res = await fetch(`/api/sales/fps?${params}`);
    if (res.ok) setResult(await res.json());
    setLoading(false);
  }, [month, selectedAgent]);

  useEffect(() => { fetchFps(); }, [fetchFps]);

  const agentObj = agents.find((a) => a.id === selectedAgent);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">FPS Daily Score</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Follow-through Performance Score — per agent per day</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
        />
        {canManage && (
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{agentName(a)}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Computing...</div>
      ) : !result ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No data found for this period.</p>
        </div>
      ) : (
        <>
          {/* Monthly summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
              <p className="text-xs text-[var(--color-text-secondary)] mb-1">MTD Confirmed Regular</p>
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">{result.mtd_confirmed_regular}</p>
              <p className={`text-xs mt-1 font-medium ${result.gate_passed ? "text-[var(--color-success)]" : "text-amber-500"}`}>
                {result.gate_passed ? "Gate passed" : `${result.gate_remaining} to gate`}
              </p>
            </div>
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
              <p className="text-xs text-[var(--color-text-secondary)] mb-1">Avg Daily FPS</p>
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                {result.avg_fps !== null ? result.avg_fps.toFixed(1) : "—"}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{result.scored_days} scored days</p>
            </div>
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
              <p className="text-xs text-[var(--color-text-secondary)] mb-1">Consistency Bonus</p>
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">+{result.consistency_score}</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">points</p>
            </div>
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
              <p className="text-xs text-[var(--color-text-secondary)] mb-1">Monthly FPS</p>
              <p className={`text-2xl font-bold ${bracketColor(result.bracket)}`}>
                {result.monthly_fps !== null ? result.monthly_fps.toFixed(1) : "—"}
              </p>
              <p className={`text-xs mt-1 font-semibold ${bracketColor(result.bracket)}`}>{result.bracket}</p>
            </div>
          </div>

          {/* Daily rows table */}
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
            <table className="min-w-full divide-y divide-[var(--color-border-secondary)] text-sm">
              <thead className="bg-[var(--color-bg-secondary)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Vol pts</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">QA pts</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">QA Tier</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Base FPS</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase font-bold">Final FPS</th>
                </tr>
              </thead>
              <tbody className="bg-[var(--color-bg-primary)] divide-y divide-[var(--color-border-secondary)]">
                {result.daily.map((row) => (
                  <tr key={row.date} className={`hover:bg-[var(--color-surface-hover)] ${row.isNoData || row.isLeave ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">
                      {format(new Date(row.date + "T00:00:00"), "EEE d MMM")}
                    </td>
                    <td className="px-4 py-3">{statusBadge(row.dayStatus)}</td>
                    <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">{row.volPts ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">{row.qaPts ?? "—"}</td>
                    <td className="px-4 py-3">
                      {row.qaTier ? (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            color: QA_TIER_STYLES[row.qaTier]?.color ?? "#666",
                            background: QA_TIER_STYLES[row.qaTier]?.bg ?? "#f0f0f0",
                          }}
                        >
                          {row.qaTier}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--color-text-tertiary)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">{row.baseFps ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-bold text-[var(--color-text-primary)]">
                      {row.finalFps !== null ? (
                        <span className={row.capApplied ? "text-[var(--color-error)]" : ""}>
                          {row.finalFps}
                          {row.capApplied && <span className="text-xs font-normal ml-1">(cap)</span>}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              {result.daily.length > 0 && (
                <tfoot className="bg-[var(--color-bg-secondary)] border-t border-[var(--color-border-primary)]">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-xs text-right font-medium text-[var(--color-text-secondary)] uppercase">
                      Average ({result.scored_days} scored days)
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-[var(--color-text-primary)]">
                      {result.avg_fps !== null ? result.avg_fps.toFixed(1) : "—"}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Agent info */}
          {agentObj && (
            <p className="text-xs text-[var(--color-text-tertiary)] mt-3 text-right">
              Viewing: {agentName(agentObj)} · {month}
            </p>
          )}
        </>
      )}
    </div>
  );
}
