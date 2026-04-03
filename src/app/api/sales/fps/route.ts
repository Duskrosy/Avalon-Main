import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import {
  computeDailyFps,
  computeMonthlyFps,
  computeMtdConfirmedRegular,
  computeGateStatus,
  computeMonthlyFpsWithConsistency,
} from "@/lib/sales/scoring";
import type { DailyVolume, QaLog } from "@/lib/sales/types";

// GET /api/sales/fps?month=YYYY-MM&agent_id=...
// Returns computed FPS rows + monthly aggregate for one or all agents
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const agentId = searchParams.get("agent_id");

  if (!month) return NextResponse.json({ error: "month is required" }, { status: 400 });

  const dateFrom = `${month}-01`;
  const dateTo = `${month}-31`;

  // Fetch volume + qa in parallel
  const [volRes, qaRes, consRes] = await Promise.all([
    (() => {
      let q = supabase
        .from("sales_daily_volume")
        .select("*")
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date");
      if (agentId) q = q.eq("agent_id", agentId);
      return q;
    })(),
    (() => {
      let q = supabase
        .from("sales_qa_log")
        .select("*")
        .gte("qa_date", dateFrom)
        .lte("qa_date", dateTo);
      if (agentId) q = q.eq("agent_id", agentId);
      return q;
    })(),
    (() => {
      let q = supabase
        .from("sales_consistency")
        .select("*")
        .eq("month", month);
      if (agentId) q = q.eq("agent_id", agentId);
      return q;
    })(),
  ]);

  const volumes = (volRes.data ?? []) as DailyVolume[];
  const qaLogs = (qaRes.data ?? []) as QaLog[];
  const consistency = consRes.data ?? [];

  // Group by agent
  const agentIds = [...new Set([
    ...volumes.map((v) => v.agent_id),
    ...qaLogs.map((q) => q.agent_id),
  ])];

  const results = agentIds.map((aid) => {
    const agentVols = volumes.filter((v) => v.agent_id === aid);
    const agentQa = qaLogs.filter((q) => q.agent_id === aid);
    const agentCons = consistency.find((c) => c.agent_id === aid);

    // Build date set
    const dates = [...new Set([
      ...agentVols.map((v) => v.date),
      ...agentQa.map((q) => q.qa_date),
    ])].sort();

    const dailyRows = dates.map((date) => {
      const vol = agentVols.find((v) => v.date === date) ?? null;
      const qa = agentQa.find((q) => q.qa_date === date) ?? null;
      return computeDailyFps(vol, qa);
    });

    const { avg, scoredDays, totalFps } = computeMonthlyFps(dailyRows);
    const mtdCr = computeMtdConfirmedRegular(agentVols);
    const gate = computeGateStatus(mtdCr);
    const consistencyScore = agentCons?.consistency_score ?? 0;
    const { monthlyFps, bracket } = computeMonthlyFpsWithConsistency(avg, consistencyScore);

    return {
      agent_id: aid,
      month,
      daily: dailyRows,
      avg_fps: avg,
      scored_days: scoredDays,
      total_fps: totalFps,
      mtd_confirmed_regular: mtdCr,
      gate_passed: gate.passed,
      gate_remaining: gate.remaining,
      consistency_score: consistencyScore,
      monthly_fps: monthlyFps,
      bracket,
    };
  });

  // If single agent, unwrap
  if (agentId) {
    return NextResponse.json(results[0] ?? null);
  }

  return NextResponse.json(results);
}
