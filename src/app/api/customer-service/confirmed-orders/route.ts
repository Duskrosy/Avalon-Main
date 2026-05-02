// src/app/api/customer-service/confirmed-orders/route.ts
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

const SELECT = [
  "id, avalon_order_number, shopify_order_name, shopify_order_number,",
  "status, completion_status, completed_at, created_by_name,",
  "mode_of_payment, payment_other_label, payment_receipt_path,",
  "delivery_method, delivery_method_notes,",
  "shopify_financial_status, shopify_fulfillment_status,",
  "person_in_charge_label, cs_hold_reason, final_total_amount,",
  "claimed_by_user_id, claimed_at,",
  // Pass 2 — lane chip + payment metadata for drawer pre-load
  "intake_lane, shopify_source_name, shopify_gateway, shopify_card_last4,",
  "shopify_transaction_id, shopify_transaction_at, parent_order_id,",
  "claimer:profiles!orders_claimed_by_user_id_fkey(id, full_name),",
  "customer:customers(id, first_name, last_name, full_name, phone)",
].join(" ");

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tab = (req.nextUrl.searchParams.get("tab") ?? "inbox") as
    | "inbox" | "in_progress" | "done" | "all";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any).from("orders").select(SELECT);

  // NOTE: completion_status='complete' is the POST-delivery flag set by
  // /api/sales/orders/[id]/complete (which also flips status='completed').
  // CS triage happens BEFORE delivery, so confirmed orders awaiting CS
  // have completion_status='incomplete'. Filtering on 'complete' here was
  // a Pass 1 bug — it excluded every order that needed CS triage.
  switch (tab) {
    case "inbox":
      query = query
        .eq("status", "confirmed")
        .is("person_in_charge_label", null);
      break;
    case "in_progress":
      query = query
        .eq("status", "confirmed")
        .not("person_in_charge_label", "is", null);
      break;
    case "done":
      query = query.in("status", ["completed", "cancelled"]);
      break;
    case "all":
      query = query.in("status", ["confirmed", "completed", "cancelled"]);
      break;
  }

  if (q) {
    const term = `%${q}%`;
    query = query.or(
      `avalon_order_number.ilike.${term},customer.full_name.ilike.${term},customer.phone.ilike.${term}`,
    );
  }

  query = query.order("completed_at", { ascending: false, nullsFirst: false }).limit(200);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data ?? [] });
}
