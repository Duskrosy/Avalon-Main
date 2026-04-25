import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { runConfirmFlow } from "@/lib/sales/confirm-flow";

// ─── POST /api/internal/sales/sync-reconciler ───────────────────────────────
//
// Sweeps stuck syncing rows. Runs every 5 minutes via Vercel Cron (vercel.json).
// Dual auth: Vercel cron bearer token OR an OPS user session for manual debug.
//
// For each `orders` row where sync_status='syncing' AND updated_at < now()-5min,
// runConfirmFlow with isRetry=true. The idempotency guard inside runConfirmFlow
// prevents duplicate Shopify orders if the original POST actually succeeded.

const STUCK_AGE_MS = 5 * 60 * 1000;

function isCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function POST(req: NextRequest) {
  const fromCron = isCronRequest(req);
  if (!fromCron) {
    const supabase = await createClient();
    const currentUser = await getCurrentUser(supabase);
    if (!currentUser || !isOps(currentUser)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STUCK_AGE_MS).toISOString();

  // The partial index idx_orders_syncing makes this query cheap regardless
  // of total table size.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stuck, error } = await (admin as any)
    .from("orders")
    .select("id, avalon_order_number, updated_at")
    .eq("sync_status", "syncing")
    .lt("updated_at", cutoff)
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];
  for (const order of stuck ?? []) {
    try {
      const result = await runConfirmFlow(admin, order.id, {
        isRetry: true,
        agentHandle: "reconciler",
      });
      results.push({
        order_id: order.id,
        avalon_order_number: order.avalon_order_number,
        ok: result.ok,
        recovered: "recovered" in result ? result.recovered : false,
        pending: "pending" in result ? result.pending : false,
        error: !result.ok ? result.error : null,
      });
    } catch (err) {
      results.push({
        order_id: order.id,
        avalon_order_number: order.avalon_order_number,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    swept: stuck?.length ?? 0,
    results,
    cutoff_iso: cutoff,
    via: fromCron ? "cron" : "manual",
  });
}
