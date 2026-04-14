import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";

// GET /api/operations/catalog — list catalog items with optional filters
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search");
  const family = searchParams.get("family");
  const active = searchParams.get("active");

  const admin = createAdminClient();
  let query = admin.from("catalog_items").select("*").order("product_name");

  if (search) {
    query = query.or(`product_name.ilike.%${search}%,sku.ilike.%${search}%`);
  }
  if (family) {
    query = query.eq("product_family", family);
  }
  if (active === "true") {
    query = query.eq("is_active", true);
  } else if (active === "false") {
    query = query.eq("is_active", false);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

// POST /api/operations/catalog — create a catalog item
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { sku, product_name, color, size, product_family, collection, supplier_ref } = body;

  if (!sku) return NextResponse.json({ error: "sku is required" }, { status: 400 });
  if (!product_name) return NextResponse.json({ error: "product_name is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("catalog_items")
    .insert({
      sku,
      product_name,
      color: color || null,
      size: size || null,
      product_family: product_family || null,
      collection: collection || null,
      supplier_ref: supplier_ref || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

// PATCH /api/operations/catalog — update a catalog item by id (from body)
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("catalog_items")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/operations/catalog?id=xxx — delete a catalog item (OPS only)
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(user)) return NextResponse.json({ error: "Forbidden — OPS only" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("catalog_items")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
