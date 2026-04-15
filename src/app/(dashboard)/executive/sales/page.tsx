import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { format } from "date-fns";

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₱${(n / 1_000).toFixed(1)}K`;
  return `₱${n.toFixed(0)}`;
}

export default async function ExecutiveSalesPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const thisMonthStart = `${today.slice(0, 7)}-01`;
  const lastMonthStart = (() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const lastMonthEnd = (() => {
    const d = new Date(); d.setDate(0);
    return d.toISOString().slice(0, 10);
  })();

  const [
    { data: volumeRows },
    { data: confirmedThisMonth },
    { data: confirmedLastMonth },
    { data: qaRows },
    { data: consistencyRows },
  ] = await Promise.all([
    // 14 days of volume (7d + prior 7d for comparison)
    admin.from("sales_daily_volume")
      .select("date, agent_id, confirmed_regular, confirmed_total, confirmed_abandoned, on_leave, profiles(first_name, last_name)")
      .gte("date", fourteenDaysAgo)
      .order("date", { ascending: true }),

    // Confirmed sales this month
    admin.from("sales_confirmed_sales")
      .select("confirmed_date, net_value, quantity, sale_type, agent_id")
      .gte("confirmed_date", thisMonthStart)
      .eq("status", "confirmed")
      .order("confirmed_date", { ascending: false }),

    // Confirmed sales last month (for comparison)
    admin.from("sales_confirmed_sales")
      .select("net_value, quantity")
      .gte("confirmed_date", lastMonthStart)
      .lte("confirmed_date", lastMonthEnd)
      .eq("status", "confirmed"),

    // Recent QA logs
    admin.from("sales_qa_log")
      .select("score, evaluated_at, agent_id, profiles(first_name, last_name)")
      .gte("evaluated_at", sevenDaysAgo)
      .order("evaluated_at", { ascending: false })
      .limit(20),

    // Consistency this month
    admin.from("sales_consistency")
      .select("agent_id, consistent_days, total_days, profiles(first_name, last_name)")
      .gte("period_start", thisMonthStart)
      .order("consistent_days", { ascending: false })
      .limit(20),
  ]);

  // ── Process volume data ───────────────────────────────────────────────────

  // Daily totals for last 7 days
  const last7Days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    last7Days.push(d.toISOString().slice(0, 10));
  }

  const dailyTotals = last7Days.map((date) => {
    const rows = (volumeRows ?? []).filter((r) => r.date === date);
    return {
      date,
      label: format(new Date(date + "T00:00:00"), "EEE d"),
      total: rows.reduce((s, r) => s + (r.confirmed_regular ?? 0), 0),
      agents: rows.length,
    };
  });
  const maxDayTotal = Math.max(1, ...dailyTotals.map((d) => d.total));

  // Agent totals for last 7 days
  const agentMap: Record<string, { name: string; pairs: number; days: number }> = {};
  for (const row of (volumeRows ?? []).filter((r) => r.date >= sevenDaysAgo)) {
    const id = row.agent_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = row.profiles as any;
    const name = p ? `${p.first_name} ${p.last_name}` : id;
    if (!agentMap[id]) agentMap[id] = { name, pairs: 0, days: 0 };
    agentMap[id].pairs += row.confirmed_regular ?? 0;
    if (!row.on_leave && (row.confirmed_regular ?? 0) > 0) agentMap[id].days++;
  }
  const agentRanking = Object.values(agentMap).sort((a, b) => b.pairs - a.pairs);
  const maxAgentPairs = Math.max(1, ...agentRanking.map((a) => a.pairs));

  // Revenue comparison
  const revenueThisMonth = (confirmedThisMonth ?? []).reduce((s, r) => s + Number(r.net_value), 0);
  const revenueLastMonth = (confirmedLastMonth ?? []).reduce((s, r) => s + Number(r.net_value), 0);
  const revGrowth = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100 : 0;

  const salesCountThis = (confirmedThisMonth ?? []).reduce((s, r) => s + (r.quantity ?? 1), 0);
  const salesCountLast = (confirmedLastMonth ?? []).reduce((s, r) => s + (r.quantity ?? 1), 0);

  // Today total
  const todayTotal = (volumeRows ?? []).filter((r) => r.date === today).reduce((s, r) => s + (r.confirmed_regular ?? 0), 0);
  const weekTotal  = dailyTotals.reduce((s, d) => s + d.total, 0);

  // QA average
  const qaAvg = (qaRows ?? []).length > 0
    ? (qaRows ?? []).reduce((s, r) => s + (r.score ?? 0), 0) / (qaRows ?? []).length
    : null;

  return (
    <div className="space-y-6">

      {/* ── Summary cards ──────────────────────────────────────────────── */}
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
            sub: `from ${(qaRows ?? []).length} evaluations`,
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

      {/* ── 7-day bar chart ─────────────────────────────────────────────── */}
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

      {/* ── Agent leaderboard ────────────────────────────────────────────── */}
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

      {/* ── Recent confirmed sales ───────────────────────────────────────── */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border-secondary)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Recent confirmed orders · this month</h2>
          <span className="text-xs text-[var(--color-text-tertiary)]">{salesCountThis} total</span>
        </div>
        {(confirmedThisMonth ?? []).length === 0 ? (
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
                {(confirmedThisMonth ?? []).slice(0, 10).map((s) => (
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

      {/* ── Consistency ─────────────────────────────────────────────────── */}
      {(consistencyRows ?? []).length > 0 && (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Consistency · this month</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Consecutive days hitting target</p>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {(consistencyRows ?? []).slice(0, 8).map((r) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const p = r.profiles as any;
              const name = p ? `${p.first_name} ${p.last_name}` : r.agent_id;
              const pct = r.total_days > 0 ? Math.round((r.consistent_days / r.total_days) * 100) : 0;
              const accent = pct >= 80 ? "border-green-200 bg-[var(--color-success-light)]" : pct >= 60 ? "border-[var(--color-border-primary)] bg-[var(--color-warning-light)]" : "border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]";
              const valColor = pct >= 80 ? "text-[var(--color-success)]" : pct >= 60 ? "text-[var(--color-warning-text)]" : "text-[var(--color-text-primary)]";
              return (
                <div key={r.agent_id} className={`rounded-[var(--radius-lg)] border p-3 ${accent}`}>
                  <p className="text-xs text-[var(--color-text-secondary)] truncate mb-1">{name}</p>
                  <p className={`text-2xl font-bold ${valColor}`}>{pct}%</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">{r.consistent_days}/{r.total_days} days</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
