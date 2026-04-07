import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchShopifyOrders,
  extractAgentHandle,
  buildOrderRow,
} from "@/lib/shopify/client";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

// ─── POST /api/sales/shopify-sync ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Dual auth: Vercel cron bearer token OR an OPS user session
  const fromCron = isCronRequest(req);
  if (!fromCron) {
    const supabase = await createClient();
    const currentUser = await getCurrentUser(supabase);
    if (!currentUser || !isOps(currentUser)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const triggeredBy = fromCron ? "cron" : "manual";
  const admin = createAdminClient();

  // Default: 25-hour window (overlapping handles midnight edge cases)
  // Optional body: { date: "YYYY-MM-DD" } to backfill a specific date
  let createdAtMin: string;
  let syncDate: string;

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.date && typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      // Manual backfill: pull orders created on that calendar date
      createdAtMin = `${body.date}T00:00:00+08:00`;
      syncDate = body.date;
    } else {
      // Default: last 25 hours
      const windowStart = new Date(Date.now() - 25 * 60 * 60 * 1000);
      createdAtMin = windowStart.toISOString();
      syncDate = new Date().toISOString().slice(0, 10);
    }
  } catch {
    const windowStart = new Date(Date.now() - 25 * 60 * 60 * 1000);
    createdAtMin = windowStart.toISOString();
    syncDate = new Date().toISOString().slice(0, 10);
  }

  // ── 1. Create sync run record ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: syncRun, error: syncRunError } = await (admin as any)
    .from("shopify_sync_runs")
    .insert({ status: "running", triggered_by: triggeredBy, sync_date: syncDate })
    .select("id")
    .single();

  if (syncRunError || !syncRun) {
    return NextResponse.json({ error: "Failed to create sync run" }, { status: 500 });
  }
  const syncRunId = syncRun.id;

  try {
    // ── 2. Fetch orders from Shopify ────────────────────────────────────────
    const orders = await fetchShopifyOrders({ createdAtMin, status: "any" });

    if (orders.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from("shopify_sync_runs")
        .update({ status: "success", orders_synced: 0, orders_new: 0, orders_updated: 0, completed_at: new Date().toISOString() })
        .eq("id", syncRunId);
      return NextResponse.json({ synced: 0, new: 0, updated: 0, errors: [] });
    }

    // ── 3. Resolve agent handles → profile IDs (batch, one IN query) ────────
    const handles = [...new Set(
      orders.map((o) => extractAgentHandle(o)).filter(Boolean) as string[]
    )];

    const handleToId: Record<string, string> = {};
    if (handles.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, first_name")
        .in("first_name", handles.map((h) => {
          // Capitalise first letter to match DB format (e.g. "john" → "John")
          return h.charAt(0).toUpperCase() + h.slice(1);
        }));

      for (const p of profiles ?? []) {
        if (p.first_name) {
          handleToId[p.first_name.toLowerCase()] = p.id;
        }
      }
    }

    // ── 4. Build upsert rows ─────────────────────────────────────────────────
    const rows = orders.map((order) => {
      const handle = extractAgentHandle(order);
      const agentId = handle ? (handleToId[handle] ?? null) : null;
      return buildOrderRow(order, agentId);
    });

    // ── 5. Upsert into shopify_orders ────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertError } = await (admin as any)
      .from("shopify_orders")
      .upsert(rows, { onConflict: "shopify_order_id" });

    if (upsertError) throw new Error(`Upsert failed: ${upsertError.message}`);

    // ── 6. Finalize sync run ─────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from("shopify_sync_runs")
      .update({
        status: "success",
        orders_synced: orders.length,
        orders_new: orders.length,
        orders_updated: 0,
        completed_at: new Date().toISOString(),
      })
      .eq("id", syncRunId);

    return NextResponse.json({
      synced: orders.length,
      new: orders.length,
      updated: 0,
      errors: [],
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from("shopify_sync_runs")
      .update({ status: "failed", error_log: message, completed_at: new Date().toISOString() })
      .eq("id", syncRunId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
