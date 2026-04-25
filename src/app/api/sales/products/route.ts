import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// ─── GET /api/sales/products?q=&limit=20 ─────────────────────────────────────
//
// Variant search for the Items step of the Create Order drawer. Joins
// Inventory v1 product_variants + product_colors + products with the per-
// location inventory_balances ledger to expose total available stock.
//
// Stock displayed = sum(quantity_available) across all locations for the
// variant. The confirm flow's allocation handles location-specific draw-down
// later via Inventory v1 RPC.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20,
    50,
  );
  if (q.length < 2) {
    return NextResponse.json({ variants: [] });
  }

  const admin = createAdminClient();
  // Match variant_sku, product name, or color label.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: variants, error } = await (admin as any)
    .from("product_variants")
    .select(
      `
      id,
      variant_sku,
      size_label,
      is_active,
      product:products(id, parent_sku, name, is_active),
      product_color:product_colors(id, color_code, color_label),
      inventory_balances(quantity_available)
    `,
    )
    .eq("is_active", true)
    .or(
      `variant_sku.ilike.%${q}%,size_label.ilike.%${q}%`,
    )
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = (variants ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v: any) => {
      const balances = Array.isArray(v.inventory_balances)
        ? v.inventory_balances
        : [];
      const available = balances.reduce(
        (sum: number, b: { quantity_available: number | null }) =>
          sum + (b.quantity_available ?? 0),
        0,
      );
      return {
        id: v.id,
        variant_sku: v.variant_sku,
        product_name: v.product?.name ?? null,
        product_id: v.product?.id ?? null,
        size: v.size_label,
        color: v.product_color?.color_label ?? null,
        available_stock: available,
      };
    },
  );

  return NextResponse.json({ variants: result });
}
