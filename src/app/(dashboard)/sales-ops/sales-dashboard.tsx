"use client";

import Link from "next/link";

type Agent = { id: string; first_name: string; last_name: string; email: string };
type VolumeRow = {
  agent_id: string;
  confirmed_regular: number;
  confirmed_total: number;
  follow_ups: number;
  on_leave: boolean;
  date: string;
};
type Payout = {
  agent_id: string;
  total_payout: number;
  gate_passed: boolean;
  final_fps: number | null;
  payout_tier: string | null;
  status: string;
};

type Props = {
  agents: Agent[];
  volumeRows: VolumeRow[];
  payouts: Payout[];
  canManage: boolean;
  currentMonth: string;
};

function agentName(a: Agent) {
  return `${a.first_name} ${a.last_name}`;
}

const MODULES = [
  { href: "/sales-ops/daily-volume", label: "Daily Volume", desc: "Log follow-ups, confirmed, abandoned" },
  { href: "/sales-agent/confirmed-sales", label: "Confirmed Sales", desc: "Individual sale records" },
  { href: "/sales-ops/qa-log", label: "QA Log", desc: "Message quality assessments" },
  { href: "/sales-ops/fps-daily", label: "FPS Daily Score", desc: "Computed performance score per day" },
  { href: "/sales-ops/downtime-log", label: "Downtime Log", desc: "System, internet, tool interruptions" },
  { href: "/sales-ops/consistency", label: "Consistency Tracker", desc: "Monthly range review" },
  { href: "/sales-ops/incentive-payouts", label: "Incentive Payouts", desc: "Compute & approve monthly payouts" },
];

function bracketColor(bracket: string | null) {
  if (bracket === "Elite") return "text-[var(--color-success)]";
  if (bracket === "Strong") return "text-[var(--color-accent)]";
  if (bracket === "Pass") return "text-[#D57B0E]";
  return "text-[var(--color-error)]";
}

export function SalesDashboard({ agents, volumeRows, payouts, canManage, currentMonth }: Props) {
  // Aggregate per agent
  const agentStats = agents.map((agent) => {
    const myVol = volumeRows.filter((v) => v.agent_id === agent.id);
    const mtdCr = myVol.reduce((s, v) => s + (v.confirmed_regular ?? 0), 0);
    const mtdFollowUps = myVol.reduce((s, v) => s + v.follow_ups, 0);
    const payout = payouts.find((p) => p.agent_id === agent.id);
    const gatePassed = payout?.gate_passed ?? (mtdCr >= 180);
    const gateRemaining = Math.max(0, 180 - mtdCr);

    return {
      agent,
      mtdCr,
      mtdFollowUps,
      payout,
      gatePassed,
      gateRemaining,
    };
  });

  const gatePassedCount = agentStats.filter((s) => s.gatePassed).length;
  const totalCr = agentStats.reduce((s, a) => s + a.mtdCr, 0);
  const totalPayout = payouts.reduce((s, p) => s + p.total_payout, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Sales Operations</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">{currentMonth} · {agents.length} agents</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Team MTD CR</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{totalCr.toLocaleString()}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">confirmed regular</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Gate Passed</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{gatePassedCount} / {agents.length}</p>
          <div className="mt-1.5 h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#3A5635] rounded-full"
              style={{ width: agents.length > 0 ? `${(gatePassedCount / agents.length) * 100}%` : "0%" }}
            />
          </div>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Payouts Computed</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{payouts.length} / {agents.length}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">this month</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Total Payout</p>
          <p className="text-2xl font-bold text-[#3A5635]">₱{totalPayout.toLocaleString()}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">incl. all tiers</p>
        </div>
      </div>

      {/* Per-agent overview */}
      {agents.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Agent Overview</h2>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
            <table className="min-w-full divide-y divide-[var(--color-border-secondary)] text-sm">
              <thead className="bg-[var(--color-bg-secondary)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Agent</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">MTD CR</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Follow-ups</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Gate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">FPS Bracket</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Payout</th>
                </tr>
              </thead>
              <tbody className="bg-[var(--color-bg-primary)] divide-y divide-[var(--color-border-secondary)]">
                {agentStats.map(({ agent, mtdCr, mtdFollowUps, payout, gatePassed, gateRemaining }) => (
                  <tr key={agent.id} className="hover:bg-[var(--color-surface-hover)]">
                    <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">{agentName(agent)}</td>
                    <td className="px-4 py-3 text-right text-[var(--color-text-primary)] font-semibold">{mtdCr}</td>
                    <td className="px-4 py-3 text-right text-[var(--color-text-secondary)]">{mtdFollowUps.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {gatePassed ? (
                        <span className="text-xs bg-[var(--color-success-light)] text-[var(--color-success)] px-2 py-0.5 rounded-full">Passed</span>
                      ) : (
                        <span className="text-xs bg-[var(--color-warning-light)] text-[var(--color-warning)] px-2 py-0.5 rounded-full">{gateRemaining} to go</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {payout?.final_fps !== undefined && payout.final_fps !== null ? (
                        <span className={`text-sm font-semibold ${bracketColor(payout.payout_tier)}`}>
                          {payout.final_fps.toFixed(1)} · {payout.payout_tier}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--color-text-tertiary)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {payout ? (
                        <span className="font-semibold text-[var(--color-text-primary)]">₱{payout.total_payout.toLocaleString()}</span>
                      ) : (
                        <span className="text-xs text-[var(--color-text-tertiary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Module links */}
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Modules</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {MODULES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4 hover:border-[#3A5635] hover:shadow-[var(--shadow-sm)] transition-all group"
          >
            <p className="font-medium text-[var(--color-text-primary)] group-hover:text-[#3A5635]">{m.label}</p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{m.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
