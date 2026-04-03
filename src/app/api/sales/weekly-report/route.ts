import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import {
  computeDailyFps,
  computeMonthlyFps,
  computeMtdConfirmedRegular,
} from "@/lib/sales/scoring";
import type { DailyVolume, QaLog } from "@/lib/sales/types";

// GET /api/sales/weekly-report?agent_id=&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!agentId || !from || !to) {
    return NextResponse.json({ error: "agent_id, from, and to are required" }, { status: 400 });
  }

  const [volRes, qaRes] = await Promise.all([
    supabase
      .from("sales_daily_volume")
      .select("*")
      .eq("agent_id", agentId)
      .gte("date", from)
      .lte("date", to)
      .order("date"),
    supabase
      .from("sales_qa_log")
      .select("*")
      .eq("agent_id", agentId)
      .gte("qa_date", from)
      .lte("qa_date", to)
      .order("qa_date"),
  ]);

  const volumes = (volRes.data ?? []) as DailyVolume[];
  const qaLogs = (qaRes.data ?? []) as QaLog[];

  // Build full date range (Mon–Sun), filling gaps
  const start = new Date(from);
  const end = new Date(to);
  const dates: string[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }

  const daily = dates.map((date) => {
    const vol = volumes.find((v) => v.date === date) ?? null;
    const qa = qaLogs.find((q) => q.qa_date === date) ?? null;
    const fps = computeDailyFps(vol, qa);

    return {
      ...fps,
      // Augment with raw volume fields for display
      followUps: vol?.follow_ups ?? 0,
      confirmedTotal: vol?.confirmed_total ?? 0,
      confirmedAbandoned: vol?.confirmed_abandoned ?? 0,
      confirmedRegular: vol
        ? Math.max(0, (vol.confirmed_total ?? 0) - (vol.confirmed_abandoned ?? 0))
        : 0,
      bufferApproved: vol?.buffer_approved ?? false,
    };
  });

  const { avg, scoredDays } = computeMonthlyFps(daily);
  const weekCr = computeMtdConfirmedRegular(volumes);

  const qaSummary = qaLogs.reduce<Record<string, number>>((acc, q) => {
    acc[q.qa_tier] = (acc[q.qa_tier] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    agent_id: agentId,
    from,
    to,
    daily,
    avg_fps: avg,
    scored_days: scoredDays,
    week_cr: weekCr,
    total_follow_ups: volumes.reduce((s, v) => s + (v.follow_ups ?? 0), 0),
    qa_summary: qaSummary,
    qa_count: qaLogs.length,
  });
}
