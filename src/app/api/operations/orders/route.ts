import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";

// GET /api/operations/orders
// ?items=true&order_id=xxx          → fetch line items for a specific order
// ?search=term                      → ILIKE on order_number or customer_name
// ?financial_status=paid            → eq filter
// ?fulfillment_status=unfulfilled   → eq filter
// ?from=2026-01-01&to=2026-01-31   → date range on created_at
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const items = searchParams.get("items");
  const orderId = searchParams.get("order_id");

  const admin = createAdminClient();

  // Fetch line items for a specific order
  if (items === "true" && orderId) {
    const { data, error } = await admin
      .from("ops_order_items")
      .select("*, catalog:catalog_items(id, sku, product_name, color, size)")
      .eq("order_id", orderId)
      .order("created_at");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  // Fetch orders with assigned profile and item count
  const search = searchParams.get("search");
  const financialStatus = searchParams.get("financial_status");
  const fulfillmentStatus = searchParams.get("fulfillment_status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = admin
    .from("ops_orders")
    .select(`
      *,
      assigned:profiles!assigned_to(id, first_name, last_name),
      items:ops_order_items(id)
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (search) {
    query = query.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%`);
  }
  if (financialStatus) {
    query = query.eq("financial_status", financialStatus);
  }
  if (fulfillmentStatus) {
    query = query.eq("fulfillment_status", fulfillmentStatus);
  }
  if (from) {
    query = query.gte("created_at", `${from}T00:00:00`);
  }
  if (to) {
    query = query.lte("created_at", `${to}T23:59:59`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Transform items array to count
  const rows = (data ?? []).map((row) => ({
    ...row,
    item_count: Array.isArray(row.items) ? row.items.length : 0,
    items: undefined,
  }));

  return NextResponse.json({ data: rows });
}

// POST /api/operations/orders — create a new order (+ optional line items)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    order_number,
    customer_name,
    customer_email,
    customer_phone,
    financial_status,
    fulfillment_status,
    total_price,
    payment_method,
    channel,
    notes,
    assigned_to,
    items: lineItems,
  } = body;

  if (!order_number) {
    return NextResponse.json({ error: "order_number is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: order, error } = await admin
    .from("ops_orders")
    .insert({
      order_number,
      customer_name: customer_name || null,
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      financial_status: financial_status || "pending",
      fulfillment_status: fulfillment_status || "unfulfilled",
      total_price: total_price ?? 0,
      payment_method: payment_method || null,
      channel: channel || null,
      notes: notes || null,
      assigned_to: assigned_to || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bulk insert line items if provided
  if (Array.isArray(lineItems) && lineItems.length > 0) {
    const rows = lineItems.map((item: Record<string, unknown>) => ({
      order_id: order.id,
      catalog_item_id: item.catalog_item_id || null,
      product_name: item.product_name || "Item",
      sku: item.sku || null,
      quantity: item.quantity ?? 1,
      unit_price: item.unit_price ?? 0,
    }));

    const { error: itemsError } = await admin
      .from("ops_order_items")
      .insert(rows);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ data: order }, { status: 201 });
}

// PATCH /api/operations/orders — update order by id (from body)
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("ops_orders")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/operations/orders?id=xxx — OPS only
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(user)) return NextResponse.json({ error: "Forbidden — OPS only" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("ops_orders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
