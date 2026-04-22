import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";

// GET /api/inventory
// Returns a pivot view: one row per product_variant, with a
// `balances` object keyed by location_code -> { on_hand, reserved, available }.
// Optional filter: ?variant_id=<uuid> narrows to a single variant.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const variantId = req.nextUrl.searchParams.get("variant_id");

  const admin = createAdminClient();

  let balancesQuery = admin
    .from("inventory_balances")
    .select(
      `
      product_variant_id,
      quantity_on_hand,
      quantity_reserved,
      quantity_available,
      row_version,
      location:inventory_locations!inner(
        id, location_code, location_name, location_type, is_source, sort_order
      ),
      variant:product_variants!inner(
        id, variant_sku, size_code, size_label,
        color:product_colors!inner(id, color_code, color_name),
        product:products!inner(id, parent_sku, name, product_family)
      )
    `
    )
    .order("product_variant_id");

  if (variantId) balancesQuery = balancesQuery.eq("product_variant_id", variantId);

  const { data, error } = await balancesQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by variant, pivot by location_code.
  type Row = (typeof data)[number];
  const byVariant = new Map<
    string,
    {
      variant_id: string;
      variant_sku: string;
      size_code: string;
      size_label: string;
      color_code: string;
      color_name: string;
      product_id: string;
      parent_sku: string;
      product_name: string;
      product_family: string | null;
      balances: Record<
        string,
        { on_hand: number; reserved: number; available: number; row_version: number }
      >;
    }
  >();

  for (const row of (data ?? []) as unknown as Row[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const v = r.variant;
    const key = v.id as string;
    if (!byVariant.has(key)) {
      byVariant.set(key, {
        variant_id: v.id,
        variant_sku: v.variant_sku,
        size_code: v.size_code,
        size_label: v.size_label,
        color_code: v.color.color_code,
        color_name: v.color.color_name,
        product_id: v.product.id,
        parent_sku: v.product.parent_sku,
        product_name: v.product.name,
        product_family: v.product.product_family,
        balances: {},
      });
    }
    byVariant.get(key)!.balances[r.location.location_code] = {
      on_hand: r.quantity_on_hand,
      reserved: r.quantity_reserved,
      available: r.quantity_available,
      row_version: r.row_version,
    };
  }

  return NextResponse.json({ data: Array.from(byVariant.values()) });
}
