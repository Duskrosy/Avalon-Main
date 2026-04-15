"use client";

import { useState, useEffect, useCallback } from "react";

type Agent = { id: string; first_name: string; last_name: string };

type FpsResult = {
  agent_id: string;
  avg_fps: number;
  scored_days: number;
  mtd_confirmed_regular: number;
  gate_passed: boolean;
  gate_remaining: number;
  consistency_score: number;
  monthly_fps: number;
  bracket: string;
};

type Payout = {
  id: string;
  agent_id: string;
  status: string;
  main_payout: number;
  abandoned_payout: number;
  onhand_payout: number;
  total_payout: number;
};

const BRACKET_STYLES: Record<string, string> = {
  "Bronze":   "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]",
  "Silver":   "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  "Gold":     "bg-yellow-50 text-yellow-700",
  "Platinum": "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  "None":     "bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]",
};

const PAYOUT_STATUS_STYLES: Record<string, string> = {
  draft:    "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  approved: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  paid:     "bg-[var(--color-success-light)] text-[var(--color-success)]",
  disputed: "bg-[var(--color-error-light)] text-[var(--color-error)]",
};

function getDefaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function agentName(agents: Agent[], id: string): string {
  const a = agents.find((x) => x.id === id);
  return a ? `${a.first_name} ${a.last_name}` : id.slice(0, 8);
}

function fmtCurrency(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function MonthlySummaryView({ agents }: { agents: Agent[] }) {
  const [month, setMonth] = useState(getDefaultMonth);
  const [fpsResults, setFpsResults] = useState<FpsResult[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [fpsRes, payoutsRes] = await Promise.all([
      fetch(`/api/sales/fps?month=${month}`),
      fetch(`/api/sales/payouts?month=${month}`),
    ]);
    const [fps, pouts] = await Promise.all([
      fpsRes.ok ? fpsRes.json() : [],
      payoutsRes.ok ? payoutsRes.json() : [],
    ]);
    setFpsResults(Array.isArray(fps) ? fps : []);
    setPayouts(Array.isArray(pouts) ? pouts : []);
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Merge FPS + payouts, sorted by monthly FPS desc
  const rows = [...fpsResults]
    .sort((a, b) => b.monthly_fps - a.monthly_fps)
    .map((fps) => ({
      fps,
      payout: payouts.find((p) => p.agent_id === fps.agent_id) ?? null,
    }));

  // Agents with payouts but no FPS data (edge case)
  const payoutOnlyRows = payouts
    .filter((p) => !fpsResults.find((f) => f.agent_id === p.agent_id))
    .map((p) => ({ fps: null, payout: p }));

  const allRows = [...rows, ...payoutOnlyRows];

  // Aggregates
  const totalCr = fpsResults.reduce((s, f) => s + f.mtd_confirmed_regular, 0);
  const gatesPassed = fpsResults.filter((f) => f.gate_passed).length;
  const avgMonthlyFps = fpsResults.length > 0
    ? fpsResults.reduce((s, f) => s + f.monthly_fps, 0) / fpsResults.length
    : 0;
  const totalPayouts = payouts.reduce((s, p) => s + (p.total_payout ?? 0), 0);
  const paidPayouts = payouts.filter((p) => p.status === "paid").length;

  const displayMonth = (() => {
    const [y, m] = month.split("-");
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  })();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Monthly Summary</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{displayMonth} · {fpsResults.length} agents</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
      </div>

      {/* Aggregate summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Team CR</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{totalCr.toLocaleString()}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">confirmed regular</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Gates Passed</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{gatesPassed}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">of {fpsResults.length} agents</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Avg Monthly FPS</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{avgMonthlyFps > 0 ? avgMonthlyFps.toFixed(1) : "—"}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">team average</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Total Payouts</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtCurrency(totalPayouts)}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{paidPayouts} paid of {payouts.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
      ) : allRows.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No data for {displayMonth}.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--color-text-tertiary)] border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
                  <th className="px-4 py-3 text-left font-medium">Agent</th>
                  <th className="px-4 py-3 text-right font-medium">CR</th>
                  <th className="px-4 py-3 text-center font-medium">Gate</th>
                  <th className="px-4 py-3 text-right font-medium">Avg FPS</th>
                  <th className="px-4 py-3 text-right font-medium">Consistency</th>
                  <th className="px-4 py-3 text-right font-medium">Monthly FPS</th>
                  <th className="px-4 py-3 text-center font-medium">Bracket</th>
                  <th className="px-4 py-3 text-right font-medium">Main</th>
                  <th className="px-4 py-3 text-right font-medium">Abandoned</th>
                  <th className="px-4 py-3 text-right font-medium">On-hand</th>
                  <th className="px-4 py-3 text-right font-medium">Total Payout</th>
                  <th className="px-4 py-3 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-secondary)]">
                {allRows.map(({ fps, payout }) => {
                  const id = fps?.agent_id ?? payout?.agent_id ?? "";
                  return (
                    <tr key={id} className="hover:bg-[var(--color-surface-hover)]">
                      <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">
                        {agentName(agents, id)}
                      </td>

                      {/* FPS columns */}
                      <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">
                        {fps ? fps.mtd_confirmed_regular : <span className="text-[var(--color-text-tertiary)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {fps ? (
                          fps.gate_passed ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-success-light)] text-[var(--color-success)] font-medium">PASS</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-error-light)] text-[var(--color-error)] font-medium">
                              FAIL {fps.gate_remaining > 0 ? `(−${fps.gate_remaining})` : ""}
                            </span>
                          )
                        ) : <span className="text-[var(--color-text-tertiary)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-secondary)]">
                        {fps ? fps.avg_fps.toFixed(1) : <span className="text-[var(--color-text-tertiary)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-secondary)]">
                        {fps ? (fps.consistency_score > 0 ? `+${fps.consistency_score}` : "0") : <span className="text-[var(--color-text-tertiary)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--color-text-primary)]">
                        {fps ? fps.monthly_fps.toFixed(1) : <span className="text-[var(--color-text-tertiary)] font-normal">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {fps ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BRACKET_STYLES[fps.bracket] ?? "bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]"}`}>
                            {fps.bracket}
                          </span>
                        ) : <span className="text-[var(--color-text-tertiary)]">—</span>}
                      </td>

                      {/* Payout columns */}
                      <td className="px-4 py-3 text-right text-[var(--color-text-secondary)]">
                        {payout ? fmtCurrency(payout.main_payout) : <span className="text-[var(--color-text-tertiary)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-secondary)]">
                        {payout ? fmtCurrency(payout.abandoned_payout) : <span className="text-[var(--color-text-tertiary)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-secondary)]">
                        {payout ? fmtCurrency(payout.onhand_payout) : <span className="text-[var(--color-text-tertiary)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--color-text-primary)]">
                        {payout ? fmtCurrency(payout.total_payout) : <span className="text-[var(--color-text-tertiary)] font-normal">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {payout ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAYOUT_STATUS_STYLES[payout.status] ?? ""}`}>
                            {payout.status}
                          </span>
                        ) : <span className="text-[var(--color-text-tertiary)]">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {allRows.length > 1 && (
                <tfoot>
                  <tr className="border-t border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] font-semibold text-[var(--color-text-primary)] text-sm">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{totalCr.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center text-xs text-[var(--color-text-secondary)]">
                      {gatesPassed}/{fpsResults.length} passed
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-text-secondary)] font-normal">
                      {avgMonthlyFps > 0 ? avgMonthlyFps.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right">
                      {fmtCurrency(payouts.reduce((s, p) => s + (p.main_payout ?? 0), 0))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {fmtCurrency(payouts.reduce((s, p) => s + (p.abandoned_payout ?? 0), 0))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {fmtCurrency(payouts.reduce((s, p) => s + (p.onhand_payout ?? 0), 0))}
                    </td>
                    <td className="px-4 py-3 text-right">{fmtCurrency(totalPayouts)}</td>
                    <td className="px-4 py-3 text-center text-xs text-[var(--color-text-secondary)]">
                      {paidPayouts}/{payouts.length} paid
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
