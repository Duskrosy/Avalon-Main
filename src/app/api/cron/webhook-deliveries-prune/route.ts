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

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
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
    console.error("[webhook-deliveries-prune] Delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: count ?? 0 });
}
