// src/app/api/sales/orders/[id]/receipt-signed-url/route.ts
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { signedReceiptUrl } from "@/lib/storage/order-receipts";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order } = await (admin as any)
    .from("orders").select("payment_receipt_path").eq("id", id).maybeSingle();
  if (!order?.payment_receipt_path) {
    return NextResponse.json({ url: null }, { status: 404 });
  }
  const url = await signedReceiptUrl(order.payment_receipt_path);
  return NextResponse.json({ url });
}
