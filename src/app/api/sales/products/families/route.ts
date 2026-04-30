import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { listShopifyProducts } from "@/lib/shopify/client";
import { NextRequest, NextResponse } from "next/server";

// ─── GET /api/sales/products/families ───────────────────────────────────────
//
// Powers the family selector at the top of the Items step's family → size +
// color cascade.
//
// Default (no `q`): the 20 most-recently-used product families based on
// `order_items` joined with `orders.created_at` over the last 30 days.
// Search (`?q=foo`): substring match across the live Shopify catalog so
// agents can find brand-new SKUs that have never been sold yet. We fall
// back to Shopify here (instead of `order_items.product_name`) because the
// existing `/api/sales/products/route.ts` already treats Shopify as the
// catalog source of truth (Phase 1.5).

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  if (q) {
    const products = await listShopifyProducts();
    const needle = q.toLowerCase();
    const distinct = Array.from(
      new Set(
        products
          .map((p) => p.title)
          .filter((t): t is string => Boolean(t) && t.toLowerCase().includes(needle)),
      ),
    ).slice(0, 50);
    return NextResponse.json({
      families: distinct.map((name) => ({ product_name: name, sku_count: 0 })),
    });
  }

  // Default: top-20 most-recently-used families based on order_items in the
  // last 30d. PostgREST auto-resolves the `orders` relationship from the
  // order_items.order_id → orders.id FK (see migration 00086).
  const admin = createAdminClient();
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("order_items")
    .select("product_name, orders!inner(created_at)")
    .gte("orders.created_at", thirtyDaysAgo)
    .not("product_name", "is", null)
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ product_name: string }>) {
    counts.set(r.product_name, (counts.get(r.product_name) ?? 0) + 1);
  }
  const families = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name]) => ({ product_name: name, sku_count: 0 }));

  return NextResponse.json({ families });
}
