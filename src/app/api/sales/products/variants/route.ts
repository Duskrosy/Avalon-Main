import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { listShopifyProducts } from "@/lib/shopify/client";
import { NextRequest, NextResponse } from "next/server";

// ─── GET /api/sales/products/variants?product_name=Altitude ─────────────────
//
// Powers the size + color cascade after a family is picked in the Items
// step. Returns:
//   - sizes: distinct size values + aggregated stock across colors
//   - colors: distinct color values + aggregated stock across sizes
//   - variantsByCombo: lookup keyed `${size}|${color}` → variant metadata
//
// We mirror the existing `/api/sales/products/route.ts` Phase 1.5 strategy
// and source data from Shopify (the live catalog), since the local
// `product_variants` table is sparsely seeded and lacks color/price/image
// columns. Convention from that route:
//   size  ← option2 ?? option1
//   color ← option1
// Stock comes from Shopify's `inventory_quantity`. No Inventory v1 overlay
// here — F11/F12 only need to drive cascade selection; the existing
// flat-search route is responsible for stock-tracking signals.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const productName = req.nextUrl.searchParams.get("product_name")?.trim();
  if (!productName) {
    return NextResponse.json(
      { error: "product_name required" },
      { status: 400 },
    );
  }

  const products = await listShopifyProducts();
  const matches = products.filter((p) => p.title === productName);

  const sizeMap = new Map<string, number>();
  const colorMap = new Map<string, number>();
  const variantsByCombo: Record<
    string,
    {
      variant_id: string;
      shopify_product_id: string | null;
      shopify_variant_id: string | null;
      price: number;
      image_url: string | null;
      stock: number;
    }
  > = {};

  for (const p of matches) {
    for (const v of p.variants ?? []) {
      const sizeKey = (v.option2 ?? v.option1) ?? "—";
      const colorKey = v.option1 ?? "—";
      const stock = v.inventory_quantity ?? 0;
      sizeMap.set(sizeKey, (sizeMap.get(sizeKey) ?? 0) + stock);
      colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + stock);
      const combo = `${sizeKey}|${colorKey}`;
      if (!variantsByCombo[combo] || stock > variantsByCombo[combo].stock) {
        variantsByCombo[combo] = {
          variant_id: String(v.id),
          shopify_product_id: String(p.id),
          shopify_variant_id: String(v.id),
          price: parseFloat(v.price),
          image_url: p.image?.src ?? null,
          stock,
        };
      }
    }
  }

  return NextResponse.json({
    sizes: Array.from(sizeMap.entries()).map(([value, stock]) => ({
      value,
      stock,
    })),
    colors: Array.from(colorMap.entries()).map(([value, stock]) => ({
      value,
      stock,
    })),
    variantsByCombo,
  });
}
