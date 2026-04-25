import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { searchShopifyVariants } from "@/lib/shopify/client";

// ─── GET /api/sales/products?q=&limit=30 ────────────────────────────────────
//
// Variant search for the Items step of the Create Order drawer.
//
// Phase 1.5 strategy: query Shopify products directly (FC's actual catalog
// lives there), then overlay Inventory v1 stock per variant when a matching
// row exists in product_variants. When Inventory v1 has no row for a variant,
// we display "stock not tracked" instead of "0" so agents know the system
// isn't blocking on a missing inventory record.
//
// Phase 2/3 path: as Inventory v1 gets seeded with FC's catalog, more
// variants will show real stock counts. The shape of the response stays
// identical — clients don't need to change.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "30", 10) || 30,
    50,
  );
  if (q.length < 2) {
    return NextResponse.json({ variants: [] });
  }

  // Stage 1: pull matching variants from Shopify.
  const shopifyVariants = await searchShopifyVariants(q, limit);
  if (shopifyVariants.length === 0) {
    return NextResponse.json({ variants: [] });
  }

  // Stage 2: overlay Inventory v1 stock for any variants that exist locally.
  // We match on shopify_variant_id stored on product_variants. If your
  // Inventory v1 seeding maps Shopify variant_id elsewhere, update this join.
  const admin = createAdminClient();
  const variantIds = shopifyVariants.map((v) => v.shopify_variant_id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: localVariants } = await (admin as any)
    .from("product_variants")
    .select(
      `
      id,
      variant_sku,
      shopify_variant_id:variant_sku,
      inventory_balances(quantity_available)
    `,
    )
    .in("variant_sku", variantIds); // best-effort match; fallback when no shopify_variant_id col exists

  // Build a lookup. The local variant table doesn't have a dedicated
  // shopify_variant_id column today (Inventory v1 keys on variant_sku), so
  // any match is opportunistic — we leave it null when there's no signal.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localBySku = new Map<string, { id: string; available: number }>();
  for (const lv of (localVariants ?? []) as Array<{
    id: string;
    variant_sku: string;
    inventory_balances?: { quantity_available: number | null }[];
  }>) {
    const balances = Array.isArray(lv.inventory_balances)
      ? lv.inventory_balances
      : [];
    const available = balances.reduce(
      (sum, b) => sum + (b.quantity_available ?? 0),
      0,
    );
    localBySku.set(lv.variant_sku, { id: lv.id, available });
  }

  const result = shopifyVariants.map((v) => {
    const local = v.sku ? localBySku.get(v.sku) : undefined;
    const isTracked = local !== undefined;
    return {
      id: local?.id ?? v.shopify_variant_id, // UI-stable id; Shopify variant id when not tracked
      product_variant_id: local?.id ?? null, // null when Inventory v1 doesn't track this variant
      shopify_product_id: v.shopify_product_id,
      shopify_variant_id: v.shopify_variant_id,
      product_name: v.product_title,
      variant_sku: v.sku,
      variant_title: v.variant_title,
      size: v.options.option2 ?? v.options.option1 ?? null,
      color: v.options.option1 ?? null,
      price: parseFloat(v.price),
      image_url: v.image_url,
      available_stock: isTracked ? (local!.available) : null,
      stock_tracked: isTracked,
    };
  });

  return NextResponse.json({ variants: result });
}
