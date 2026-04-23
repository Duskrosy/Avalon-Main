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

  // Window resolution — three modes:
  //   • explicit { date: "YYYY-MM-DD" }     → that calendar day (PH time)
  //   • explicit { from, to } date range    → from..to inclusive (PH time)
  //   • default (cron/manual without body)  → self-healing: start from
  //     max(created_at_shopify) minus a 6h overlap buffer, capped at 30 days.
  //     If the table is empty, fall back to a 25h window.
  let createdAtMin: string;
  let createdAtMax: string | undefined;
  let syncDate: string;

  const body = await req.json().catch(() => ({}));
  const isYmd = (s: unknown): s is string =>
    typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

  if (isYmd(body?.date)) {
    const start = `${body.date}T00:00:00+08:00`;
    const end   = `${body.date}T23:59:59+08:00`;
    createdAtMin = start;
    createdAtMax = end;
    syncDate = body.date;
  } else if (isYmd(body?.from) && isYmd(body?.to)) {
    createdAtMin = `${body.from}T00:00:00+08:00`;
    createdAtMax = `${body.to}T23:59:59+08:00`;
    syncDate = body.from;
  } else {
    // Self-healing: pick up where we left off
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: latest } = await (admin as any)
      .from("shopify_orders")
      .select("created_at_shopify")
      .order("created_at_shopify", { ascending: false })
      .limit(1)
      .maybeSingle();

    const MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;  // cap so a first run doesn't pull the whole store
    const OVERLAP_MS      = 6  * 60 * 60 * 1000;       // re-pull last 6h to catch updates + clock drift

    if (latest?.created_at_shopify) {
      const lastOrder = new Date(latest.created_at_shopify);
      const overlapStart = new Date(lastOrder.getTime() - OVERLAP_MS);
      const floor = new Date(Date.now() - MAX_LOOKBACK_MS);
      createdAtMin = (overlapStart < floor ? floor : overlapStart).toISOString();
    } else {
      createdAtMin = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    }
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
    const orders = await fetchShopifyOrders({ createdAtMin, createdAtMax, status: "any" });

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
