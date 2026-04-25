import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validate";
import { updateShopifyCustomerAddress } from "@/lib/shopify/client";

// ─── PATCH /api/sales/customers/[id]/addresses/[addressId] ──────────────────
//
// Edit a single saved Shopify address. Used by the "Address book" modal's
// inline editor so the agent can fix a typo or update a unit number on
// any of a customer's stored addresses (not just the default).

const patchSchema = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  address1: z.string().nullable().optional(),
  address2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; addressId: string }> },
) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, addressId } = await params;
  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(patchSchema, raw);
  if (validationError) return validationError;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (admin as any)
    .from("customers")
    .select("id, shopify_customer_id")
    .eq("id", id)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  if (!customer.shopify_customer_id) {
    return NextResponse.json(
      { error: "Customer has no Shopify mirror" },
      { status: 409 },
    );
  }

  try {
    const updated = await updateShopifyCustomerAddress(
      customer.shopify_customer_id,
      addressId,
      {
        first_name: body.first_name,
        last_name: body.last_name,
        address1: body.address1,
        address2: body.address2,
        city: body.city,
        zip: body.zip,
        phone: body.phone,
        country: "Philippines",
      },
    );
    return NextResponse.json({ address: updated });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Shopify address update failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
