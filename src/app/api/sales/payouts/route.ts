import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import {
  computeMonthlyFps,
  computeMtdConfirmedRegular,
  computeGateStatus,
  computeMonthlyFpsWithConsistency,
  computeTotalPayout,
  computeDailyFps,
} from "@/lib/sales/scoring";
import type { DailyVolume, QaLog } from "@/lib/sales/types";

// GET /api/sales/payouts?month=YYYY-MM&agent_id=...
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const agentId = searchParams.get("agent_id");

  let query = supabase
    .from("sales_incentive_payouts")
    .select("*")
    .order("month", { ascending: false });

  if (month) query = query.eq("month", month);
  if (agentId) query = query.eq("agent_id", agentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST /api/sales/payouts/compute — manager+ only
// Computes and saves (or updates) the payout for a given agent/month
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    agent_id, month,
    paid_pairs, abandoned_pairs, onhand_pairs, total_delivered,
    notes,
  } = body;

  const dateFrom = `${month}-01`;
  const dateTo = `${month}-31`;

  // Fetch data needed for computation
  const [volRes, qaRes, consRes] = await Promise.all([
    supabase.from("sales_daily_volume").select("*").eq("agent_id", agent_id).gte("date", dateFrom).lte("date", dateTo),
    supabase.from("sales_qa_log").select("*").eq("agent_id", agent_id).gte("qa_date", dateFrom).lte("qa_date", dateTo),
    supabase.from("sales_consistency").select("*").eq("agent_id", agent_id).eq("month", month).maybeSingle(),
  ]);

  const volumes = (volRes.data ?? []) as DailyVolume[];
  const qaLogs = (qaRes.data ?? []) as QaLog[];
  const consistencyScore = consRes.data?.consistency_score ?? 0;

  // Compute FPS
  const dates = [...new Set([
    ...volumes.map((v) => v.date),
    ...qaLogs.map((q) => q.qa_date),
  ])].sort();

  const dailyRows = dates.map((date) => {
    const vol = volumes.find((v) => v.date === date) ?? null;
    const qa = qaLogs.find((q) => q.qa_date === date) ?? null;
    return computeDailyFps(vol, qa);
  });

  const { avg, scoredDays } = computeMonthlyFps(dailyRows);
  const mtdCr = computeMtdConfirmedRegular(volumes);
  const gate = computeGateStatus(mtdCr);
  const { monthlyFps, bracket } = computeMonthlyFpsWithConsistency(avg, consistencyScore);

  // Compute payout
  const payoutResult = computeTotalPayout(
    gate.passed,
    monthlyFps,
    bracket,
    paid_pairs ?? 0,
    abandoned_pairs ?? 0,
    onhand_pairs ?? 0,
    total_delivered ?? 0
  );

  const record = {
    agent_id,
    month,
    gate_passed: gate.passed,
    mtd_confirmed_regular: mtdCr,
    gate_threshold: 180,
    avg_fps: avg,
    scored_days: scoredDays,
    consistency_score: consistencyScore,
    final_fps: monthlyFps,
    payout_tier: bracket,
    paid_pairs: paid_pairs ?? 0,
    abandoned_pairs: abandoned_pairs ?? 0,
    onhand_pairs: onhand_pairs ?? 0,
    total_delivered: total_delivered ?? 0,
    main_tier_payout: payoutResult.mainTier.amount,
    abandoned_payout: payoutResult.abandoned.amount,
    onhand_payout: payoutResult.onhand.amount,
    total_payout: payoutResult.total,
    status: "draft" as const,
    notes: notes ?? null,
  };

  const { data, error } = await supabase
    .from("sales_incentive_payouts")
    .upsert(record, { onConflict: "agent_id,month" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ...data,
    _computed: payoutResult,
  }, { status: 201 });
}

// PATCH /api/sales/payouts?id=... — manager+ only (approve/paid/dispute)
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json();

  if (body.status === "approved") {
    body.approved_by = currentUser.id;
    body.approved_at = new Date().toISOString();
  }
  if (body.status === "paid") {
    body.paid_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("sales_incentive_payouts")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/sales/payouts?id=... — OPS only
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("sales_incentive_payouts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
