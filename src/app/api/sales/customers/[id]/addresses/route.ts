import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { listShopifyCustomerAddresses } from "@/lib/shopify/client";

// ─── GET /api/sales/customers/[id]/addresses ────────────────────────────────
//
// Returns every saved Shopify address for a local customer. Used by the
// "Address book" modal in the Customer step so the agent can pick which
// of the customer's existing addresses to ship the current order to —
// older Shopify customers often have one address per past checkout.
//
// 200 → { addresses: ShopifyCustomerAddress[] } (possibly empty)
// 404 → customer not found
// 409 → customer has no Shopify mirror (no shopify_customer_id), so there
//       is no address book to read
// 502 → Shopify API failed

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
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
    const addresses = await listShopifyCustomerAddresses(
      customer.shopify_customer_id,
    );
    return NextResponse.json({ addresses });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Shopify address fetch failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
