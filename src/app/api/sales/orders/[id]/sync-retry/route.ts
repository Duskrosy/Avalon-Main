import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { runConfirmFlow } from "@/lib/sales/confirm-flow";

type RouteContext = { params: Promise<{ id: string }> };

// ─── POST /api/sales/orders/[id]/sync-retry ──────────────────────────────────
//
// Retry a failed/stuck Shopify sync. Uses runConfirmFlow with isRetry=true,
// which runs the idempotency guard:
//   1. Check order_shopify_syncs for a 'succeeded' attempt → recover
//   2. Else: fetchShopifyOrderByNoteAttribute with avalon_order_number → recover
//   3. Else: register a fresh attempt and POST

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order } = await (admin as any)
    .from("orders")
    .select("id, status, sync_status, created_by_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    order.created_by_user_id !== currentUser.id &&
    !isManagerOrAbove(currentUser)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (order.status === "draft") {
    return NextResponse.json(
      { error: "Order is still a draft. Use /confirm first." },
      { status: 409 },
    );
  }
  if (order.sync_status === "synced") {
    return NextResponse.json({ ok: true, pending: false, message: "Already synced." });
  }

  const agentHandle =
    `${currentUser.first_name}-${currentUser.last_name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const result = await runConfirmFlow(admin, id, {
    isRetry: true,
    agentHandle,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, stage: result.stage, error: result.error },
      { status: 502 },
    );
  }
  if (result.pending) {
    return NextResponse.json(
      {
        ok: true,
        pending: true,
        avalon_order_number: result.avalonOrderNumber,
        attempt_number: result.attemptNumber,
      },
      { status: 202 },
    );
  }
  return NextResponse.json({
    ok: true,
    pending: false,
    shopify_order_id: result.shopifyOrderId,
    avalon_order_number: result.avalonOrderNumber,
    attempt_number: result.attemptNumber,
    recovered: result.recovered,
  });
}
