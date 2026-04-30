import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// ─── GET /api/sales/adjustments?bucket=cs|inventory|fulfillment&status=open|in_progress|resolved|cancelled&type=...&limit=... ─
//
// Queue endpoint shared by:
//   • /customer-service/order-adjustments  (bucket=cs)
//   • /operations/inventory-handoffs (bucket=inventory) — hits the orders queue,
//     not adjustments. Inventory/Fulfillment routing is per the design doc:
//     C — PIC label drives those queues, not adjustment rows. This endpoint
//     is for the CS-style ticketing workflow only.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const bucket = params.get("bucket") ?? "cs";
  const statusFilter = params.get("status"); // open | in_progress | resolved | cancelled | null=open+in_progress
  const typeFilter = params.get("type");
  const limit = Math.min(parseInt(params.get("limit") ?? "200", 10) || 200, 1000);

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (admin as any)
    .from("order_adjustments")
    .select(
      "id, order_id, adjustment_type, status, assigned_to_user_id, assigned_to_label, " +
        "request_text, structured_payload, created_by_user_id, created_by_name, " +
        "resolved_by_user_id, resolution_notes, created_at, updated_at, resolved_at, " +
        "order:orders(id, avalon_order_number, shopify_order_name, shopify_order_number, " +
        "status, sync_status, final_total_amount, person_in_charge_label, " +
        "customer:customers(id, first_name, last_name, full_name, phone))",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusFilter) {
    q = q.eq("status", statusFilter);
  } else {
    q = q.in("status", ["open", "in_progress"]);
  }

  if (typeFilter) {
    q = q.eq("adjustment_type", typeFilter);
  } else if (bucket === "cs") {
    // CS bucket = anything not auto-resolved like bundle_split_pricing.
    // Show every type EXCEPT bundle_split_pricing (which is one-shot audit).
    q = q.neq("adjustment_type", "bundle_split_pricing");
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ adjustments: data ?? [] });
}
