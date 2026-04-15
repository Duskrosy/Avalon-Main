"use client";

import { useState, useEffect, useCallback } from "react";
import type { Consistency } from "@/lib/sales/types";
import { CONSISTENCY_TIERS } from "@/lib/sales/constants";

type Agent = { id: string; first_name: string; last_name: string; email: string };
type Props = { agents: Agent[]; canManage: boolean };

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

function agentName(a: Agent) {
  return `${a.first_name} ${a.last_name}`;
}

// The 3 date ranges for the monthly consistency review
const RANGES = [
  { label: "Range 1", desc: "Days 1–10" },
  { label: "Range 2", desc: "Days 11–20" },
  { label: "Range 3", desc: "Days 21–end" },
];

function RangeHitPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2, 3].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          className={`w-8 h-8 rounded-lg text-sm font-semibold transition-all border ${
            value === n
              ? "bg-[#3A5635] text-white border-[#3A5635]"
              : "bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)] border-[var(--color-border-primary)] hover:border-gray-400"
          } ${disabled ? "opacity-50 cursor-default" : "cursor-pointer"}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function scorePill(score: number) {
  let cls = "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]";
  if (score >= 20) cls = "bg-[var(--color-success-light)] text-[var(--color-success)]";
  else if (score >= 12) cls = "bg-[var(--color-accent-light)] text-[var(--color-accent)]";
  else if (score >= 5) cls = "bg-[var(--color-warning-light)] text-[var(--color-warning)]";

  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${cls}`}>
      +{score} pts
    </span>
  );
}

export function ConsistencyView({ agents, canManage }: Props) {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [rows, setRows] = useState<Consistency[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [localRanges, setLocalRanges] = useState<Record<string, number>>({});
  const [localEvaluators, setLocalEvaluators] = useState<Record<string, string>>({});

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/sales/consistency?month=${month}`);
    if (res.ok) {
      const data: Consistency[] = await res.json();
      setRows(data);
      // Seed local state from fetched data
      const rangeMap: Record<string, number> = {};
      const evalMap: Record<string, string> = {};
      for (const r of data) {
        rangeMap[r.agent_id] = r.ranges_hit;
        evalMap[r.agent_id] = r.evaluator ?? "";
      }
      setLocalRanges(rangeMap);
      setLocalEvaluators(evalMap);
    }
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Pre-populate unset agents with 0
  useEffect(() => {
    setLocalRanges((prev) => {
      const next = { ...prev };
      for (const a of agents) {
        if (next[a.id] === undefined) next[a.id] = 0;
      }
      return next;
    });
  }, [agents]);

  async function handleSave(agentId: string) {
    const ranges_hit = localRanges[agentId] ?? 0;
    const evaluator = localEvaluators[agentId] ?? "";

    setSaving(agentId);

    const existing = rows.find((r) => r.agent_id === agentId);
    if (existing) {
      await fetch(`/api/sales/consistency?id=${existing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ranges_hit, evaluator: evaluator || null }),
      });
    } else {
      await fetch("/api/sales/consistency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, month, ranges_hit, evaluator: evaluator || null }),
      });
    }

    await fetchRows();
    setSaving(null);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Consistency Tracker</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Monthly review — how many of the 3 date ranges hit ≥70 avg FPS?
          </p>
        </div>
      </div>

      {/* Range legend */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        {RANGES.map((r) => (
          <div key={r.label} className="bg-[#F4E2D0] rounded-lg px-3 py-1.5 text-xs text-[#D57B0E] font-medium">
            {r.label} · {r.desc}
          </div>
        ))}
        <div className="text-xs text-[var(--color-text-tertiary)]">
          Bonus: 3 hit = +20pts, 2 = +12pts, 1 = +5pts, 0 = +0pts
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => {
            const row = rows.find((r) => r.agent_id === agent.id);
            const currentRanges = localRanges[agent.id] ?? row?.ranges_hit ?? 0;
            const score = CONSISTENCY_TIERS[currentRanges as keyof typeof CONSISTENCY_TIERS] ?? 0;
            const isSavingThis = saving === agent.id;

            return (
              <div key={agent.id} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-40">
                  <p className="font-medium text-[var(--color-text-primary)]">{agentName(agent)}</p>
                  {row?.evaluator && (
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">by {row.evaluator}</p>
                  )}
                </div>

                {/* Ranges hit picker */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--color-text-secondary)]">Ranges hit:</span>
                  <RangeHitPicker
                    value={currentRanges}
                    onChange={(v) => setLocalRanges((prev) => ({ ...prev, [agent.id]: v }))}
                    disabled={!canManage}
                  />
                </div>

                {/* Score */}
                <div className="flex items-center gap-2">
                  {scorePill(score)}
                </div>

                {/* Evaluator + save */}
                {canManage && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Evaluator"
                      value={localEvaluators[agent.id] ?? ""}
                      onChange={(e) => setLocalEvaluators((prev) => ({ ...prev, [agent.id]: e.target.value }))}
                      className="border border-[var(--color-border-primary)] rounded-lg px-2 py-1.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#3A5635]"
                    />
                    <button
                      onClick={() => handleSave(agent.id)}
                      disabled={isSavingThis}
                      className="text-xs bg-[#3A5635] text-white px-3 py-1.5 rounded-lg hover:bg-[#2e4429] disabled:opacity-50"
                    >
                      {isSavingThis ? "..." : "Save"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
