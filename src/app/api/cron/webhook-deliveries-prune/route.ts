// src/app/api/cron/webhook-deliveries-prune/route.ts
//
// GET /api/cron/webhook-deliveries-prune  (Vercel Cron — schedule: "0 3 * * *")
//
// Daily prune of cs_webhook_deliveries rows older than 24 hours.
// The dedup table grows without bound otherwise; 24h retention is sufficient
// because Shopify's retry window is ~48h but any order the reconciler misses
// is caught by the hourly cron well within that window.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authCron } from "@/lib/auth/cron-auth";

function isCronRequest(req: NextRequest): boolean {
  return authCron(req);
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // DELETE rows older than 24 hours.
  // The idx_cs_webhook_deliveries_received_at index makes this cheap.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, count } = await (admin as any)
    .from("cs_webhook_deliveries")
    .delete({ count: "exact" })
    .lt("received_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (error) {
    console.error("[webhook-deliveries-prune] Delete failed", {
      code: error.code,
      message: error.message,
      hint: error.hint,
      details: error.details,
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ deleted: count ?? 0 });
}
