import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const triageSchema = z.object({
  action: z.enum([
    "claim",
    "release",
    "inventory",
    "preorder",
    "fulfillment",
    "dispatch",
    "hold",
  ]),
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
  const action = parsed.data.action;

  const admin = createAdminClient();

  // ── Claim: conditional UPDATE so two simultaneous claims yield one winner.
  if (action === "claim") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: claimed, error: claimErr } = await (admin as any)
      .from("orders")
      .update({ claimed_by_user_id: user.id, claimed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "confirmed")
      .eq("completion_status", "complete")
      .is("person_in_charge_label", null)
      .is("claimed_by_user_id", null)
      .select("id")
      .maybeSingle();
    if (claimErr) {
      return NextResponse.json({ error: claimErr.message }, { status: 500 });
    }
    if (!claimed) {
      // Either someone else just claimed it, or it isn't in the inbox state.
      // Look up the current state to surface a useful 409 message.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current } = await (admin as any)
        .from("orders")
        .select(
          "id, status, completion_status, person_in_charge_label, claimed_by_user_id, claimer:profiles!orders_claimed_by_user_id_fkey(full_name)",
        )
        .eq("id", id)
        .maybeSingle();
      if (!current) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      if (current.claimed_by_user_id) {
        return NextResponse.json(
          {
            error: "Already claimed",
            claimer_name: current.claimer?.full_name ?? "Another agent",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "Order is not in the CS Inbox" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  // ── Release: clear the claim. Only the claimer (or a manager) can release.
  if (action === "release") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: order } = await (admin as any)
      .from("orders")
      .select("id, claimed_by_user_id")
      .eq("id", id)
      .maybeSingle();
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (
      order.claimed_by_user_id &&
      order.claimed_by_user_id !== user.id &&
      !isManagerOrAbove(user)
    ) {
      return NextResponse.json(
        { error: "Only the claimer or a manager can release this ticket" },
        { status: 403 },
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: relErr } = await (admin as any)
      .from("orders")
      .update({ claimed_by_user_id: null, claimed_at: null })
      .eq("id", id);
    if (relErr) return NextResponse.json({ error: relErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Routing actions (inventory/preorder/fulfillment/dispatch/hold).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order } = await (admin as any)
    .from("orders")
    .select(
      "id, status, completion_status, delivery_method, claimed_by_user_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  // CS triage happens between confirm (sales-side) and complete (post-delivery).
  // Eligibility = order is confirmed and not yet finalized. completion_status
  // stays 'incomplete' through CS triage — it only flips to 'complete' when the
  // courier returns the COD parcel (separate /complete endpoint).
  if (order.status !== "confirmed") {
    return NextResponse.json(
      { error: "Order is not in CS Inbox" },
      { status: 409 },
    );
  }
  // Soft-lock: only the claimer (or a manager) can route a claimed ticket.
  // Tickets with no claim can be routed by anyone, preserving existing
  // behaviour for power users who triage without claiming.
  if (
    order.claimed_by_user_id &&
    order.claimed_by_user_id !== user.id &&
    !isManagerOrAbove(user)
  ) {
    return NextResponse.json(
      { error: "This ticket is claimed by someone else" },
      { status: 403 },
    );
  }

  // Auto-release the claim as part of the triage UPDATE — the rep is done
  // with this ticket the moment it leaves the inbox.
  const updates: Record<string, unknown> = {
    cs_hold_reason: null,
    claimed_by_user_id: null,
    claimed_at: null,
  };

  switch (action) {
    case "inventory":
      updates.person_in_charge_label = "Inventory";
      updates.person_in_charge_type = "custom";
      break;
    case "preorder":
      updates.person_in_charge_label = "Pre-Order";
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
  if (action === "dispatch") {
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
