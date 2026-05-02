// src/app/api/customer-service/admin/edit-plan-coverage/route.ts
//
// GET /api/customer-service/admin/edit-plan-coverage
//   ?days=14   (rolling window length; defaults to 14)
//
// Returns the Phase B-Lite ledger coverage metric: how many CS-driven order
// edits in the rolling window were captured by the Avalon ledger via the
// auto-write path vs how many were logged after a manual Shopify-admin edit.
//
// Numerator/denominator definitions live in src/lib/cs/edit-plan/coverage.ts.
//
// Admin-gated: roles.tier <= 2 (manager, ops_admin, super_admin).

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import {
  computeLedgerCoverage,
  rollingWindowSince,
} from "@/lib/cs/edit-plan/coverage";

const MIN_DAYS = 1;
const MAX_DAYS = 90;

export async function GET(req: NextRequest) {
  // 1. Auth — must be a manager or above to read coverage stats.
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAbove(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Parse the optional `days` query param. Default 14, clamped to [1, 90].
  const daysParam = req.nextUrl.searchParams.get("days");
  let days = 14;
  if (daysParam !== null) {
    const parsed = Number(daysParam);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return NextResponse.json(
        { error: "Invalid days parameter" },
        { status: 400 },
      );
    }
    if (parsed < MIN_DAYS || parsed > MAX_DAYS) {
      return NextResponse.json(
        { error: `days must be between ${MIN_DAYS} and ${MAX_DAYS}` },
        { status: 400 },
      );
    }
    days = parsed;
  }

  // 3. Compute and return.
  const since = rollingWindowSince(days);
  const admin = createAdminClient();
  try {
    const metric = await computeLedgerCoverage(admin, { since });
    return NextResponse.json({
      ...metric,
      days,
      threshold_target: 0.8,
      meets_target: metric.coverage_ratio >= 0.8,
    });
  } catch (err) {
    console.error("[edit-plan-coverage] compute failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to compute coverage" },
      { status: 500 },
    );
  }
}
