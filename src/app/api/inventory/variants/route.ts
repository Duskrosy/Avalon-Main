import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";

// GET /api/inventory/variants?q=term
// Typeahead search. variant_sku embeds parent + color + size, so a single
// top-level ilike covers most operator-side lookups (SKU prefix or fragment).
// For product-name search we run a second query against products and union.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ data: [] });

  const admin = createAdminClient();
  const pattern = `%${q}%`;

  const variantSelect = `
    id, variant_sku, size_code, size_label,
    color:product_colors!inner(id, color_code, color_name),
    product:products!inner(id, parent_sku, name, product_family)
  `;

  const [bySku, byProduct] = await Promise.all([
    admin
      .from("product_variants")
      .select(variantSelect)
      .eq("is_active", true)
      .ilike("variant_sku", pattern)
      .limit(25),
    admin
      .from("products")
      .select("id")
      .or(`parent_sku.ilike.${pattern},name.ilike.${pattern}`)
      .limit(25),
  ]);

  if (bySku.error) return NextResponse.json({ error: bySku.error.message }, { status: 500 });
  if (byProduct.error)
    return NextResponse.json({ error: byProduct.error.message }, { status: 500 });

  const productIds = (byProduct.data ?? []).map((p) => p.id);
  let nameMatches: typeof bySku.data = [];
  if (productIds.length > 0) {
    const { data, error } = await admin
      .from("product_variants")
      .select(variantSelect)
      .eq("is_active", true)
      .in("product_id", productIds)
      .limit(25);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    nameMatches = data ?? [];
  }

  const seen = new Set<string>();
  const merged: NonNullable<typeof bySku.data> = [];
  for (const row of [...(bySku.data ?? []), ...nameMatches]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
    if (merged.length >= 25) break;
  }

  return NextResponse.json({ data: merged });
}
