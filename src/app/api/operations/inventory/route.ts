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

  // Fetch movements for a specific catalog item
  if (movements === "true" && catalogItemId) {
    const { data, error } = await admin
      .from("inventory_movements")
      .select("*")
      .eq("catalog_item_id", catalogItemId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  // Fetch inventory records joined with catalog items
  let query = admin
    .from("inventory_records")
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

// POST /api/operations/inventory — stock adjustment
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { catalog_item_id, adjustment_type, quantity, notes } = body;

  if (!catalog_item_id || !adjustment_type || quantity == null) {
    return NextResponse.json(
      { error: "Missing required fields: catalog_item_id, adjustment_type, quantity" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1. Insert movement record
  const { error: moveError } = await admin.from("inventory_movements").insert({
    catalog_item_id,
    adjustment_type,
    quantity,
    notes: notes ?? null,
    performed_by: user.id,
  });

  if (moveError) return NextResponse.json({ error: moveError.message }, { status: 500 });

  // 2. Fetch current inventory record
  const { data: current, error: fetchError } = await admin
    .from("inventory_records")
    .select("*")
    .eq("catalog_item_id", catalog_item_id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json({ error: "Inventory record not found" }, { status: 404 });
  }

  // 3. Calculate new quantities based on adjustment type
  const updates: Record<string, number> = {};

  switch (adjustment_type) {
    case "received":
      updates.available_qty = (current.available_qty ?? 0) + quantity;
      break;
    case "dispatched":
      updates.available_qty = (current.available_qty ?? 0) - quantity;
      break;
    case "returned":
      updates.available_qty = (current.available_qty ?? 0) + quantity;
      break;
    case "damaged":
      updates.available_qty = (current.available_qty ?? 0) - quantity;
      updates.damaged_qty = (current.damaged_qty ?? 0) + quantity;
      break;
    case "correction":
      updates.available_qty = quantity;
      break;
    case "reserved":
      updates.available_qty = (current.available_qty ?? 0) - quantity;
      updates.reserved_qty = (current.reserved_qty ?? 0) + quantity;
      break;
    case "released":
      updates.reserved_qty = (current.reserved_qty ?? 0) - quantity;
      updates.available_qty = (current.available_qty ?? 0) + quantity;
      break;
    default:
      return NextResponse.json({ error: `Unknown adjustment_type: ${adjustment_type}` }, { status: 400 });
  }

  // 4. Update inventory record
  const { error: updateError } = await admin
    .from("inventory_records")
    .update(updates)
    .eq("catalog_item_id", catalog_item_id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
