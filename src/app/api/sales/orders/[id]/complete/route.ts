import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validate";

// ─── POST /api/sales/orders/[id]/complete ───────────────────────────────────
//
// Marks a synced order complete. Captures the post-delivery attribution
// fields the agent records once the COD parcel comes back (delivered /
// rejected / returned), so reporting can split gross-sold from net GMV.
//
// Flips:
//   status: confirmed → completed
//   completion_status: incomplete → complete
//   completed_by_user_id, completed_at
// And persists the user-entered fields (net_value_amount,
// is_abandoned_cart, ad_campaign_source, alex_ai_assist, delivery_status).
//
// 200 → { order } (updated row)
// 400 → bad payload
// 403 → not the order's owner or a manager
// 404 → not found
// 409 → wrong order state (must be status='confirmed' + sync_status='synced')

const completeSchema = z.object({
  net_value_amount: z.number().min(0),
  delivery_status: z.string().min(1),
  is_abandoned_cart: z.boolean().optional().default(false),
  ad_campaign_source: z.string().nullable().optional(),
  alex_ai_assist: z.boolean().optional().default(false),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(
    completeSchema,
    raw,
  );
  if (validationError) return validationError;

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
  if (order.status !== "confirmed" || order.sync_status !== "synced") {
    return NextResponse.json(
      {
        error:
          "Only confirmed + synced orders can be completed (current: " +
          `status=${order.status}, sync_status=${order.sync_status})`,
      },
      { status: 409 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (admin as any)
    .from("orders")
    .update({
      status: "completed",
      completion_status: "complete",
      completed_by_user_id: currentUser.id,
      completed_at: new Date().toISOString(),
      net_value_amount: body.net_value_amount,
      is_abandoned_cart: body.is_abandoned_cart ?? false,
      ad_campaign_source: body.ad_campaign_source ?? null,
      alex_ai_assist: body.alex_ai_assist ?? false,
      delivery_status: body.delivery_status,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ order: updated });
}
