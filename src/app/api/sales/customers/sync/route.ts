import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validate";
import { searchShopifyCustomers } from "@/lib/shopify/client";

// ─── POST /api/sales/customers/sync ──────────────────────────────────────────
//
// On-demand pull of a Shopify customer into the local mirror. Used when an
// agent searches a customer that isn't in the Avalon mirror yet but exists
// in Shopify.

const schema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  shopify_customer_id: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(schema, raw);
  if (validationError) return validationError;

  if (!body.email && !body.phone && !body.shopify_customer_id) {
    return NextResponse.json(
      { error: "Provide email, phone, or shopify_customer_id" },
      { status: 400 },
    );
  }

  const query = body.shopify_customer_id
    ? `id:${body.shopify_customer_id}`
    : body.email
      ? `email:${body.email}`
      : `phone:${body.phone}`;

  const shopifyMatches = await searchShopifyCustomers(query);
  if (shopifyMatches.length === 0) {
    return NextResponse.json({ found: false });
  }

  const shopifyCustomer = shopifyMatches[0];
  const admin = createAdminClient();

  // Upsert: if a row with this shopify_customer_id already exists, return it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin as any)
    .from("customers")
    .select("*")
    .eq("shopify_customer_id", String(shopifyCustomer.id))
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ found: true, customer: existing, recovered: true });
  }

  const addr = shopifyCustomer.addresses?.[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await (admin as any)
    .from("customers")
    .insert({
      shopify_customer_id: String(shopifyCustomer.id),
      first_name: shopifyCustomer.first_name ?? "Unknown",
      last_name: shopifyCustomer.last_name ?? "Unknown",
      email: shopifyCustomer.email ?? null,
      phone: shopifyCustomer.phone ?? null,
      address_line_1: addr?.address1 ?? null,
      address_line_2: addr?.address2 ?? null,
      city_text: addr?.city ?? null,
      region_text: addr?.province ?? null,
      postal_code: addr?.zip ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ found: true, customer: row, recovered: false });
}
