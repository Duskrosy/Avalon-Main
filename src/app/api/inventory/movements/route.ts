import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";

const ALLOWED_MOVEMENT_TYPES = new Set([
  "initial_stock",
  "allocate",
  "return_pending",
  "return_verified",
  "restock_source",
  "reallocate",
  "adjustment",
  "manual_correction",
  "damage_writeoff",
]);

// GET /api/inventory/movements?variant_id=...&limit=50
// Returns the movement ledger for one variant (or all if omitted).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const variantId = req.nextUrl.searchParams.get("variant_id");
  const limit = Math.min(
    200,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "50"))
  );

  const admin = createAdminClient();

  let query = admin
    .from("inventory_movements")
    .select(
      `
      id, movement_type, quantity, status, reason_code, notes,
      reference_type, reference_id, created_at,
      from_location:inventory_locations!from_location_id(id, location_code, location_name),
      to_location:inventory_locations!to_location_id(id, location_code, location_name),
      variant:product_variants!inner(id, variant_sku),
      actor:profiles!acted_by_user_id(id, first_name, last_name),
      verifier:profiles!verified_by_user_id(id, first_name, last_name)
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (variantId) query = query.eq("product_variant_id", variantId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/inventory/movements
// Body: {
//   product_variant_id: uuid,
//   from_location_id: uuid | null,
//   to_location_id:   uuid | null,
//   movement_type:    <enum string>,
//   quantity:         int,
//   reason_code?:     string,
//   notes?:           string,
//   reference_type?:  string,
//   reference_id?:    uuid,
//   expected_from_version?: int,
//   expected_to_version?:   int,
// }
// acted_by_user_id is resolved SERVER-SIDE from the session -- never
// trust client-supplied actor ids.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const movementType = String(body.movement_type ?? "");
  if (!ALLOWED_MOVEMENT_TYPES.has(movementType)) {
    return NextResponse.json(
      { error: `Invalid movement_type: ${movementType}` },
      { status: 400 }
    );
  }

  const variantId = body.product_variant_id as string | undefined;
  if (!variantId) {
    return NextResponse.json(
      { error: "product_variant_id is required" },
      { status: 400 }
    );
  }

  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity)) {
    return NextResponse.json({ error: "quantity must be a number" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_inventory_movement", {
    p_product_variant_id: variantId,
    p_from_location_id: (body.from_location_id as string | null) ?? null,
    p_to_location_id: (body.to_location_id as string | null) ?? null,
    p_movement_type: movementType,
    p_quantity: quantity,
    p_reason_code: (body.reason_code as string | null) ?? null,
    p_notes: (body.notes as string | null) ?? null,
    p_reference_type: (body.reference_type as string | null) ?? null,
    p_reference_id: (body.reference_id as string | null) ?? null,
    p_acted_by_user_id: user.id,
    p_expected_from_version: (body.expected_from_version as number | null) ?? null,
    p_expected_to_version: (body.expected_to_version as number | null) ?? null,
    p_verification_condition:
      (body.verification_condition as string | null) ??
      (body.condition_status as string | null) ??
      null,
    p_verification_id: (body.verification_id as string | null) ?? null,
  });

  if (error) {
    const status = /permission|denied|not authorized/i.test(error.message)
      ? 403
      : /not found|missing/i.test(error.message)
        ? 404
        : /version|concurrent|stale/i.test(error.message)
          ? 409
          : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ data });
}
