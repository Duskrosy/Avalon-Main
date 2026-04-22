import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";

// GET /api/operations/inventory
// ?movements=true&catalog_item_id=xxx  → fetch movements for a specific item
// ?search=term                         → filter by product_name or sku
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const movements = searchParams.get("movements");
  const catalogItemId = searchParams.get("catalog_item_id");
  const search = searchParams.get("search");

  const admin = createAdminClient();

  // Fetch movements for a specific catalog item (legacy ledger).
  // The new inventory_movements table has a different schema (see 00076);
  // this route serves the legacy inventory page only, so it reads the
  // renamed _deprecated table.
  if (movements === "true" && catalogItemId) {
    const { data, error } = await admin
      .from("inventory_movements_deprecated")
      .select("*")
      .eq("catalog_item_id", catalogItemId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  // Fetch inventory records joined with catalog items
  let query = admin
    .from("inventory_records_deprecated")
    .select("*, catalog:catalog_items(id, sku, product_name, color, size, product_family)");

  if (search) {
    query = query.or(
      `catalog.product_name.ilike.%${search}%,catalog.sku.ilike.%${search}%`
    );
  }

  query = query.order("catalog_item_id");

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// POST /api/operations/inventory — DEPRECATED by migration 00076.
// The legacy stock-adjustment flow is replaced by the new Operations
// workflow pages under /operations/stock-actions/*, which POST to
// /api/inventory/movements and call the create_inventory_movement RPC.
// This endpoint is kept only so legacy client code returns a clear
// message instead of silently writing into the new schema.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "This endpoint is deprecated. Use the new Operations stock-action workflows under /operations/stock-actions/.",
    },
    { status: 410 }
  );
}
