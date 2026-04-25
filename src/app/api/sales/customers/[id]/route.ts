import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validate";

// ─── PATCH /api/sales/customers/[id] ────────────────────────────────────────
//
// Updates a single customer. Used by the Customer step of the Create Order
// drawer when the agent picks an existing customer and edits their fields
// (e.g. fixes a wrong address) before placing the order. Only the supplied
// fields are written; the rest stay untouched.

const patchSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address_line_1: z.string().nullable().optional(),
  address_line_2: z.string().nullable().optional(),
  city_text: z.string().nullable().optional(),
  region_text: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  full_address: z.string().nullable().optional(),
  region_code: z.string().nullable().optional(),
  city_code: z.string().nullable().optional(),
  barangay_code: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(patchSchema, raw);
  if (validationError) return validationError;

  const admin = createAdminClient();

  // Build the update object excluding undefined keys so unchanged fields
  // don't get overwritten with null.
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) update[k] = v;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await (admin as any)
    .from("customers")
    .update(update)
    .eq("id", id)
    .select(
      "id, shopify_customer_id, first_name, last_name, full_name, email, phone, full_address, total_orders_cached",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customer: row });
}
