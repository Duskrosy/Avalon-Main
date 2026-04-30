import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const triageSchema = z.object({
  action: z.enum(["inventory", "fulfillment", "dispatch", "hold"]),
  hold_reason: z.string().optional(),
});

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = triageSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order } = await (admin as any)
    .from("orders")
    .select("id, status, completion_status, delivery_method")
    .eq("id", id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "confirmed" || order.completion_status !== "complete") {
    return NextResponse.json(
      { error: "Order is not in CS Inbox" },
      { status: 409 },
    );
  }

  const updates: Record<string, unknown> = {
    cs_hold_reason: null, // clear any previous hold by default
  };

  switch (parsed.data.action) {
    case "inventory":
      updates.person_in_charge_label = "Inventory";
      updates.person_in_charge_type = "custom";
      break;
    case "fulfillment":
      updates.person_in_charge_label = "Fulfillment";
      updates.person_in_charge_type = "custom";
      break;
    case "dispatch":
      updates.person_in_charge_label = "Lalamove";
      updates.person_in_charge_type = "lalamove";
      updates.route_type = order.delivery_method === "tnvs" ? "tnvs" : "normal";
      break;
    case "hold":
      updates.person_in_charge_label = null;
      updates.cs_hold_reason = parsed.data.hold_reason ?? "On hold";
      break;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (admin as any).from("orders").update(updates).eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // For dispatch: create the ops_orders + dispatch_queue rows so the order
  // lands in the existing operations dispatch queue AND the lifecycle view's
  // courier-event projection (00097) has a path to project events back.
  if (parsed.data.action === "dispatch") {
    // 1. Fetch the source order with everything we need to hydrate ops_orders.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: full } = await (admin as any)
      .from("orders")
      .select(
        "id, avalon_order_number, mode_of_payment, final_total_amount, customer:customers(full_name, email, phone)",
      )
      .eq("id", id)
      .maybeSingle();
    if (!full || !full.avalon_order_number) {
      return NextResponse.json(
        { error: "Order is missing avalon_order_number; cannot bridge to ops_orders" },
        { status: 409 },
      );
    }

    // 2. Insert (or recover) the ops_orders row with the bridge column populated.
    //    UNIQUE on sales_order_id means a re-triage can't double-create.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: opsRow, error: opsErr } = await (admin as any)
      .from("ops_orders")
      .upsert(
        {
          sales_order_id: id,
          order_number: full.avalon_order_number,
          customer_name: full.customer?.full_name ?? null,
          customer_email: full.customer?.email ?? null,
          customer_phone: full.customer?.phone ?? null,
          financial_status: "pending",
          fulfillment_status: "unfulfilled",
          total_price: full.final_total_amount ?? 0,
          payment_method: full.mode_of_payment ?? null,
          channel: "sales-agent",
        },
        { onConflict: "sales_order_id" },
      )
      .select("id")
      .single();
    if (opsErr || !opsRow) {
      return NextResponse.json(
        { error: opsErr?.message ?? "Could not create ops_orders bridge row" },
        { status: 500 },
      );
    }

    // 3. Insert the dispatch_queue row (UNIQUE on order_id; ignore on conflict).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("dispatch_queue").upsert(
      {
        order_id: opsRow.id,
        status: "pending",
        is_preorder: false,
        courier_name:
          order.delivery_method === "tnvs"
            ? "TNVS"
            : order.delivery_method === "lwe"
              ? "LWE"
              : null,
      },
      { onConflict: "order_id" },
    );
  }

  return NextResponse.json({ ok: true });
}
