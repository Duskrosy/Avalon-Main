import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { calculateDraftOrderDiscount } from "@/lib/shopify/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  customer_shopify_id: z.string().nullable().optional(),
  items: z.array(z.object({
    shopify_variant_id: z.string().nullable(),
    quantity: z.number().min(1),
    product_name: z.string(),
    unit_price_amount: z.number().min(0),
  })).min(1),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const result = await calculateDraftOrderDiscount({
      customer_id: parsed.data.customer_shopify_id ?? null,
      line_items: parsed.data.items.map((it) => ({
        variant_id: it.shopify_variant_id,
        quantity: it.quantity,
        title: it.product_name,
        price: it.unit_price_amount.toString(),
      })),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Shopify calculation failed" },
      { status: 502 },
    );
  }
}
