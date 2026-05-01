// src/app/api/customer-service/admin/quarantine/[id]/resolve/route.ts
//
// POST /api/customer-service/admin/quarantine/:id/resolve
// Body: { lane: 'sales' | 'shopify_admin' | 'conversion' }
//
// Resolves a quarantine review row by assigning a final intake_lane.
// Admin-gated: roles.tier <= 2.
//
// Write order (intentional):
//   1. UPDATE orders.intake_lane — source of truth column. If this
//      fails, nothing else happens.
//   2. UPDATE cs_intake_quarantine_review — marks the review resolved.
//      If this fails, orders is already correct; the review row is
//      stale and can be retried idempotently (resolved_at IS NULL
//      still returns in pending list).

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

const VALID_LANES = ["sales", "shopify_admin", "conversion"] as const;
type ValidLane = (typeof VALID_LANES)[number];

function isValidLane(v: unknown): v is ValidLane {
  return VALID_LANES.includes(v as ValidLane);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Param
  const { id } = await params;
  const reviewId = parseInt(id, 10);
  if (isNaN(reviewId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // Body
  let body: { lane?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidLane(body.lane)) {
    return NextResponse.json(
      {
        error: `lane must be one of: ${VALID_LANES.join(", ")}`,
      },
      { status: 400 },
    );
  }
  const lane = body.lane;

  const admin = createAdminClient();

  // Fetch the quarantine row to get order_id (and confirm it exists).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reviewRow, error: fetchError } = await (admin as any)
    .from("cs_intake_quarantine_review")
    .select("id, order_id, resolved_at")
    .eq("id", reviewId)
    .single();

  if (fetchError || !reviewRow) {
    return NextResponse.json({ error: "Quarantine row not found" }, { status: 404 });
  }

  const orderId = reviewRow.order_id as number;

  // Step 1: Update orders.intake_lane (source of truth).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: orderError } = await (admin as any)
    .from("orders")
    .update({ intake_lane: lane })
    .eq("id", orderId);

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  // Step 2: Mark the review row resolved.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: reviewError } = await (admin as any)
    .from("cs_intake_quarantine_review")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_lane: lane,
      resolved_by: user.id,
    })
    .eq("id", reviewId)
    .select()
    .single();

  if (reviewError) {
    // orders row is already updated — log and surface partial success.
    console.error(
      "[quarantine/resolve] orders updated but review row update failed:",
      reviewError.message,
    );
    return NextResponse.json({ error: reviewError.message }, { status: 500 });
  }

  return NextResponse.json({ row: updated });
}
